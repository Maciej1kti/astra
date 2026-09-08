//! Application facade for transports. Storage and lock ownership stay here.
use crate::{AppError, auth::Auth, engine::Engine, workflow::Workflows};
use serde_json::{Value, json};

impl Engine {
    pub fn retain_history(&self, now: i64) -> Result<Value, AppError> {
        self.journal.retain(now)
    }
    pub fn rotate_after_restore(&mut self, now: i64) -> Result<(), AppError> {
        self.journal.rotate_after_restore(now)
    }
    pub fn auth(&self) -> Auth<'_> {
        Auth {
            journal: &self.journal,
        }
    }
    pub fn command_epoch(&self) -> &str {
        &self.journal.epoch
    }
    pub fn snapshot_cursor(&self) -> Result<String, AppError> {
        self.index.cursor()
    }
    pub fn subscribe_changes(&self) -> tokio::sync::watch::Receiver<u64> {
        self.index.subscribe()
    }
    pub fn subscribe_auth_changes(&self) -> tokio::sync::watch::Receiver<u64> {
        self.journal.subscribe_auth_changes()
    }
    pub fn events_since(&self, cursor: &str, now: i64) -> Result<Vec<Value>, AppError> {
        self.index.events_since(cursor, now)
    }
    pub fn job(&self, id: &str) -> Result<Value, AppError> {
        Workflows {
            journal: &self.journal,
        }
        .job(id)
    }
    pub fn command_status(&self, id: &str, original_epoch: &str) -> Result<Value, AppError> {
        if !crate::valid_request_id(id) {
            return Err(AppError::reject(400, "INVALID_REQUEST_ID"));
        }
        if !uuid::Uuid::parse_str(original_epoch).is_ok_and(|value| {
            value.get_version_num() == 4
                && value.get_variant() == uuid::Variant::RFC4122
                && value.to_string() == original_epoch
        }) {
            return Err(AppError::reject(400, "INVALID_EPOCH"));
        }
        if original_epoch != self.journal.epoch {
            return Err(AppError::reject(409, "EPOCH_CHANGED"));
        }
        let (state, reply) = self
            .journal
            .command_status(original_epoch, id)?
            .ok_or_else(|| AppError::reject(404, "COMMAND_NOT_FOUND"))?;
        let mut value = json!({"api_version":"1","request_id":id,"state":state});
        if let Some(reply) = reply {
            if reply.body.get("result").is_some() {
                value["result"] = reply.body;
            } else if let Some(error) = reply.body.get("error") {
                value["error"] = json!({"api_version":"1","error":error});
            }
        }
        Ok(value)
    }
}
