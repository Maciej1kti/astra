use crate::{
    AppError, Reply,
    engine::{Engine, pretty, read},
    instant,
    journal::{Command, Journal, Target},
    now_millis, wire,
    writer::CommitPoint,
};
use project_domain::validate_workspace;
use project_store::{
    document::{Kind, version},
    filesystem::WritePoint,
};
use rusqlite::params;
use serde_json::{Value, json};
impl Engine {
    pub fn mutate_workspace(
        &self,
        section: &str,
        payload: &Value,
        request: &str,
        epoch: &str,
        expected: Option<&str>,
    ) -> Result<Reply, AppError> {
        self.mutate_workspace_with(section, payload, request, epoch, expected, |_| Ok(()))
    }
    pub fn mutate_workspace_with(
        &self,
        section: &str,
        payload: &Value,
        request: &str,
        epoch: &str,
        expected: Option<&str>,
        mut checkpoint: impl FnMut(CommitPoint) -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let definition = match section {
            "focus" => "FocusReplace",
            "preferences" => "PreferencesPatch",
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        };
        let command = Command {
            request_id: request.into(),
            epoch: epoch.into(),
            method: format!("WORKSPACE:{section}"),
            target: Target {
                project_id: "workspace".into(),
                kind: Kind::Project,
                id: section.into(),
            },
            expected: expected.map(str::to_owned),
            payload: payload.clone(),
        };
        let now = now_millis();
        if let Some(reply) = self.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |status, code| -> Result<Reply, AppError> {
            let reply = Reply::error(status, code, request);
            Ok(self
                .journal
                .record(&command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        if self.journal.has_pending("workspace")? {
            return reject(409, "WORKSPACE_RECOVERY_REQUIRED");
        }
        // Registration jobs publish this same file and must be resolved first.
        let pending: bool = self.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM workflow_jobs WHERE state!='done')",
            [],
            |r| r.get(0),
        )?;
        if pending {
            return reject(409, "REGISTRATION_RECOVERY_REQUIRED");
        }
        if expected.is_none() {
            return reject(428, "PRECONDITION_REQUIRED");
        }
        if wire::validate(definition, payload).is_err() {
            return reject(422, "VALIDATION_FAILED");
        }
        let before = self
            .journal
            .directory
            .read("workspace.json")?
            .ok_or(AppError::State)?;
        if Some(version(&before).as_str()) != expected {
            return reject(412, "VERSION_CONFLICT");
        }
        let mut workspace: Value = serde_json::from_slice(&before).map_err(|_| AppError::State)?;
        validate_workspace(workspace.clone()).map_err(|_| AppError::State)?;
        let mut references = Vec::new();
        if section == "focus" {
            for item in payload["items"].as_array().unwrap() {
                let project = item["project_id"].as_str().unwrap();
                let id = item["card_id"].as_str().unwrap();
                let handle = self.store(project)?;
                let store = handle.lock().map_err(|_| AppError::State)?;
                let (card, hash) = read(&store, Kind::Card, id)?;
                if card["metadata"]["archived"] == true {
                    return reject(409, "FOCUS_TARGET_ARCHIVED");
                }
                references.push(json!({"project_id":project,"card_id":id,"version":hash,"path":store.directory.path()}));
            }
            workspace["focus"] = payload["items"].clone();
        } else {
            if let Some(zone) = payload["timezone"].as_str()
                && zone.parse::<chrono_tz::Tz>().is_err()
            {
                return reject(422, "INVALID_TIMEZONE");
            }
            for (key, value) in payload.as_object().unwrap() {
                if key == "preferences" {
                    for (k, v) in value.as_object().unwrap() {
                        workspace[key][k] = v.clone();
                    }
                } else {
                    workspace[key] = value.clone();
                }
            }
        }
        validate_workspace(workspace.clone())
            .map_err(|_| AppError::reject(422, "VALIDATION_FAILED"))?;
        let old: Value = serde_json::from_slice(&before).map_err(|_| AppError::State)?;
        let noop = old == workspace;
        let after = if noop {
            before.clone()
        } else {
            pretty(&workspace)
        };
        let reply = Reply {
            http_status: 200,
            body: json!({"api_version":"1","request_id":request,"status":if noop{"noop"}else{"committed"},"result":{"type":section,"version":version(&after)},"warnings":[],"replayed":false}),
        };
        if noop {
            return Ok(self
                .journal
                .record(&command, &reply, None, now, false)?
                .unwrap_or(reply));
        }
        {
            let mut db = self.journal.db()?;
            if let Some(reply) = Journal::known(&db, &command)? {
                return Ok(reply);
            }
            let tx = db.transaction()?;
            tx.execute("INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json) VALUES(?1,?2,?3,'prepared',?4,'workspace',?4,?5,?6,?7)",params![epoch,request,command.digest(),section,instant(now),instant(now+7*86_400_000),serde_json::to_string(&reply).unwrap()])?;
            tx.execute("INSERT INTO workspace_intents(epoch,request_id,before_bytes,after_bytes,references_json,result_json) VALUES(?1,?2,?3,?4,?5,?6)",params![epoch,request,before,after,serde_json::to_string(&references).unwrap(),serde_json::to_string(&reply).unwrap()])?;
            tx.commit()?;
        }
        let result = (|| -> Result<(), AppError> {
            checkpoint(CommitPoint::Prepared)?;
            self.journal
                .directory
                .replace_with("workspace.json", &after, expected, |point| {
                    checkpoint(match point {
                        WritePoint::TempWritten => CommitPoint::TempWritten,
                        WritePoint::TempSynced => CommitPoint::TempSynced,
                        WritePoint::Renamed => CommitPoint::Renamed,
                        WritePoint::DirectorySynced => CommitPoint::DirectorySynced,
                    })
                    .map_err(|_| project_store::StoreError::Invalid("CHECKPOINT_FAILURE"))
                })?;
            self.finish_workspace(epoch, request)?;
            checkpoint(CommitPoint::Committed)?;
            Ok(())
        })();
        if result.is_err() {
            return Ok(Reply {
                http_status: 202,
                body: json!({"api_version":"1","request_id":request,"state":"prepared"}),
            });
        }
        let _ = self.index.invalidate_workspace(now);
        Ok(reply)
    }
    fn finish_workspace(&self, epoch: &str, request: &str) -> Result<(), AppError> {
        let mut db = self.journal.db()?;
        let tx = db.transaction()?;
        tx.execute(
            "UPDATE commands SET state='committed' WHERE epoch=?1 AND request_id=?2",
            [epoch, request],
        )?;
        tx.execute(
            "UPDATE workspace_intents SET resolved=1 WHERE epoch=?1 AND request_id=?2",
            [epoch, request],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn recover_workspace(&self) -> Result<(), AppError> {
        let rows = {
            let db = self.journal.db()?;
            let mut statement=db.prepare("SELECT w.epoch,w.request_id,w.before_bytes,w.after_bytes,w.references_json FROM workspace_intents w JOIN commands c USING(epoch,request_id) WHERE w.resolved=0 AND c.state!='needs_review' ORDER BY c.received_at")?;
            statement
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Vec<u8>>(2)?,
                        r.get::<_, Vec<u8>>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        for (epoch, request, before, after, references) in rows {
            let result = (|| -> Result<(), AppError> {
                let value: Value = serde_json::from_slice(&after).map_err(|_| AppError::State)?;
                validate_workspace(value).map_err(|_| AppError::State)?;
                let actual = self.journal.directory.read("workspace.json")?;
                if actual.as_deref() == Some(after.as_slice()) {
                    self.journal.directory.resync("workspace.json")?;
                    return self.finish_workspace(&epoch, &request);
                }
                if actual.as_deref() != Some(before.as_slice()) {
                    return Err(AppError::reject(409, "WORKSPACE_SOURCE_CHANGED"));
                }
                let references: Vec<Value> =
                    serde_json::from_str(&references).map_err(|_| AppError::State)?;
                for reference in references {
                    let handle =
                        self.store(reference["project_id"].as_str().ok_or(AppError::State)?)?;
                    let store = handle.lock().map_err(|_| AppError::State)?;
                    if reference["path"].as_str() != store.directory.path().to_str() {
                        return Err(AppError::reject(409, "FOCUS_REFERENCE_CHANGED"));
                    }
                    let (_, hash) = read(
                        &store,
                        Kind::Card,
                        reference["card_id"].as_str().ok_or(AppError::State)?,
                    )?;
                    if reference["version"] != hash {
                        return Err(AppError::reject(409, "FOCUS_REFERENCE_CHANGED"));
                    }
                }
                self.journal.directory.replace(
                    "workspace.json",
                    &after,
                    Some(&version(&before)),
                )?;
                self.finish_workspace(&epoch, &request)
            })();
            if let Err(error) = result {
                let state = if matches!(
                    error,
                    AppError::Rejected(_)
                        | AppError::Store(
                            project_store::StoreError::Invalid(_)
                                | project_store::StoreError::Conflict
                        )
                ) {
                    "needs_review"
                } else {
                    "blocked"
                };
                self.journal.db()?.execute(
                    "UPDATE commands SET state=?3 WHERE epoch=?1 AND request_id=?2",
                    params![epoch, request, state],
                )?;
            }
        }
        Ok(())
    }
}
