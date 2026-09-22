use super::*;
use project_store::document;
use rusqlite::params;

#[test]
fn strict_card_commands_reject_retired_fields_without_writing() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());

    for payload in [
        json!({"title":"Rejected", "kind":"decision"}),
        json!({"title":"Rejected", "expected_result":"Legacy result"}),
        json!({"title":"Rejected", "owner":"Legacy owner"}),
    ] {
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Card,
                id: None,
                payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: None,
            })
            .unwrap();
        assert_eq!(reply.http_status, 422, "{reply:?}");
    }

    let created = create(&engine, &project, "Clean card");
    let id = created.body["result"]["id"].as_str().unwrap();
    let version = created.body["result"]["version"].as_str().unwrap();
    for payload in [
        json!({"set":{"kind":"decision"}}),
        json!({"set":{"expected_result":"Legacy result"}}),
        json!({"set":{"owner":"Legacy owner"}}),
    ] {
        let reply = patch(&engine, &project, id, version, payload);
        assert_eq!(reply.http_status, 422, "{reply:?}");
    }
    let current = engine.get(&project, Kind::Card, id).unwrap();
    for field in ["kind", "expected_result", "owner"] {
        assert!(current["metadata"].get(field).is_none(), "{field}");
    }
}

#[test]
fn stale_card_projection_rows_do_not_expose_retired_fields() {
    let indexed = Indexed {
        project_id: "project".into(),
        kind: "card".into(),
        id: "card".into(),
        version: "r1.card".into(),
        metadata: json!({
            "id":"card",
            "title":"Card",
            "status":"active",
            "priority":"normal",
            "kind":"decision",
            "expected_result":"Legacy result",
            "owner":"Legacy owner",
            "acceptance":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","text":"Keep","completed":true}]
        }),
        validity: "valid".into(),
    };
    let summary = indexed.summary();
    for field in ["kind", "expected_result", "owner"] {
        assert!(summary.get(field).is_none(), "stale summary field {field}");
    }
    assert_eq!(
        summary["acceptance_progress"],
        json!({"total":1,"completed":1})
    );

    let report = Indexed {
        project_id: "project".into(),
        kind: "update".into(),
        id: "report".into(),
        version: "r1.report".into(),
        metadata: json!({
            "id":"report",
            "summary":"Report",
            "kind":"decision_needed",
            "recorded_at":"2026-09-22T00:00:00Z"
        }),
        validity: "valid".into(),
    };
    assert_eq!(report.summary()["kind"], "decision_needed");
}

#[test]
fn card_undo_rejects_historical_retired_metadata_without_source_change() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Current card");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let current_version = created.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let source_path = env.root.join(format!("project/.project/cards/{id}.md"));
    let current_bytes = fs::read(&source_path).unwrap();
    let mut legacy_metadata = created.body["result"]["resource"]["metadata"].clone();
    legacy_metadata["kind"] = json!("decision");
    legacy_metadata["expected_result"] = json!("Legacy result");
    legacy_metadata["owner"] = json!("Legacy owner");
    let historical = format!(
        "---\n{}\n---\n{}",
        serde_json::to_string(&legacy_metadata).unwrap(),
        created.body["result"]["resource"]["body"].as_str().unwrap()
    )
    .into_bytes();
    assert!(document::parse(Kind::Card, Some(&id), &historical).is_err());
    let history_id = Uuid::new_v4().to_string();
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO history(
                id, project_id, target_kind, target_id, epoch, request_id,
                before_hash, after_hash, before_bytes, after_bytes, recorded_at
             ) VALUES (?1, ?2, 'card', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                history_id.clone(),
                project.clone(),
                id.clone(),
                engine.journal.epoch.clone(),
                Uuid::now_v7().to_string(),
                document::version(&historical),
                current_version.clone(),
                historical,
                current_bytes.clone(),
                "2026-09-22T00:00:00Z",
            ],
        )
        .unwrap();

    let reply = engine
        .mutate(Mutation {
            project_id: project,
            kind: Kind::Card,
            id: Some(id),
            payload: json!({"undo":{"history_entry_id":history_id}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(current_version),
        })
        .unwrap();
    assert_eq!(reply.http_status, 409, "{reply:?}");
    assert_eq!(reply.body["error"]["code"], "HISTORY_UNAVAILABLE");
    assert_eq!(fs::read(source_path).unwrap(), current_bytes);
}
