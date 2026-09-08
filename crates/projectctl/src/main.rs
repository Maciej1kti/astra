mod transport;
mod typed;
use clap::{Parser, Subcommand};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Duration};
use transport::Request;
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
            if let Some(failure) = error.downcast_ref::<transport::Failure>() {
                println!("{}", failure.output);
                std::process::exit(failure.code);
            }
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
    let request = match args.command {
        Action::MaintenancePlan { json_file } => Request::local(
            "POST",
            "/local/v1/maintenance/plans",
            Some(serde_json::from_slice(&typed::file(&json_file)?)?),
        ),
        Action::MaintenanceApply {
            plan_id,
            request_id,
            epoch,
        } => Request::maintenance(plan_id).retry(request_id, epoch),
        Action::Typed(action) => action.prepare(&client, args.project.as_deref()).await?,
        Action::AddRoot {
            absolute_path,
            label,
        } => Request::local(
            "POST",
            "/local/v1/roots",
            Some(json!({"absolute_path":absolute_path,"label":label})),
        ),
        Action::RemoveRoot { id } => {
            uuid4(&id)?;
            Request::local("DELETE", format!("/local/v1/roots/{id}"), Some(json!({})))
        }
        Action::Hello => Request::read("/local/v1/hello"),
        Action::Doctor => Request::read("/local/v1/doctor"),
        Action::Projects => Request::read("/api/v1/projects"),
        Action::Pairings => Request::read("/api/v1/auth/pairings"),
        Action::RegistrationPlan {
            absolute_path,
            name,
            tracked,
        } => {
            let mut value = json!({"absolute_path":absolute_path,"git_mode":if tracked {"tracked"}else{"private"}});
            if let Some(name) = name {
                value["name"] = json!(name);
            }
            Request::local("POST", "/local/v1/registration-plans", Some(value))
        }
        Action::Register {
            plan_id,
            request_id,
            epoch,
        } => Request::api(
            "POST",
            "/api/v1/registrations",
            Some(json!({"plan_id":plan_id})),
        )
        .retry(request_id, epoch),
        Action::Approve {
            pairing_id,
            challenge,
        } => {
            uuid4(&pairing_id)?;
            Request::local(
                "POST",
                format!("/local/v1/pairings/{pairing_id}/approve"),
                Some(json!({"challenge":challenge})),
            )
        }
        Action::Deny { pairing_id } => {
            uuid4(&pairing_id)?;
            Request::local(
                "POST",
                format!("/local/v1/pairings/{pairing_id}/deny"),
                Some(json!({})),
            )
        }
        Action::Get { path } => {
            api_path(&path)?;
            Request::read(path)
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
            Request::api(
                &method,
                path,
                Some(serde_json::from_slice(&typed::file(&json_file)?)?),
            )
            .version(if_version)
            .retry(request_id, epoch)
        }
    };
    let outcome = transport::execute(&client, request).await?;
    println!("{}", serde_json::to_string_pretty(&outcome.output)?);
    Ok(outcome.code)
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
