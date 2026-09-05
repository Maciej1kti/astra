use crate::{AppError, Reply, instant};
use project_store::{
    document::{self, Kind},
    filesystem::{Directory, Lease},
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::Duration,
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Target {
    pub project_id: String,
    pub kind: Kind,
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub request_id: String,
    pub epoch: String,
    pub method: String,
    pub target: Target,
    pub expected: Option<String>,
    pub payload: Value,
}
impl Command {
    pub fn digest(&self) -> String {
        document::version(
            &serde_json::to_vec(&json!([
                1,
                self.method,
                self.target,
                self.expected,
                self.payload
            ]))
            .unwrap(),
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub kind: Kind,
    pub id: String,
    pub version: Option<String>,
}
#[derive(Debug, Clone)]
pub struct Intent {
    pub command: Command,
    pub before: Option<Vec<u8>>,
    pub after: Vec<u8>,
    pub reply: Reply,
    pub references: Vec<Reference>,
    pub source_root: String,
}

pub struct Journal {
    connection: Mutex<Connection>,
    pub epoch: String,
    pub directory: Directory,
    lease: Lease,
}
impl Journal {
    /// Persist definite preflight rejections; transient storage failures remain retryable.
    pub(crate) fn reject_error(
        &self,
        command: &Command,
        error: AppError,
        now: i64,
    ) -> Result<Reply, AppError> {
        match error {
            AppError::Rejected(mut reply) => {
                reply.body["error"]["request_id"] = json!(command.request_id);
                Ok(self
                    .record(command, &reply, None, now, true)?
                    .unwrap_or(reply))
            }
            error => Err(error),
        }
    }

    /// Explicit recovery of a stopped-server copy invalidates old client intentions.
    pub fn rotate_after_restore(&mut self, now: i64) -> Result<(), AppError> {
        let epoch = Uuid::new_v4().to_string();
        {
            let mut db = self.db()?;
            let tx = db.transaction()?;
            let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM commands WHERE state IN ('prepared','blocked','needs_review'))",[],|r|r.get(0))?;
            if pending {
                return Err(AppError::reject(409, "RECOVERY_REQUIRED"));
            }
            tx.execute(
                "UPDATE meta SET value=?1 WHERE key='command_epoch'",
                [&epoch],
            )?;
            tx.execute(
                "UPDATE sessions SET revoked_at=?1 WHERE revoked_at IS NULL",
                [instant(now)],
            )?;
            tx.execute("UPDATE pairings SET state='denied' WHERE state IN ('pending','approved','claimed')",[])?;
            tx.commit()?;
        }
        self.epoch = epoch;
        self.directory.sync()?;
        Ok(())
    }
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let directory = Directory::open(path)?;
        directory.require_private()?;
        let lease = directory.lease("instance.lock")?;
        if !directory.exists_regular("state.sqlite")? {
            directory.replace("state.sqlite", &[], None)?;
        }
        directory.exists_regular("state.sqlite-wal")?;
        directory.exists_regular("state.sqlite-shm")?;
        let connection = Connection::open_with_flags(
            path.join("state.sqlite"),
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )?;
        let schema: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if schema > 1 {
            return Err(AppError::reject(503, "STATE_SCHEMA_TOO_NEW"));
        }
        connection.busy_timeout(Duration::from_secs(2))?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA fullfsync=ON; PRAGMA checkpoint_fullfsync=ON;")?;
        if schema == 0 {
            connection.execute_batch("BEGIN IMMEDIATE;")?;
            connection
                .execute_batch(include_str!("../../../contracts/state-starting-schema.sql"))?;
            connection.execute_batch("PRAGMA user_version=1; COMMIT;")?;
        }
        let epoch: Option<String> = connection
            .query_row(
                "SELECT value FROM meta WHERE key='command_epoch'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let epoch = match epoch {
            Some(epoch) => {
                Uuid::parse_str(&epoch).map_err(|_| AppError::State)?;
                epoch
            }
            None => {
                let epoch = Uuid::new_v4().to_string();
                connection.execute(
                    "INSERT INTO meta(key,value) VALUES('command_epoch',?1)",
                    [&epoch],
                )?;
                epoch
            }
        };
        directory.sync()?;
        Ok(Self {
            connection: Mutex::new(connection),
            epoch,
            directory,
            lease,
        })
    }
    pub fn db(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        self.lease.verify()?;
        self.directory.verify()?;
        self.connection.lock().map_err(|_| AppError::State)
    }
    pub(crate) fn known(db: &Connection, command: &Command) -> Result<Option<Reply>, AppError> {
        let row: Option<(String, String, Option<String>, Option<String>)> = db.query_row(
            "SELECT digest,state,result_json,error_json FROM commands WHERE epoch=?1 AND request_id=?2",
            params![command.epoch, command.request_id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
        let Some((digest, state, result, error)) = row else {
            return Ok(None);
        };
        if digest != command.digest() {
            return Ok(Some(Reply::error(
                409,
                "IDEMPOTENCY_KEY_REUSED",
                &command.request_id,
            )));
        }
        if state == "committed" || state == "rejected" {
            let text = if state == "committed" { result } else { error }.ok_or(AppError::State)?;
            return Ok(Some(
                serde_json::from_str::<Reply>(&text)
                    .map_err(|_| AppError::State)?
                    .replay(),
            ));
        }
        Ok(Some(Reply {
            http_status: 202,
            body: json!({"api_version":"1","request_id":command.request_id,"state":state}),
        }))
    }
    /// Auth happens at the transport boundary before this method. Known commands
    /// are looked up before time/precondition checks, but always after epoch.
    pub fn admit(&self, command: &Command, now: i64) -> Result<Option<Reply>, AppError> {
        if command.epoch != self.epoch {
            return Ok(Some(Reply::error(
                409,
                "EPOCH_CHANGED",
                &command.request_id,
            )));
        }
        let mut db = self.db()?;
        if let Some(reply) = Self::known(&db, command)? {
            return Ok(Some(reply));
        }
        let id = match Uuid::parse_str(&command.request_id) {
            Ok(id) if crate::valid_request_id(&command.request_id) => id,
            _ => {
                return Ok(Some(Reply::error(
                    422,
                    "INVALID_REQUEST_ID",
                    &command.request_id,
                )));
            }
        };
        let (seconds, nanos) = id.get_timestamp().ok_or(AppError::State)?.to_unix();
        let request_time = seconds as i64 * 1000 + nanos as i64 / 1_000_000;
        let floor: i64 = db
            .query_row(
                "SELECT value FROM meta WHERE key='admission_floor'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| "0".into())
            .parse()
            .map_err(|_| AppError::State)?;
        if now < floor - 300_000 {
            return Ok(Some(Reply::error(
                503,
                "CLOCK_ROLLBACK",
                &command.request_id,
            )));
        }
        // The durable floor prevents resurrecting expired IDs after small clock drift.
        let admission = now.max(floor);
        if request_time < admission - 86_400_000 || request_time > now + 300_000 {
            return Ok(Some(Reply::error(
                409,
                "REQUEST_OUTSIDE_WINDOW",
                &command.request_id,
            )));
        }
        let transaction = db.transaction()?;
        transaction.execute("INSERT INTO meta(key,value) VALUES('admission_floor',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [admission.to_string()])?;
        transaction.commit()?;
        Ok(None)
    }
    pub fn pending(&self, project_id: &str) -> Result<Vec<Intent>, AppError> {
        let db = self.db()?;
        let mut statement = db.prepare("SELECT c.command_json,w.before_bytes,w.after_bytes,m.result_json,c.references_json,w.approved_root FROM commands m JOIN write_intents w USING(epoch,request_id) JOIN intent_context c USING(epoch,request_id) WHERE m.project_id=?1 AND m.state IN ('prepared','blocked','needs_review') ORDER BY m.rowid,w.step")?;
        let rows = statement.query_map([project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<Vec<u8>>>(1)?,
                r.get::<_, Vec<u8>>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        })?;
        rows.map(|row| {
            let (command, before, after, reply, references, source_root) = row?;
            Ok(Intent {
                command: serde_json::from_str(&command).map_err(|_| AppError::State)?,
                before,
                after,
                reply: serde_json::from_str(&reply).map_err(|_| AppError::State)?,
                references: serde_json::from_str(&references).map_err(|_| AppError::State)?,
                source_root,
            })
        })
        .collect()
    }
    pub fn has_pending(&self, project_id: &str) -> Result<bool, AppError> {
        Ok(self.db()?.query_row("SELECT EXISTS(SELECT 1 FROM commands WHERE project_id=?1 AND state IN ('prepared','blocked','needs_review'))", [project_id], |r| r.get(0))?)
    }
    pub fn record(
        &self,
        command: &Command,
        reply: &Reply,
        intent: Option<&Intent>,
        now: i64,
        rejected: bool,
    ) -> Result<Option<Reply>, AppError> {
        let mut db = self.db()?;
        if let Some(reply) = Self::known(&db, command)? {
            return Ok(Some(reply));
        }
        let tx = db.transaction()?;
        let state = if rejected {
            "rejected"
        } else if intent.is_some() {
            "prepared"
        } else {
            "committed"
        };
        let result_json = serde_json::to_string(reply).map_err(|_| AppError::State)?;
        tx.execute("INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json,error_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", params![command.epoch,command.request_id,command.digest(),state,command.target.kind.as_str(),command.target.project_id,command.target.id,instant(now),instant(now+7*86_400_000),if rejected {None} else {Some(&result_json)},if rejected {Some(&result_json)} else {None}])?;
        if let Some(intent) = intent {
            let relative = command.target.kind.directory().map_or_else(
                || "project.md".to_owned(),
                |directory| format!("{directory}/{}.md", command.target.id),
            );
            tx.execute("INSERT INTO write_intents(epoch,request_id,step,approved_root,relative_path,before_hash,after_hash,before_bytes,after_bytes,intent_kind) VALUES(?1,?2,0,?3,?4,?5,?6,?7,?8,?9)",params![command.epoch,command.request_id,intent.source_root,relative,intent.before.as_ref().map(|b|document::version(b)),document::version(&intent.after),intent.before,intent.after,if intent.before.is_some(){"replace"}else{"create"}])?;
            tx.execute("INSERT INTO intent_context(epoch,request_id,command_json,references_json) VALUES(?1,?2,?3,?4)",params![command.epoch,command.request_id,serde_json::to_string(command).unwrap(),serde_json::to_string(&intent.references).unwrap()])?;
        }
        tx.commit()?;
        Ok(None)
    }
    pub fn finish(&self, intent: &Intent, now: i64) -> Result<(), AppError> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        let command = &intent.command;
        tx.execute(
            "UPDATE commands SET state='committed' WHERE epoch=?1 AND request_id=?2",
            params![command.epoch, command.request_id],
        )?;
        tx.execute(
            "UPDATE write_intents SET resolved=1 WHERE epoch=?1 AND request_id=?2",
            params![command.epoch, command.request_id],
        )?;
        tx.execute("INSERT INTO history(id,project_id,target_kind,target_id,epoch,request_id,before_hash,after_hash,before_bytes,after_bytes,recorded_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![Uuid::new_v4().to_string(),command.target.project_id,command.target.kind.as_str(),command.target.id,command.epoch,command.request_id,intent.before.as_ref().map(|b| document::version(b)),document::version(&intent.after),intent.before,intent.after,instant(now)])?;
        tx.commit()?;
        Ok(())
    }
    pub fn mark(&self, command: &Command, state: &str) -> Result<(), AppError> {
        self.db()?.execute(
            "UPDATE commands SET state=?3 WHERE epoch=?1 AND request_id=?2",
            params![command.epoch, command.request_id, state],
        )?;
        Ok(())
    }
    pub fn state(&self, command: &Command) -> Result<String, AppError> {
        Ok(self.db()?.query_row(
            "SELECT state FROM commands WHERE epoch=?1 AND request_id=?2",
            params![command.epoch, command.request_id],
            |r| r.get(0),
        )?)
    }
}
