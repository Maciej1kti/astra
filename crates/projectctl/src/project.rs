//! Explicit project lifecycle commands.  Project IDs are always supplied by
//! the caller so retries do not depend on a folder that may have been removed.

use crate::transport::{Error, Request};
use clap::{Args, Subcommand};
use serde_json::json;

#[derive(Args)]
pub struct Identity {
    #[arg(long, requires = "epoch")]
    request_id: Option<String>,
    #[arg(long, requires = "request_id")]
    epoch: Option<String>,
}

#[derive(Subcommand)]
pub enum Action {
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
