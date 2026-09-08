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
        let mut out = json!({
            "type": self.kind,
            "project_id": self.project_id,
            "id": self.id,
            "version": self.version,
            "title": m.get("title").or_else(||m.get("name")).or_else(||m.get("summary")).unwrap_or(&json!("Unavailable")),
            "availability": match self.validity.as_str(){"valid"=>"ready","unavailable"=>"unavailable","invalid"=>"invalid",_=>"stale"},
        });
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
                "completed": items.iter().filter(|item| item["completed"] == true).count(),
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
    tx.execute_batch(include_str!(
        "../../../../contracts/index-starting-schema.sql"
    ))?;
    tx.execute(
        "INSERT INTO documents_fts(documents_fts) VALUES('rebuild')",
        [],
    )?;
    tx.execute(
        "INSERT INTO projection_meta(key,
    value)
VALUES ('search_format',
    '2')
ON CONFLICT (key) DO UPDATE
SET value='2'",
        [],
    )?;
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
    db.execute(
        "INSERT INTO projection_revisions(project_id,
    sequence)
VALUES (?1,
    ?2)
ON CONFLICT (project_id) DO UPDATE
SET sequence=excluded.sequence",
        params![project, sequence],
    )?;
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
                vec![json!({
                    "code": "PROJECTION_RECONCILING",
                    "message": "Project sources are being verified. Retained results may be stale, and an empty page does not yet establish that no resources exist.",
                })]
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
    pub(crate) fn with_snapshot<T>(
        &self,
        read: impl FnOnce(&Connection, &str) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let sequence: String = db.query_row(
            "SELECT value FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        read(&db, &format!("{}:{sequence}", self.epoch))
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
        connection.execute_batch(include_str!(
            "../../../../contracts/index-starting-schema.sql"
        ))?;
        upgrade_search_projection(&mut connection)?;
        connection.execute_batch(
            "INSERT INTO projection_meta(key,
    value)
VALUES ('sequence',
    '0'),
    ('workspace_sequence',
    '0')
ON CONFLICT (key) DO UPDATE
SET value='0'; DELETE
FROM projection_revisions;",
        )?;
        Ok(Self {
            connection: Mutex::new(connection),
            epoch: Uuid::new_v4().to_string(),
            notifications: tokio::sync::watch::channel(0).0,
            events: Mutex::new(VecDeque::new()),
        })
    }
}

mod events;
mod projection;
mod query;
mod reconciliation;
#[cfg(test)]
mod tests;
