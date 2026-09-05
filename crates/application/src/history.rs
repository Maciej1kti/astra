use crate::{
    AppError,
    engine::{Engine, read},
    journal::{Command, Journal},
};
use project_store::document::{self, Kind};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::collections::BTreeSet;
impl Engine {
    pub fn history(
        &self,
        project: &str,
        kind: Kind,
        id: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        if limit == 0 || limit > 200 {
            return Err(AppError::reject(400, "INVALID_LIMIT"));
        }
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let handle = self.store(project)?;
        let store = handle.lock().map_err(|_| AppError::State)?;
        let (_, current) = read(&store, kind, id)?;
        let db = self.journal.db()?;
        let (newest,count):(i64,i64)=db.query_row("SELECT COALESCE(MAX(rowid),0),count(*) FROM history WHERE project_id=?1 AND target_kind=?2 AND target_id=?3",params![project,kind.as_str(),id],|r|Ok((r.get(0)?,r.get(1)?)))?;
        let revision = json!([project, kind.as_str(), id, current, newest, count]);
        let before = if let Some(cursor) = cursor {
            let value: Value = serde_json::from_str(cursor)
                .map_err(|_| AppError::reject(400, "INVALID_CURSOR"))?;
            if value[0] != revision {
                return Err(AppError::reject(409, "PAGE_STALE"));
            }
            value[1]
                .as_i64()
                .ok_or_else(|| AppError::reject(400, "INVALID_CURSOR"))?
        } else {
            i64::MAX
        };
        let mut statement=db.prepare("SELECT rowid,id,request_id,recorded_at,before_hash,after_hash,before_bytes,after_bytes FROM history WHERE project_id=?1 AND target_kind=?2 AND target_id=?3 AND rowid<?4 ORDER BY rowid DESC LIMIT ?5")?;
        let rows = statement
            .query_map(
                params![project, kind.as_str(), id, before, limit + 1],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, Option<Vec<u8>>>(6)?,
                        r.get::<_, Option<Vec<u8>>>(7)?,
                    ))
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        let more = rows.len() > limit as usize;
        let mut items = Vec::new();
        let mut last = before;
        for (row, id, request, time, before_hash, after_hash, before_bytes, after_bytes) in
            rows.into_iter().take(limit as usize)
        {
            last = row;
            let previous = before_bytes
                .as_ref()
                .and_then(|b| document::parse(kind, None, b).ok())
                .map(|p| p.value());
            let after = after_bytes
                .as_ref()
                .and_then(|b| document::parse(kind, None, b).ok())
                .map(|p| p.value());
            let mut fields = BTreeSet::new();
            for document in [&previous, &after].into_iter().flatten() {
                for key in document["metadata"]
                    .as_object()
                    .ok_or(AppError::State)?
                    .keys()
                {
                    if key != "updated_at"
                        && previous.as_ref().map(|p| &p["metadata"][key])
                            != after.as_ref().map(|p| &p["metadata"][key])
                    {
                        fields.insert(key.clone());
                    }
                }
            }
            if previous.as_ref().map(|p| &p["body"]) != after.as_ref().map(|p| &p["body"]) {
                fields.insert("body".into());
            }
            items.push(json!({"id":id,"request_id":request,"recorded_at":time,"before_version":before_hash,"after_version":after_hash,"changed_fields":fields.into_iter().take(100).collect::<Vec<_>>(),"can_undo":previous.is_some()&&kind!=Kind::Update&&after_hash==current}));
        }
        let next = more.then(|| json!([revision, last]).to_string());
        Ok(
            json!({"items":items,"page":{"next_cursor":next,"snapshot_cursor":self.index.cursor()?,"has_more":more,"freshness":"verified"}}),
        )
    }
}
pub(crate) fn undo_document(
    journal: &Journal,
    command: &Command,
    history_id: &str,
    current: &str,
) -> Result<Value, AppError> {
    let row:Option<(Option<Vec<u8>>,String)>=journal.db()?.query_row("SELECT before_bytes,after_hash FROM history WHERE id=?1 AND project_id=?2 AND target_kind=?3 AND target_id=?4",params![history_id,command.target.project_id,command.target.kind.as_str(),command.target.id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let (before, after) = row.ok_or_else(|| AppError::reject(404, "HISTORY_NOT_FOUND"))?;
    if after != current {
        return Err(AppError::reject(409, "UNDO_TARGET_CHANGED"));
    }
    let bytes = before.ok_or_else(|| AppError::reject(409, "UNDO_CREATE_NOT_SUPPORTED"))?;
    document::parse(command.target.kind, Some(&command.target.id), &bytes)
        .map(|p| p.value())
        .map_err(|_| AppError::reject(409, "HISTORY_UNAVAILABLE"))
}
