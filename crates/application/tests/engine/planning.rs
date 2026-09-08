use super::*;

#[test]
fn attention_distinguishes_hard_deadlines_and_reading_from_resolution() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    for (title, kind) in [("Soft target", "target"), ("Hard deadline", "hard")] {
        let card = create(&engine, &project, title);
        let resource = &card.body["result"]["resource"];
        patch(
            &engine,
            &project,
            resource["metadata"]["id"].as_str().unwrap(),
            resource["version"].as_str().unwrap(),
            json!({"set":{"due":{"date":"2026-09-01","kind":kind},"schedule":{"start":"2026-08-30","end":"2026-09-03"}}}),
        );
    }
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-05T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let attention = engine.attention(None, 200, now).unwrap();
    wire::validate("AttentionPage", &attention).unwrap();
    assert_eq!(attention["items"].as_array().unwrap().len(), 1);
    assert_eq!(attention["items"][0]["label"], "Hard deadline");
    let calendar = engine
        .calendar(Some(&project), "2026-09-01", "2026-09-30", None, 100)
        .unwrap();
    wire::validate("CalendarPage", &calendar).unwrap();
    assert_eq!(calendar["items"].as_array().unwrap().len(), 4);
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
    assert_eq!(
        engine.attention(None, 200, now).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
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
        1
    );
}

#[test]
fn schedule_warning_is_durable_and_never_moves_deadline() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let request = Uuid::now_v7().to_string();
    let mutation = Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: None,
        payload: json!({
            "title": "Plan after due",
            "schedule": {
                "start": "2026-09-01",
                "end": "2026-09-10",
            },
            "due": {
                "date": "2026-09-05",
                "kind": "hard",
            },
        }),
        request_id: request,
        epoch: engine.journal.epoch.clone(),
        expected: None,
    };
    let first = engine.mutate(mutation.clone()).unwrap();
    assert_eq!(first.body["warnings"][0]["code"], "SCHEDULE_AFTER_DUE");
    assert_eq!(
        first.body["result"]["resource"]["metadata"]["due"]["date"],
        "2026-09-05"
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
            payload: json!({"title":"Release gate","due":{"date":"2026-09-30","kind":"hard"}}),
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
fn timeline_forecast_uses_other_pages_without_changing_recorded_dates() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let a = create(&engine, &project, "Design");
    let aid = a.body["result"]["id"].as_str().unwrap();
    patch(
        &engine,
        &project,
        aid,
        a.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"schedule":{"start":"2026-09-01","end":"2026-09-03"}}}),
    );
    let b = create(&engine, &project, "Build");
    let bid = b.body["result"]["id"].as_str().unwrap();
    let changed = patch(
        &engine,
        &project,
        bid,
        b.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"schedule":{"start":"2026-09-02","end":"2026-09-04"},"depends_on":[aid]}}),
    );
    assert_eq!(changed.http_status, 200);
    let first = engine.gantt(&project, None, 1).unwrap();
    wire::validate("GanttPage", &first).unwrap();
    assert_eq!(first["analysis"]["forecast_end"], "2026-09-06");
    assert_eq!(first["analysis"]["delay_days"], 2);
    assert_eq!(first["analysis"]["complete"], true);
    let next = engine
        .gantt(&project, first["page"]["next_cursor"].as_str(), 1)
        .unwrap();
    wire::validate("GanttPage", &next).unwrap();
    assert_eq!(first["analysis"], next["analysis"]);
    let all = engine.gantt(&project, None, 50).unwrap();
    assert_eq!(
        all["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["id"] == bid)
            .unwrap()["schedule"]["start"],
        "2026-09-02"
    );
}

#[test]
fn gantt_bulk_predecessors_preserve_archived_cancelled_stale_missing_and_undated_warnings() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let mut predecessors = std::collections::BTreeMap::new();
    for name in ["archived", "cancelled", "stale", "missing", "undated"] {
        let created = create(&engine, &project, name);
        let id = created.body["result"]["id"].as_str().unwrap();
        let mut set = json!({});
        if name != "undated" {
            set["schedule"] = json!({"start":"2026-09-01","end":"2026-09-10"});
        }
        if name == "archived" {
            set["archived"] = json!(true);
        }
        if name == "cancelled" {
            set["status"] = json!("cancelled");
        }
        if name != "undated" {
            let edited = patch(
                &engine,
                &project,
                id,
                created.body["result"]["version"].as_str().unwrap(),
                json!({"set":set}),
            );
            assert_eq!(edited.http_status, 200);
        }
        predecessors.insert(name, id.to_owned());
    }
    let target = create(&engine, &project, "Dependent card");
    let id = target.body["result"]["id"].as_str().unwrap();
    let edited = patch(
        &engine,
        &project,
        id,
        target.body["result"]["version"].as_str().unwrap(),
        json!({
            "set": {
                "schedule": {
                    "start": "2026-09-02",
                    "end": "2026-09-03",
                },
                "depends_on": predecessors.values().collect::<Vec<_>>(),
            },
        }),
    );
    assert_eq!(edited.http_status, 200);
    fs::write(
        env.root.join(format!(
            "project/.project/cards/{}.md",
            predecessors["stale"]
        )),
        b"Unfinished external edit",
    )
    .unwrap();
    fs::remove_file(env.root.join(format!(
        "project/.project/cards/{}.md",
        predecessors["missing"]
    )))
    .unwrap();
    engine.refresh_project(&project, None).unwrap();
    let view = engine.gantt(&project, None, 50).unwrap();
    wire::validate("GanttPage", &view).unwrap();
    for (name, warning) in [
        ("archived", Some("DEPENDENCY_DATE_CONFLICT")),
        ("cancelled", Some("DEPENDENCY_DATE_CONFLICT")),
        ("stale", Some("DEPENDENCY_STALE")),
        ("missing", Some("DEPENDENCY_MISSING")),
        ("undated", None),
    ] {
        let edge = view["edges"]
            .as_array()
            .unwrap()
            .iter()
            .find(|edge| edge["from"] == predecessors[name] && edge["to"] == id)
            .unwrap();
        assert_eq!(edge["warning"].as_str(), warning, "{name}");
        if name == "archived" || name == "missing" {
            assert_eq!(edge["outside_page"], true);
        }
    }
    assert_eq!(view["analysis"]["complete"], false);
}

#[test]
fn forecast_example_matches_projection_contracts() {
    let example: Value =
        serde_json::from_str(include_str!("../../../../examples/gantt-forecast.json")).unwrap();
    wire::validate("TimelineAnalysis", &example["analysis"]).unwrap();
    for forecast in example["forecasts"].as_array().unwrap() {
        wire::validate("TimelineForecast", forecast).unwrap();
    }
}
