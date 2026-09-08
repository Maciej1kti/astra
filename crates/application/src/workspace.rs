use crate::{
    AppError, Reply,
    command_state::CommandState,
    engine::Engine,
    journal::{Command, CommandRecord, Journal, Target},
    now_millis,
    source::{pretty, read},
    wire,
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
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let definition = match section {
            "focus" => "FocusReplace",
            "preferences" => "PreferencesPatch",
            "tags" => "TagsReplace",
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
        if section == "tags"
            && payload["tags"]
                .as_array()
                .unwrap()
                .iter()
                .any(|name| name.as_str().unwrap().contains('\0'))
        {
            return reject(422, "TAG_NAME_INVALID");
        }
        let before = self
            .journal
            .directory
            .read("workspace.json")?
            .ok_or(AppError::Unavailable("workspace.json"))?;
        if Some(version(&before).as_str()) != expected {
            return reject(412, "VERSION_CONFLICT");
        }
        let old = validate_workspace(
            serde_json::from_slice(&before).map_err(|_| AppError::invariant("workspace JSON"))?,
        )
        .map_err(|_| AppError::invariant("workspace schema"))?
        .into_inner();
        let mut workspace = old.clone();
        let mut references = Vec::new();
        match WorkspaceChange::decode(section, payload)? {
            WorkspaceChange::Focus(items) => {
                for item in &items {
                    let project = item.project_id.as_str();
                    let id = item.card_id.as_str();
                    let handle = match self.store(project) {
                        Ok(handle) => handle,
                        Err(error) => return self.journal.reject_error(&command, error, now),
                    };
                    let store = handle
                        .lock()
                        .map_err(|_| AppError::invariant("project store lock"))?;
                    let card = match read(&store, Kind::Card, id) {
                        Ok(card) => card,
                        Err(error) => return self.journal.reject_error(&command, error, now),
                    };
                    let project_domain::models::Document::Card { metadata, .. } =
                        card.document.get()
                    else {
                        return Err(AppError::invariant("focus source kind"));
                    };
                    if metadata.archived {
                        return reject(409, "FOCUS_TARGET_ARCHIVED");
                    }
                    references.push(json!({"project_id":project,"card_id":id,"version":card.version,"path":store.directory.path()}));
                }
                workspace.focus = items;
            }
            WorkspaceChange::Tags(tags) => workspace.tags = Some(tags),
            WorkspaceChange::Preferences(patch) => {
                if let Some(zone) = patch.timezone {
                    if zone.parse::<chrono_tz::Tz>().is_err() {
                        return reject(422, "INVALID_TIMEZONE");
                    }
                    workspace.timezone = zone;
                }
                if let Some(locale) = patch.locale {
                    workspace.locale = locale;
                }
                if let Some(preferences) = patch.preferences {
                    if let Some(day) = preferences.week_start {
                        workspace.preferences.week_start = Some(day);
                    }
                    if let Some(view) = preferences.default_view {
                        workspace.preferences.default_view = Some(view);
                    }
                }
            }
        }
        validate_workspace(json!(workspace))
            .map_err(|_| AppError::reject(422, "VALIDATION_FAILED"))?;
        let noop = old == workspace;
        let after = if noop {
            before.clone()
        } else {
            pretty(&workspace)
        };
        let reply = Reply {
            http_status: 200,
            body: json!({
                "api_version": "1",
                "request_id": request,
                "status": if noop{"noop"}else{"committed"},
                "result": {
                    "type": section,
                    "version": version(&after),
                },
                "warnings": [],
                "replayed": false,
            }),
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
            Journal::insert_command(
                &tx,
                CommandRecord {
                    command: &command,
                    state: CommandState::Prepared,
                    target_kind: section,
                    reply: &reply,
                    received_at: now,
                },
            )?;
            tx.execute(
                "INSERT INTO workspace_intents(epoch,
    request_id,
    before_bytes,
    after_bytes,
    references_json,
    result_json)
VALUES (?1,
    ?2,
    ?3,
    ?4,
    ?5,
    ?6)",
                params![
                    epoch,
                    request,
                    before,
                    after,
                    serde_json::to_string(&references).unwrap(),
                    serde_json::to_string(&reply).unwrap()
                ],
            )?;
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
        if let Err(error) = result {
            crate::diagnostics::record_failure("workspace_commit", &error, None, Some(request));
            return Ok(Reply {
                http_status: 202,
                body: json!({"api_version":"1","request_id":request,"state":"prepared"}),
            });
        }
        if let Err(error) = self.index.invalidate_workspace(now) {
            crate::diagnostics::record_failure("workspace_projection", &error, None, Some(request));
        }
        Ok(reply)
    }
    fn finish_workspace(&self, epoch: &str, request: &str) -> Result<(), AppError> {
        let mut db = self.journal.db()?;
        let tx = db.transaction()?;
        Journal::set_command_state(&tx, epoch, request, CommandState::Committed)?;
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
            let mut statement = db.prepare(
                "SELECT w.epoch,
    w.request_id,
    w.before_bytes,
    w.after_bytes,
    w.references_json
FROM workspace_intents w
JOIN commands c USING(epoch,
    request_id)
WHERE w.resolved=0
AND c.state!='needs_review'
ORDER BY c.received_at",
            )?;
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
                let value: Value = serde_json::from_slice(&after)
                    .map_err(|source| AppError::stored("workspace recovery candidate", source))?;
                validate_workspace(value).map_err(|source| AppError::SourceValidation {
                    context: "workspace recovery candidate",
                    source,
                })?;
                let actual = self.journal.directory.read("workspace.json")?;
                if actual.as_deref() == Some(after.as_slice()) {
                    self.journal.directory.resync("workspace.json")?;
                    return self.finish_workspace(&epoch, &request);
                }
                if actual.as_deref() != Some(before.as_slice()) {
                    return Err(AppError::reject(409, "WORKSPACE_SOURCE_CHANGED"));
                }
                let references: Vec<Value> = serde_json::from_str(&references)
                    .map_err(|source| AppError::stored("workspace recovery references", source))?;
                for reference in references {
                    let handle = self.store(
                        reference["project_id"]
                            .as_str()
                            .ok_or(AppError::invariant("workspace reference project ID"))?,
                    )?;
                    let store = handle
                        .lock()
                        .map_err(|_| AppError::LockPoisoned("project store"))?;
                    if reference["path"].as_str() != store.directory.path().to_str() {
                        return Err(AppError::reject(409, "FOCUS_REFERENCE_CHANGED"));
                    }
                    let source = read(
                        &store,
                        Kind::Card,
                        reference["card_id"]
                            .as_str()
                            .ok_or(AppError::invariant("workspace reference card ID"))?,
                    )?;
                    if reference["version"] != source.version {
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
                crate::diagnostics::record_failure(
                    "workspace_recovery",
                    &error,
                    None,
                    Some(&request),
                );
                let state = if matches!(
                    error,
                    AppError::Rejected(_)
                        | AppError::Store(
                            project_store::StoreError::Invalid(_)
                                | project_store::StoreError::Conflict
                        )
                ) {
                    CommandState::NeedsReview
                } else {
                    CommandState::Blocked
                };
                let db = self.journal.db()?;
                Journal::set_command_state(&db, &epoch, &request, state)?;
            }
        }
        Ok(())
    }
}

/// Decoded only after wire validation; a retained command keeps its original JSON.
enum WorkspaceChange {
    Focus(Vec<project_domain::models::FocusRef>),
    Tags(Vec<String>),
    Preferences(PreferencesPatch),
}
#[derive(serde::Deserialize)]
struct PreferencesPatch {
    timezone: Option<String>,
    locale: Option<project_domain::models::Locale>,
    preferences: Option<project_domain::models::Preferences>,
}
impl WorkspaceChange {
    fn decode(section: &str, payload: &Value) -> Result<Self, AppError> {
        match section {
            "focus" => serde_json::from_value(payload["items"].clone()).map(Self::Focus),
            "tags" => serde_json::from_value(payload["tags"].clone()).map(Self::Tags),
            "preferences" => serde_json::from_value(payload.clone()).map(Self::Preferences),
            _ => return Err(AppError::invariant("validated workspace section")),
        }
        .map_err(|_| AppError::invariant("validated workspace payload"))
    }
}
