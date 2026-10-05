//! Operator review of interrupted source writes that recovery could not settle.
use crate::transport::{Error, Request};
use clap::Subcommand;
use reqwest::Client;
use serde_json::json;
use std::path::Path;

#[derive(Subcommand)]
pub enum Action {
    /// List unresolved source writes with their saved and current versions.
    List,
    /// Keep the current source and record the reviewed command as rejected.
    /// Never writes a source file. Requires --project and a needs_review state.
    Abandon {
        /// Request ID printed by `recovery list`.
        request_id: String,
        /// Current source version you reviewed, as printed by `recovery list`.
        #[arg(
            long,
            conflicts_with = "if_absent",
            required_unless_present = "if_absent"
        )]
        if_version: Option<String>,
        /// The source is absent and should stay absent.
        #[arg(long)]
        if_absent: bool,
    },
}

impl Action {
    pub async fn prepare(self, client: &Client, project: Option<&Path>) -> Result<Request, Error> {
        match self {
            Self::List => Ok(Request::read(match project {
                Some(_) => format!(
                    "/local/v1/recovery/intents?project_id={}",
                    crate::input::project_id(client, project).await?
                ),
                None => "/local/v1/recovery/intents".into(),
            })),
            Self::Abandon {
                request_id,
                if_version,
                if_absent: _,
            } => {
                if !uuid::Uuid::parse_str(&request_id)
                    .is_ok_and(|id| id.get_version_num() == 7 && id.to_string() == request_id)
                {
                    return Err("Request ID must be the canonical UUIDv7 from recovery list".into());
                }
                let project_id = crate::input::project_id(client, project).await?;
                Ok(Request::local(
                    "POST",
                    format!("/local/v1/recovery/intents/{request_id}/abandon"),
                    Some(json!({"project_id":project_id,"current_version":if_version})),
                ))
            }
        }
    }
}
