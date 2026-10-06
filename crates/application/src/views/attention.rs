use super::*;
use rusqlite::{Connection, functions::FunctionFlags};
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
};

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
        self.attention_folder(project, None, cursor, limit, now)
    }

    pub fn attention_folder(
        &self,
        project: Option<&str>,
        folder: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
        now: i64,
    ) -> Result<Value, AppError> {
        self.attention_mode(project, folder, cursor, limit, now, false)
    }

    pub fn attention_mode(
        &self,
        project: Option<&str>,
        folder: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
        now: i64,
        focus: bool,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        if let Some(folder) = folder {
            validate_folder(folder)?;
        }
        let workspace = self.workspace()?.value;
        let local_now =
            crate::workspace::civil_clock(&workspace.timezone, now, "attention timestamp")?;
        let today = local_now.date_naive();
        let clock = local_now.format("%Y-%m-%d %H:%M:00").to_string();
        let soon = today
            .checked_add_days(Days::new(7))
            .ok_or_else(|| AppError::invariant("attention date range"))?;
        // Release the journal lock before reading the disposable index.
        let receipts: String = if focus {
            self.journal.db()?.query_row(
                "SELECT json_group_array(project_id || ':' || update_id) FROM (SELECT project_id,update_id FROM read_receipts ORDER BY project_id,update_id)",
                [], |r| r.get(0),
            )?
        } else {
            "[]".into()
        };
        let receipts_version = project_store::document::version(receipts.as_bytes());
        self.index.with_snapshot(|db, revision| {
            let membership = ReceiptMembership::install(db, receipts)?;
            let result = (|| {
                let projection = ProjectionStatus::read(db, project)?;
                let boundary = event_boundary(db, project, folder, None, &clock)?;
                let scope = json!([
                    "attention",
                    page_revision(db, revision, project)?,
                    project,
                    folder,
                    today.to_string(),
                    boundary,
                    focus,
                    receipts_version,
                    limit
                ]);
                let start = offset(cursor, &scope)?;
                let candidate_prefix = (start as i64).saturating_add(i64::from(limit) + 1);
                let sql = format!(
                    include_str!("attention.sql"),
                    ACTIVE = ACTIVE,
                    FOLDER = EFFECTIVE_FOLDER
                );
                let mut statement = db.prepare(&sql)?;
                let mut items = statement
                    .query_map(
                        params![
                            today.to_string(),
                            soon.to_string(),
                            limit + 1,
                            start as i64,
                            project,
                            folder,
                            clock,
                            focus,
                            candidate_prefix
                        ],
                        attention_item,
                    )?
                    .collect::<Result<Vec<_>, _>>()?;
                for item in &mut items {
                    if let Some(id) = item["report_id"].as_str().map(str::to_owned) {
                        let text: String = db.query_row(
                            "SELECT json_extract(metadata_json,
    '$.target')
FROM documents
WHERE project_id=?1
AND entity_id=?2
AND entity_type='update'",
                            params![
                                item["project_id"]
                                    .as_str()
                                    .ok_or(AppError::invariant("attention item project ID"))?,
                                id
                            ],
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
            })();
            // Drop all read statements before removing the request's receipt snapshot.
            membership.finish()?;
            result
        })
    }
}

type ReadReports = HashMap<String, HashSet<String>>;

fn receipt_membership(snapshot: &str) -> Result<ReadReports, AppError> {
    // Journal keys are canonical UUID pairs, so their JSON needs no escapes.
    let receipts: Vec<&str> = serde_json::from_str(snapshot)
        .map_err(|source| AppError::stored("attention receipt snapshot", source))?;
    let mut members: ReadReports = HashMap::new();
    for receipt in receipts {
        let (project, report) = receipt
            .split_once(':')
            .ok_or_else(|| AppError::invariant("attention receipt identity"))?;
        if let Some(reports) = members.get_mut(project) {
            reports.insert(report.to_owned());
        } else {
            members.insert(project.to_owned(), HashSet::from([report.to_owned()]));
        }
    }
    Ok(members)
}

/// A receipt snapshot is available only while this request owns the index lock.
struct ReceiptMembership<'a> {
    db: &'a Connection,
    installed: bool,
}

enum ReceiptState {
    Snapshot(String),
    Ready(ReadReports),
}

impl<'a> ReceiptMembership<'a> {
    fn install(db: &'a Connection, snapshot: String) -> Result<Self, AppError> {
        let members = RefCell::new(ReceiptState::Snapshot(snapshot));
        db.create_scalar_function(
            "astra_report_is_read",
            2,
            FunctionFlags::SQLITE_UTF8
                | FunctionFlags::SQLITE_DETERMINISTIC
                | FunctionFlags::SQLITE_DIRECTONLY,
            move |context| {
                let project = context.get_raw(0);
                let report = context.get_raw(1);
                let project = project
                    .as_str()
                    .map_err(|source| rusqlite::Error::UserFunctionError(source.into()))?;
                let report = report
                    .as_str()
                    .map_err(|source| rusqlite::Error::UserFunctionError(source.into()))?;
                let mut state = members.borrow_mut();
                // A full decision prefix or an empty unread branch needs no membership set.
                if let ReceiptState::Snapshot(snapshot) = &*state {
                    *state = ReceiptState::Ready(
                        receipt_membership(snapshot)
                            .map_err(|source| rusqlite::Error::UserFunctionError(source.into()))?,
                    );
                }
                let ReceiptState::Ready(members) = &*state else {
                    return Err(rusqlite::Error::UserFunctionError(
                        AppError::invariant("attention receipt initialization").into(),
                    ));
                };
                Ok(members
                    .get(project)
                    .is_some_and(|reports| reports.contains(report)))
            },
        )?;
        Ok(Self {
            db,
            installed: true,
        })
    }

    fn finish(mut self) -> Result<(), AppError> {
        self.db.remove_function("astra_report_is_read", 2)?;
        self.installed = false;
        Ok(())
    }
}

impl Drop for ReceiptMembership<'_> {
    fn drop(&mut self) {
        if self.installed {
            let _ = self.db.remove_function("astra_report_is_read", 2);
        }
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
