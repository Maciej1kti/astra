//! Bounded projections. SQL applies filters and pagination before materializing output.
use crate::{
    AppError,
    engine::Engine,
    index::{Indexed, ProjectionStatus, page_revision},
};
use chrono::Days;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
fn offset(cursor: Option<&str>, scope: &Value) -> Result<u64, AppError> {
    let Some(cursor) = cursor else { return Ok(0) };
    if cursor.len() > 4096 {
        return Err(AppError::reject(400, "INVALID_CURSOR"));
    }
    let value: Value =
        serde_json::from_str(cursor).map_err(|_| AppError::reject(400, "INVALID_CURSOR"))?;
    if value[0] != *scope {
        return Err(AppError::reject(409, "PAGE_STALE"));
    }
    value[1]
        .as_u64()
        .filter(|n| *n <= i64::MAX as u64)
        .ok_or_else(|| AppError::reject(400, "INVALID_CURSOR"))
}
fn page(
    scope: &Value,
    revision: &str,
    start: u64,
    count: usize,
    more: bool,
    freshness: &str,
) -> Value {
    json!({
        "next_cursor": more.then(||json!([scope,start+count as u64]).to_string()),
        "snapshot_cursor": revision,
        "has_more": more,
        "freshness": freshness,
    })
}
fn bounded(limit: u32, max: u32) -> Result<(), AppError> {
    if limit == 0 || limit > max {
        Err(AppError::reject(400, "INVALID_LIMIT"))
    } else {
        Ok(())
    }
}
const ACTIVE: &str = "COALESCE(json_extract(d.metadata_json,
    '$.archived'),
    0)=0
AND COALESCE(json_extract(d.metadata_json,
    '$.status'),
    '') NOT IN ('done',
    'cancelled',
    'achieved')
AND COALESCE(json_extract(d.metadata_json,
    '$.state'),
    '')!='archived'
AND NOT EXISTS(SELECT 1
FROM documents p
WHERE p.project_id=d.project_id
AND p.entity_type='project'
AND json_extract(p.metadata_json,
    '$.state')='archived')";

fn rows(
    db: &Connection,
    project: &str,
    status: Option<&str>,
    limit: u32,
    offset: u64,
    include_milestones: bool,
) -> Result<Vec<Indexed>, AppError> {
    let mut statement = db.prepare(include_str!("planning-rows.sql"))?;
    statement
        .query_map(
            params![project, status, limit, offset as i64, include_milestones],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )?
        .map(|r| {
            let (id, version, metadata, validity, kind) = r?;
            Ok(Indexed {
                project_id: project.into(),
                kind,
                id,
                version,
                metadata: serde_json::from_str(&metadata)
                    .map_err(|source| AppError::stored("view row metadata", source))?,
                validity,
            })
        })
        .collect()
}

mod attention;
mod board;
mod calendar;
mod gantt;
