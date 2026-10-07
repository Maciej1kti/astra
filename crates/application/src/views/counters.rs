use super::*;

impl Engine {
    /// Counter configuration, whole-history totals and range-limited daily totals
    /// share one projection snapshot.
    pub fn counter_series(
        &self,
        project: Option<&str>,
        from: &str,
        to: &str,
        include_archived: bool,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 100)?;
        let first = project_domain::local_date(from)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        let last = project_domain::local_date(to)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        if last < first || (last - first).num_days() >= 400 {
            return Err(AppError::reject(400, "INVALID_DATE_RANGE"));
        }
        if project.is_some_and(|id| !crate::canonical_uuid_v4(id)) {
            return Err(AppError::reject(400, "INVALID_PROJECT_ID"));
        }
        self.index.with_snapshot(|db, revision| {
            let mut projection = ProjectionStatus::read(db, project)?;
            let scope = json!([
                "counters", page_revision(db, revision, project)?,
                project, from, to, include_archived, limit
            ]);
            let start = offset(cursor, &scope)?;
            let omitted: bool = db.query_row(
                "SELECT EXISTS(SELECT 1 FROM documents WHERE entity_type IN ('card','project')
                AND (?1 IS NULL OR project_id=?1) AND validity!='valid')
                OR EXISTS(SELECT 1 FROM projection_issues
                WHERE (?1 IS NULL OR project_id=?1) AND (path='project.json' OR path LIKE 'cards/%'))",
                [project], |row| row.get(0),
            )?;
            if omitted {
                projection.freshness = "stale";
                projection.warnings.push(json!({
                    "code": "COUNTER_SOURCES_OMITTED",
                    "message": "Counter data from unverified or unavailable sources is omitted. Check host diagnostics before treating this view as complete.",
                }));
            }
            let mut statement = db.prepare(include_str!("counters.sql"))?;
            let mut items = statement.query_map(
                params![project, from, to, include_archived, limit + 1, start as i64],
                |row| {
                    let project_id: String = row.get(0)?;
                    let values: String = row.get(12)?;
                    let values: Value = serde_json::from_str(&values)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?;
                    let mut history = json!({
                        "total": row.get::<_, i64>(14)?,
                        "recorded": row.get::<_, u32>(15)?,
                    });
                    if let Some(first) = row.get::<_, Option<String>>(16)? {
                        history["first_date"] = json!(first);
                    }
                    let mut series = json!({
                        "project_id": project_id,
                        "project_name": row.get::<_, String>(1)?,
                        "project_archived": row.get::<_, bool>(2)?,
                        "card_id": row.get::<_, String>(3)?,
                        "card_title": row.get::<_, String>(4)?,
                        "card_archived": row.get::<_, bool>(5)?,
                        "version": row.get::<_, String>(6)?,
                        "id": row.get::<_, String>(7)?,
                        "name": row.get::<_, String>(8)?,
                        "unit": row.get::<_, String>(9)?,
                        "step": row.get::<_, u32>(10)?,
                        "archived": row.get::<_, bool>(11)?,
                        "history": history,
                        "values": values,
                        "availability": if projection.project_pending(&project_id) { "stale" } else { "ready" },
                    });
                    if let Some(rate) = row.get::<_, Option<String>>(13)? {
                        series["rate"] = json!(rate);
                    }
                    Ok(series)
                },
            )?.collect::<Result<Vec<_>, _>>()?;
            let more = items.len() > limit as usize;
            items.truncate(limit as usize);
            let result = json!({
                "items": items,
                "page": page(&scope, revision, start, items.len(), more, projection.freshness),
                "warnings": projection.warnings,
            });
            // Series/date/string schema bounds fit below this serialized byte cap.
            // Fail explicitly if a damaged projection violates that invariant.
            if serde_json::to_vec(&result)
                .map_err(|_| AppError::invariant("counter view serialization"))?.len()
                > 2 * 1024 * 1024
            {
                return Err(AppError::invariant("counter view response bounds"));
            }
            Ok(result)
        })
    }
}
