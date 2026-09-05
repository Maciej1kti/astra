//! Budgeted project data for a caller. No source text is promoted to instructions.
use crate::{
    AppError,
    engine::{Engine, read},
    instant, now_millis,
};
use project_store::document::Kind;
use rusqlite::params;
use serde_json::{Value, json};
impl Engine {
    pub fn context(&self, project: &str, max_bytes: usize) -> Result<Value, AppError> {
        if !(4096..=131072).contains(&max_bytes) {
            return Err(AppError::reject(400, "INVALID_CONTEXT_BUDGET"));
        }
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let handle = self.store(project)?;
        let store = handle.lock().map_err(|_| AppError::State)?;
        let (document, version) = read(&store, Kind::Project, project)?;
        let workspace = self.workspace()?.0;
        let focus = workspace["focus"]
            .as_array()
            .ok_or(AppError::State)?
            .iter()
            .filter(|r| r["project_id"] == project)
            .cloned()
            .collect::<Vec<_>>();
        let (counts,candidates)=self.index.with_snapshot(|db,_|{
            let mut counts=serde_json::Map::new();let mut candidates=Vec::new();
            for (kind,field) in [(Kind::Milestone,"milestones"),(Kind::Card,"cards"),(Kind::Update,"updates")]{
                let count:i64=db.query_row("SELECT count(*) FROM documents WHERE project_id=?1 AND entity_type=?2",params![project,kind.as_str()],|r|r.get(0))?;
                counts.insert(field.into(),json!(count));
                let mut statement=db.prepare("SELECT entity_id FROM documents WHERE project_id=?1 AND entity_type=?2 ORDER BY EXISTS(SELECT 1 FROM json_each(?3) f WHERE json_extract(f.value,'$.card_id')=entity_id) DESC, CASE json_extract(metadata_json,'$.status') WHEN 'active' THEN 0 WHEN 'review' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END, json_extract(metadata_json,'$.recorded_at') DESC,entity_id LIMIT 200")?;
                let ids=statement.query_map(params![project,kind.as_str(),serde_json::to_string(&focus).unwrap()],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
                candidates.extend(ids.into_iter().map(|id|(kind,field,id)));
            }
            Ok((Value::Object(counts),candidates))
        })?;
        let mut out = json!({"api_version":"1","project":entry(&document,&version,1024),"cards":[],"milestones":[],"updates":[],"generated_at":instant(now_millis()),"truncated":false,"budget_bytes":max_bytes,"omitted":counts,"warnings":[],"focus":[],"included":{"project":1,"cards":0,"milestones":0,"updates":0,"focus":0},"next_reads":[]});
        out["omitted"]["focus"] = json!(focus.len());
        let budget = max_bytes - 512;
        for reference in focus {
            if encoded_len(&out) > max_bytes / 2 {
                break;
            }
            if !append(&mut out, "focus", reference, budget) {
                break;
            }
            increment(&mut out, "focus");
        }
        let mut omitted = Vec::new();
        for (kind, field, id) in candidates {
            let (value, version) = match read(&store, kind, &id) {
                Ok(value) => value,
                Err(_) => {
                    append(
                        &mut out,
                        "warnings",
                        json!({"code":"SOURCE_UNAVAILABLE","message":"A source could not be verified; read the resource separately."}),
                        budget,
                    );
                    omitted.push(json!({"type":kind.as_str(),"id":id}));
                    continue;
                }
            };
            let value = entry(
                &value,
                &version,
                if kind == Kind::Update { 512 } else { 1024 },
            );
            if append(&mut out, field, value, budget) {
                increment(&mut out, field);
            } else {
                omitted.push(json!({"type":kind.as_str(),"id":id}));
            }
        }
        for reference in omitted.into_iter().take(200) {
            if !append(&mut out, "next_reads", reference, budget) {
                break;
            }
        }
        out["truncated"] = json!(
            out["omitted"]
                .as_object()
                .unwrap()
                .values()
                .any(|v| v.as_u64().unwrap_or(0) > 0)
                || out["project"]["truncated"] == true
                || ["cards", "milestones", "updates"]
                    .iter()
                    .any(|field| out[field]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|entry| entry["truncated"] == true))
        );
        if encoded_len(&out) > max_bytes {
            return Err(AppError::reject(422, "CONTEXT_BUDGET_TOO_SMALL"));
        }
        Ok(out)
    }
}
fn encoded_len(value: &Value) -> usize {
    serde_json::to_vec(value)
        .expect("JSON value serialization")
        .len()
}
fn append(out: &mut Value, field: &str, value: Value, budget: usize) -> bool {
    let array = out[field].as_array_mut().unwrap();
    if array.len() >= if field == "warnings" { 100 } else { 200 } {
        return false;
    }
    array.push(value);
    if encoded_len(out) > budget {
        out[field].as_array_mut().unwrap().pop();
        false
    } else {
        true
    }
}
fn increment(out: &mut Value, field: &str) {
    out["included"][field] = json!(out["included"][field].as_u64().unwrap() + 1);
    out["omitted"][field] = json!(out["omitted"][field].as_u64().unwrap().saturating_sub(1));
}
fn entry(document: &Value, version: &str, max: usize) -> Value {
    let metadata = &document["metadata"];
    let body = document["body"].as_str().unwrap_or("");
    let mut end = max.min(body.len());
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    let mut out = json!({"type":document["type"],"id":metadata["id"],"title":metadata.get("title").or_else(||metadata.get("name")).or_else(||metadata.get("summary")).unwrap_or(&json!("")),"version":version,"excerpt":&body[..end],"truncated":end<body.len()});
    for key in [
        "phase",
        "status",
        "schedule",
        "due",
        "priority",
        "review_on",
        "blocked",
        "target",
        "recorded_at",
    ] {
        if let Some(value) = metadata.get(key) {
            out[key] = value.clone();
        }
    }
    if document["type"] == "project" {
        out["status"] = metadata["state"].clone();
    }
    out
}
