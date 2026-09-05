//! Explicit resumable file workflows. Each step has an approved directory
//! identity and before/after bytes. The entire tree is never described as atomic.
use crate::{
    AppError, Reply, instant,
    journal::{Command, Journal, Target},
};
use project_store::{
    StoreError,
    document::{Kind, version},
    filesystem::Directory,
};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub root: String,
    pub identity: (u64, u64),
    pub path: Vec<String>,
    pub before: Option<Vec<u8>>,
    pub after: Vec<u8>,
}
impl Step {
    pub fn plan(root: &Directory, path: &[&str], after: Vec<u8>) -> Result<Self, AppError> {
        let mut step = Self {
            root: root.path().to_str().ok_or(AppError::State)?.into(),
            identity: root.identity()?,
            path: path.iter().map(|s| (*s).into()).collect(),
            before: None,
            after,
        };
        step.before = step.read()?;
        Ok(step)
    }
    fn parent(&self, create: bool) -> Result<(Directory, &str), AppError> {
        let mut directory = Directory::open(Path::new(&self.root))?;
        if directory.identity()? != self.identity {
            return Err(AppError::reject(409, "APPROVED_DIRECTORY_CHANGED"));
        }
        let (name, parents) = self.path.split_last().ok_or(AppError::State)?;
        for part in parents {
            directory = directory.child(part, create)?;
        }
        Ok((directory, name))
    }
    fn read(&self) -> Result<Option<Vec<u8>>, AppError> {
        let (directory, name) = match self.parent(false) {
            Ok(location) => location,
            Err(AppError::Store(StoreError::Io(error)))
                if error.kind() == std::io::ErrorKind::NotFound =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        Ok(directory.read(name)?)
    }
    fn apply(&self) -> Result<(), AppError> {
        let actual = self.read()?;
        let (directory, name) = self.parent(true)?;
        if actual.as_deref() == Some(&self.after) {
            directory.resync(name)?;
            return Ok(());
        }
        if actual != self.before {
            return Err(AppError::reject(409, "WORKFLOW_SOURCE_CHANGED"));
        }
        directory.replace(
            name,
            &self.after,
            self.before.as_ref().map(|bytes| version(bytes)).as_deref(),
        )?;
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub kind: String,
    pub project_id: String,
    pub expires_at: i64,
    pub steps: Vec<Step>,
    pub view: Value,
    #[serde(default)]
    pub approved_root: Option<Value>,
    #[serde(default)]
    pub collection_guard: Option<(String, Vec<String>)>,
}
impl Plan {
    fn collection_matches(&self) -> Result<bool, AppError> {
        let Some((path, expected)) = &self.collection_guard else {
            return Ok(true);
        };
        let directory = Directory::open(Path::new(path))?;
        let mut actual = directory.names()?;
        actual.retain(|name| name.ends_with(".md"));
        actual.sort();
        Ok(&actual == expected)
    }

    pub(crate) fn command(&self, request_id: &str, epoch: &str) -> Command {
        Command {
            request_id: request_id.into(),
            epoch: epoch.into(),
            method: format!("WORKFLOW:{}", self.kind),
            target: Target {
                project_id: self.project_id.clone(),
                kind: Kind::Project,
                id: self.project_id.clone(),
            },
            expected: None,
            payload: json!({"plan_id":self.id}),
        }
    }
}
pub struct Workflows<'a> {
    pub journal: &'a Journal,
}
impl Workflows<'_> {
    pub fn save(&self, plan: &Plan) -> Result<(), AppError> {
        self.journal.db()?.execute(
            "INSERT INTO workflow_plans(id,plan_json) VALUES(?1,?2)",
            params![
                plan.id,
                serde_json::to_string(plan).map_err(|_| AppError::State)?
            ],
        )?;
        Ok(())
    }
    pub fn plan(&self, id: &str) -> Result<Plan, AppError> {
        let text: String = self
            .journal
            .db()?
            .query_row(
                "SELECT plan_json FROM workflow_plans WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::reject(404, "PLAN_NOT_FOUND"))?;
        serde_json::from_str(&text).map_err(|_| AppError::State)
    }
    /// Caller holds the maintenance gate and relevant project lease throughout.
    pub fn commit(
        &self,
        plan_id: &str,
        request_id: &str,
        epoch: &str,
        now: i64,
    ) -> Result<Reply, AppError> {
        self.commit_with(plan_id, request_id, epoch, now, |_| Ok(()))
    }
    pub fn commit_with(
        &self,
        plan_id: &str,
        request_id: &str,
        epoch: &str,
        now: i64,
        checkpoint: impl FnMut(usize) -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        self.commit_with_completion(plan_id, request_id, epoch, now, checkpoint, || Ok(()))
    }
    pub(crate) fn commit_with_completion(
        &self,
        plan_id: &str,
        request_id: &str,
        epoch: &str,
        now: i64,
        checkpoint: impl FnMut(usize) -> Result<(), AppError>,
        completion: impl FnMut() -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        let plan = self.plan(plan_id)?;
        let command = plan.command(request_id, epoch);
        if let Some(reply) = self.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |code: &str| -> Result<Reply, AppError> {
            let reply = Reply::error(409, code, request_id);
            Ok(self
                .journal
                .record(&command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        if now >= plan.expires_at {
            return reject("PLAN_EXPIRED");
        }
        if self.journal.has_pending(&plan.project_id)? {
            return reject("PROJECT_RECOVERY_REQUIRED");
        }
        if !plan.collection_matches()? {
            return reject("PLAN_STALE");
        }
        for step in &plan.steps {
            if step.read()? != step.before {
                return reject("PLAN_STALE");
            }
        }
        let job_id = Uuid::new_v4().to_string();
        let reply = Reply {
            http_status: 202,
            body: json!({"api_version":"1","request_id":request_id,"job_id":job_id,"status":"running"}),
        };
        {
            let mut db = self.journal.db()?;
            if let Some(reply) = Journal::known(&db, &command)? {
                return Ok(reply);
            }
            let used: bool = db.query_row(
                "SELECT EXISTS(SELECT 1 FROM workflow_jobs WHERE plan_id=?1)",
                [plan_id],
                |r| r.get(0),
            )?;
            if used {
                drop(db);
                return reject("PLAN_ALREADY_COMMITTED");
            }
            let tx = db.transaction()?;
            tx.execute("INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json) VALUES(?1,?2,?3,'prepared',?4,?5,?5,?6,?7,?8)",params![epoch,request_id,command.digest(),plan.kind,plan.project_id,instant(now),instant(now+7*86_400_000),serde_json::to_string(&reply).unwrap()])?;
            tx.execute("INSERT INTO workflow_jobs(id,plan_id,epoch,request_id,state) VALUES(?1,?2,?3,?4,'running')",params![job_id,plan_id,epoch,request_id])?;
            tx.commit()?;
        }
        // The original acceptance result always identifies the same durable job.
        // A failed attempt leaves the job available for diagnostics/recovery.
        let _ = self.resume_with_completion(&job_id, checkpoint, completion);
        Ok(reply)
    }
    pub fn resume(&self, id: &str) -> Result<(), AppError> {
        self.resume_with(id, |_| Ok(()))
    }
    pub fn resume_with(
        &self,
        id: &str,
        checkpoint: impl FnMut(usize) -> Result<(), AppError>,
    ) -> Result<(), AppError> {
        self.resume_with_completion(id, checkpoint, || Ok(()))
    }
    pub(crate) fn resume_with_completion(
        &self,
        id: &str,
        mut checkpoint: impl FnMut(usize) -> Result<(), AppError>,
        mut completion: impl FnMut() -> Result<(), AppError>,
    ) -> Result<(), AppError> {
        let (plan_id, epoch, request_id, state, next): (String, String, String, String, i64) =
            self.journal.db()?.query_row(
                "SELECT plan_id,epoch,request_id,state,next_step FROM workflow_jobs WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )?;
        if state == "done" {
            return Ok(());
        }
        if state == "needs_review" {
            return Err(AppError::reject(409, "WORKFLOW_NEEDS_REVIEW"));
        }
        let plan = self.plan(&plan_id)?;
        if next < 0 || next as usize > plan.steps.len() {
            return Err(AppError::State);
        }
        for (index, step) in plan.steps.iter().enumerate() {
            let outcome = if index < next as usize {
                step.read().and_then(|actual| {
                    if actual.as_deref() == Some(step.after.as_slice()) {
                        Ok(())
                    } else {
                        Err(AppError::reject(409, "WORKFLOW_SOURCE_CHANGED"))
                    }
                })
            } else {
                step.apply()
            };
            if let Err(error) = outcome {
                let needs_review = matches!(
                    error,
                    AppError::Rejected(_)
                        | AppError::Store(StoreError::Invalid(_) | StoreError::Conflict)
                );
                let mut db = self.journal.db()?;
                let tx = db.transaction()?;
                if needs_review {
                    tx.execute(
                        "UPDATE workflow_jobs SET state='needs_review' WHERE id=?1",
                        [id],
                    )?;
                }
                tx.execute(
                    "UPDATE commands SET state=?3 WHERE epoch=?1 AND request_id=?2",
                    params![
                        epoch,
                        request_id,
                        if needs_review {
                            "needs_review"
                        } else {
                            "blocked"
                        }
                    ],
                )?;
                tx.commit()?;
                return Err(error);
            }
            if index < next as usize {
                continue;
            }
            checkpoint(index)?;
            self.journal.db()?.execute(
                "UPDATE workflow_jobs SET next_step=?2 WHERE id=?1",
                params![id, (index + 1) as i64],
            )?;
        }
        if let Err(error) = completion() {
            self.journal.db()?.execute(
                "UPDATE commands SET state='blocked' WHERE epoch=?1 AND request_id=?2",
                params![epoch, request_id],
            )?;
            return Err(error);
        }
        let mut db = self.journal.db()?;
        let tx = db.transaction()?;
        tx.execute("UPDATE workflow_jobs SET state='done' WHERE id=?1", [id])?;
        tx.execute(
            "UPDATE commands SET state='committed' WHERE epoch=?1 AND request_id=?2",
            params![epoch, request_id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn pending(&self) -> Result<Vec<(String, Plan)>, AppError> {
        let db = self.journal.db()?;
        let mut statement=db.prepare("SELECT j.id,p.plan_json FROM workflow_jobs j JOIN workflow_plans p ON p.id=j.plan_id WHERE j.state='running' ORDER BY j.rowid")?;
        statement
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .map(|r| {
                let (id, text) = r?;
                Ok((
                    id,
                    serde_json::from_str(&text).map_err(|_| AppError::State)?,
                ))
            })
            .collect()
    }
    pub fn job(&self, id: &str) -> Result<Value, AppError> {
        let (plan_id, state, completed): (String, String, i64) = self
            .journal
            .db()?
            .query_row(
                "SELECT plan_id,state,next_step FROM workflow_jobs WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::reject(404, "JOB_NOT_FOUND"))?;
        let plan = self.plan(&plan_id)?;
        Ok(
            json!({"id":id,"kind":plan.kind,"state":state,"completed_steps":completed,"total_steps":plan.steps.len()}),
        )
    }
}
