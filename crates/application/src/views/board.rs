use super::*;

impl Engine {
    pub fn board(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, Some(project))?;
            let scope = json!(["board", page_revision(db, revision, Some(project))?, project, limit]);
            let (selected, requested_start) = board_cursor(cursor, &scope)?;
            let mut columns = Vec::new();
            for status in ["planned", "active", "review", "done", "cancelled"] {
                let start = if selected == status { requested_start } else { 0 };
                let mut values = rows(db, project, Some(status), limit + 1, start, false)?;
                let more = values.len() > limit as usize;
                values.truncate(limit as usize);
                projection.mark_rows(&mut values);
                let total: i64 = db.query_row(
                    "SELECT count(*)
FROM documents
WHERE project_id=?1
AND entity_type='card'
AND json_extract(metadata_json,
    '$.status')=?2
AND COALESCE(json_extract(metadata_json,
    '$.archived'),
    0)=0",
                    [project, status], |row| row.get(0),
                )?;
                let mut page = page(&scope, revision, start, values.len(), more, projection.freshness);
                page["next_cursor"] = json!(more.then(|| json!([scope, status, start + values.len() as u64]).to_string()));
                let items: Vec<_> = values.iter().map(Indexed::summary).collect();
                columns.push(json!({ "status": status, "items": items, "page": page, "total": total }));
            }
            Ok(json!({ "columns": columns, "snapshot_cursor": revision, "warnings": projection.warnings }))
        })
    }
}

fn board_cursor(cursor: Option<&str>, scope: &Value) -> Result<(String, u64), AppError> {
    let Some(cursor) = cursor else {
        return Ok((String::new(), 0));
    };
    let value: Value =
        serde_json::from_str(cursor).map_err(|_| AppError::reject(400, "INVALID_CURSOR"))?;
    if value[0] != *scope {
        return Err(AppError::reject(409, "PAGE_STALE"));
    }
    let selected = value[1]
        .as_str()
        .ok_or_else(|| AppError::invariant("board cursor column"))?;
    let start = value[2]
        .as_u64()
        .filter(|n| *n <= i64::MAX as u64)
        .ok_or_else(|| AppError::invariant("board cursor offset"))?;
    Ok((selected.to_owned(), start))
}
