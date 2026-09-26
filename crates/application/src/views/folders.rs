use super::*;

impl Engine {
    pub fn folders(&self, cursor: Option<&str>, limit: u32) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, None)?;
            let scope = json!(["folders", page_revision(db, revision, None)?, limit]);
            let start = offset(cursor, &scope)?;
            let mut statement = db.prepare("SELECT DISTINCT json_extract(metadata_json,'$.folder') AS folder FROM documents WHERE entity_type='project' AND json_type(metadata_json,'$.folder')='text' ORDER BY folder LIMIT ?1 OFFSET ?2")?;
            let mut items = statement.query_map(params![limit + 1, start as i64], |row| row.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
            let more = items.len() > limit as usize;
            items.truncate(limit as usize);
            Ok(json!({"items": items, "page": page(&scope, revision, start, items.len(), more, projection.freshness), "warnings": projection.warnings}))
        })
    }
}
