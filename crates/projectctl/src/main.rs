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
    socket: Option<PathBuf>,
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
    /// Prepare a local maintenance operation from a strict JSON input file.
    MaintenancePlan {
        #[arg(long)]
        json_file: PathBuf,
    },
    /// Apply a reviewed plan, preserving identity on retries.
    MaintenanceApply {
        plan_id: String,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
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
    let args = match Arguments::try_parse() {
        Ok(args) => args,
        Err(error) if !error.use_stderr() => {
            let _ = error.print();
            return;
        }
        Err(error) => {
            println!(
                "{}",
                json!({"api_version":"1","ok":false,"error":{"code":"INVALID_ARGUMENTS","message":error.to_string()},"request_id":null})
            );
            std::process::exit(2);
        }
    };
    match run(args).await {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            let (code, label) = if let Some(network) = error.downcast_ref::<reqwest::Error>() {
                match network.status().map(|status| status.as_u16()) {
                    Some(404) => (4, "RESOURCE_NOT_FOUND"),
                    Some(401 | 403) => (6, "ACCESS_DENIED"),
                    Some(409 | 412 | 428) => (5, "CONFLICT"),
                    Some(400 | 422) => (2, "INVALID_ARGUMENTS"),
                    Some(_) => (8, "SERVER_ERROR"),
                    None => (3, "TRANSPORT_UNAVAILABLE"),
                }
            } else if let Some(source) = error.downcast_ref::<project_store::StoreError>() {
                match source {
                    project_store::StoreError::Io(error)
                        if error.kind() == std::io::ErrorKind::NotFound =>
                    {
                        (4, "RESOURCE_NOT_FOUND")
                    }
                    _ => (7, "SOURCE_UNAVAILABLE"),
                }
            } else {
                (2, "CLIENT_ERROR")
            };
            println!(
                "{}",
                json!({"api_version":"1","ok":false,"error":{"code":label,"message":error.to_string()},"request_id":null})
            );
            std::process::exit(code);
        }
    }
}

