//! Operator review of source intents that recovery could not settle.
//!
//! A `needs_review` intent means the target holds neither the bytes observed
//! before the write nor the bytes it intended. Astra never chooses between
//! them. The only resolution offered here keeps the current source exactly as
//! it is and records the original command as rejected.
use crate::{AppError, Reply, command_state::CommandState, engine::Engine, journal::Intent};
use project_store::{
    document::{self, Kind},
    filesystem::ProjectStore,
};
use serde_json::{Value, json};

/// Project deletion journals a manifest through the same tables; its partial
/// tree removal is resumed by its own recovery and is not a source intent.
fn source_intent(intent: &Intent) -> bool {
    !(intent.command.target.kind == Kind::Project && intent.after.is_none())
}

fn current_version(store: &ProjectStore, intent: &Intent) -> Result<Option<String>, AppError> {
    let target = &intent.command.target;
    let (directory, name) = match store.location(target.kind, &target.id, false) {
        Ok(location) => location,
        Err(project_store::StoreError::Io(error))
            if error.kind() == std::io::ErrorKind::NotFound =>
        {
            return Ok(None);
        }
        Err(error) => return Err(error.into()),
    };
    Ok(directory
        .read(&name)?
        .map(|bytes| document::version(&bytes)))
}

impl Engine {
    /// Unresolved source intents with the versions an operator needs to judge
    /// them. A source that cannot be read reports no current version.
    pub fn recovery_intents(&self, project_id: Option<&str>) -> Result<Value, AppError> {
        let _gate = self.shared_gate()?;
        let projects = match project_id {
            Some(id) => vec![id.to_owned()],
            None => self
                .workspace()?
                .value
                .projects
                .into_iter()
                .map(|registration| registration.project_id)
                .collect(),
        };
        let mut items = Vec::new();
        for project in projects {
            let handle = self.store(&project)?;
            let store = crate::engine::lock_store(&handle)?;
            for intent in self.journal.pending(&project)? {
                if !source_intent(&intent) {
                    continue;
                }
                let command = &intent.command;
                items.push(json!({
                    "request_id": command.request_id,
                    "command_epoch": command.epoch,
                    "state": self.journal.state(command)?,
                    "project_id": command.target.project_id,
                    "target": {"type": command.target.kind.as_str(), "id": command.target.id},
                    "operation": match (&intent.before, &intent.after) {
                        (_, None) => "delete",
                        (Some(_), Some(_)) => "replace",
                        (None, Some(_)) => "create",
                    },
                    "before_version": intent.before.as_deref().map(document::version),
                    "after_version": intent.after.as_deref().map(document::version),
                    "current_version": current_version(&store, &intent).unwrap_or(None),
                }));
            }
        }
        Ok(json!({"api_version":"1","items":items}))
    }

    /// Settle one reviewed intent by keeping the current source. `current` is
    /// the version the operator observed, or `None` for an absent source; the
    /// intent's saved bytes are discarded and no source file is written.
    pub fn abandon_reviewed_intent(
        &self,
        project_id: &str,
        request_id: &str,
        current: Option<&str>,
    ) -> Result<Value, AppError> {
        if !crate::valid_request_id(request_id) {
            return Err(AppError::reject(400, "INVALID_REQUEST_ID"));
        }
        let _gate = self.shared_gate()?;
        let handle = self.store(project_id)?;
        let store = crate::engine::lock_store(&handle)?;
        let intent = self
            .journal
            .pending(project_id)?
            .into_iter()
            .find(|intent| intent.command.request_id == request_id && source_intent(intent))
            .ok_or_else(|| AppError::reject(404, "RECOVERY_INTENT_NOT_FOUND"))?;
        // Prepared and blocked intents are still completed by ordinary recovery.
        if self.journal.state(&intent.command)? != CommandState::NeedsReview {
            return Err(AppError::reject(409, "RECOVERY_NOT_IN_REVIEW"));
        }
        if current_version(&store, &intent)?.as_deref() != current {
            return Err(AppError::reject(412, "VERSION_CONFLICT"));
        }
        self.journal.abandon(
            &intent,
            Some(&Reply::error(409, "RECOVERY_ABANDONED", request_id)),
            CommandState::NeedsReview,
        )?;
        Ok(json!({
            "api_version": "1",
            "request_id": request_id,
            "state": CommandState::Rejected,
            "recovery_pending": self.journal.has_pending(project_id)?,
        }))
    }
}
