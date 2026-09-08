//! Rebuildable projections and bounded invalidation replay. State and source
//! documents are never restored from this database.
use crate::{AppError, instant};
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{Directory, ProjectStore},
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, params, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    path::Path,
    sync::Mutex,
};
use uuid::Uuid;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Query {
    pub project: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub label: Option<String>,
    pub milestone_id: Option<String>,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub archived: Option<bool>,
    pub search: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
#[derive(Debug, Clone)]
pub struct Indexed {
    pub project_id: String,
    pub kind: String,
    pub id: String,
    pub version: String,
    pub metadata: Value,
    pub validity: String,
}
impl Indexed {
    pub fn summary(&self) -> Value {
        let m = &self.metadata;
        let mut out = json!({"type":self.kind,"project_id":self.project_id,"id":self.id,"version":self.version,"title":m.get("title").or_else(||m.get("name")).or_else(||m.get("summary")).unwrap_or(&json!("Unavailable")),"availability":match self.validity.as_str(){"valid"=>"ready","unavailable"=>"unavailable","invalid"=>"invalid",_=>"stale"}});
        for key in [
            "status",
            "priority",
            "schedule",
            "due",
            "review_on",
            "archived",
            "position",
            "phase",
            "kind",
            "recorded_at",
            "author",
            "target",
            "blocked",
            "labels",
            "milestone_id",
            "owner",
        ] {
            if let Some(value) = m.get(key) {
                out[key] = value.clone();
            }
        }
        if self.kind == "project" {
            out["status"] = m["state"].clone();
        }
        if let Some(items) = m.get("acceptance").and_then(Value::as_array) {
            out["acceptance_progress"] = json!({
                "total": items.len(),
                "completed": items.iter().filter(|item| item["completed"] == true).count()
            });
        }
        out
    }
}

/// Search remains a derived projection; source Markdown is never rewritten.
fn search_text(body: &str, metadata: &Value) -> String {
    let mut text = body.to_owned();
    for key in ["expected_result", "owner"] {
        if let Some(value) = metadata.get(key).and_then(Value::as_str) {
            text.push('\n');
            text.push_str(value);
        }
    }
    if let Some(items) = metadata.get("acceptance").and_then(Value::as_array) {
        for item in items {
            if let Some(value) = item["text"].as_str() {
                text.push('\n');
                text.push_str(value);
            }
        }
    }
    text
}

fn upgrade_search_projection(connection: &mut Connection) -> Result<(), AppError> {
    let version: Option<String> = connection
        .query_row(
            "SELECT value FROM projection_meta WHERE key='search_format'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if version.as_deref() == Some("2") {
        return Ok(());
    }
    let tx = connection.transaction()?;
    let has_column = tx
        .prepare("PRAGMA table_info(documents)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|column| column == "search_text");
    if !has_column {
        tx.execute(
            "ALTER TABLE documents ADD COLUMN search_text TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    // Disable old trigger definitions before rebuilding the disposable index.
    tx.execute_batch("DROP TRIGGER IF EXISTS documents_ai; DROP TRIGGER IF EXISTS documents_ad; DROP TRIGGER IF EXISTS documents_au; DROP TABLE IF EXISTS documents_fts;")?;
    {
        let mut statement =
            tx.prepare("SELECT rowid,body,metadata_json FROM documents ORDER BY rowid")?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let body: String = row.get(1)?;
            let metadata: String = row.get(2)?;
            let metadata: Value = serde_json::from_str(&metadata).map_err(|_| AppError::State)?;
            tx.execute(
                "UPDATE documents SET search_text=?2 WHERE rowid=?1",
                params![id, search_text(&body, &metadata)],
            )?;
        }
    }
    tx.execute_batch(include_str!("../../../contracts/index-starting-schema.sql"))?;
    tx.execute(
        "INSERT INTO documents_fts(documents_fts) VALUES('rebuild')",
        [],
    )?;
    tx.execute("INSERT INTO projection_meta(key,value) VALUES('search_format','2') ON CONFLICT(key) DO UPDATE SET value='2'", [])?;
    tx.commit()?;
    Ok(())
}
type ProjectionDocuments = BTreeMap<(String, String), Option<(String, Value)>>;
type ProjectionKeys = Vec<(String, String)>;

fn relative_path(kind: &str, id: &str) -> String {
    if kind == "project" {
        "project.md".to_owned()
    } else {
        format!("{kind}s/{id}.md")
    }
}

/// Opaque page identity. Public snapshot cursors retain the global SSE sequence.
pub(crate) fn page_revision(
    db: &Connection,
    global: &str,
    project: Option<&str>,
) -> Result<String, AppError> {
    let Some(project) = project else {
        return Ok(global.to_owned());
    };
    let workspace: String = db.query_row(
        "SELECT value FROM projection_meta WHERE key='workspace_sequence'",
        [],
        |row| row.get(0),
    )?;
    let local: i64 = db
        .query_row(
            "SELECT sequence FROM projection_revisions WHERE project_id=?1",
            [project],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0);
    let epoch = global.rsplit_once(':').ok_or(AppError::State)?.0;
    Ok(format!("{epoch}:{workspace}:{local}"))
}

fn record_project_revision(db: &Connection, project: &str, sequence: i64) -> Result<(), AppError> {
    db.execute("INSERT INTO projection_revisions(project_id,sequence) VALUES(?1,?2) ON CONFLICT(project_id) DO UPDATE SET sequence=excluded.sequence", params![project,sequence])?;
    Ok(())
}

pub(crate) struct ProjectionStatus {
    pub freshness: &'static str,
    pub warnings: Vec<Value>,
    pending_projects: BTreeSet<String>,
}
impl ProjectionStatus {
    pub(crate) fn read(db: &Connection, project: Option<&str>) -> Result<Self, AppError> {
        let pending_projects: BTreeSet<String> = if let Some(project) = project {
            db.query_row(
                "SELECT project_id FROM projection_pending WHERE project_id=?1",
                [project],
                |row| row.get(0),
            )
            .optional()?
            .into_iter()
            .collect()
        } else {
            db.prepare("SELECT project_id FROM projection_pending")?
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?
        };
        let pending = !pending_projects.is_empty();
        Ok(Self {
            freshness: if pending { "stale" } else { "index_snapshot" },
            warnings: if pending {
                vec![
                    json!({"code":"PROJECTION_RECONCILING","message":"Project sources are being verified. Retained results may be stale, and an empty page does not yet establish that no resources exist."}),
                ]
            } else {
                Vec::new()
            },
            pending_projects,
        })
    }
    pub(crate) fn mark_rows(&self, rows: &mut [Indexed]) {
        for row in rows {
            if row.validity == "valid" && self.pending_projects.contains(&row.project_id) {
                row.validity = "stale".into();
            }
        }
    }
}

pub struct Index {
    connection: Mutex<Connection>,
    epoch: String,
    notifications: tokio::sync::watch::Sender<u64>,
    events: Mutex<VecDeque<(i64, Value)>>,
}
impl Index {
    pub(crate) fn begin_reconciliation(&self, projects: &Value) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        tx.execute("DELETE FROM projection_pending", [])?;
        for project in projects.as_array().ok_or(AppError::State)? {
            let id = project["project_id"].as_str().ok_or(AppError::State)?;
            tx.execute(
                "INSERT INTO projection_pending(project_id) VALUES(?1)",
                [id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn pending_projects(&self) -> Result<Vec<String>, AppError> {
        let db = self.connection.lock().map_err(|_| AppError::State)?;
        let mut statement =
            db.prepare("SELECT project_id FROM projection_pending ORDER BY project_id")?;
        Ok(statement
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?)
    }
    pub fn retain_registered(&self, projects: &Value) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let input = serde_json::to_string(projects).map_err(|_| AppError::State)?;
        tx.execute("DELETE FROM documents WHERE project_id NOT IN (SELECT json_extract(value,'$.project_id') FROM json_each(?1))",[&input])?;
        tx.execute("DELETE FROM projection_issues WHERE project_id NOT IN (SELECT json_extract(value,'$.project_id') FROM json_each(?1))",[&input])?;
        tx.execute("DELETE FROM projection_pending WHERE project_id NOT IN (SELECT json_extract(value,'$.project_id') FROM json_each(?1))",[&input])?;
        tx.execute("DELETE FROM projection_revisions WHERE project_id NOT IN (SELECT json_extract(value,'$.project_id') FROM json_each(?1))",[&input])?;
        tx.commit()?;
        Ok(())
    }
    pub fn forget_project(&self, project: &str, now: i64) -> Result<(), AppError> {
        {
            let mut db = self.connection.lock().map_err(|_| AppError::State)?;
            let tx = db.transaction()?;
            tx.execute("DELETE FROM documents WHERE project_id=?1", [project])?;
            tx.execute(
                "DELETE FROM projection_revisions WHERE project_id=?1",
                [project],
            )?;
            tx.execute(
                "DELETE FROM projection_pending WHERE project_id=?1",
                [project],
            )?;
            tx.execute(
                "DELETE FROM projection_issues WHERE project_id=?1",
                [project],
            )?;
            tx.commit()?;
        }
        self.invalidate_workspace(now)
    }
    pub fn subscribe(&self) -> tokio::sync::watch::Receiver<u64> {
        self.notifications.subscribe()
    }
    fn notify(&self) {
        self.notifications
            .send_modify(|sequence| *sequence = sequence.wrapping_add(1));
    }
    pub(crate) fn with_snapshot<T>(
        &self,
        read: impl FnOnce(&Connection, &str) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let db = self.connection.lock().map_err(|_| AppError::State)?;
        let sequence: String = db.query_row(
            "SELECT value FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        read(&db, &format!("{}:{sequence}", self.epoch))
    }

    pub fn invalidate_workspace(&self, now: i64) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let sequence:i64=tx.query_row("UPDATE projection_meta SET value=CAST(value AS INTEGER)+1 WHERE key='sequence' RETURNING CAST(value AS INTEGER)",[],|r|r.get(0))?;
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='workspace_sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        let mut events = self.events.lock().map_err(|_| AppError::State)?;
        events.push_back((now,json!({"kind":"resync_required","cursor":format!("{}:{sequence}",self.epoch),"reason":"workspace_changed"})));
        while events.len() > 10_000
            || events
                .front()
                .is_some_and(|(time, _)| *time < now - 600_000)
        {
            events.pop_front();
        }
        self.notify();
        Ok(())
    }

    pub fn mark_unavailable(&self, project_id: &str, code: &str, now: i64) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let changed=tx.execute("UPDATE documents SET validity='unavailable' WHERE project_id=?1 AND validity!='unavailable'",[project_id])?;
        let ended_reconciliation = tx.execute(
            "DELETE FROM projection_pending WHERE project_id=?1",
            [project_id],
        )?;
        let existing:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM projection_issues WHERE project_id=?1 AND path='project.md' AND code=?2)",params![project_id,code],|r|r.get(0))?;
        tx.execute("INSERT INTO projection_issues(project_id,path,code) VALUES(?1,'project.md',?2) ON CONFLICT(project_id,path) DO UPDATE SET code=excluded.code",params![project_id,code])?;
        if changed == 0 && existing && ended_reconciliation == 0 {
            tx.commit()?;
            return Ok(());
        }
        let sequence: i64 = tx.query_row(
            "SELECT CAST(value AS INTEGER) FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        let sequence = sequence + 1;
        record_project_revision(&tx, project_id, sequence)?;
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        let mut events = self.events.lock().map_err(|_| AppError::State)?;
        events.push_back((now,json!({"kind":"health_changed","cursor":format!("{}:{sequence}",self.epoch),"project_id":project_id,"reason":"project_unavailable"})));
        while events.len() > 10_000
            || events
                .front()
                .is_some_and(|(time, _)| *time < now - 600_000)
        {
            events.pop_front();
        }
        self.notify();
        Ok(())
    }
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let directory = Directory::open(path)?;
        directory.require_private()?;
        if !directory.exists_regular("index.sqlite")? {
            directory.replace("index.sqlite", &[], None)?;
        }
        directory.exists_regular("index.sqlite-wal")?;
        directory.exists_regular("index.sqlite-shm")?;
        let mut connection = Connection::open_with_flags(
            path.join("index.sqlite"),
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        connection.execute_batch(include_str!("../../../contracts/index-starting-schema.sql"))?;
        upgrade_search_projection(&mut connection)?;
        connection.execute_batch("INSERT INTO projection_meta(key,value) VALUES('sequence','0'),('workspace_sequence','0') ON CONFLICT(key) DO UPDATE SET value='0'; DELETE FROM projection_revisions;")?;
        Ok(Self {
            connection: Mutex::new(connection),
            epoch: Uuid::new_v4().to_string(),
            notifications: tokio::sync::watch::channel(0).0,
            events: Mutex::new(VecDeque::new()),
        })
    }
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

    fn apply_projection(
        &self,
        project_id: &str,
        documents: ProjectionDocuments,
        issues: Vec<(String, &str)>,
        keys: Option<ProjectionKeys>,
        now: i64,
    ) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let previous: BTreeMap<(String, String), (String, String)> = if let Some(keys) = &keys {
            let mut statement = tx.prepare("SELECT source_hash,validity FROM documents WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3")?;
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
            let mut statement=tx.prepare("SELECT entity_type,entity_id,source_hash,validity FROM documents WHERE project_id=?1")?;
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
                let count=tx.execute("UPDATE documents SET validity='stale' WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3 AND validity!='stale'",params![project_id,kind,id])?;
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
                let previous: Option<String> = tx.query_row("SELECT COALESCE(json_extract(metadata_json,'$.labels'),'[]') FROM documents WHERE project_id=?1 AND entity_type='card' AND entity_id=?2", params![project_id,id], |row|row.get(0)).optional()?;
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
            tx.execute("INSERT INTO documents(project_id,entity_id,entity_type,relative_path,source_hash,title,body,search_text,metadata_json,observed_at,validity) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'valid') ON CONFLICT(project_id,entity_type,entity_id) DO UPDATE SET source_hash=excluded.source_hash,title=excluded.title,body=excluded.body,search_text=excluded.search_text,metadata_json=excluded.metadata_json,observed_at=excluded.observed_at,validity='valid'",params![project_id,id,kind,relative,version,title,body,search_text(body,metadata),serde_json::to_string(metadata).unwrap(),instant(now)])?;
            let mut event = json!({"kind":"changed","project_id":project_id,"target":{"type":kind,"id":id},"version":version,"reason":"source_changed"});
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
                    tx.execute("INSERT INTO projection_issues(project_id,path,code) VALUES(?1,?2,?3) ON CONFLICT(project_id,path) DO UPDATE SET code=excluded.code", params![project_id, path, code])?;
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
        let mut events = self.events.lock().map_err(|_| AppError::State)?;
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
    pub fn cursor(&self) -> Result<String, AppError> {
        let db = self.connection.lock().map_err(|_| AppError::State)?;
        let sequence: String = db.query_row(
            "SELECT value FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        Ok(format!("{}:{sequence}", self.epoch))
    }
    pub fn events_since(&self, cursor: &str, now: i64) -> Result<Vec<Value>, AppError> {
        let current = self.cursor()?;
        let sequence = |cursor: &str| {
            cursor
                .rsplit_once(':')
                .and_then(|(epoch, sequence)| (epoch == self.epoch).then_some(sequence))
                .and_then(|sequence| sequence.parse::<i64>().ok())
        };
        let Some(since) = sequence(cursor) else {
            return Ok(vec![
                json!({"kind":"resync_required","cursor":current,"reason":"stream_epoch_changed"}),
            ]);
        };
        let current_sequence = sequence(&current).ok_or(AppError::State)?;
        let events = self.events.lock().map_err(|_| AppError::State)?;
        let first = events
            .iter()
            .find(|(time, _)| *time >= now - 600_000)
            .and_then(|(_, e)| sequence(e["cursor"].as_str().unwrap()))
            .unwrap_or(current_sequence + 1);
        if since > current_sequence || since < first - 1 {
            return Ok(vec![
                json!({"kind":"resync_required","cursor":current,"reason":"replay_gap"}),
            ]);
        }
        Ok(events
            .iter()
            .filter(|(time, e)| {
                *time >= now - 600_000
                    && sequence(e["cursor"].as_str().unwrap()).is_some_and(|seq| seq > since)
            })
            .map(|(_, e)| e.clone())
            .collect())
    }
    pub fn query(
        &self,
        kind: Option<&str>,
        query: &Query,
        max: u32,
    ) -> Result<(Vec<Indexed>, Value), AppError> {
        self.query_projection(kind, query, max)
            .map(|(rows, page, _)| (rows, page))
    }
    fn query_projection(
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
        let db = self.connection.lock().map_err(|_| AppError::State)?;
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
        let mut sql="SELECT project_id,entity_type,entity_id,source_hash,metadata_json,validity FROM documents WHERE 1=1".to_owned();
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
        sql.push_str(" ORDER BY CASE WHEN entity_type='update' THEN json_extract(metadata_json,'$.recorded_at') END DESC,COALESCE(json_extract(metadata_json,'$.position'),title),entity_id,project_id,entity_type LIMIT ? OFFSET ?");
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
            json!({"next_cursor":next,"snapshot_cursor":revision,"has_more":more,"freshness":if stale{"stale"}else{"index_snapshot"}}),
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
        let db = self.connection.lock().map_err(|_| AppError::State)?;
        let mut statement = db.prepare(
            "SELECT project_id,path,code FROM projection_issues ORDER BY project_id,path LIMIT 100",
        )?;
        Ok(statement.query_map([],|row|Ok(json!({"project_id":row.get::<_,String>(0)?,"path":row.get::<_,String>(1)?,"code":row.get::<_,String>(2)?})))?.collect::<Result<Vec<_>,_>>()?)
    }
    pub fn issue_count(&self) -> Result<i64, AppError> {
        Ok(self
            .connection
            .lock()
            .map_err(|_| AppError::State)?
            .query_row("SELECT count(*) FROM projection_issues", [], |r| r.get(0))?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_target_pagination_is_bounded_amid_more_than_twenty_thousand_unrelated_reports() {
        let temporary = tempfile::tempdir().unwrap();
        let directory = Directory::open(&temporary.path().canonicalize().unwrap())
            .unwrap()
            .child("index", true)
            .unwrap();
        let index = Index::open(directory.path()).unwrap();
        let project = Uuid::new_v4().to_string();
        let card = Uuid::new_v4().to_string();
        let other = Uuid::new_v4().to_string();
        let mut expected = BTreeSet::new();
        {
            let mut db = index.connection.lock().unwrap();
            let tx = db.transaction().unwrap();
            {
                let mut insert = tx.prepare("INSERT INTO documents(project_id,entity_id,entity_type,relative_path,source_hash,title,body,search_text,metadata_json,observed_at,validity) VALUES(?1,?2,'update','','r1.hash','Report','Detail body','',?3,'','valid')").unwrap();
                for number in 0..20_006 {
                    let id = Uuid::new_v4().to_string();
                    let target = if number >= 20_001 {
                        expected.insert(id.clone());
                        &card
                    } else {
                        &other
                    };
                    let metadata = json!({"id":id,"summary":"Report","recorded_at":"2026-09-08T10:00:00Z","target":{"type":"card","id":target}});
                    insert
                        .execute(params![project, id, metadata.to_string()])
                        .unwrap();
                }
                // Identical target identifiers in another project or target kind
                // must not leak into the selected card's report history.
                for (project_id, target_type) in
                    [(other.as_str(), "card"), (project.as_str(), "milestone")]
                {
                    let id = Uuid::new_v4().to_string();
                    insert.execute(params![project_id, id, json!({"id":id,"summary":"Report","target":{"type":target_type,"id":card}}).to_string()]).unwrap();
                }
            }
            tx.commit().unwrap();
        }
        let mut query = Query {
            project: Some(project),
            target_type: Some("card".into()),
            target_id: Some(card),
            limit: Some(2),
            ..Default::default()
        };
        let mut received = BTreeSet::new();
        let mut pages = 0;
        loop {
            let result = index.summary_page(Some("update"), &query).unwrap();
            assert!(result["items"].as_array().unwrap().len() <= 2);
            for item in result["items"].as_array().unwrap() {
                assert!(item.get("body").is_none());
                assert!(received.insert(item["id"].as_str().unwrap().to_owned()));
            }
            pages += 1;
            let Some(cursor) = result["page"]["next_cursor"].as_str() else {
                break;
            };
            query.cursor = Some(cursor.into());
            let mut different = query.clone();
            different.target_id = Some(other.clone());
            assert!(
                matches!(index.query(Some("update"), &different, 200), Err(AppError::Rejected(reply)) if reply.body["error"]["code"] == "CURSOR_STALE")
            );
        }
        assert_eq!(pages, 3);
        assert_eq!(received, expected);
    }

    #[test]
    fn report_target_filter_requires_a_valid_pair_on_update_queries() {
        let temporary = tempfile::tempdir().unwrap();
        let directory = Directory::open(&temporary.path().canonicalize().unwrap())
            .unwrap()
            .child("index", true)
            .unwrap();
        let index = Index::open(directory.path()).unwrap();
        let valid = Query {
            target_type: Some("card".into()),
            target_id: Some(Uuid::new_v4().to_string()),
            ..Default::default()
        };
        for (kind, query) in [
            (Some("card"), valid.clone()),
            (None, valid.clone()),
            (
                Some("update"),
                Query {
                    target_type: None,
                    ..valid.clone()
                },
            ),
            (
                Some("update"),
                Query {
                    target_id: None,
                    ..valid.clone()
                },
            ),
            (
                Some("update"),
                Query {
                    target_type: Some("update".into()),
                    ..valid.clone()
                },
            ),
            (
                Some("update"),
                Query {
                    target_id: Some(Uuid::now_v7().to_string()),
                    ..valid.clone()
                },
            ),
        ] {
            assert!(
                matches!(index.query(kind, &query, 200), Err(AppError::Rejected(reply)) if reply.body["error"]["code"] == "INVALID_TARGET_FILTER")
            );
        }
        assert!(index.query(Some("update"), &valid, 200).is_ok());
    }

    #[test]
    fn bundled_sqlite_seeks_composite_projection_and_report_target_keys() {
        let temporary = tempfile::tempdir().unwrap();
        let directory = Directory::open(&temporary.path().canonicalize().unwrap())
            .unwrap()
            .child("index", true)
            .unwrap();
        let index = Index::open(directory.path()).unwrap();
        let db = index.connection.lock().unwrap();
        for (sql, expected) in [
            (
                "EXPLAIN QUERY PLAN SELECT source_hash,validity FROM documents WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3",
                "project_id=? AND entity_type=? AND entity_id=?",
            ),
            (
                "EXPLAIN QUERY PLAN SELECT entity_id FROM documents WHERE project_id=?1 AND entity_type='update' AND json_extract(metadata_json,'$.target.type')=?2 AND json_extract(metadata_json,'$.target.id')=?3",
                "documents_report_target",
            ),
        ] {
            let mut statement = db.prepare(sql).unwrap();
            let plan = statement
                .query_map(["project", "card", "id"], |row| row.get::<_, String>(3))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
                .join("\n");
            assert!(plan.contains(expected), "{plan}");
        }
    }
}