async fn run(args: Arguments) -> Result<i32, Box<dyn std::error::Error>> {
    if matches!(
        args.command,
        Action::Typed(typed::Action::Validate { offline: true })
    ) {
        let path = args
            .project
            .as_ref()
            .ok_or("Offline validation requires --project with an exact folder")?;
        let path = if path.is_absolute() {
            path.clone()
        } else {
            std::env::current_dir()?.join(path)
        };
        let directory =
            project_store::filesystem::Directory::open(&path)?.child(".project", false)?;
        let data = project_store::validation::report(&directory)?;
        let valid = data["valid"] == true;
        println!(
            "{}",
            json!({"api_version":"1","ok":true,"data":data,"request_id":null})
        );
        return Ok(if valid { 0 } else { 7 });
    }
    let client = reqwest::Client::builder()
        .unix_socket(args.socket.ok_or("This command requires --socket")?)
        .no_proxy()
        .timeout(Duration::from_secs(args.timeout))
        .build()?;
    let (method, path, payload, version, request, epoch) = match args.command {
        Action::MaintenancePlan { json_file } => (
            "POST".into(),
            "/local/v1/maintenance/plans".into(),
            Some(serde_json::from_slice(&typed::file(&json_file)?)?),
            None,
            None,
            None,
        ),
        Action::MaintenanceApply {
            plan_id,
            request_id,
            epoch,
        } => {
            if request_id.is_some() != epoch.is_some() {
                return Err("Retry requires both --request-id and --epoch".into());
            }
            let (request_id, epoch) = if let (Some(id), Some(epoch)) = (request_id, epoch) {
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
                json!({"request_id":request_id,"command_epoch":epoch,"plan_id":plan_id})
            );
            (
                "POST".into(),
                "/local/v1/maintenance/jobs".into(),
                Some(json!({"plan_id":plan_id,"request_id":request_id,"command_epoch":epoch})),
                None,
                None,
                None,
            )
        }
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
    let mut identity = payload.as_ref().map(|value| json!({"request_id":value["request_id"],"command_epoch":value["command_epoch"]})).unwrap_or(json!({}));
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
        identity = json!({"request_id":request_id,"command_epoch":epoch});
        builder = builder
            .header("x-request-id", request_id)
            .header("x-command-epoch", epoch);
    }
    let mut reply = match builder.send().await {
        Ok(reply) => reply,
        Err(error) => {
            let uncertain = method != "GET"
                && (path.starts_with("/api/") || path == "/local/v1/maintenance/jobs");
            println!(
                "{}",
                json!({"api_version":"1","ok":false,"error":{"code":if uncertain {"RESULT_UNCERTAIN"} else {"TRANSPORT_UNAVAILABLE"},"message":error.to_string()},"request_id":identity["request_id"],"command_epoch":identity["command_epoch"]})
            );
            return Ok(if uncertain { 9 } else { 3 });
        }
    };
    let status = reply.status().as_u16();
    let body = async {
        let mut bytes = Vec::new();
        while let Some(chunk) = reply.chunk().await? {
            if bytes.len() + chunk.len() > 16 * 1024 * 1024 {
                return Err("Server response exceeds 16 MiB".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() {
            Ok(Value::Null)
        } else {
            Ok::<Value, Box<dyn std::error::Error>>(serde_json::from_slice(&bytes)?)
        }
    }
    .await;
    let body = match body {
        Ok(body) => body,
        Err(error) => {
            let uncertain = method != "GET"
                && (path.starts_with("/api/") || path == "/local/v1/maintenance/jobs");
            println!(
                "{}",
                json!({"api_version":"1","ok":false,"error":{"code":if uncertain {"RESULT_UNCERTAIN"} else {"INVALID_RESPONSE"},"message":error.to_string()},"request_id":identity["request_id"],"command_epoch":identity["command_epoch"]})
            );
            return Ok(if uncertain { 9 } else { 8 });
        }
    };
    let request_id = body
        .get("request_id")
        .or_else(|| body["error"].get("request_id"))
        .unwrap_or(&identity["request_id"]);
    let ok = (200..300).contains(&status);
    let output = if ok {
        json!({"api_version":"1","ok":true,"data":body,"request_id":request_id,"command_epoch":identity["command_epoch"],"http_status":status})
    } else {
        json!({"api_version":"1","ok":false,"error":body["error"],"request_id":request_id,"command_epoch":identity["command_epoch"],"http_status":status})
    };
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(exit_code(status, &body))
}
fn exit_code(status: u16, body: &Value) -> i32 {
    if body["scope"] == "source_documents" && body["valid"] == false {
        return 7;
    }
    if status == 202
        || matches!(
            body["state"].as_str(),
            Some("prepared" | "running" | "blocked" | "needs_review")
        )
    {
        return 9;
    }
    if matches!(
        body["error"]["code"].as_str(),
        Some(
            "DOCUMENT_INVALID"
                | "NORMALIZATION_REQUIRED"
                | "RECOVERY_REQUIRED"
                | "WORKSPACE_RECOVERY_REQUIRED"
                | "PROJECT_RECOVERY_REQUIRED"
        )
    ) {
        return 7;
    }
    match status {
        200..=299 => 0,
        404 => 4,
        409 | 412 | 428 => 5,
        401 | 403 => 6,
        400 | 422 => 2,
        _ => 8,
    }
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
    #[tokio::test]
    async fn command_tree_is_valid_and_requires_socket_except_for_offline_validation() {
        Arguments::command().debug_assert();
        assert!(
            run(Arguments::try_parse_from(["projectctl", "hello"]).unwrap())
                .await
                .is_err()
        );
        assert!(
            Arguments::try_parse_from(["projectctl", "--project", ".", "validate", "--offline"])
                .is_ok()
        );
        assert!(
            Arguments::try_parse_from(["projectctl", "--socket", "/tmp/example.sock", "hello"])
                .is_ok()
        );
    }
}
