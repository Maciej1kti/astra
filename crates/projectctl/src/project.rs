//! Explicit project lifecycle commands.  Project IDs are always supplied by
//! the caller so retries do not depend on a folder that may have been removed.

use crate::transport::{self, Error, Outcome, Request, checked};
use clap::{Args, Subcommand};
use reqwest::Client;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[derive(Args)]
pub struct Identity {
    #[arg(long, requires = "epoch")]
    request_id: Option<String>,
    #[arg(long, requires = "request_id")]
    epoch: Option<String>,
}

#[derive(Args)]
pub struct Create {
    /// Project name; the server derives the folder name from it.
    #[arg(long)]
    name: String,
    /// Approved root to create the folder in instead of the profile's default.
    #[arg(long)]
    root: Option<String>,
    /// Existing directory below --root, relative to it.
    #[arg(long, requires = "root")]
    path: Option<String>,
    /// Identity of an earlier attempt, so repeating it creates no second folder.
    #[arg(long)]
    creation_id: Option<String>,
    /// Keep the project local even when the host and profile publish new projects.
    #[arg(long)]
    no_publish: bool,
}

#[derive(Subcommand)]
pub enum Action {
    /// Create a project by name: its folder, its registration and, where the
    /// host and profile publish, its private repository. The same server
    /// operations as the browser's Add project.
    Create(Create),
    /// Append a Markdown comment to the project with a declared human or bot author.
    Comment {
        project_id: String,
        /// Markdown file with the comment; use - to read stdin.
        #[arg(long)]
        body_file: PathBuf,
        #[arg(long)]
        author: String,
        #[arg(long, value_parser = ["human", "agent"])]
        author_kind: String,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
    /// Preview the bounded `.project` tree and return its deletion version.
    DeletionPlan { project_id: String },
    /// Permanently remove `.project`; retain the printed request identity for retries.
    Delete {
        project_id: String,
        #[arg(long)]
        if_version: String,
        #[command(flatten)]
        identity: Identity,
    },
}

impl Action {
    pub fn prepare(self) -> Result<Request, Error> {
        match self {
            Self::Create(_) => Err("project create runs several requests".into()),
            Self::Comment {
                project_id,
                body_file,
                author,
                author_kind,
                if_version,
                identity,
            } => {
                crate::uuid4(&project_id)?;
                Ok(Request::command(
                    "PATCH",
                    format!("/api/v1/projects/{project_id}"),
                    Some(
                        json!({"append_comment":{"body":crate::input::body(Some(&body_file))?,"author":{"kind":author_kind,"label":author}}}),
                    ),
                )
                .version(Some(if_version))
                .retry(identity.request_id, identity.epoch))
            }
            Self::DeletionPlan { project_id } => {
                crate::uuid4(&project_id)?;
                Ok(Request::read(format!(
                    "/api/v1/projects/{project_id}/deletion-plan"
                )))
            }
            Self::Delete {
                project_id,
                if_version,
                identity,
            } => {
                crate::uuid4(&project_id)?;
                Ok(Request::command(
                    "DELETE",
                    format!("/api/v1/projects/{project_id}"),
                    Some(json!({})),
                )
                .version(Some(if_version))
                .retry(identity.request_id, identity.epoch))
            }
        }
    }
}

/// The browser's three steps in order: folder, registration, publication.
/// A project that is registered counts as created even when its publication
/// failed; the repository state in the result says what happened to it.
pub async fn create(
    client: &Client,
    arguments: Create,
    user: Option<String>,
    timeout: Duration,
) -> Result<Outcome, Error> {
    let creation_id = match arguments.creation_id {
        Some(id) => {
            crate::uuid4(&id)?;
            id
        }
        None => uuid::Uuid::new_v4().to_string(),
    };
    let mut input = json!({"creation_id": creation_id, "name": arguments.name});
    if let Some(root) = arguments.root {
        crate::uuid4(&root)?;
        input["root_id"] = json!(root);
        input["relative_path"] = json!(arguments.path.unwrap_or_default());
    }
    let folder = checked(
        client
            .post("http://localhost/api/v1/project-folders")
            .json(&input),
    )
    .await?;
    let (Some(plan), Some(project)) = (
        folder["plan"]["plan_id"].as_str(),
        folder["plan"]["project_id"].as_str(),
    ) else {
        return Err("Invalid project folder response".into());
    };
    let mut data = json!({
        "creation_id": creation_id,
        "project_id": project,
        "folder": folder["folder"],
        "path": folder["plan"]["display_path"],
        "registration": Value::Null,
        "repository": Value::Null,
    });
    let registered = transport::execute(
        client,
        Request::workflow(
            "POST",
            "/api/v1/registrations",
            Some(json!({"plan_id": plan})),
        )
        .selected_user(user),
    )
    .await?;
    let Some(job) = registered.output["data"]["job_id"].as_str() else {
        // Refused or uncertain: the reply carries the request identity to check.
        let mut outcome = registered;
        outcome.output["project"] = data;
        return Ok(outcome);
    };
    let job = checked(client.get(format!("http://localhost/api/v1/jobs/{job}"))).await?;
    data["registration"] = job["state"].clone();
    let done = job["state"] == "done";
    if done && folder["publish"] == true && !arguments.no_publish {
        let url = format!("http://localhost/api/v1/projects/{project}/repository");
        let deadline = Instant::now() + timeout;
        let mut state = checked(client.post(&url).json(&json!({}))).await?;
        while state["state"] == "publishing" && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(500)).await;
            state = checked(client.get(&url)).await?;
        }
        data["repository"] = state;
    }
    Ok(Outcome {
        code: if done { 0 } else { 9 },
        output: json!({
            "api_version": "1",
            "ok": done,
            "http_status": if done { 200 } else { 202 },
            "request_id": registered.output["request_id"],
            "command_epoch": registered.output["command_epoch"],
            "data": data,
        }),
    })
}
