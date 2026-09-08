mod input;
mod output;
mod queries;
mod transport;
mod typed;
use clap::{Parser, Subcommand, ValueEnum};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Duration};
use transport::Request;
use uuid::Uuid;

#[derive(Parser)]
#[command(
    version,
    about = "Astra client. Read, plan and update projects through the local daemon."
)]
struct Arguments {
    /// Daemon socket. Overrides ASTRA_SOCKET; no instance is selected implicitly.
    #[arg(long, global = true)]
    socket: Option<PathBuf>,
    /// Exact registered project folder; never searches parent folders.
    #[arg(long, global = true)]
    project: Option<PathBuf>,
    #[arg(long, global=true, default_value_t=30, value_parser=clap::value_parser!(u64).range(1..=300))]
    timeout: u64,
    /// JSON is the default output format; this flag makes the choice explicit.
    #[arg(long, global = true)]
    json: bool,
    /// Select readable text or the default machine-readable JSON envelope.
    #[arg(
        long,
        global = true,
        value_enum,
        default_value = "json",
        conflicts_with = "json"
    )]
    output: OutputFormat,
    #[command(subcommand)]
    command: Action,
}
#[derive(Clone, Copy, ValueEnum)]
enum OutputFormat {
    Json,
    Text,
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
    #[command(flatten)]
    Queries(queries::Action),
    /// Allow browser registration within an explicitly selected directory.
    AddRoot {
        absolute_path: PathBuf,
        #[arg(long)]
        label: String,
    },
    /// Revoke a browser registration root without deleting project files.
    RemoveRoot { id: String },
    /// Read instance identity, command epoch and server time.
    Hello,
    /// Inspect storage, index and recovery diagnostics.
    Doctor,
    /// List the first page of registered projects and their availability.
    Projects,
    /// Preview registration of an exact local folder without applying it.
    RegistrationPlan {
        absolute_path: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        tracked: bool,
    },
    /// Apply a reviewed registration plan; use job to inspect accepted work.
    Register {
        plan_id: String,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
    /// List pending browser access requests.
    Pairings,
    /// Approve one browser after comparing its challenge.
    Approve {
        pairing_id: String,
        #[arg(long)]
        challenge: String,
    },
    /// Reject a pending browser access request.
    Deny { pairing_id: String },
    /// Read an API resource. Paths must start with /api/v1/.
    Get { path: String },
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
    let format = args.output;
    match run(args).await {
        Ok(outcome) => {
            print_output(&outcome.output, format);
            std::process::exit(outcome.code);
        }
        Err(error) => {
            if let Some(failure) = error.downcast_ref::<transport::Failure>() {
                print_output(&failure.output, format);
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
            print_output(
                &json!({"api_version":"1","ok":false,"error":{"code":label,"message":error.to_string()},"request_id":null}),
                format,
            );
            std::process::exit(code);
        }
    }
}

fn print_output(value: &Value, format: OutputFormat) {
    match format {
        OutputFormat::Json => println!(
            "{}",
            serde_json::to_string_pretty(value).expect("JSON value")
        ),
        OutputFormat::Text => println!("{}", output::render(value)),
    }
}

async fn run(args: Arguments) -> Result<transport::Outcome, Box<dyn std::error::Error>> {
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
        return Ok(transport::Outcome {
            code: if valid { 0 } else { 7 },
            output: json!({"api_version":"1","ok":true,"data":data,"request_id":null}),
        });
    }
    let socket = args.socket.or_else(|| {
        std::env::var_os("ASTRA_SOCKET")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
    });
    let client = reqwest::Client::builder()
        .unix_socket(socket.ok_or("Provide --socket or set ASTRA_SOCKET to the daemon socket")?)
        .no_proxy()
        .timeout(Duration::from_secs(args.timeout))
        .build()?;
    let request = match args.command {
        Action::MaintenancePlan { json_file } => Request::local(
            "POST",
            "/local/v1/maintenance/plans",
            Some(input::json(&json_file)?),
        ),
        Action::MaintenanceApply {
            plan_id,
            request_id,
            epoch,
        } => Request::maintenance(plan_id).retry(request_id, epoch),
        Action::Typed(action) => action.prepare(&client, args.project.as_deref()).await?,
        Action::Queries(action) => action.prepare(&client, args.project.as_deref()).await?,
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
        } => Request::workflow(
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
            Request::api(&method, path, Some(input::json(&json_file)?))
                .version(if_version)
                .retry(request_id, epoch)
        }
    };
    transport::execute(&client, request).await
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
    #[test]
    fn command_tree_accepts_explicit_connection_and_offline_validation() {
        Arguments::command().debug_assert();
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
