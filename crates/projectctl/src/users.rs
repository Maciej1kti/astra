//! Trusted profile management; global creation belongs to the default command journal.
use crate::transport::{Error, Request, checked};
use clap::Subcommand;
use reqwest::Client;
use serde_json::json;

#[derive(Subcommand)]
pub enum Action {
    /// Create a profile. Keep its ID, name, request ID and epoch unchanged on retry.
    Create {
        /// New canonical UUIDv4, chosen once and retained on retry.
        #[arg(long)]
        id: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
    /// Rename a profile using the observed users registry version.
    Rename {
        id: String,
        #[arg(long)]
        name: String,
        /// Version returned by users; never replaced automatically on retry.
        #[arg(long)]
        if_version: String,
        #[arg(long)]
        request_id: Option<String>,
        #[arg(long)]
        epoch: Option<String>,
    },
}

impl Action {
    pub async fn prepare(self, client: &Client) -> Result<Request, Error> {
        let (id, name, expected, request_id, epoch) = match self {
            Self::Create {
                id,
                name,
                request_id,
                epoch,
            } => (id, name, None, request_id, epoch),
            Self::Rename {
                id,
                name,
                if_version,
                request_id,
                epoch,
            } => (id, name, Some(if_version), request_id, epoch),
        };
        crate::uuid4(&id)?;
        if request_id.is_some() != epoch.is_some() {
            return Err("Retry requires both --request-id and --epoch".into());
        }
        let users = checked(client.get("http://localhost/api/v1/users")).await?;
        let default = users["items"]
            .as_array()
            .and_then(|items| items.iter().find(|user| user["is_default"] == true))
            .and_then(|user| user["id"].as_str())
            .ok_or("User list has no default profile")?;
        crate::uuid4(default)?;
        let request = if let Some(version) = expected {
            Request::command(
                "PATCH",
                format!("/api/v1/users/{id}"),
                Some(json!({"name":name})),
            )
            .version(Some(version))
        } else {
            Request::command("POST", "/api/v1/users", Some(json!({"id":id,"name":name})))
        };
        Ok(request.retry(request_id, epoch).user(default.to_owned()))
    }
}
