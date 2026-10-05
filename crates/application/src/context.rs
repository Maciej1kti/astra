//! Budgeted project data for a caller. No source text is promoted to instructions.
use crate::{
    AppError,
    engine::Engine,
    instant, now_millis,
    source::{read, read_collection},
};
use project_domain::models::Document;
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
                            serde_json::to_string(&focus).map_err(|source| {
                                AppError::stored("context focus serialization", source)
                            })?
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
        let omitted = out["omitted"]
            .as_object()
            .ok_or(AppError::invariant("context omitted counts"))?
            .values()
            .any(|v| v.as_u64().unwrap_or(0) > 0);
        out["truncated"] = json!(
            omitted
                || out["project"]["truncated"] == true
                || ["cards", "milestones", "updates"]
                    .iter()
                    .any(|field| out[field]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|entry| entry["truncated"] == true))
        );
        if encoded_len(&out) > max_bytes {
            return Err(AppError::reject(422, "CONTEXT_BUDGET_TOO_SMALL"));
        }
        Ok(out)
    }
}
#[expect(
    clippy::expect_used,
    reason = "a JSON value always serializes into memory"
)]
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
    let Some(array) = out[field].as_array_mut() else {
        return false;
    };
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
    // Both counts come from the reply skeleton; without them nothing is adjusted.
    let (Some(included), Some(omitted)) = (
        out["included"][field].as_u64(),
        out["omitted"][field].as_u64(),
    ) else {
        return;
    };
    for (counter, previous, next) in [
        ("included", included, included + 1),
        ("omitted", omitted, omitted.saturating_sub(1)),
    ] {
        *encoded_bytes += decimal_len(next);
        *encoded_bytes -= decimal_len(previous);
        out[counter][field] = json!(next);
    }
}
fn decimal_len(value: u64) -> usize {
    value.checked_ilog10().unwrap_or(0) as usize + 1
}
fn entry(source: &project_store::document::ParsedDocument, max: usize) -> Value {
    #[expect(
        clippy::expect_used,
        reason = "validated metadata models hold only string keys and plain JSON values"
    )]
    let (kind, metadata, body) = match source.document.get() {
        Document::Project { metadata, body } => (
            "project",
            serde_json::to_value(metadata).expect("validated metadata serializes"),
            body,
        ),
        Document::Card { metadata, body } => (
            "card",
            serde_json::to_value(metadata).expect("validated metadata serializes"),
            body,
        ),
        Document::Milestone { metadata, body } => (
            "milestone",
            serde_json::to_value(metadata).expect("validated metadata serializes"),
            body,
        ),
        Document::Update { metadata, body } => (
            "update",
            serde_json::to_value(metadata).expect("validated metadata serializes"),
            body,
        ),
    };
    // A metadata model is a struct, so it serializes to an object.
    let mut metadata = match metadata {
        Value::Object(metadata) => metadata,
        _ => serde_json::Map::new(),
    };
    let version = &source.version;
    let mut end = max.min(body.len());
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    let mut out = json!({
        "type": kind,
        "id": metadata.get("id"),
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
        if key == "due" && kind != "milestone" {
            continue;
        }
        if let Some(value) = metadata.remove(key) {
            out[key] = value;
        }
    }
    if kind == "project"
        && let Some(state) = metadata.remove("state")
    {
        out["status"] = state;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_entries_keep_each_kind_metadata_and_utf8_excerpt_boundaries() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        for (kind, example, title_field, projected) in [
            (
                Kind::Project,
                "project.json",
                "name",
                json!({"status":"active","folder":"Work"}),
            ),
            (
                Kind::Card,
                "card-counters.json",
                "title",
                json!({
                    "status":"active", "priority":"high",
                    "schedule":{"start":"2026-09-14","end":"2026-09-18"}
                }),
            ),
            (
                Kind::Milestone,
                "milestone.json",
                "title",
                json!({"status":"active","due":{"date":"2026-09-25"}}),
            ),
            (
                Kind::Update,
                "update.json",
                "summary",
                json!({
                    "target":{"type":"project","id":"11111111-1111-4111-8111-111111111111"},
                    "recorded_at":"2026-09-05T10:10:00Z"
                }),
            ),
        ] {
            let mut input: Value = serde_json::from_slice(
                &std::fs::read(root.join("examples").join(example)).unwrap(),
            )
            .unwrap();
            input["metadata"][title_field] = json!("ą🦀 \"Context\" \\path");
            let mut expected = projected;
            if kind == Kind::Card {
                for key in ["comments", "counters"] {
                    expected[key] = input["metadata"][key].clone();
                }
                let acceptance = json!([{
                    "id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    "text":"ą🦀 \"Keep order\" \\path", "completed":false
                }]);
                input["metadata"]["acceptance"] = acceptance.clone();
                expected["acceptance"] = acceptance;
            }
            if matches!(kind, Kind::Milestone | Kind::Update) {
                input["metadata"]["x-context"] = json!({"body":"Do not export this extension"});
            }
            expected["type"] = json!(kind.as_str());
            expected["id"] = input["metadata"]["id"].clone();
            expected["title"] = input["metadata"][title_field].clone();
            let max = if kind == Kind::Update { 512 } else { 1024 };
            for padding in [max - 4, max - 3, max - 1, max] {
                input["body"] = json!(format!("{}🦀 tail\r\n", "a".repeat(padding)));
                let bytes = serde_json::to_vec(&input).unwrap();
                let source =
                    project_store::document::parse(kind, input["metadata"]["id"].as_str(), &bytes)
                        .unwrap();
                let excerpt = if padding == max - 4 {
                    format!("{}🦀", "a".repeat(padding))
                } else {
                    "a".repeat(padding)
                };
                expected["excerpt"] = json!(excerpt);
                expected["truncated"] = json!(true);
                expected["version"] = json!(project_store::document::version(&bytes));
                let actual = entry(&source, max);
                crate::wire::validate("ContextEntry", &actual).unwrap();
                assert_eq!(actual, expected, "{kind:?}, padding {padding}");
                assert_eq!(source.value(), input, "projection does not change source");
            }
        }
    }

    #[test]
    fn context_entry_keeps_event_and_omits_absent_optional_fields() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut input: Value = serde_json::from_slice(
            &std::fs::read(root.join("examples/card-counters.json")).unwrap(),
        )
        .unwrap();
        let metadata = input["metadata"].as_object_mut().unwrap();
        for key in ["schedule", "comments", "counters"] {
            metadata.remove(key);
        }
        metadata.insert("title".into(), json!("Event context"));
        let event = json!({"start":"2026-10-01T10:00","duration_minutes":30});
        metadata.insert("event".into(), event.clone());
        input["body"] = json!("");
        let bytes = serde_json::to_vec(&input).unwrap();
        let source = project_store::document::parse(Kind::Card, None, &bytes).unwrap();
        let actual = entry(&source, 1024);
        crate::wire::validate("ContextEntry", &actual).unwrap();
        assert_eq!(
            actual,
            json!({
                "type":"card", "id":input["metadata"]["id"], "title":"Event context",
                "status":"active", "priority":"high", "event":event,
                "version":project_store::document::version(&bytes),
                "excerpt":"", "truncated":false
            })
        );
        assert_eq!(source.value(), input);
    }

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
