use super::*;

impl Engine {
    pub fn calendar(
        &self,
        project: Option<&str>,
        from: &str,
        to: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 1000)?;
        let first = project_domain::local_date(from)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        let last = project_domain::local_date(to)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        if last < first || (last - first).num_days() >= 400 {
            return Err(AppError::reject(400, "INVALID_DATE_RANGE"));
        }
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, project)?;
            let scope = json!([
                "calendar",
                page_revision(db, revision, project)?,
                project,
                from,
                to,
                limit
            ]);
            let start = offset(cursor, &scope)?;
            let mut statement = db.prepare(include_str!("calendar.sql"))?;
            let mut items = statement
                .query_map(
                    params![project, from, to, limit + 1, start as i64],
                    calendar_item,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            let more = items.len() > limit as usize;
            items.truncate(limit as usize);
            Ok(json!({
                "page": page(&scope, revision, start, items.len(), more, projection.freshness),
                "items": items,
                "warnings": projection.warnings,
            }))
        })
    }
}

fn calendar_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let project: String = row.get(0)?;
    let id: String = row.get(1)?;
    let version: String = row.get(2)?;
    let title: String = row.get(3)?;
    let kind: String = row.get(4)?;
    let start: String = row.get(5)?;
    let end: String = row.get(6)?;
    let due: Option<String> = row.get(7)?;
    let mut item = json!({
        "item_id": format!("{id}:{kind}"),
        "kind": kind,
        "project_id": project,
        "resource_id": id,
        "version": version,
        "title": title,
        "start": start,
        "end": end,
    });
    if let Some(due) = due {
        item["due_kind"] = json!(due);
    }
    Ok(item)
}
