//! Local, bounded operational diagnostics never contain source bodies or credentials.
use crate::{AppError, engine::Engine, now_millis};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
impl Engine {
    pub fn diagnostics(&self) -> Result<Value, AppError> {
        let workspace = self.workspace().ok().map(|value| value.0);
        let mut warnings = Vec::new();
        if workspace.is_none() {
            let missing = self
                .journal
                .directory
                .read("workspace.json")
                .is_ok_and(|value| value.is_none());
            warnings.push(json!({"code":if missing {"WORKSPACE_MISSING"} else {"WORKSPACE_INVALID"},"message":"Project writes are unavailable. Stop the server and repair the workspace file from your own known-good source; the registry has not been recreated."}));
        }
        let db = self.journal.db()?;
        let cached: Option<String> = db
            .query_row(
                "SELECT value FROM meta WHERE key='instance_id'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let instance = workspace
            .as_ref()
            .and_then(|value| value["instance_id"].as_str())
            .map(str::to_owned)
            .or(cached);
        let pending: i64 = db.query_row(
            "SELECT count(*) FROM commands WHERE state IN ('prepared','blocked','needs_review')",
            [],
            |row| row.get(0),
        )?;
        if pending > 0 {
            warnings.push(json!({"code":"RECOVERY_PENDING","message":"Inspect the pending command/job before issuing a new intent. Restart resumes safe interrupted operations; needs_review requires checking the source conflict."}));
        }
        let floor: Option<String> = db
            .query_row(
                "SELECT value FROM meta WHERE key='admission_floor'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if floor
            .and_then(|value| value.parse::<i64>().ok())
            .is_some_and(|floor| now_millis() < floor - 300_000)
        {
            warnings.push(json!({"code":"CLOCK_ROLLBACK","message":"The host clock moved backwards. Correct the clock before issuing new mutations; known command results remain queryable."}));
        }
        let (entries,bytes):(i64,i64)=db.query_row("SELECT count(*),COALESCE(sum(COALESCE(length(before_bytes),0)+COALESCE(length(after_bytes),0)),0) FROM history",[],|row|Ok((row.get(0)?,row.get(1)?)))?;
        let mut statement=db.prepare("SELECT j.id,j.state,json_extract(p.plan_json,'$.project_id') FROM workflow_jobs j JOIN workflow_plans p ON p.id=j.plan_id WHERE j.state!='done' ORDER BY j.rowid LIMIT 50")?;
        let jobs=statement.query_map([],|row|Ok(json!({"id":row.get::<_,String>(0)?,"state":row.get::<_,String>(1)?,"project_id":row.get::<_,String>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
        drop(statement);
        drop(db);
        let count = self.index.issue_count()?;
        let issues = self.index.issues()?;
        if count > 0 {
            warnings.push(json!({"code":"SOURCE_DIAGNOSTICS","message":"Inspect the listed source paths. Validate documents and use an explicit normalization plan where required; healthy project files remain editable."}));
        }
        Ok(
            json!({"instance_id":instance,"state":if warnings.is_empty(){"ready"}else{"degraded"},"invalid_documents":count,"pending_commands":pending,"index_state":if count>0 || workspace.is_none(){"degraded"}else{"ready"},"warnings":warnings,"issues":issues,"jobs":jobs,"history":{"entries":entries,"bytes":bytes,"retention_days":30,"byte_budget":1073741824}}),
        )
    }
}
