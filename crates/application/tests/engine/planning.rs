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

#[test]
fn project_folders_scope_all_resources_before_pagination_and_survive_restart() {
    let env = Environment::new();
    let engine = env.engine();
    let first = register(&engine, &env.path());
    let mut projects = vec![first];
    for name in ["other", "third"] {
        let path = env.root.join(name);
        fs::create_dir(&path).unwrap();
        projects.push(register(&engine, path.to_str().unwrap()));
    }
    let set_folder = |engine: &Engine, project: &str, payload: Value| {
        let source = engine.get(project, Kind::Project, project).unwrap();
        engine
            .mutate(Mutation {
                project_id: project.into(),
                kind: Kind::Project,
                id: Some(project.into()),
                payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: Some(source["version"].as_str().unwrap().into()),
            })
            .unwrap()
    };
    for (i, project) in projects.iter().enumerate() {
        assert_eq!(
            set_folder(
                &engine,
                project,
                json!({"set":{"folder":if i == 0 {"Home"} else {"Work"}}})
            )
            .http_status,
            200
        );
        let created = create(&engine, project, "Folder card");
        let resource = &created.body["result"]["resource"];
        let id = resource["metadata"]["id"].as_str().unwrap();
        assert_eq!(
            patch(
                &engine,
                project,
                id,
                resource["version"].as_str().unwrap(),
                json!({"set":{"status":"review","labels":["Unchanged"]}})
            )
            .http_status,
            200
        );
    }
    let folders = engine.folders(None, 1).unwrap();
    wire::validate("FolderPage", &folders).unwrap();
    assert_eq!(folders["items"], json!(["Home"]));
    let next = engine
        .folders(folders["page"]["next_cursor"].as_str(), 1)
        .unwrap();
    assert_eq!(next["items"], json!(["Work"]));
    assert_eq!(next["page"]["has_more"], false);
    let query = Query {
        folder: Some("Work".into()),
        limit: Some(1),
        ..Query::default()
    };
    let first_page = engine.list(Some("card"), &query).unwrap();
    assert_ne!(first_page["items"][0]["project_id"], projects[0]);
    assert_eq!(first_page["items"][0]["labels"], json!(["Unchanged"]));
    let second_page = engine
        .list(
            Some("card"),
            &Query {
                cursor: first_page["page"]["next_cursor"]
                    .as_str()
                    .map(str::to_owned),
                ..query.clone()
            },
        )
        .unwrap();
    assert_ne!(second_page["items"][0]["project_id"], projects[0]);
    assert_ne!(
        first_page["items"][0]["project_id"],
        second_page["items"][0]["project_id"]
    );
    assert_eq!(second_page["page"]["has_more"], false);
    let attention = engine
        .attention_folder(None, Some("Work"), None, 1, now_millis())
        .unwrap();
    assert_ne!(attention["items"][0]["project_id"], projects[0]);
    assert_eq!(attention["page"]["has_more"], true);
    assert!(
        engine
            .attention_folder(
                None,
                Some("Home"),
                attention["page"]["next_cursor"].as_str(),
                1,
                now_millis()
            )
            .is_err()
    );
    assert_eq!(
        set_folder(&engine, &projects[1], json!({"set":{"folder":" "}})).http_status,
        422
    );
    assert_eq!(
        set_folder(&engine, &projects[1], json!({"clear":["folder"]})).http_status,
        200
    );
    assert!(
        engine
            .list(
                Some("card"),
                &Query {
                    cursor: first_page["page"]["next_cursor"]
                        .as_str()
                        .map(str::to_owned),
                    ..query.clone()
                }
            )
            .is_err()
    );
    drop(engine);
    let engine = env.engine();
    let remaining = engine.list(Some("card"), &query).unwrap();
    assert_eq!(remaining["items"][0]["project_id"], projects[2]);
    assert_eq!(remaining["page"]["has_more"], false);
    assert!(
        engine
            .get(&projects[1], Kind::Project, &projects[1])
            .unwrap()["metadata"]
            .get("folder")
            .is_none()
    );
}
