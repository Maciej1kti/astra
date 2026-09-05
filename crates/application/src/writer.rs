//! One project lock surrounds this whole operation; the journal's DB mutex is
//! held only for state transactions, never across source filesystem writes.
use crate::{
    AppError, Reply, instant,
    journal::{Command, Intent, Journal, Reference},
};
use project_domain::validate_document;
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{ProjectStore, WritePoint},
};
use serde_json::{Value, json};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitPoint {
    Prepared,
    TempWritten,
    TempSynced,
    Renamed,
    DirectorySynced,
    Committed,
}
pub struct Writer<'a> {
    pub journal: &'a Journal,
}
impl Writer<'_> {
    pub fn execute(
        &self,
        store: &mut ProjectStore,
        command: &Command,
        references: Vec<Reference>,
        now: i64,
        build: impl FnOnce(Option<&Value>) -> Result<Value, Reply>,
    ) -> Result<Reply, AppError> {
        self.execute_with(store, command, references, now, build, |_| Ok(()))
    }
    pub fn execute_with(
        &self,
        store: &mut ProjectStore,
        command: &Command,
        references: Vec<Reference>,
        now: i64,
        build: impl FnOnce(Option<&Value>) -> Result<Value, Reply>,
        mut checkpoint: impl FnMut(CommitPoint) -> Result<(), StoreError>,
    ) -> Result<Reply, AppError> {
        if let Some(reply) = self.journal.admit(command, now)? {
            return Ok(reply);
        }
        if self.journal.has_pending(&command.target.project_id)? {
            return Ok(Reply::error(
                409,
                "PROJECT_RECOVERY_REQUIRED",
                &command.request_id,
            ));
        }
        let reject = |reply: Reply| -> Result<Reply, AppError> {
            Ok(self
                .journal
                .record(command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        let (directory, filename) =
            store.location(command.target.kind, &command.target.id, true)?;
        let before = match directory.read(&filename) {
            Ok(before) => before,
            Err(_) => return reject(Reply::error(409, "DOCUMENT_INVALID", &command.request_id)),
        };
        let before_version = before.as_ref().map(|bytes| document::version(bytes));
        if command.method != "POST" && command.expected.is_none() {
            return reject(Reply::error(
                428,
                "PRECONDITION_REQUIRED",
                &command.request_id,
            ));
        }
        if command.expected != before_version {
            return reject(Reply::error(
                if before.is_none() && command.expected.is_some() {
                    404
                } else {
                    412
                },
                "VERSION_CONFLICT",
                &command.request_id,
            ));
        }
        let previous = match before
            .as_ref()
            .map(|bytes| document::parse(command.target.kind, Some(&command.target.id), bytes))
            .transpose()
        {
            Ok(value) => value,
            Err(_) => return reject(Reply::error(409, "DOCUMENT_INVALID", &command.request_id)),
        };
        let normalize = command.method == "NORMALIZE";
        if !normalize && previous.as_ref().is_some_and(|p| p.normalization_required) {
            return reject(Reply::error(
                409,
                "NORMALIZATION_REQUIRED",
                &command.request_id,
            ));
        }
        if !references_match(store, &references)? {
            return reject(Reply::error(412, "REFERENCE_CHANGED", &command.request_id));
        }
        let previous_value = previous.as_ref().map(|p| p.value());
        let mut value = match build(previous_value.as_ref()) {
            Ok(v) => v,
            Err(reply) => return reject(reply),
        };
        if value["type"].as_str() != Some(command.target.kind.as_str())
            || value["metadata"]["id"].as_str() != Some(&command.target.id)
        {
            return reject(Reply::error(422, "TARGET_MISMATCH", &command.request_id));
        }
        if let Some(previous) = &previous_value {
            if value["metadata"].get("created_at") != previous["metadata"].get("created_at") {
                return reject(Reply::error(
                    422,
                    "IMMUTABLE_CREATED_AT",
                    &command.request_id,
                ));
            }
            if command.target.kind == Kind::Update && !normalize {
                return reject(Reply::error(422, "UPDATE_IMMUTABLE", &command.request_id));
            }
        }
        let noop = !normalize && previous_value.as_ref() == Some(&value);
        if !noop && command.target.kind != Kind::Update {
            value["metadata"]["updated_at"] = json!(instant(now));
        }
        let validated = match validate_document(value.clone()) {
            Ok(value) => value,
            Err(_) => return reject(Reply::error(422, "VALIDATION_FAILED", &command.request_id)),
        };
        let after = if noop {
            before.clone().unwrap()
        } else {
            match document::serialize(&validated) {
                Ok(bytes) => bytes,
                Err(_) => return reject(Reply::error(422, "DOCUMENT_LIMIT", &command.request_id)),
            }
        };
        let reply = Reply {
            http_status: 200,
            body: json!({"api_version":"1","request_id":command.request_id,"status":if noop {"noop"} else {"committed"},"result":{"type":command.target.kind.as_str(),"id":command.target.id,"version":document::version(&after),"resource": {"type":value["type"],"metadata":value["metadata"],"body":value["body"],"version":document::version(&after)}},"warnings":[],"replayed":false}),
        };
        if noop {
            return Ok(self
                .journal
                .record(command, &reply, None, now, false)?
                .unwrap_or(reply));
        }
        let intent = Intent {
            command: command.clone(),
            before,
            after,
            reply: reply.clone(),
            references,
            source_root: store.directory.path().to_str().unwrap().to_owned(),
        };
        if let Some(existing) = self
            .journal
            .record(command, &reply, Some(&intent), now, false)?
        {
            return Ok(existing);
        }
        // Anything failing after PREPARED is uncertain. Never report a rejection
        // or roll back source bytes that may already be durable.
        let write = (|| -> Result<(), AppError> {
            checkpoint(CommitPoint::Prepared)?;
            directory.replace_with(
                &filename,
                &intent.after,
                command.expected.as_deref(),
                |point| {
                    checkpoint(match point {
                        WritePoint::TempWritten => CommitPoint::TempWritten,
                        WritePoint::TempSynced => CommitPoint::TempSynced,
                        WritePoint::Renamed => CommitPoint::Renamed,
                        WritePoint::DirectorySynced => CommitPoint::DirectorySynced,
                    })
                },
            )?;
            self.journal.finish(&intent, now)?;
            checkpoint(CommitPoint::Committed)?;
            Ok(())
        })();
        if write.is_err() {
            return Ok(Reply {
                http_status: 202,
                body: json!({"api_version":"1","request_id":command.request_id,"state":"prepared"}),
            });
        }
        Ok(reply)
    }

    pub fn recover(
        &self,
        store: &mut ProjectStore,
        project_id: &str,
        now: i64,
    ) -> Result<usize, AppError> {
        let mut recovered = 0;
        for intent in self.journal.pending(project_id)? {
            if self.journal.state(&intent.command)? == "needs_review" {
                break;
            }
            if intent.source_root != store.directory.path().to_str().unwrap() {
                self.journal.mark(&intent.command, "needs_review")?;
                break;
            }
            let attempt = (|| -> Result<bool, AppError> {
                let (directory, name) =
                    store.location(intent.command.target.kind, &intent.command.target.id, true)?;
                let actual = directory.read(&name)?;
                let actual_hash = actual.as_ref().map(|b| document::version(b));
                if actual_hash.as_deref() == Some(&document::version(&intent.after)) {
                    directory.resync(&name)?;
                } else if actual_hash == intent.before.as_ref().map(|b| document::version(b)) {
                    if !references_match(store, &intent.references)? {
                        return Ok(false);
                    }
                    directory.replace(&name, &intent.after, actual_hash.as_deref())?;
                } else {
                    return Ok(false);
                }
                self.journal.finish(&intent, now)?;
                Ok(true)
            })();
            match attempt {
                Ok(true) => recovered += 1,
                Ok(false) => {
                    self.journal.mark(&intent.command, "needs_review")?;
                    break;
                }
                Err(AppError::Store(StoreError::Invalid(_) | StoreError::Conflict)) => {
                    self.journal.mark(&intent.command, "needs_review")?;
                    break;
                }
                Err(_) => {
                    self.journal.mark(&intent.command, "blocked")?;
                    break;
                }
            }
        }
        Ok(recovered)
    }
}

pub fn references_match(store: &ProjectStore, references: &[Reference]) -> Result<bool, AppError> {
    for reference in references {
        let (directory, name) = store.location(reference.kind, &reference.id, false)?;
        let version = directory
            .read(&name)?
            .as_ref()
            .map(|bytes| document::version(bytes));
        if version != reference.version {
            return Ok(false);
        }
    }
    Ok(true)
}
