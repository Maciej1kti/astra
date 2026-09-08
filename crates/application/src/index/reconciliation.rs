use super::*;

impl Index {
    pub(crate) fn begin_reconciliation(
        &self,
        projects: &[project_domain::models::ProjectRegistration],
    ) -> Result<(), AppError> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let tx = db.transaction()?;
        tx.execute("DELETE FROM projection_pending", [])?;
        for project in projects {
            let id = &project.project_id;
            tx.execute(
                "INSERT INTO projection_pending(project_id) VALUES(?1)",
                [id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn pending_projects(&self) -> Result<Vec<String>, AppError> {
        let db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let mut statement =
            db.prepare("SELECT project_id FROM projection_pending ORDER BY project_id")?;
        Ok(statement
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?)
    }
    pub fn retain_registered(
        &self,
        projects: &[project_domain::models::ProjectRegistration],
    ) -> Result<(), AppError> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let tx = db.transaction()?;
        let input = serde_json::to_string(projects)
            .map_err(|source| AppError::stored("reconciliation project registry", source))?;
        tx.execute(
            "DELETE
FROM documents
WHERE project_id NOT IN (SELECT json_extract(value,
    '$.project_id')
FROM json_each(?1))",
            [&input],
        )?;
        tx.execute(
            "DELETE
FROM projection_issues
WHERE project_id NOT IN (SELECT json_extract(value,
    '$.project_id')
FROM json_each(?1))",
            [&input],
        )?;
        tx.execute(
            "DELETE
FROM projection_pending
WHERE project_id NOT IN (SELECT json_extract(value,
    '$.project_id')
FROM json_each(?1))",
            [&input],
        )?;
        tx.execute(
            "DELETE
FROM projection_revisions
WHERE project_id NOT IN (SELECT json_extract(value,
    '$.project_id')
FROM json_each(?1))",
            [&input],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn forget_project(&self, project: &str, now: i64) -> Result<(), AppError> {
        {
            let mut db = self
                .connection
                .lock()
                .map_err(|_| AppError::LockPoisoned("database connection"))?;
            let tx = db.transaction()?;
            tx.execute("DELETE FROM documents WHERE project_id=?1", [project])?;
            tx.execute(
                "DELETE FROM projection_revisions WHERE project_id=?1",
                [project],
            )?;
            tx.execute(
                "DELETE FROM projection_pending WHERE project_id=?1",
                [project],
            )?;
            tx.execute(
                "DELETE FROM projection_issues WHERE project_id=?1",
                [project],
            )?;
            tx.commit()?;
        }
        self.invalidate_workspace(now)
    }
    pub fn mark_unavailable(&self, project_id: &str, code: &str, now: i64) -> Result<(), AppError> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let tx = db.transaction()?;
        let changed = tx.execute(
            "UPDATE documents
SET validity='unavailable'
WHERE project_id=?1
AND validity!='unavailable'",
            [project_id],
        )?;
        let ended_reconciliation = tx.execute(
            "DELETE FROM projection_pending WHERE project_id=?1",
            [project_id],
        )?;
        let existing: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1
FROM projection_issues
WHERE project_id=?1
AND path='project.md'
AND code=?2)",
            params![project_id, code],
            |r| r.get(0),
        )?;
        tx.execute(
            "INSERT INTO projection_issues(project_id,
    path,
    code)
VALUES (?1,
    'project.md',
    ?2)
ON CONFLICT (project_id,
    path) DO UPDATE
SET code=excluded.code",
            params![project_id, code],
        )?;
        if changed == 0 && existing && ended_reconciliation == 0 {
            tx.commit()?;
            return Ok(());
        }
        let sequence: i64 = tx.query_row(
            "SELECT CAST(value AS INTEGER) FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        let sequence = sequence + 1;
        record_project_revision(&tx, project_id, sequence)?;
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        let mut events = self
            .events
            .lock()
            .map_err(|_| AppError::LockPoisoned("invalidation replay"))?;
        events.push_back((
            now,
            json!({
                "kind": "health_changed",
                "cursor": format!("{}:{sequence}",self.epoch),
                "project_id": project_id,
                "reason": "project_unavailable",
            }),
        ));
        while events.len() > 10_000
            || events
                .front()
                .is_some_and(|(time, _)| *time < now - 600_000)
        {
            events.pop_front();
        }
        self.notify();
        Ok(())
    }
}
