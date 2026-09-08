use super::*;

impl Engine {
    pub fn gantt(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 500)?;
        // Own every input and its revision before releasing the index lock.
        // Parsing and graph analysis below cannot delay unrelated index users.
        let snapshot = self.index.with_snapshot(|db, revision| {
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
            let mut statement = db.prepare(
                "SELECT entity_id,
    json_extract(metadata_json,
    '$.schedule'),
    json_extract(metadata_json,
    '$.depends_on'),
    validity
FROM documents
WHERE project_id=?1
AND entity_type='card'
AND COALESCE(json_extract(metadata_json,
    '$.archived'),
    0)=0
AND COALESCE(json_extract(metadata_json,
    '$.status'),
    '')!='cancelled'
ORDER BY entity_id
LIMIT 10001",
            )?;
            let mut cards = statement
                .query_map([project], |row| {
                    Ok(TimelineCard {
                        id: row.get(0)?,
                        schedule: row.get(1)?,
                        dependencies: row.get(2)?,
                        validity: row.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let truncated = cards.len() > 10_000;
            cards.truncate(10_000);
            let ids: BTreeSet<&str> = rows
                .iter()
                .flat_map(|row| {
                    row.metadata["depends_on"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                })
                .collect();
            let predecessors = if ids.is_empty() {
                BTreeMap::new()
            } else {
                // These inputs include archived/cancelled and analysis-bound
                // predecessors, preserving edge warnings independently of forecasts.
                let mut statement = db.prepare(
                    "SELECT entity_id,
    json_extract(metadata_json,
    '$.schedule.end'),
    validity
FROM documents
WHERE project_id=?1
AND entity_type='card'
AND entity_id IN (SELECT value
FROM json_each(?2))",
                )?;
                statement
                    .query_map(
                        params![
                            project,
                            serde_json::to_string(&ids).map_err(|source| AppError::stored(
                                "timeline predecessor IDs",
                                source
                            ))?
                        ],
                        |row| Ok((row.get(0)?, (row.get(1)?, row.get(2)?))),
                    )?
                    .collect::<Result<_, _>>()?
            };
            Ok(GanttSnapshot {
                revision: revision.to_owned(),
                scope,
                start,
                rows,
                more,
                cards,
                truncated,
                predecessors,
                projection,
            })
        })?;
        snapshot.render()
    }
}
struct TimelineCard {
    id: String,
    schedule: Option<String>,
    dependencies: Option<String>,
    validity: String,
}

impl TimelineCard {
    fn analysis_input(
        self,
        snapshot_reliable: bool,
    ) -> Result<project_domain::timeline::TimelineInput, AppError> {
        Ok(project_domain::timeline::TimelineInput {
            id: self.id,
            schedule: self
                .schedule
                .map(|text| {
                    serde_json::from_str(&text)
                        .map_err(|source| AppError::stored("timeline projection schedule", source))
                })
                .transpose()?,
            depends_on: self
                .dependencies
                .map(|text| {
                    serde_json::from_str(&text).map_err(|source| {
                        AppError::stored("timeline projection dependencies", source)
                    })
                })
                .transpose()?
                .unwrap_or_default(),
            reliable: self.validity == "valid" && snapshot_reliable,
        })
    }
}

struct GanttSnapshot {
    revision: String,
    scope: Value,
    start: u64,
    rows: Vec<Indexed>,
    more: bool,
    cards: Vec<TimelineCard>,
    truncated: bool,
    predecessors: BTreeMap<String, (Option<String>, String)>,
    projection: ProjectionStatus,
}

impl GanttSnapshot {
    fn render(self) -> Result<Value, AppError> {
        let cards = self
            .cards
            .into_iter()
            .map(|card| card.analysis_input(self.projection.freshness != "stale"))
            .collect::<Result<Vec<_>, AppError>>()?;
        let analysis = project_domain::timeline::analyze(&cards, self.truncated);
        let forecasts = self
            .rows
            .iter()
            .filter_map(|row| analysis.forecasts.get(&row.id))
            .collect::<Vec<_>>();
        let page_ids: BTreeSet<&str> = self.rows.iter().map(|row| row.id.as_str()).collect();
        let mut edges = Vec::new();
        let mut warnings = self.projection.warnings;
        for row in &self.rows {
            warnings.extend(project_domain::date_warnings(&row.metadata));
            for id in row.metadata["depends_on"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
            {
                let warning = match self.predecessors.get(id) {
                    None => Some("DEPENDENCY_MISSING"),
                    Some((_, validity))
                        if validity != "valid" || self.projection.freshness == "stale" =>
                    {
                        Some("DEPENDENCY_STALE")
                    }
                    Some((Some(end), _))
                        if row.metadata["schedule"]["start"]
                            .as_str()
                            .is_some_and(|start| start <= end.as_str()) =>
                    {
                        Some("DEPENDENCY_DATE_CONFLICT")
                    }
                    _ => None,
                };
                edges.push(json!({"from":id,"to":row.id,"kind":"finish_to_start","outside_page":!page_ids.contains(id),"warning":warning}));
            }
        }
        Ok(json!({
            "analysis": analysis,
            "forecasts": forecasts,
            "rows": self.rows.iter().map(Indexed::summary).collect::<Vec<_>>(),
            "edges": edges,
            "page": page(&self.scope,&self.revision,self.start,self.rows.len(),self.more,self.projection.freshness),
            "warnings": warnings.into_iter().take(100).collect::<Vec<_>>(),
        }))
    }
}
