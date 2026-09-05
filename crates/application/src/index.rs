//! Rebuildable projections and bounded invalidation replay. State and source
//! documents are never restored from this database.
use crate::{AppError, instant};
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{Directory, ProjectStore},
};
use rusqlite::{Connection, OpenFlags, params, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
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
        ] {
            if let Some(value) = m.get(key) {
                out[key] = value.clone();
            }
        }
        if self.kind == "project" {
            out["status"] = m["state"].clone();
        }
        out
    }
}
pub struct Index {
    connection: Mutex<Connection>,
    epoch: String,
    events: Mutex<VecDeque<(i64, Value)>>,
}
impl Index {
    pub fn mark_unavailable(&self, project_id: &str, code: &str, now: i64) -> Result<(), AppError> {
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let changed=tx.execute("UPDATE documents SET validity='unavailable' WHERE project_id=?1 AND validity!='unavailable'",[project_id])?;
        let existing:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM projection_issues WHERE project_id=?1 AND path='project.md' AND code=?2)",params![project_id,code],|r|r.get(0))?;
        tx.execute("INSERT INTO projection_issues(project_id,path,code) VALUES(?1,'project.md',?2) ON CONFLICT(project_id,path) DO UPDATE SET code=excluded.code",params![project_id,code])?;
        if changed == 0 && existing {
            tx.commit()?;
            return Ok(());
        }
        let sequence: i64 = tx.query_row(
            "SELECT CAST(value AS INTEGER) FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        let sequence = sequence + 1;
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        self.events.lock().map_err(|_|AppError::State)?.push_back((now,json!({"kind":"health_changed","cursor":format!("{}:{sequence}",self.epoch),"project_id":project_id,"reason":"project_unavailable"})));
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
        let connection = Connection::open_with_flags(
            path.join("index.sqlite"),
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        connection.execute_batch(include_str!("../../../contracts/index-starting-schema.sql"))?;
        connection.execute_batch("INSERT INTO projection_meta(key,value) VALUES('sequence','0') ON CONFLICT(key) DO UPDATE SET value='0';")?;
        Ok(Self {
            connection: Mutex::new(connection),
            epoch: Uuid::new_v4().to_string(),
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
                    issues.push((filename, "INVALID_FILENAME"));
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
        let mut db = self.connection.lock().map_err(|_| AppError::State)?;
        let tx = db.transaction()?;
        let previous: BTreeMap<(String, String), (String, String)> = {
            let mut statement=tx.prepare("SELECT entity_type,entity_id,source_hash,validity FROM documents WHERE project_id=?1")?;
            statement
                .query_map([project_id], |r| {
                    Ok(((r.get(0)?, r.get(1)?), (r.get(2)?, r.get(3)?)))
                })?
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
            let title = metadata
                .get("title")
                .or_else(|| metadata.get("name"))
                .or_else(|| metadata.get("summary"))
                .and_then(Value::as_str)
                .ok_or(AppError::State)?;
            let relative = if kind == "project" {
                "project.md".to_owned()
            } else {
                format!("{kind}s/{id}.md")
            };
            tx.execute("INSERT INTO documents(project_id,entity_id,entity_type,relative_path,source_hash,title,body,metadata_json,observed_at,validity) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,'valid') ON CONFLICT(project_id,entity_type,entity_id) DO UPDATE SET source_hash=excluded.source_hash,title=excluded.title,body=excluded.body,metadata_json=excluded.metadata_json,observed_at=excluded.observed_at,validity='valid'",params![project_id,id,kind,relative,version,title,value["body"].as_str().unwrap(),serde_json::to_string(metadata).unwrap(),instant(now)])?;
            changes.push(json!({"kind":"changed","project_id":project_id,"target":{"type":kind,"id":id},"version":version,"reason":"source_changed"}));
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
        tx.execute(
            "DELETE FROM projection_issues WHERE project_id=?1",
            [project_id],
        )?;
        for (path, code) in issues {
            tx.execute(
                "INSERT INTO projection_issues(project_id,path,code) VALUES(?1,?2,?3)",
                params![project_id, path, code],
            )?;
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
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        // Keep DB guard until publication so a snapshot never outruns its events.
        let mut events = self.events.lock().map_err(|_| AppError::State)?;
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
        let offset = if let Some(cursor) = &query.cursor {
            if cursor.len() > 4096 {
                return Err(AppError::reject(422, "INVALID_CURSOR"));
            }
            let cursor: Value = serde_json::from_str(cursor)
                .map_err(|_| AppError::reject(422, "INVALID_CURSOR"))?;
            if cursor["revision"] != revision || cursor["query"] != query_hash {
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
        sql.push_str(" ORDER BY CASE WHEN entity_type='update' THEN json_extract(metadata_json,'$.recorded_at') END DESC,COALESCE(json_extract(metadata_json,'$.position'),title),entity_id LIMIT ? OFFSET ?");
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
                &json!({"revision":revision,"query":query_hash,"offset":offset+limit as i64}),
            )
            .unwrap()
        });
        let stale = rows.iter().any(|r| r.validity != "valid");
        Ok((
            rows,
            json!({"next_cursor":next,"snapshot_cursor":revision,"has_more":more,"freshness":if stale{"stale"}else{"index_snapshot"}}),
        ))
    }
    pub fn summary_page(&self, kind: Option<&str>, query: &Query) -> Result<Value, AppError> {
        let (rows, page) = self.query(kind, query, 200)?;
        Ok(
            json!({"items":rows.iter().map(Indexed::summary).collect::<Vec<_>>(),"page":page,"warnings":[]}),
        )
    }
    pub fn issue_count(&self) -> Result<i64, AppError> {
        Ok(self
            .connection
            .lock()
            .map_err(|_| AppError::State)?
            .query_row("SELECT count(*) FROM projection_issues", [], |r| r.get(0))?)
    }
}
