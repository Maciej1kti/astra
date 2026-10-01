//! Budgeted project data for a caller. No source text is promoted to instructions.
use crate::{
    AppError,
    engine::Engine,
    instant, now_millis,
    source::{read, read_collection},
};
use project_store::document::Kind;
use rusqlite::params;
use serde_json::{Value, json};
impl Engine {
    pub fn context(&self, project: &str, max_bytes: usize) -> Result<Value, AppError> {
        if !(4096..=131072).contains(&max_bytes) {
            return Err(AppError::reject(400, "INVALID_CONTEXT_BUDGET"));
        }
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let workspace = self.workspace()?.value;
        let focus = self
            .source_focus_in(&workspace, Some(project))?
            .into_iter()
            .filter(|r| r.project_id == project)
            .collect::<Vec<_>>();
        let handle = self.store(project)?;
        let store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
        let document = read(&store, Kind::Project, project)?;
        let (counts, candidates) = self.index.with_snapshot(|db, _| {
            let mut counts = serde_json::Map::new();
            let mut candidates = Vec::new();
            for (kind, field) in [
                (Kind::Milestone, "milestones"),
                (Kind::Card, "cards"),
                (Kind::Update, "updates"),
            ] {
                let count: i64 = db.query_row(
                    "SELECT count(*) FROM documents WHERE project_id=?1 AND entity_type=?2",
                    params![project, kind.as_str()],
                    |r| r.get(0),
                )?;
                counts.insert(field.into(), json!(count));
                let mut statement = db.prepare(
                    "SELECT entity_id
FROM documents
WHERE project_id=?1
AND entity_type=?2
ORDER BY EXISTS(SELECT 1
FROM json_each(?3) f
WHERE json_extract(f.value,
    '$.card_id')=entity_id) DESC,
    CASE json_extract(metadata_json,
    '$.status') WHEN 'active' THEN 0 WHEN 'review' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
    json_extract(metadata_json,
    '$.recorded_at') DESC,
    entity_id
LIMIT 200",
                )?;
                let ids = statement
                    .query_map(
                        params![
                            project,
                            kind.as_str(),
                            serde_json::to_string(&focus).unwrap()
                        ],
                        |r| r.get::<_, String>(0),
                    )?
                    .collect::<Result<Vec<_>, _>>()?;
                candidates.extend(ids.into_iter().map(|id| (kind, field, id)));
            }
            Ok((Value::Object(counts), candidates))
        })?;
        let mut out = json!({
            "api_version": "1",
            "project": entry(&document,1024),
            "cards": [],
            "milestones": [],
            "updates": [],
            "generated_at": instant(now_millis()),
            "truncated": false,
            "budget_bytes": max_bytes,
            "omitted": counts,
            "warnings": [],
            "focus": [],
            "included": {
                "project": 1,
                "cards": 0,
                "milestones": 0,
                "updates": 0,
                "focus": 0,
            },
            "next_reads": [],
        });
        out["omitted"]["focus"] = json!(focus.len());
        let budget = max_bytes - 512;
        // Appends and count updates keep the current compact JSON size exact.
        // The final truncation flag is followed by ordinary full serialization.
        let mut encoded_bytes = encoded_len(&out);
        for reference in focus {
            if encoded_bytes > max_bytes / 2 {
                break;
            }
            if !append(
                &mut out,
                "focus",
                json!(reference),
                budget,
                &mut encoded_bytes,
            ) {
                break;
            }
            increment(&mut out, "focus", &mut encoded_bytes);
        }
        let mut omitted = Vec::new();
        let mut collection_kind = None;
        let mut collection = None;
        for (kind, field, id) in candidates {
            if collection_kind != Some(kind) {
                collection = store.collection_reader(kind).ok();
                collection_kind = Some(kind);
            }
            let observed = match &collection {
                Some(reader) => read_collection(reader, kind, &id),
                // A failed collection open is not a cached source failure.
                // Each candidate retains the ordinary current lookup.
                None => read(&store, kind, &id),
            };
            let value = match observed {
                Ok(value) => value,
                Err(_) => {
                    append(
                        &mut out,
                        "warnings",
                        json!({"code":"SOURCE_UNAVAILABLE","message":"A source could not be verified; read the resource separately."}),
                        budget,
                        &mut encoded_bytes,
                    );
                    omitted.push(json!({"type":kind.as_str(),"id":id}));
                    continue;
                }
            };
            let value = entry(&value, if kind == Kind::Update { 512 } else { 1024 });
            if append(&mut out, field, value, budget, &mut encoded_bytes) {
                increment(&mut out, field, &mut encoded_bytes);
            } else {
                omitted.push(json!({"type":kind.as_str(),"id":id}));
            }
        }
        for reference in omitted.into_iter().take(200) {
            if !append(
                &mut out,
                "next_reads",
                reference,
                budget,
                &mut encoded_bytes,
            ) {
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
fn append(
    out: &mut Value,
    field: &str,
    value: Value,
    budget: usize,
    encoded_bytes: &mut usize,
) -> bool {
    let array = out[field].as_array_mut().unwrap();
    if array.len() >= if field == "warnings" { 100 } else { 200 } {
        return false;
    }
    let added = encoded_len(&value) + usize::from(!array.is_empty());
    if *encoded_bytes + added > budget {
        return false;
    }
    array.push(value);
    *encoded_bytes += added;
    true
}
fn increment(out: &mut Value, field: &str, encoded_bytes: &mut usize) {
    for (counter, next) in [
        ("included", out["included"][field].as_u64().unwrap() + 1),
        (
            "omitted",
            out["omitted"][field].as_u64().unwrap().saturating_sub(1),
        ),
    ] {
        let previous = out[counter][field].as_u64().unwrap();
        *encoded_bytes += decimal_len(next);
        *encoded_bytes -= decimal_len(previous);
        out[counter][field] = json!(next);
    }
}
fn decimal_len(value: u64) -> usize {
    value.checked_ilog10().unwrap_or(0) as usize + 1
}
fn entry(source: &project_store::document::ParsedDocument, max: usize) -> Value {
    let document = source.value();
    let version = &source.version;
    let metadata = &document["metadata"];
    let body = document["body"].as_str().unwrap_or("");
    let mut end = max.min(body.len());
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    let mut out = json!({
        "type": document["type"],
        "id": metadata["id"],
        "title": metadata.get("title").or_else(||metadata.get("name")).or_else(||metadata.get("summary")).unwrap_or(&json!("")),
        "version": version,
        "excerpt": &body[..end],
        "truncated": end<body.len(),
    });
    for key in [
        "status",
        "schedule",
        "event",
        "due",
        "priority",
        "target",
        "recorded_at",
        "acceptance",
        "comments",
        "counters",
        "folder",
    ] {
        if key == "due" && document["type"] != "milestone" {
            continue;
        }
        if let Some(value) = metadata.get(key) {
            out[key] = value.clone();
        }
    }
    if document["type"] == "project" {
        out["status"] = metadata["state"].clone();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incremental_budget_matches_compact_json_at_escape_and_counter_boundaries() {
        for initial in [0, 8, 9, 98, 99, 198, 199] {
            for omitted in [0u64, 1, 9, 10, 99, 100, 999, 1000, 9999, 10_000] {
                let original = json!({
                    "cards": vec![json!({"id":"previous"}); initial],
                    "warnings": [], "next_reads": [],
                    "included": {"cards":initial}, "omitted": {"cards":omitted},
                    "project": {"excerpt":"ą🦀 \"quoted\" \\path\n\t\r\u{001f}"}
                });
                let value = json!({
                    "type":"card", "title":"ą🦀 \"quoted\" \\path\n\t\r\u{0001}",
                    "acceptance":[{"text":"Structured \\ data", "completed":false}],
                    "comments":[{"body":"ą🦀\n\t"}],
                    "counters":[{"values":{"2026-10-01":1_000_000_000}}]
                });
                let mut trial = original.clone();
                trial["cards"].as_array_mut().unwrap().push(value.clone());
                let exact = encoded_len(&trial);
                for budget in [exact - 1, exact, exact + 1] {
                    let mut out = original.clone();
                    let mut bytes = encoded_len(&out);
                    let accepted = append(&mut out, "cards", value.clone(), budget, &mut bytes);
                    assert_eq!(accepted, exact <= budget);
                    assert_eq!(out, if accepted { &trial } else { &original }.clone());
                    assert_eq!(bytes, encoded_len(&out));
                    if accepted {
                        increment(&mut out, "cards", &mut bytes);
                        assert_eq!(out["included"]["cards"], initial + 1);
                        assert_eq!(out["omitted"]["cards"], omitted.saturating_sub(1));
                        assert_eq!(bytes, encoded_len(&out));
                    }
                }
            }
        }
    }

    #[test]
    fn array_caps_and_rejected_appends_keep_the_exact_budget_state() {
        for (field, cap) in [
            ("focus", 200),
            ("cards", 200),
            ("milestones", 200),
            ("updates", 200),
            ("warnings", 100),
            ("next_reads", 200),
        ] {
            let mut out = json!({field: []});
            let mut bytes = encoded_len(&out);
            for index in 0..cap {
                let value = json!({"id":index,"text":"ą🦀 \"quoted\" \\path\n"});
                let mut trial = out.clone();
                trial[field].as_array_mut().unwrap().push(value.clone());
                let exact = encoded_len(&trial);
                let original = out.clone();
                assert!(!append(
                    &mut out,
                    field,
                    value.clone(),
                    exact - 1,
                    &mut bytes
                ));
                assert_eq!(out, original);
                assert_eq!(bytes, encoded_len(&out));
                assert!(append(&mut out, field, value, exact, &mut bytes));
                assert_eq!(out, trial);
                assert_eq!(bytes, exact);
            }
            let original = out.clone();
            assert!(!append(
                &mut out,
                field,
                json!({"id":"overflow"}),
                usize::MAX,
                &mut bytes
            ));
            assert_eq!(out, original);
            assert_eq!(bytes, encoded_len(&out));
        }
    }
}
