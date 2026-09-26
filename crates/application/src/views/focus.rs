use super::*;

impl Engine {
    /// Daily Focus membership is shared by HTTP and CLI and filtered before paging.
    pub fn focus_cards(
        &self,
        section: &str,
        folder: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
        now: i64,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        if !matches!(section, "motion" | "events") {
            return Err(AppError::reject(400, "INVALID_QUERY"));
        }
        if let Some(folder) = folder {
            validate_folder(folder)?;
        }
        let workspace = self.workspace()?.value;
        let zone = workspace
            .timezone
            .parse::<chrono_tz::Tz>()
            .map_err(|_| AppError::invariant("workspace timezone"))?;
        let local = chrono::DateTime::from_timestamp_millis(now)
            .ok_or_else(|| AppError::invariant("focus timestamp"))?
            .with_timezone(&zone);
        let today = local.date_naive().to_string();
        let clock = local.format("%Y-%m-%d %H:%M:00").to_string();
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, None)?;
            let scope = json!(["focus-cards", revision, section, folder, clock, limit]);
            let start = offset(cursor, &scope)?;
            let sql = format!(include_str!("focus.sql"), ACTIVE=ACTIVE, FOLDER=EFFECTIVE_FOLDER);
            let mut statement = db.prepare(&sql)?;
            let mut rows = statement.query_map(params![section, folder, today, clock, limit + 1, start as i64], |r| {
                Ok(Indexed {
                    project_id: r.get(0)?, kind: "card".into(), id: r.get(1)?,
                    version: r.get(2)?,
                    metadata: serde_json::from_str(&r.get::<_, String>(3)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    validity: r.get(4)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            let more = rows.len() > limit as usize;
            rows.truncate(limit as usize);
            projection.mark_rows(&mut rows);
            let stale = projection.freshness == "stale" || rows.iter().any(|r| r.validity != "valid");
            Ok(json!({
                "items": rows.iter().map(Indexed::summary).collect::<Vec<_>>(),
                "page": page(&scope, revision, start, rows.len(), more, if stale {"stale"} else {"index_snapshot"}),
                "warnings": projection.warnings,
            }))
        })
    }
}
