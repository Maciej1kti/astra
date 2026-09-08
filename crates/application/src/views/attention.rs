use super::*;

impl Engine {
    pub fn attention(&self, cursor: Option<&str>, limit: u32, now: i64) -> Result<Value, AppError> {
        self.attention_project(None, cursor, limit, now)
    }

    pub fn attention_project(
        &self,
        project: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
        now: i64,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        let workspace = self.workspace()?.value;
        let zone = workspace
            .timezone
            .parse::<chrono_tz::Tz>()
            .map_err(|_| AppError::invariant("workspace timezone"))?;
        let today = chrono::DateTime::from_timestamp_millis(now)
            .ok_or_else(|| AppError::invariant("attention timestamp"))?
            .with_timezone(&zone)
            .date_naive();
        let soon = today
            .checked_add_days(Days::new(7))
            .ok_or_else(|| AppError::invariant("attention date range"))?;
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, project)?;
            let scope = json!([
                "attention",
                page_revision(db, revision, project)?,
                project,
                today.to_string(),
                limit
            ]);
            let start = offset(cursor, &scope)?;
            let sql = format!(include_str!("attention.sql"), ACTIVE = ACTIVE);
            let mut statement = db.prepare(&sql)?;
            let mut items = statement
                .query_map(
                    params![
                        today.to_string(),
                        soon.to_string(),
                        limit + 1,
                        start as i64,
                        project
                    ],
                    attention_item,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            for item in &mut items {
                if let Some(id) = item.as_object_mut().unwrap().remove("report_id") {
                    let text: String = db.query_row(
                        "SELECT json_extract(metadata_json,
    '$.target')
FROM documents
WHERE project_id=?1
AND entity_id=?2
AND entity_type='update'",
                        params![item["project_id"].as_str().unwrap(), id.as_str().unwrap()],
                        |row| row.get(0),
                    )?;
                    item["target"] = serde_json::from_str(&text)
                        .map_err(|_| AppError::invariant("indexed update target"))?;
                }
            }
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

fn attention_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let project: String = row.get(0)?;
    let id: String = row.get(1)?;
    let kind: String = row.get(2)?;
    let title: String = row.get(3)?;
    let reason: String = row.get(4)?;
    let date: Option<String> = row.get(5)?;
    let mut item = json!({
        "id": format!("{project}:{id}:{reason}"),
        "project_id": project,
        "target": {
            "type": if kind == "update" { "project" } else { &kind },
            "id": if kind == "update" { project.as_str() } else { id.as_str() },
        },
        "reason": reason,
        "label": title,
    });
    if kind == "update" {
        item["report_id"] = json!(id);
    }
    if let Some(date) = date {
        item["date"] = json!(date);
    }
    Ok(item)
}
