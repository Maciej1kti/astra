use super::*;

impl Index {
    #[cfg(test)]
    pub fn query(
        &self,
        kind: Option<&str>,
        query: &Query,
        max: u32,
    ) -> Result<(Vec<Indexed>, Value), AppError> {
        self.query_projection(kind, query, max)
            .map(|(rows, page, _)| (rows, page))
    }
    pub(super) fn query_projection(
        &self,
        kind: Option<&str>,
        query: &Query,
        max: u32,
    ) -> Result<(Vec<Indexed>, Value, Vec<Value>), AppError> {
        match (&query.target_type, &query.target_id) {
            (None, None) => {}
            (Some(target_type), Some(target_id))
                if kind == Some("update")
                    && matches!(target_type.as_str(), "project" | "card" | "milestone")
                    && Uuid::parse_str(target_id).is_ok_and(|id| {
                        id.get_version_num() == 4
                            && id.get_variant() == uuid::Variant::RFC4122
                            && id.to_string() == *target_id
                    }) => {}
            _ => return Err(AppError::reject(422, "INVALID_TARGET_FILTER")),
        }
        let limit = query.limit.unwrap_or(50);
        if limit == 0
            || limit > max
            || query
                .search
                .as_ref()
                .is_some_and(|s| s.chars().count() > 256)
        {
            return Err(AppError::reject(422, "QUERY_LIMIT"));
        }
        let mut identity = query.clone();
        identity.cursor = None;
        let query_hash = document::version(&serde_json::to_vec(&json!([kind, identity])).unwrap());
        let db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let sequence: String = db.query_row(
            "SELECT value FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        let revision = format!("{}:{sequence}", self.epoch);
        let cursor_revision = page_revision(&db, &revision, query.project.as_deref())?;
        let offset = if let Some(cursor) = &query.cursor {
            if cursor.len() > 4096 {
                return Err(AppError::reject(422, "INVALID_CURSOR"));
            }
            let cursor: Value = serde_json::from_str(cursor)
                .map_err(|_| AppError::reject(422, "INVALID_CURSOR"))?;
            if cursor["revision"] != cursor_revision || cursor["query"] != query_hash {
                return Err(AppError::reject(409, "CURSOR_STALE"));
            }
            cursor["offset"]
                .as_i64()
                .filter(|n| *n >= 0)
                .ok_or_else(|| AppError::reject(422, "INVALID_CURSOR"))?
        } else {
            0
        };
        let mut sql = "SELECT project_id,
    entity_type,
    entity_id,
    source_hash,
    metadata_json,
    validity
FROM documents
WHERE 1=1"
            .to_owned();
        let mut values = Vec::<SqlValue>::new();
        for (condition, value) in [
            ("entity_type", kind),
            ("project_id", query.project.as_deref()),
            (
                "json_extract(metadata_json,'$.status')",
                query.status.as_deref(),
            ),
            (
                "json_extract(metadata_json,'$.priority')",
                query.priority.as_deref(),
            ),
            (
                "json_extract(metadata_json,'$.milestone_id')",
                query.milestone_id.as_deref(),
            ),
            (
                "json_extract(metadata_json,'$.target.type')",
                query.target_type.as_deref(),
            ),
            (
                "json_extract(metadata_json,'$.target.id')",
                query.target_id.as_deref(),
            ),
        ] {
            if let Some(value) = value {
                sql.push_str(&format!(" AND {condition}=?"));
                values.push(value.to_owned().into());
            }
        }
        if let Some(label) = &query.label {
            sql.push_str(
                " AND EXISTS(SELECT 1 FROM json_each(metadata_json,'$.labels') WHERE value=?)",
            );
            values.push(label.clone().into());
        }
        let archived = query.archived.unwrap_or(false);
        sql.push_str(" AND (COALESCE(json_extract(metadata_json,'$.archived'),0)=1 OR COALESCE(json_extract(metadata_json,'$.state'),'')='archived')=?");
        values.push(i64::from(archived).into());
        if let Some(search) = &query.search {
            let terms = search
                .split_whitespace()
                .map(|term| format!("\"{}\"*", term.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND ");
            if !terms.is_empty() {
                sql.push_str(
                    " AND rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?)",
                );
                values.push(terms.into());
            }
        }
        sql.push_str(
            " ORDER BY
CASE WHEN entity_type='update' THEN json_extract(metadata_json,'$.recorded_at') END DESC,
COALESCE(json_extract(metadata_json,'$.position'),title),
entity_id,project_id,entity_type
LIMIT ? OFFSET ?",
        );
        values.push((limit as i64 + 1).into());
        values.push(offset.into());
        let mut statement = db.prepare(&sql)?;
        let mut rows = statement
            .query_map(rusqlite::params_from_iter(values), |r| {
                Ok(Indexed {
                    project_id: r.get(0)?,
                    kind: r.get(1)?,
                    id: r.get(2)?,
                    version: r.get(3)?,
                    metadata: serde_json::from_str(&r.get::<_, String>(4)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    validity: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = more.then(|| {
            serde_json::to_string(
                &json!({"revision":cursor_revision,"query":query_hash,"offset":offset+limit as i64}),
            )
            .unwrap()
        });
        let projection = ProjectionStatus::read(&db, query.project.as_deref())?;
        projection.mark_rows(&mut rows);
        let stale = projection.freshness == "stale" || rows.iter().any(|r| r.validity != "valid");
        Ok((
            rows,
            json!({
                "next_cursor": next,
                "snapshot_cursor": revision,
                "has_more": more,
                "freshness": if stale{"stale"}else{"index_snapshot"},
            }),
            projection.warnings,
        ))
    }
    pub fn summary_page(&self, kind: Option<&str>, query: &Query) -> Result<Value, AppError> {
        let (rows, page, warnings) = self.query_projection(kind, query, 200)?;
        Ok(
            json!({"items":rows.iter().map(Indexed::summary).collect::<Vec<_>>(),"page":page,"warnings":warnings}),
        )
    }
    pub(crate) fn issues(&self) -> Result<Vec<Value>, AppError> {
        let db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let mut statement = db.prepare(
            "SELECT project_id,
    path,
    code
FROM projection_issues
ORDER BY project_id,
    path
LIMIT 100",
        )?;
        Ok(statement
            .query_map([], |row| {
                let project_id: String = row.get(0)?;
                let path: String = row.get(1)?;
                let code: String = row.get(2)?;
                Ok(json!({ "project_id": project_id, "path": path, "code": code }))
            })?
            .collect::<Result<Vec<_>, _>>()?)
    }
    pub fn issue_count(&self) -> Result<i64, AppError> {
        Ok(self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?
            .query_row("SELECT count(*) FROM projection_issues", [], |r| r.get(0))?)
    }
}
