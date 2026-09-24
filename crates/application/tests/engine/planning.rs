use super::*;

#[test]
fn attention_uses_card_schedule_end_and_milestone_due() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    for (title, end) in [
        ("Overdue schedule", "2026-09-03"),
        ("Upcoming schedule", "2026-09-10"),
    ] {
        let card = create(&engine, &project, title);
        let resource = &card.body["result"]["resource"];
        patch(
            &engine,
            &project,
            resource["metadata"]["id"].as_str().unwrap(),
            resource["version"].as_str().unwrap(),
            json!({"set":{"schedule":{"start":"2026-08-30","end":end}}}),
        );
    }
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-05T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let attention = engine.attention(None, 200, now).unwrap();
    wire::validate("AttentionPage", &attention).unwrap();
    assert_eq!(attention["items"].as_array().unwrap().len(), 2);
    assert_eq!(attention["items"][0]["label"], "Overdue schedule");
    assert_eq!(attention["items"][0]["reason"], "overdue");
    let calendar = engine
        .calendar(Some(&project), "2026-09-01", "2026-09-30", None, 100)
        .unwrap();
    wire::validate("CalendarPage", &calendar).unwrap();
    assert_eq!(calendar["items"].as_array().unwrap().len(), 2);
    assert!(
        engine
            .calendar(None, "2026-02-30", "2026-03-01", None, 10)
            .is_err()
    );
    wire::validate("BoardView", &engine.board(&project, None, 50).unwrap()).unwrap();
    wire::validate("GanttPage", &engine.gantt(&project, None, 50).unwrap()).unwrap();
    let report = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "kind": "decision_needed",
                "summary": "Choose scope",
                "target": {
                    "type": "project",
                    "id": project,
                },
                "author": {
                    "kind": "human",
                    "label": "Owner",
                },
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    let id = report.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    engine
        .receipts(
            &json!({"items":[{"project_id":project,"update_id":id,"read":true}]}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    let attention = engine.attention(None, 200, now).unwrap();
    wire::validate("AttentionPage", &attention).unwrap();
    assert_eq!(attention["items"].as_array().unwrap().len(), 3);
    let decision = attention["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["reason"] == "decision_needed")
        .unwrap();
    assert_eq!(decision["report_id"], id);
    assert_eq!(decision["target"]["type"], "project");
    assert_eq!(decision["target"]["id"], project);
    let result = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "kind": "resolution",
                "summary": "Scope selected",
                "resolves": [id],
                "target": {
                    "type": "project",
                    "id": project,
                },
                "author": {
                    "kind": "human",
                    "label": "Owner",
                },
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(result.http_status, 200);
    assert_eq!(
        engine.attention(None, 200, now).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn milestone_due_is_date_only_and_durable() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let request = Uuid::now_v7().to_string();
    let mutation = Mutation {
        project_id: project.clone(),
        kind: Kind::Milestone,
        id: None,
        payload: json!({
            "title": "Release gate",
            "due": {"date": "2026-09-05"},
        }),
        request_id: request,
        epoch: engine.journal.epoch.clone(),
        expected: None,
    };
    let first = engine.mutate(mutation.clone()).unwrap();
    assert!(first.body["warnings"].as_array().unwrap().is_empty());
    assert_eq!(
        first.body["result"]["resource"]["metadata"]["due"],
        json!({"date":"2026-09-05"})
    );
    let replay = engine.mutate(mutation).unwrap();
    assert_eq!(replay.body["warnings"], first.body["warnings"]);
}

#[test]
fn gantt_pages_include_milestones_and_board_stays_card_only() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "Scheduled card");
    let milestone = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Milestone,
            id: None,
            payload: json!({"title":"Release gate","due":{"date":"2026-09-30"}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(milestone.http_status, 200, "{milestone:?}");
    let first = engine.gantt(&project, None, 1).unwrap();
    wire::validate("GanttPage", &first).unwrap();
    assert_eq!(first["rows"][0]["type"], "card");
    let second = engine
        .gantt(&project, first["page"]["next_cursor"].as_str(), 1)
        .unwrap();
    wire::validate("GanttPage", &second).unwrap();
    assert_eq!(second["rows"][0]["type"], "milestone");
    assert_eq!(second["rows"][0]["due"]["date"], "2026-09-30");
    let board = engine.board(&project, None, 50).unwrap();
    assert_eq!(
        board["columns"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["items"].as_array().unwrap().len())
            .sum::<usize>(),
        1
    );
}

#[test]
fn attention_project_filter_applies_before_pagination() {
    let env = Environment::new();
    let engine = env.engine();
    let first = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let second = register(&engine, other.to_str().unwrap());
    for project in [&first, &second] {
        let card = create(&engine, project, "Needs review");
        let resource = &card.body["result"]["resource"];
        patch(
            &engine,
            project,
            resource["metadata"]["id"].as_str().unwrap(),
            resource["version"].as_str().unwrap(),
            json!({"set":{"status":"review"}}),
        );
    }
    let page = engine
        .attention_project(Some(&second), None, 1, now_millis())
        .unwrap();
    wire::validate("AttentionPage", &page).unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(page["items"][0]["project_id"], second);
    assert!(page["page"]["next_cursor"].is_null());
}

#[test]
fn gantt_keeps_source_rows_and_page_snapshot_without_forecasts_or_edges() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let scheduled = create(&engine, &project, "Scheduled");
    patch(
        &engine,
        &project,
        scheduled.body["result"]["id"].as_str().unwrap(),
        scheduled.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"schedule":{"start":"2026-09-01","end":"2026-09-02"}}}),
    );
    create(&engine, &project, "Unscheduled");
    let first = engine.gantt(&project, None, 1).unwrap();
    wire::validate("GanttPage", &first).unwrap();
    assert_eq!(first["rows"].as_array().unwrap().len(), 1);
    assert!(first.get("analysis").is_none());
    assert!(first.get("forecasts").is_none());
    assert!(first.get("edges").is_none());
    let cursor = first["page"]["next_cursor"].as_str().unwrap();
    let next = engine.gantt(&project, Some(cursor), 1).unwrap();
    wire::validate("GanttPage", &next).unwrap();
    assert_eq!(next["rows"].as_array().unwrap().len(), 1);
}
