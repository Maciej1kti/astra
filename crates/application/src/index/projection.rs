use super::*;

impl Index {
    pub fn refresh(
        &self,
        store: &ProjectStore,
        project_id: &str,
        now: i64,
    ) -> Result<(), AppError> {
        let (project_dir, name) = store.location(Kind::Project, project_id, false)?;
        let project = project_dir
            .read(&name)?
            .ok_or_else(|| AppError::reject(409, "PROJECT_DOCUMENT_MISSING"))?;
        let project = document::parse(Kind::Project, Some(project_id), &project)?;
        let mut documents = BTreeMap::new();
        documents.insert(
            ("project".to_owned(), project_id.to_owned()),
            Some((project.version.clone(), project.value())),
        );
        let mut issues = Vec::new();
        for kind in [Kind::Card, Kind::Milestone, Kind::Update] {
            let directory = match store.directory.child(kind.directory().unwrap(), false) {
                Ok(directory) => directory,
                Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    continue;
                }
                Err(error) => return Err(error.into()),
            };
            for filename in directory.names()? {
                let Some(id) = filename.strip_suffix(".md") else {
                    continue;
                };
                if Uuid::parse_str(id).is_err() {
                    issues.push((
                        format!("{}/{filename}", kind.directory().unwrap()),
                        "INVALID_FILENAME",
                    ));
                    continue;
                }
                let parsed = directory
                    .read(&filename)
                    .and_then(|bytes| bytes.ok_or(StoreError::Invalid("SOURCE_DISAPPEARED")))
                    .and_then(|bytes| document::parse(kind, Some(id), &bytes));
                let key = (kind.as_str().to_owned(), id.to_owned());
                match parsed {
                    Ok(parsed) => {
                        documents.insert(key, Some((parsed.version.clone(), parsed.value())));
                    }
                    Err(_) => {
                        documents.insert(key, None);
                        issues.push((
                            format!("{}/{filename}", kind.directory().unwrap()),
                            "DOCUMENT_INVALID",
                        ));
                    }
                }
            }
        }
        self.apply_projection(project_id, documents, issues, None, now)
    }
    /// Re-read only named source documents. Never accepts arbitrary filesystem paths.
    pub fn refresh_targets(
        &self,
        store: &ProjectStore,
        project_id: &str,
        targets: &[(Kind, String)],
        now: i64,
    ) -> Result<(), AppError> {
        let mut documents = BTreeMap::new();
        let mut issues = Vec::new();
        let mut keys = Vec::new();
        let mut seen = BTreeSet::new();
        for (kind, id) in targets {
            if Uuid::parse_str(id).is_err() {
                return Err(AppError::State);
            }
            let key = (kind.as_str().to_owned(), id.clone());
            if !seen.insert(key.clone()) {
                continue;
            }
            keys.push(key.clone());
            let relative = relative_path(kind.as_str(), id);
            let bytes = match store.location(*kind, id, false) {
                Ok((directory, name)) => directory.read(&name),
                Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    Ok(None)
                }
                Err(error) => Err(error),
            };
            let parsed = match bytes {
                Ok(None) => continue,
                Ok(Some(bytes)) => document::parse(*kind, Some(id), &bytes),
                Err(error) => Err(error),
            };
            match parsed {
                Ok(parsed) => {
                    documents.insert(key, Some((parsed.version.clone(), parsed.value())));
                }
                Err(_) => {
                    documents.insert(key, None);
                    issues.push((relative, "DOCUMENT_INVALID"));
                }
            }
        }
        self.apply_projection(project_id, documents, issues, Some(keys), now)
    }
    pub(super) fn apply_projection(
        &self,
        project_id: &str,
        documents: ProjectionDocuments,
        issues: Vec<(String, &str)>,
        keys: Option<ProjectionKeys>,
        now: i64,
    ) -> Result<(), AppError> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let tx = db.transaction()?;
        let previous: BTreeMap<(String, String), (String, String)> = if let Some(keys) = &keys {
            let mut statement = tx.prepare(
                "SELECT source_hash,
    validity
FROM documents
WHERE project_id=?1
AND entity_type=?2
AND entity_id=?3",
            )?;
            let mut previous = BTreeMap::new();
            for (kind, id) in keys {
                if let Some(value) = statement
                    .query_row(params![project_id, kind, id], |row| {
                        Ok((row.get(0)?, row.get(1)?))
                    })
                    .optional()?
                {
                    previous.insert((kind.clone(), id.clone()), value);
                }
            }
            previous
        } else {
            let mut statement = tx.prepare(
                "SELECT entity_type,
    entity_id,
    source_hash,
    validity
FROM documents
WHERE project_id=?1",
            )?;
            statement
                .query_map([project_id], |r| {
                    Ok(((r.get(0)?, r.get(1)?), (r.get(2)?, r.get(3)?)))
                })?
                .collect::<Result<_, _>>()?
        };
        let previous_issues: BTreeMap<String, String> = if let Some(keys) = &keys {
            let mut statement =
                tx.prepare("SELECT code FROM projection_issues WHERE project_id=?1 AND path=?2")?;
            let mut previous = BTreeMap::new();
            for (kind, id) in keys {
                let path = relative_path(kind, id);
                if let Some(code) = statement
                    .query_row(params![project_id, path], |row| row.get(0))
                    .optional()?
                {
                    previous.insert(path, code);
                }
            }
            previous
        } else {
            let mut statement =
                tx.prepare("SELECT path,code FROM projection_issues WHERE project_id=?1")?;
            statement
                .query_map([project_id], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?
        };
        let mut changes = Vec::new();
        for ((kind, id), value) in &documents {
            let Some((version, value)) = value else {
                let count = tx.execute(
                    "UPDATE documents
SET validity='stale'
WHERE project_id=?1
AND entity_type=?2
AND entity_id=?3
AND validity!='stale'",
                    params![project_id, kind, id],
                )?;
                if count > 0 {
                    changes.push(json!({"kind":"health_changed","project_id":project_id,"reason":"document_invalid"}));
                }
                continue;
            };
            if previous.get(&(kind.clone(), id.clone()))
                == Some(&(version.clone(), "valid".to_owned()))
            {
                continue;
            }
            let metadata = &value["metadata"];
            let tags_changed = if kind == "card" {
                let previous: Option<String> = tx
                    .query_row(
                        "SELECT COALESCE(json_extract(metadata_json,
    '$.labels'),
    '[]')
FROM documents
WHERE project_id=?1
AND entity_type='card'
AND entity_id=?2",
                        params![project_id, id],
                        |row| row.get(0),
                    )
                    .optional()?;
                previous
                    .as_deref()
                    .map(serde_json::from_str::<Value>)
                    .transpose()
                    .map_err(|_| AppError::State)?
                    .unwrap_or(serde_json::json!([]))
                    != metadata
                        .get("labels")
                        .cloned()
                        .unwrap_or(serde_json::json!([]))
            } else {
                false
            };
            let title = metadata
                .get("title")
                .or_else(|| metadata.get("name"))
                .or_else(|| metadata.get("summary"))
                .and_then(Value::as_str)
                .ok_or(AppError::State)?;
            let relative = relative_path(kind, id);
            let body = value["body"].as_str().unwrap();
            tx.execute(
                "INSERT INTO documents(project_id,
    entity_id,
    entity_type,
    relative_path,
    source_hash,
    title,
    body,
    search_text,
    metadata_json,
    observed_at,
    validity)
