use crate::input;
use crate::transport::{Request, checked};
use clap::{Args, Subcommand};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
type Error = Box<dyn std::error::Error>;
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
    /// Read bounded project context with resource versions for agents and scripts.
    Context {
        #[arg(long, default_value_t=24576,value_parser=clap::value_parser!(u32).range(4096..=131072))]
        max_bytes: u32,
    },
    /// Read and change cards, schedules and their version history.
    Card {
        #[command(subcommand)]
        action: Card,
    },
    /// Read and change milestones and their version history.
    Milestone {
        #[command(subcommand)]
        action: Resource,
    },
    /// List cards; equivalent to card list.
    Cards {
        #[command(flatten)]
        page: Page,
    },
    /// List project reports.
    Reports {
        #[command(flatten)]
        page: Page,
    },
    /// Append project reports and explicit resolutions.
    Report {
        #[command(subcommand)]
        action: Report,
    },
    /// Read or replace the ordered workspace focus list.
    Focus {
        #[command(subcommand)]
        action: Focus,
    },
    /// Manage the workspace tag vocabulary and preview versioned card changes.
    Tags {
        #[command(subcommand)]
        action: Tags,
    },
    /// Check an original command without generating a new identity.
    CommandStatus {
        id: String,
        /// Original epoch printed when the command was submitted.
        #[arg(long)]
        epoch: String,
    },
    /// List paired browser sessions.
    Sessions,
    /// Revoke a browser session.
    RevokeSession { id: String },
}
#[derive(Subcommand)]
pub enum Card {
    #[command(flatten)]
    Resource(Resource),
    /// Set inclusive schedule dates or explicitly remove the schedule.
    Schedule {
        id: String,
        #[arg(long, requires = "end", required_unless_present = "clear")]
        start: Option<String>,
        #[arg(long, requires = "start")]
        end: Option<String>,
        #[arg(long, conflicts_with_all = ["start", "end"])]
        clear: bool,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
}

#[derive(Args)]
#[group(required = true, multiple = true)]
pub struct Patch {
    /// Exact JSON patch file; use - to read stdin. Cannot be mixed with field flags.
    #[arg(long, conflicts_with_all = ["title", "status", "body_file"])]
    patch_file: Option<PathBuf>,
    #[arg(long)]
    title: Option<String>,
    #[arg(long)]
    status: Option<String>,
    /// Replace Markdown body from a UTF-8 file or stdin (-).
    #[arg(long)]
    body_file: Option<PathBuf>,
}
impl Patch {
    fn payload(self) -> Result<Value, Error> {
        if let Some(path) = self.patch_file {
            return input::json(&path);
        }
        let mut set = serde_json::Map::new();
        if let Some(title) = self.title {
            set.insert("title".into(), json!(title));
        }
        if let Some(status) = self.status {
            set.insert("status".into(), json!(status));
        }
        if let Some(path) = self.body_file {
            set.insert("body".into(), json!(input::body(Some(&path))?));
        }
        Ok(json!({"set":set}))
    }
}

#[derive(Subcommand)]
pub enum Resource {
    /// List resource summaries and a cursor for the next page.
    List {
        #[command(flatten)]
        page: Page,
    },
    /// Read the complete resource and its observed version.
    Get { id: String },
    /// Create from title/body or a complete JSON request supplied with --input.
    Create {
        #[arg(long, required_unless_present = "input", conflicts_with = "input")]
        title: Option<String>,
        /// UTF-8 Markdown file, or - for stdin.
        #[arg(long, conflicts_with = "input")]
        body_file: Option<PathBuf>,
        /// Complete create request as JSON; use - to read stdin.
        #[arg(long, conflicts_with_all = ["title", "body_file"])]
        input: Option<PathBuf>,
        #[command(flatten)]
        identity: Identity,
    },
    /// Change explicit fields or submit a JSON patch using the observed version.
    Set {
        id: String,
        #[command(flatten)]
        patch: Patch,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
    /// Undo one history entry conditionally; later edits remain protected.
    Undo {
        id: String,
        #[arg(long)]
        history_entry: String,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
    /// Change ordering and optionally status relative to explicit neighbors.
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
    /// Read earlier versions of this resource.
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
#[derive(Subcommand)]
pub enum Tags {
    /// Read exact names and source usage, including archived cards.
    List,
    /// Preview only. Apply reviewed rows using card set and their returned versions.
    Preview {
        #[arg(long)]
        source: String,
        #[arg(long)]
        target: String,
    },
    /// Replace only the vocabulary using a JSON object containing tags.
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
    Request::read(path)
}
fn write(
    method: &str,
    path: String,
    payload: Value,
    version: Option<String>,
    identity: Identity,
) -> Request {
    Request::command(method, path, Some(payload))
        .version(version)
        .retry(identity.request_id, identity.epoch)
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
            Self::Tags { action: Tags::List } => {
                return Ok(read("/api/v1/workspace/tags".into()));
            }
            Self::Tags {
                action: Tags::Preview { source, target },
            } => {
                return Ok(Request::query(
                    "POST",
                    "/api/v1/workspace/tags/preview",
                    Some(json!({"source":source,"target":target})),
                ));
            }
            Self::Tags {
                action:
                    Tags::Set {
                        input,
                        if_version,
                        identity,
                    },
            } => {
                return Ok(write(
                    "PUT",
                    "/api/v1/workspace/tags".into(),
                    input::json(&input)?,
                    Some(if_version),
                    identity,
                ));
            }
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
                    input::json(&input)?,
                    Some(if_version),
                    identity,
                ));
            }
            Self::Sessions => return Ok(read("/api/v1/auth/sessions".into())),
            Self::RevokeSession { id } => {
                super::uuid4(&id)?;
                return Ok(Request::action(
                    "DELETE",
                    format!("/api/v1/auth/sessions/{id}"),
                    Some(json!({})),
                ));
            }
            Self::CommandStatus { id, epoch } => {
                let uuid = uuid::Uuid::parse_str(&id)?;
                if uuid.get_version_num() != 7 {
                    return Err("Expected UUIDv7 request ID".into());
                }
                super::uuid4(&epoch)?;
                return Ok(Request::command_status(id, epoch));
            }
            _ => {}
        }
        let project = input::project_id(client, project).await?;
        let root = format!("/api/v1/projects/{project}");
        Ok(match self {
            Self::Git => read(format!("{root}/git")),
            Self::Validate { .. } => read(format!("{root}/validation")),
            Self::Context { max_bytes } => read(format!("{root}/context?max_bytes={max_bytes}")),
            Self::Cards { page: p } => read(page(format!("{root}/cards"), p)),
            Self::Reports { page: p } => read(page(format!("{root}/updates"), p)),
            Self::Card { action } => card(format!("{root}/cards"), action)?,
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
                    json!({"kind":kind,"summary":summary,"target":{"type":kind_target,"id":id},"body":input::body(body_file.as_deref())?,"author":{"kind":"human","label":author}}),
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
                let original =
                    checked(client.get(format!("http://localhost{root}/updates/{id}"))).await?;
                write(
                    "POST",
                    format!("{root}/updates"),
                    json!({
                        "kind": "resolution",
                        "summary": summary,
                        "target": original["metadata"]["target"],
                        "resolves": [id],
                        "body": input::body(body_file.as_deref())?,
                        "author": {
                            "kind": "human",
                            "label": "CLI user",
                        },
                    }),
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
            input,
            identity,
        } => write(
            "POST",
            root,
            match input {
                Some(path) => input::json(&path)?,
                None => {
                    json!({"title":title.ok_or("A title is required")?,"body":input::body(body_file.as_deref())?})
                }
            },
            None,
            identity,
        ),
        Resource::Set {
            id,
            patch,
            if_version,
            identity,
        } => {
            super::uuid4(&id)?;
            write(
                "PATCH",
                format!("{root}/{id}"),
                patch.payload()?,
                Some(if_version),
                identity,
            )
        }
        Resource::Undo {
            id,
            history_entry,
            if_version,
            identity,
        } => {
            super::uuid4(&id)?;
            super::uuid4(&history_entry)?;
            write(
                "PATCH",
                format!("{root}/{id}"),
                json!({"undo":{"history_entry_id":history_entry}}),
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

fn card(root: String, action: Card) -> Result<Request, Error> {
    match action {
        Card::Resource(action) => resource(root, action),
        Card::Schedule {
            id,
            start,
            end,
            clear,
            if_version,
            identity,
        } => {
            super::uuid4(&id)?;
            let payload = if clear {
                json!({"clear":["schedule"]})
            } else {
                json!({"set":{"schedule":{"start":start.ok_or("Schedule start is required")?,"end":end.ok_or("Schedule end is required")?}}})
            };
            Ok(write(
                "PATCH",
                format!("{root}/{id}"),
                payload,
                Some(if_version),
                identity,
            ))
        }
    }
}
