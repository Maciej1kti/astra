mod typed;
use clap::{Parser, Subcommand};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Duration};
use uuid::Uuid;

#[derive(Parser)]
#[command(
    version,
    about = "Local Projects client. All writes go through the authenticated Unix socket."
)]
struct Arguments {
    #[arg(long)]
    socket: PathBuf,
    #[arg(long, global = true)]
    project: Option<PathBuf>,
    #[arg(long, global=true, default_value_t=30, value_parser=clap::value_parser!(u64).range(1..=300))]
    timeout: u64,
    /// JSON is the default output format; this flag makes the choice explicit.
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Action,
}
#[derive(Subcommand)]
enum Action {
    #[command(flatten)]
    Typed(typed::Action),
    AddRoot {
        absolute_path: PathBuf,
        #[arg(long)]
        label: String,
    },
    RemoveRoot {
        id: String,
    },
    Hello,
    Doctor,
    Projects,
    RegistrationPlan {
        absolute_path: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        tracked: bool,
    },
    Register {
        plan_id: String,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
    Pairings,
    Approve {
        pairing_id: String,
        #[arg(long)]
        challenge: String,
    },
    Deny {
        pairing_id: String,
    },
    /// Read an API resource. Paths must start with /api/v1/.
    Get {
        path: String,
    },
    /// Send a JSON command. Keep the printed request ID, epoch and payload when retrying.
    Command {
        #[arg(value_parser = ["POST", "PATCH", "PUT", "DELETE"])]
        method: String,
        path: String,
        #[arg(long)]
        json_file: PathBuf,
        #[arg(long)]
        if_version: Option<String>,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
}
#[tokio::main]
async fn main() {
    match run(Arguments::parse()).await {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!(
                "{}",
                json!({"error":"CLIENT_ERROR","message":error.to_string()})
            );
            std::process::exit(1);
        }
    }
}
async fn run(args: Arguments) -> Result<i32, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .unix_socket(args.socket)
        .no_proxy()
        .timeout(Duration::from_secs(args.timeout))
        .build()?;
    let (method, path, payload, version, request, epoch) = match args.command {
        Action::Typed(action) => action.prepare(&client, args.project.as_deref()).await?,
        Action::AddRoot {
            absolute_path,
            label,
        } => (
            "POST".into(),
            "/local/v1/roots".into(),
            Some(json!({"absolute_path":absolute_path,"label":label})),
            None,
            None,
            None,
        ),
        Action::RemoveRoot { id } => {
            uuid4(&id)?;
            (
                "DELETE".into(),
                format!("/local/v1/roots/{id}"),
                Some(json!({})),
                None,
                None,
                None,
            )
        }
        Action::Hello => (
            "GET".into(),
            "/local/v1/hello".into(),
            None,
            None,
            None,
            None,
        ),
        Action::Doctor => (
            "GET".into(),
            "/local/v1/doctor".into(),
            None,
            None,
            None,
            None,
        ),
        Action::Projects => (
            "GET".into(),
            "/api/v1/projects".into(),
            None,
            None,
            None,
            None,
        ),
        Action::Pairings => (
            "GET".into(),
            "/api/v1/auth/pairings".into(),
            None,
            None,
            None,
            None,
        ),
        Action::RegistrationPlan {
            absolute_path,
            name,
            tracked,
        } => {
            let mut value = json!({"absolute_path":absolute_path,"git_mode":if tracked {"tracked"}else{"private"}});
            if let Some(name) = name {
                value["name"] = json!(name);
            }
            (
                "POST".into(),
                "/local/v1/registration-plans".into(),
                Some(value),
                None,
                None,
                None,
            )
        }
        Action::Register {
            plan_id,
            request_id,
            epoch,
        } => (
            "POST".into(),
            "/api/v1/registrations".into(),
            Some(json!({"plan_id":plan_id})),
            None,
            request_id,
            epoch,
        ),
        Action::Approve {
            pairing_id,
            challenge,
        } => {
            uuid4(&pairing_id)?;
            (
                "POST".into(),
                format!("/local/v1/pairings/{pairing_id}/approve"),
                Some(json!({"challenge":challenge})),
                None,
                None,
                None,
            )
        }
        Action::Deny { pairing_id } => {
            uuid4(&pairing_id)?;
            (
                "POST".into(),
                format!("/local/v1/pairings/{pairing_id}/deny"),
                Some(json!({})),
                None,
                None,
                None,
            )
        }
        Action::Get { path } => {
            api_path(&path)?;
            ("GET".into(), path, None, None, None, None)
        }
        Action::Command {
            method,
            path,
            json_file,
            if_version,
            request_id,
            epoch,
        } => {
            api_path(&path)?;
            let bytes = typed::file(&json_file)?;
            if bytes.len() > 1_100_000 {
                return Err("JSON file too large".into());
            }
            (
                method,
                path,
                Some(serde_json::from_slice(&bytes)?),
                if_version,
                request_id,
                epoch,
            )
        }
    };
    let mut builder = client.request(method.parse()?, format!("http://localhost{path}"));
    if let Some(payload) = payload {
        builder = builder.json(&payload);
    }
    if let Some(version) = version {
        builder = builder.header("if-match", format!("\"{version}\""));
    }
    if method != "GET" && path.starts_with("/api/") {
        if request.is_some() != epoch.is_some() {
            return Err("Retry requires both --request-id and --epoch".into());
        }
        let (request_id, epoch) = if let (Some(id), Some(epoch)) = (request, epoch) {
            (id, epoch)
        } else {
            let hello: Value = client
                .get("http://localhost/local/v1/hello")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            (
                request_id_at(hello["server_time"].as_str().ok_or("Invalid server time")?)?,
                hello["command_epoch"]
                    .as_str()
                    .ok_or("Invalid hello")?
                    .to_owned(),
            )
        };
        eprintln!(
            "{}",
            json!({"request_id":request_id,"command_epoch":epoch,"method":method,"path":path})
        );
        builder = builder
            .header("x-request-id", request_id)
            .header("x-command-epoch", epoch);
    }
    let reply = match builder.send().await {
        Ok(reply) => reply,
        Err(error) => {
            let uncertain = method != "GET" && path.starts_with("/api/");
            println!(
                "{}",
                json!({"api_version":"1","ok":false,"error":{"code":if uncertain {"RESULT_UNCERTAIN"} else {"TRANSPORT_UNAVAILABLE"},"message":error.to_string()}})
            );
            return Ok(if uncertain { 9 } else { 3 });
        }
    };
    let status = reply.status().as_u16();
    let bytes = reply.bytes().await?;
    let body: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({"http_status":status,"body":body}))?
    );
    Ok(match status {
        200..=299 => 0,
        404 => 4,
        409 | 412 | 428 => 5,
        401 | 403 => 6,
        400 | 422 => 2,
        _ => 8,
    })
}
fn api_path(path: &str) -> Result<(), Box<dyn std::error::Error>> {
    if !path.starts_with("/api/v1/")
        || path.contains(['#', '\\'])
        || path.split('/').any(|p| p == ".." || p == ".")
    {
        Err("Expected an API path under /api/v1/".into())
    } else {
        Ok(())
    }
}
fn uuid4(value: &str) -> Result<(), Box<dyn std::error::Error>> {
    let id = Uuid::parse_str(value)?;
    if id.get_version_num() != 4 || id.to_string() != value {
        return Err("Expected a canonical UUIDv4".into());
    }
    Ok(())
}

fn request_id_at(time: &str) -> Result<String, Box<dyn std::error::Error>> {
    let millis = chrono::DateTime::parse_from_rfc3339(time)?.timestamp_millis();
    if !(0..(1i64 << 48)).contains(&millis) {
        return Err("Invalid server time".into());
    }
    let mut bytes = Uuid::now_v7().into_bytes();
    bytes[..6].copy_from_slice(&(millis as u64).to_be_bytes()[2..]);
    Ok(Uuid::from_bytes(bytes).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;
    #[test]
    fn command_tree_is_valid_and_requires_explicit_socket() {
        Arguments::command().debug_assert();
        assert!(Arguments::try_parse_from(["projectctl", "hello"]).is_err());
        assert!(
            Arguments::try_parse_from(["projectctl", "--socket", "/tmp/example.sock", "hello"])
                .is_ok()
        );
    }
}
