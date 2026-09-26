//! Owner authorized physical card/report deletion.
//!
//! Deletion is a source command with an absent durable after state. The
//! command is admitted before project or resource lookup so a retry can replay a
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
        self.delete_source(
            Target {
                project_id: project_id.into(),
                kind: Kind::Card,
                id: card_id.into(),
            },
            payload,
            request_id,
            epoch,
            expected,
        )
    }

    pub fn delete_report(
        &self,
        project_id: &str,
        report_id: &str,
        payload: Value,
        request_id: &str,
        epoch: &str,
        expected: Option<String>,
    ) -> Result<Reply, AppError> {
        self.delete_source(
            Target {
                project_id: project_id.into(),
                kind: Kind::Update,
                id: report_id.into(),
            },
            payload,
            request_id,
            epoch,
            expected,
        )
    }

    fn delete_source(
        &self,
        target: Target,
        payload: Value,
        request_id: &str,
        epoch: &str,
        expected: Option<String>,
    ) -> Result<Reply, AppError> {
        // Membership changes serialize with source writes and reference creation.
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let command = Command {
            request_id: request_id.into(),
            epoch: epoch.into(),
            method: "DELETE".into(),
            target,
            expected,
            payload,
        };
        let project_id = command.target.project_id.as_str();
        let id = command.target.id.as_str();
        let kind = command.target.kind;
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
        if let Err(error) = preflight_source(&store, kind, id, command.expected.as_deref()) {
            return self.journal.reject_error(&command, error, now);
        }
        if let Err(error) = deletion_guard(&store, kind, project_id, id, request_id) {
            return self.journal.reject_error(&command, error, now);
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
            |store| deletion_guard(store, kind, project_id, id, request_id),
            |_| Ok(()),
        )?;
        let repair_projection = reply.http_status == 200
            && reply.body["status"] == "committed"
            && self
                .index
                .refresh_targets(&store, project_id, &[(kind, id.into())], now)
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
                "source_deletion_projection_schedule",
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
        "message": "Unpin the card before deleting it.",
    });
    reply
}

fn preflight_source(
    store: &ProjectStore,
    kind: Kind,
    id: &str,
    expected: Option<&str>,
) -> Result<(), AppError> {
    let (directory, filename) = match store.location(kind, id, false) {
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
    document::parse(kind, Some(id), &bytes)
        .map_err(|_| AppError::reject(409, "DOCUMENT_INVALID"))?;
    Ok(())
}

fn deletion_guard(
    store: &ProjectStore,
    kind: Kind,
    project_id: &str,
    id: &str,
    request_id: &str,
) -> Result<(), AppError> {
    match kind {
        Kind::Card => match read(store, kind, id) {
            Ok(card) if matches!(card.document.get(), project_domain::models::Document::Card { metadata, .. } if metadata.pinned == Some(true)) =>
            {
                return Err(AppError::Rejected(focus_blocker(
                    request_id, project_id, id,
                )));
            }
            Err(AppError::Rejected(reply)) if reply.http_status == 404 => {}
            Err(error) => return Err(error),
            _ => {}
        },
        Kind::Update => {
            // Read source membership again, including reports created externally
            // since preparation. Never use the disposable index for this guard.
            for report in crate::source::collection(store, Kind::Update)? {
                let value = report.value();
                let metadata = &value["metadata"];
                if metadata["supersedes"].as_str() == Some(id)
                    || metadata["resolves"]
                        .as_array()
                        .is_some_and(|ids| ids.iter().any(|item| item.as_str() == Some(id)))
                {
                    let mut reply = Reply::error(409, "REPORT_REFERENCED", request_id);
                    reply.body["error"]["details"] = json!({"report_id":id,"referencing_report_id":metadata["id"],"message":"Delete the referencing report first."});
                    return Err(AppError::Rejected(reply));
                }
            }
        }
        _ => return Err(AppError::invariant("unsupported source deletion")),
    }
    Ok(())
}

/// Startup holds the exclusive workspace gate. Recheck pins/report references
/// even if unlink already happened; a new reference requires explicit review.
pub(crate) fn recovery_guard(
    _engine: &Engine,
    store: &ProjectStore,
    intent: &Intent,
) -> Result<bool, AppError> {
    if intent.after.is_some() {
        return Ok(true);
    }
    if intent.command.method != "DELETE"
        || !matches!(intent.command.target.kind, Kind::Card | Kind::Update)
    {
        return Ok(false);
    }
    match deletion_guard(
        store,
        intent.command.target.kind,
        &intent.command.target.project_id,
        &intent.command.target.id,
        &intent.command.request_id,
    ) {
        Ok(()) => Ok(true),
        Err(AppError::Rejected(_)) => Ok(false),
        Err(error) => Err(error),
    }
}
