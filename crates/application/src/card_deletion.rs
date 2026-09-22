//! Owner authorized physical card deletion.
//!
//! Deletion is a source command with an absent durable after state. The
//! command is admitted before project or card lookup so a retry can replay a
//! committed result even when the project has since disappeared.

use crate::{
    AppError, Reply,
    engine::Engine,
    journal::{Command, Intent, Reference, Target},
    now_millis,
    source::read,
    writer::Writer,
};
use project_store::{
    document::{self, Kind},
    filesystem::ProjectStore,
};
use serde_json::{Value, json};

impl Engine {
    pub fn delete_card(
        &self,
        project_id: &str,
        card_id: &str,
        payload: Value,
        request_id: &str,
        epoch: &str,
        expected: Option<String>,
    ) -> Result<Reply, AppError> {
        // A deletion changes source membership and is guarded by workspace
        // focus state, so the complete operation uses the exclusive gate.
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let command = Command {
            request_id: request_id.into(),
            epoch: epoch.into(),
            method: "DELETE".into(),
            target: Target {
                project_id: project_id.into(),
                kind: Kind::Card,
                id: card_id.into(),
            },
            expected,
            payload,
        };
        let now = now_millis();
        // Admission deliberately precedes every source and registration lookup.
        if let Some(reply) = self.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |reply: Reply| -> Result<Reply, AppError> {
            Ok(self
                .journal
                .record(&command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        if command.payload != json!({}) {
            return reject(Reply::error(422, "VALIDATION_FAILED", request_id));
        }
        if command.expected.is_none() {
            return reject(Reply::error(428, "PRECONDITION_REQUIRED", request_id));
        }
        let handle = match self.store(project_id) {
            Ok(handle) => handle,
            Err(error) => return self.journal.reject_error(&command, error, now),
        };
        let mut store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
        if let Err(error) = preflight_card(&store, card_id, command.expected.as_deref()) {
            return self.journal.reject_error(&command, error, now);
        }
        let workspace = self.workspace()?.value;
        let focused = workspace
            .focus
            .iter()
            .any(|focus| focus.project_id == project_id && focus.card_id == card_id);
        if focused {
            return reject(focus_blocker(request_id, project_id, card_id));
        }
        let project = match read(&store, Kind::Project, project_id) {
            Ok(project) => project,
            Err(error) => return self.journal.reject_error(&command, error, now),
        };
        if project.document.get().status() == Some("archived") {
            return reject(Reply::error(409, "PROJECT_ARCHIVED", request_id));
        }
        let mut reply = Writer {
            journal: &self.journal,
        }
        .execute_delete(
            &mut store,
            &command,
            vec![Reference {
                kind: Kind::Project,
                id: project_id.into(),
                version: Some(project.version),
            }],
            now,
            |_| {
                if focused {
                    return Err(AppError::Rejected(focus_blocker(
                        request_id, project_id, card_id,
                    )));
                }
                Ok(())
            },
            |_| Ok(()),
        )?;
        let repair_projection = reply.http_status == 200
            && reply.body["status"] == "committed"
            && self
                .index
                .refresh_targets(&store, project_id, &[(Kind::Card, card_id.into())], now)
                .is_err();
        if repair_projection {
            reply.body["warnings"]
                .as_array_mut()
                .expect("delete warnings array")
                .push(json!({
                    "code": "PROJECTION_DEGRADED",
                    "message": "Source committed; the search index needs rebuilding."
                }));
            let _ = self
                .index
                .mark_unavailable(project_id, "PROJECTION_DEGRADED", now);
            let _ = self.journal.update_result(&command, &reply);
        }
        // Projection repair may open this store again; release its mutex first.
        drop(store);
        if repair_projection
            && let Err(error) = self.repair_completed_projection(project_id, request_id)
        {
            crate::diagnostics::record_failure(
                "card_deletion_projection_schedule",
                &error,
                Some(project_id),
                Some(request_id),
            );
        }
        Ok(reply)
    }
}

fn focus_blocker(request_id: &str, project_id: &str, card_id: &str) -> Reply {
    let mut reply = Reply::error(409, "CARD_IN_FOCUS", request_id);
    reply.body["error"]["details"] = json!({
        "project_id": project_id,
        "card_id": card_id,
        "message": "Remove the card from workspace focus before deleting it.",
    });
    reply
}

fn preflight_card(
    store: &ProjectStore,
    card_id: &str,
    expected: Option<&str>,
) -> Result<(), AppError> {
    let (directory, filename) = match store.location(Kind::Card, card_id, false) {
        Ok(location) => location,
        Err(project_store::StoreError::Io(error))
            if error.kind() == std::io::ErrorKind::NotFound =>
        {
            return Err(AppError::reject(404, "RESOURCE_NOT_FOUND"));
        }
        Err(error) => return Err(error.into()),
    };
    let bytes = directory
        .read(&filename)?
        .ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
    if expected != Some(document::version(&bytes).as_str()) {
        return Err(AppError::reject(412, "VERSION_CONFLICT"));
    }
    document::parse(Kind::Card, Some(card_id), &bytes)
        .map_err(|_| AppError::reject(409, "DOCUMENT_INVALID"))?;
    Ok(())
}

/// Called by the startup owner while holding the exclusive workspace gate.
/// It rechecks focus after a crash. Returning false makes Writer mark the
/// intent needs_review.
pub(crate) fn recovery_guard(
    engine: &Engine,
    store: &ProjectStore,
    intent: &Intent,
) -> Result<bool, AppError> {
    if intent.after.is_some() {
        return Ok(true);
    }
    if intent.command.method != "DELETE" || intent.command.target.kind != Kind::Card {
        // A caller that reaches generic source recovery with another absent
        // after-state must stop for explicit operational handling.
        return Ok(false);
    }
    let workspace = engine.workspace()?.value;
    if workspace.focus.iter().any(|focus| {
        focus.project_id == intent.command.target.project_id
            && focus.card_id == intent.command.target.id
    }) {
        return Ok(false);
    }
    let _ = store;
    Ok(true)
}
