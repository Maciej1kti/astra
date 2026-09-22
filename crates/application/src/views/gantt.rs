use super::*;

impl Engine {
    pub fn gantt(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 500)?;
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, Some(project))?;
            let scope = json!([
                "gantt",
                page_revision(db, revision, Some(project))?,
                project,
                limit
            ]);
            let start = offset(cursor, &scope)?;
            let mut rows = rows(db, project, None, limit + 1, start, true)?;
            let more = rows.len() > limit as usize;
            rows.truncate(limit as usize);
            projection.mark_rows(&mut rows);
            Ok(json!({
                "rows": rows.iter().map(Indexed::summary).collect::<Vec<_>>(),
                "page": page(&scope, revision, start, rows.len(), more, projection.freshness),
                "warnings": projection.warnings,
            }))
        })
    }
}
