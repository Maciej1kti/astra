use clap::{Args, Subcommand};
use serde_json::{Value, json};
use std::{
    io::Read,
    path::{Path, PathBuf},
};
type Error = Box<dyn std::error::Error>;
pub type Request = (
    String,
    String,
    Option<Value>,
    Option<String>,
    Option<String>,
    Option<String>,
);
#[derive(Args)]
pub struct Identity {
    #[arg(long, requires = "epoch")]
    request_id: Option<String>,
    #[arg(long, requires = "request_id")]
    epoch: Option<String>,
}
#[derive(Args)]
pub struct Page {
    #[arg(long, default_value_t=50, value_parser=clap::value_parser!(u32).range(1..=200))]
    limit: u32,
    #[arg(long)]
    cursor: Option<String>,
    #[arg(long)]
    status: Option<String>,
}
#[derive(Subcommand)]
pub enum Action {
    /// Observe HEAD and staged index changes on demand; never scans the working tree.
    Git,
    /// Validate source documents; offline mode never writes or initializes a project.
    Validate {
        #[arg(long)]
        offline: bool,
    },
    Context {
        #[arg(long, default_value_t=24576,value_parser=clap::value_parser!(u32).range(4096..=131072))]
        max_bytes: u32,
    },
    Card {
        #[command(subcommand)]
        action: Resource,
    },
    Milestone {
        #[command(subcommand)]
        action: Resource,
    },
    Cards {
        #[command(flatten)]
        page: Page,
    },
    Reports {
        #[command(flatten)]
        page: Page,
    },
    Report {
        #[command(subcommand)]
        action: Report,
    },
    Focus {
        #[command(subcommand)]
        action: Focus,
    },
    CommandStatus {
        id: String,
    },
    Sessions,
    RevokeSession {
        id: String,
    },
}
#[derive(Subcommand)]
pub enum Resource {
    List {
        #[command(flatten)]
        page: Page,
    },
    Get {
        id: String,
    },
    Create {
        #[arg(long)]
        title: String,
        #[arg(long)]
        body_file: Option<PathBuf>,
        #[command(flatten)]
        identity: Identity,
    },
    Set {
        id: String,
        #[arg(long)]
        patch_file: PathBuf,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
    Move {
        id: String,
        #[arg(long)]
        after: Option<String>,
        #[arg(long)]
        before: Option<String>,
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
    History {
        id: String,
        #[command(flatten)]
        page: Page,
    },
}
#[derive(Subcommand)]
pub enum Report {
    Get {
        id: String,
    },
    Add {
        #[arg(long,value_parser=["result","blocker","decision_needed","note"])]
        kind: String,
        #[arg(long)]
        target: String,
        #[arg(long)]
        summary: String,
        #[arg(long)]
        body_file: Option<PathBuf>,
        #[arg(long, default_value = "CLI user")]
        author: String,
        #[command(flatten)]
        identity: Identity,
    },
    Resolve {
        id: String,
        #[arg(long)]
        summary: String,
        #[arg(long)]
        body_file: Option<PathBuf>,
        #[command(flatten)]
        identity: Identity,
    },
}
#[derive(Subcommand)]
pub enum Focus {
    Get,
    Set {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
}
fn read(path: String) -> Request {
    ("GET".into(), path, None, None, None, None)
}
fn write(
    method: &str,
    path: String,
    payload: Value,
    version: Option<String>,
    identity: Identity,
) -> Request {
    (
        method.into(),
        path,
        Some(payload),
        version,
        identity.request_id,
        identity.epoch,
    )
}
pub fn file(path: &Path) -> Result<Vec<u8>, Error> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(1_100_001)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1_100_000 {
        return Err("Input file exceeds 1.1 MB".into());
    }
    Ok(bytes)
}
fn body(path: Option<PathBuf>) -> Result<String, Error> {
    path.map(|p| Ok(String::from_utf8(file(&p)?)?))
        .unwrap_or_else(|| Ok(String::new()))
}
fn page(path: String, page: Page) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("limit", &page.limit.to_string());
    if let Some(cursor) = page.cursor {
        query.append_pair("cursor", &cursor);
    }
    if let Some(status) = page.status {
        query.append_pair("status", &status);
    }
    format!("{path}?{}", query.finish())
}
impl Action {
    pub async fn prepare(
        self,
        client: &reqwest::Client,
        project: Option<&Path>,
    ) -> Result<Request, Error> {
        match self {
            Self::Focus { action: Focus::Get } => {
                return Ok(read("/api/v1/workspace/focus".into()));
            }
            Self::Focus {
                action:
                    Focus::Set {
                        input,
                        if_version,
                        identity,
                    },
            } => {
                return Ok(write(
                    "PUT",
                    "/api/v1/workspace/focus".into(),
                    serde_json::from_slice(&file(&input)?)?,
                    Some(if_version),
                    identity,
                ));
            }
            Self::Sessions => return Ok(read("/api/v1/auth/sessions".into())),
            Self::RevokeSession { id } => {
                super::uuid4(&id)?;
                return Ok((
                    "DELETE".into(),
                    format!("/api/v1/auth/sessions/{id}"),
                    Some(json!({})),
                    None,
                    None,
                    None,
                ));
            }
            Self::CommandStatus { id } => {
                let uuid = uuid::Uuid::parse_str(&id)?;
                if uuid.get_version_num() != 7 {
                    return Err("Expected UUIDv7 request ID".into());
                }
                return Ok(read(format!("/api/v1/commands/{id}")));
            }
            _ => {}
        }
        let path = project
            .ok_or("This command requires --project with an exact registered folder")?
            .canonicalize()?;
        let response = client
            .post("http://localhost/local/v1/projects/resolve")
            .json(&json!({"absolute_path":path}))
            .send()
            .await?;
        let response = response.error_for_status()?;
        let resolved: Value = response.json().await?;
        let project = resolved["project_id"]
            .as_str()
            .ok_or("Invalid project resolution")?;
        let root = format!("/api/v1/projects/{project}");
        Ok(match self {
            Self::Git => read(format!("{root}/git")),
            Self::Validate { .. } => read(format!("{root}/validation")),
            Self::Context { max_bytes } => read(format!("{root}/context?max_bytes={max_bytes}")),
            Self::Cards { page: p } => read(page(format!("{root}/cards"), p)),
            Self::Reports { page: p } => read(page(format!("{root}/updates"), p)),
            Self::Card { action } => resource(format!("{root}/cards"), action)?,
            Self::Milestone { action } => resource(format!("{root}/milestones"), action)?,
            Self::Report {
                action: Report::Get { id },
            } => {
                super::uuid4(&id)?;
                read(format!("{root}/updates/{id}"))
            }
            Self::Report {
                action:
                    Report::Add {
                        kind,
                        target,
                        summary,
                        body_file,
                        author,
                        identity,
                    },
            } => {
                let (kind_target, id) = target
                    .split_once(':')
                    .ok_or("Target must be project:UUID, card:UUID or milestone:UUID")?;
                if !["project", "card", "milestone"].contains(&kind_target) {
                    return Err("Invalid target type".into());
                }
                super::uuid4(id)?;
                write(
                    "POST",
                    format!("{root}/updates"),
                    json!({"kind":kind,"summary":summary,"target":{"type":kind_target,"id":id},"body":body(body_file)?,"author":{"kind":"human","label":author}}),
                    None,
                    identity,
                )
            }
            Self::Report {
                action:
                    Report::Resolve {
                        id,
                        summary,
                        body_file,
                        identity,
                    },
            } => {
                super::uuid4(&id)?;
                let original: Value = client
                    .get(format!("http://localhost{root}/updates/{id}"))
                    .send()
                    .await?
                    .error_for_status()?
                    .json()
                    .await?;
                write(
                    "POST",
                    format!("{root}/updates"),
                    json!({"kind":"resolution","summary":summary,"target":original["metadata"]["target"],"resolves":[id],"body":body(body_file)?,"author":{"kind":"human","label":"CLI user"}}),
                    None,
                    identity,
                )
            }
            _ => unreachable!(),
        })
    }
}
fn resource(root: String, action: Resource) -> Result<Request, Error> {
    Ok(match action {
        Resource::List { page: p } => read(page(root, p)),
        Resource::Get { id } => {
            super::uuid4(&id)?;
            read(format!("{root}/{id}"))
        }
        Resource::History { id, page: p } => {
            super::uuid4(&id)?;
            read(page(format!("{root}/{id}/history"), p))
        }
        Resource::Create {
            title,
            body_file,
            identity,
        } => write(
            "POST",
            root,
            json!({"title":title,"body":body(body_file)?}),
            None,
            identity,
        ),
        Resource::Set {
            id,
            patch_file,
            if_version,
            identity,
        } => {
            super::uuid4(&id)?;
            write(
                "PATCH",
                format!("{root}/{id}"),
                serde_json::from_slice(&file(&patch_file)?)?,
                Some(if_version),
                identity,
            )
        }
        Resource::Move {
            id,
            after,
            before,
            status,
            if_version,
            identity,
        } => {
            super::uuid4(&id)?;
            for id in after.iter().chain(before.iter()) {
                super::uuid4(id)?;
            }
            let set = status
                .map(|status| json!({"status":status}))
                .unwrap_or(json!({}));
            write(
                "PATCH",
                format!("{root}/{id}"),
                json!({"set":set,"placement":{"after_id":after,"before_id":before}}),
                Some(if_version),
                identity,
            )
        }
    })
}