VALUES (?1,
    ?2,
    ?3,
    ?4,
    ?5,
    ?6,
    ?7,
    ?8,
    ?9,
    ?10,
    'valid')
ON CONFLICT (project_id,
    entity_type,
    entity_id) DO UPDATE
SET source_hash=excluded.source_hash,
    title=excluded.title,
    body=excluded.body,
    search_text=excluded.search_text,
    metadata_json=excluded.metadata_json,
    observed_at=excluded.observed_at,
    validity='valid'",
                params![
                    project_id,
                    id,
                    kind,
                    relative,
                    version,
                    title,
                    body,
                    search_text(body, metadata),
                    serde_json::to_string(metadata).unwrap(),
                    instant(now)
                ],
            )?;
            let mut event = json!({
                "kind": "changed",
                "project_id": project_id,
                "target": {
                    "type": kind,
                    "id": id,
                },
                "version": version,
                "reason": "source_changed",
            });
            if kind == "card" {
                event["tags_changed"] = json!(tags_changed);
            }
            changes.push(event);
        }
        for (kind, id) in previous.keys() {
            if !documents.contains_key(&(kind.clone(), id.clone())) {
                tx.execute(
                    "DELETE FROM documents WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3",
                    params![project_id, kind, id],
                )?;
                changes.push(json!({"kind":"changed","project_id":project_id,"target":{"type":kind,"id":id},"reason":"source_removed"}));
            }
        }
        let issues: BTreeMap<_, _> = issues
            .into_iter()
            .map(|(path, code)| (path, code.to_owned()))
            .collect();
        let ended_reconciliation = keys.is_none()
            && tx.execute(
                "DELETE FROM projection_pending WHERE project_id=?1",
                [project_id],
            )? > 0;
        if issues != previous_issues {
            for path in previous_issues
                .keys()
                .filter(|path| !issues.contains_key(*path))
            {
                tx.execute(
                    "DELETE FROM projection_issues WHERE project_id=?1 AND path=?2",
                    params![project_id, path],
                )?;
            }
            for (path, code) in &issues {
                if previous_issues.get(path) != Some(code) {
                    tx.execute(
                        "INSERT INTO projection_issues(project_id,
    path,
    code)
VALUES (?1,
    ?2,
    ?3)
ON CONFLICT (project_id,
    path) DO UPDATE
SET code=excluded.code",
                        params![project_id, path, code],
                    )?;
                }
            }
            if !changes
                .iter()
                .any(|event| event["kind"] == "health_changed")
            {
                changes.push(json!({"kind":"health_changed","project_id":project_id,"reason":"projection_issues_changed"}));
            }
        }
        if ended_reconciliation
            && !changes
                .iter()
                .any(|event| event["kind"] == "health_changed")
        {
            changes.push(json!({"kind":"health_changed","project_id":project_id,"reason":"projection_reconciled"}));
        }
        let mut sequence: i64 = tx.query_row(
            "SELECT CAST(value AS INTEGER) FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        for event in &mut changes {
            sequence += 1;
            event["cursor"] = json!(format!("{}:{sequence}", self.epoch));
        }
        if !changes.is_empty() {
            record_project_revision(&tx, project_id, sequence)?;
        }
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        // Keep DB guard until publication so a snapshot never outruns its events.
        let mut events = self
            .events
            .lock()
            .map_err(|_| AppError::LockPoisoned("invalidation replay"))?;
        if !changes.is_empty() {
            self.notify();
        }
        events.extend(changes.into_iter().map(|event| (now, event)));
        while events.len() > 10_000
            || events
                .front()
                .is_some_and(|(time, _)| *time < now - 600_000)
        {
            events.pop_front();
        }
        Ok(())
    }
}
