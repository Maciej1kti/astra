use crate::{
    AppError, Reply,
    engine::{Engine, read},
    instant,
    journal::{Command, Journal, Target},
    now_millis, wire,
};
use project_store::document::Kind;
use rusqlite::params;
use serde_json::{Value, json};
use std::collections::BTreeSet;
impl Engine {
    pub fn receipts(&self, payload: &Value, request: &str, epoch: &str) -> Result<Reply, AppError> {
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
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
        let mut unique = BTreeSet::new();
        for item in payload["items"].as_array().unwrap() {
            let project = item["project_id"].as_str().unwrap();
            let id = item["update_id"].as_str().unwrap();
            if !unique.insert((project, id)) {
                return reject("DUPLICATE_RECEIPT");
            }
            let handle = match self.store(project) {
                Ok(handle) => handle,
                Err(error) => return self.journal.reject_error(&command, error, now),
            };
            let store = handle.lock().map_err(|_| AppError::State)?;
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
        for item in payload["items"].as_array().unwrap() {
            let project = item["project_id"].as_str().unwrap();
            let id = item["update_id"].as_str().unwrap();
            changed += if item["read"] == true {
                tx.execute("INSERT OR IGNORE INTO read_receipts(project_id,update_id,read_at) VALUES(?1,?2,?3)",params![project,id,instant(now)])?
            } else {
                tx.execute(
                    "DELETE FROM read_receipts WHERE project_id=?1 AND update_id=?2",
                    [project, id],
                )?
            };
        }
        let reply = Reply {
            http_status: 200,
            body: json!({"api_version":"1","request_id":request,"status":if changed==0{"noop"}else{"committed"},"result":{"type":"receipt"},"warnings":[],"replayed":false}),
        };
        tx.execute("INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json) VALUES(?1,?2,?3,'committed','receipt','workspace','receipts',?4,?5,?6)",params![epoch,request,command.digest(),instant(now),instant(now+7*86_400_000),serde_json::to_string(&reply).unwrap()])?;
        tx.commit()?;
        drop(db);
        if changed > 0 {
            let _ = self.index.invalidate_workspace(now);
        }
        Ok(reply)
    }
    pub(crate) fn receipt(&self, project: &str, id: &str) -> Result<bool, AppError> {
        Ok(self.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM read_receipts WHERE project_id=?1 AND update_id=?2)",
            [project, id],
            |r| r.get(0),
        )?)
    }
}
