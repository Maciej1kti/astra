use crate::{
    AppError, Reply,
    command_state::CommandState,
    engine::{Engine, lock_store},
    instant,
    journal::{Command, CommandRecord, Journal, Target},
    now_millis,
    source::read,
    wire,
};
use project_store::document::Kind;
use rusqlite::params;
use serde_json::{Value, json};
use std::collections::BTreeSet;
impl Engine {
    pub fn receipts(&self, payload: &Value, request: &str, epoch: &str) -> Result<Reply, AppError> {
        let _gate = self.shared_gate()?;
        let command = Command {
            request_id: request.into(),
            epoch: epoch.into(),
            method: "POST:read-receipts".into(),
            target: Target {
                project_id: "workspace".into(),
                kind: Kind::Update,
                id: "receipts".into(),
            },
            expected: None,
            payload: payload.clone(),
        };
        let now = now_millis();
        if let Some(reply) = self.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |code| -> Result<Reply, AppError> {
            let reply = Reply::error(422, code, request);
            Ok(self
                .journal
                .record(&command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        if wire::validate("ReceiptsInput", payload).is_err() {
            return reject("VALIDATION_FAILED");
        }
        let items = payload["items"]
            .as_array()
            .ok_or(AppError::invariant("validated receipt items"))?;
        let mut unique = BTreeSet::new();
        for item in items {
            let (project, id) = receipt_key(item)?;
            if !unique.insert((project, id)) {
                return reject("DUPLICATE_RECEIPT");
            }
            let handle = match self.store(project) {
                Ok(handle) => handle,
                Err(error) => return self.journal.reject_error(&command, error, now),
            };
            let store = lock_store(&handle)?;
            if let Err(error) = read(&store, Kind::Update, id) {
                return self.journal.reject_error(&command, error, now);
            }
        }
        let mut db = self.journal.db()?;
        if let Some(reply) = Journal::known(&db, &command)? {
            return Ok(reply);
        }
        let tx = db.transaction()?;
        let mut changed = 0;
        for item in items {
            let (project, id) = receipt_key(item)?;
            changed += if item["read"] == true {
                tx.execute(
                    "INSERT
OR IGNORE INTO read_receipts(project_id,
    update_id,
    read_at)
VALUES (?1,
    ?2,
    ?3)",
                    params![project, id, instant(now)],
                )?
            } else {
                tx.execute(
                    "DELETE FROM read_receipts WHERE project_id=?1 AND update_id=?2",
                    [project, id],
                )?
            };
        }
        let reply = Reply {
            http_status: 200,
            body: json!({
                "api_version": "1",
                "request_id": request,
                "status": if changed==0{"noop"}else{"committed"},
                "result": {
                    "type": "receipt",
                },
                "warnings": [],
                "replayed": false,
            }),
        };
        Journal::insert_command(
            &tx,
            CommandRecord {
                command: &command,
                state: CommandState::Committed,
                target_kind: "receipt",
                reply: &reply,
                received_at: now,
            },
        )?;
        tx.commit()?;
        drop(db);
        if changed > 0 {
            let _ = self.index.invalidate_workspace(now);
        }
        Ok(reply)
    }
    /// Remove one bounded batch of receipts whose project left this workspace
    /// before receipts were removed with it. The shared gate orders the
    /// membership snapshot with registration, unregistration and deletion.
    pub(crate) fn prune_receipts(&self) -> Result<usize, AppError> {
        let _gate = self.shared_gate()?;
        let workspace = self.workspace()?.value;
        let registered: Vec<_> = workspace
            .projects
            .iter()
            .map(|project| project.project_id.as_str())
            .collect();
        let registered = serde_json::to_string(&registered)
            .map_err(|source| AppError::stored("registered project IDs", source))?;
        Ok(self.journal.db()?.execute(
            "DELETE FROM read_receipts WHERE rowid IN (
                 SELECT rowid FROM read_receipts
                 WHERE project_id NOT IN (SELECT value FROM json_each(?1))
                 LIMIT ?2)",
            params![registered, RECEIPT_SWEEP_BATCH],
        )?)
    }
    pub(crate) fn receipt(&self, project: &str, id: &str) -> Result<bool, AppError> {
        Ok(self.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM read_receipts WHERE project_id=?1 AND update_id=?2)",
            [project, id],
            |r| r.get(0),
        )?)
    }
}
/// One retention pass removes at most this many orphaned receipts.
const RECEIPT_SWEEP_BATCH: i64 = 500;

/// A project that leaves the workspace takes its receipts along, in the
/// journal transaction that commits its unregistration or deletion.
pub(crate) fn forget_project(
    tx: &rusqlite::Transaction<'_>,
    project_id: &str,
) -> Result<(), AppError> {
    tx.execute(
        "DELETE FROM read_receipts WHERE project_id=?1",
        [project_id],
    )?;
    Ok(())
}
fn receipt_key(item: &Value) -> Result<(&str, &str), AppError> {
    Ok((
        item["project_id"]
            .as_str()
            .ok_or(AppError::invariant("validated receipt project ID"))?,
        item["update_id"]
            .as_str()
            .ok_or(AppError::invariant("validated receipt update ID"))?,
    ))
}
