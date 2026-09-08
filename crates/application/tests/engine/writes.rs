use super::*;

#[test]
fn stale_target_rejection_precedes_unrelated_collection_validation_and_replays() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "Before");
    let id = first.body["result"]["id"].as_str().unwrap();
    let version = first.body["result"]["version"].as_str().unwrap();
    assert_eq!(
        patch(
            &engine,
            &project,
            id,
            version,
            json!({"set":{"title":"After"}})
        )
        .http_status,
        200
    );
    fs::write(
        env.root
            .join(format!("project/.project/cards/{}.md", Uuid::new_v4())),
        "invalid sibling",
    )
    .unwrap();
    let input = Mutation {
        project_id: project,
        kind: Kind::Card,
        id: Some(id.into()),
        payload: json!({"set":{"status":"active"}}),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: Some(version.into()),
    };
    let reply = engine.mutate(input.clone()).unwrap();
    assert_eq!(reply.body["error"]["code"], "VERSION_CONFLICT");
    let replay = engine.mutate(input).unwrap();
    assert_eq!(reply.body, replay.body);
}

#[test]
fn dependency_validation_rereads_external_edits_and_deleted_cards() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "First");
    let second = create(&engine, &project, "Second");
    create(&engine, &project, "Observe the initial source graph");
    let a = first.body["result"]["id"].as_str().unwrap();
    let b = second.body["result"]["id"].as_str().unwrap();
    let mut changed = first.body["result"]["resource"].clone();
    changed.as_object_mut().unwrap().remove("version");
    changed["metadata"]["depends_on"] = json!([b]);
    let bytes =
        project_store::document::serialize(&project_domain::validate_document(changed).unwrap())
            .unwrap();
    let source = env.root.join(format!("project/.project/cards/{a}.md"));
    fs::write(&source, bytes).unwrap();
    let cycle = patch(
        &engine,
        &project,
        b,
        second.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"depends_on":[a]}}),
    );
    assert_eq!(cycle.body["error"]["code"], "DEPENDENCY_INVALID");
    fs::remove_file(source).unwrap();
    let missing = patch(
        &engine,
        &project,
        b,
        second.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"depends_on":[a]}}),
    );
    assert_eq!(missing.body["error"]["code"], "DEPENDENCY_INVALID");
    let cursor = engine.index.cursor().unwrap();
    let fresh = engine.get(&project, Kind::Card, b).unwrap();
    assert_eq!(
        patch(
            &engine,
            &project,
            b,
            fresh["version"].as_str().unwrap(),
            json!({"set":{"title":"Renamed"}})
        )
        .http_status,
        200
    );
    for event in engine.index.events_since(&cursor, now_millis()).unwrap() {
        wire::validate("Event", &event).unwrap();
        assert_eq!(event["tags_changed"], false);
    }
}

#[test]
fn real_card_edit_two_clients_search_and_index_rebuild() {
    let env = Environment::new();
    let engine = Arc::new(env.engine());
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "żółć export");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let version = created.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut threads = Vec::new();
    for title in ["Client one", "Client two"] {
        let engine = engine.clone();
        let project = project.clone();
        let id = id.clone();
        let version = version.clone();
        threads.push(std::thread::spawn(move || {
            patch(
                &engine,
                &project,
                &id,
                &version,
                json!({"set":{"title":title}}),
            )
        }));
    }
    let mut statuses = threads
        .into_iter()
        .map(|thread| thread.join().unwrap().http_status)
        .collect::<Vec<_>>();
    statuses.sort();
    assert_eq!(statuses, vec![200, 412]);
    let detail = engine.get(&project, Kind::Card, &id).unwrap();
    wire::validate("CardResource", &detail).unwrap();
    let query = Query {
        project: Some(project.clone()),
        search: Some("Client".into()),
        ..Default::default()
    };
    let page = engine.list(Some("card"), &query).unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    wire::validate("SummaryPage", &page).unwrap();
    let old = engine
        .list(
            Some("card"),
            &Query {
                search: Some("żółć".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(
        old["items"].as_array().unwrap().is_empty(),
        "FTS update removed old tokens"
    );
    drop(engine);
    fs::remove_file(env.root.join("state/index.sqlite")).unwrap();
    let engine = env.engine();
    assert_eq!(engine.get(&project, Kind::Card, &id).unwrap(), detail);
    assert_eq!(
        engine.list(Some("card"), &query).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn create_retry_without_client_id_returns_the_original_resource() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let request_id = Uuid::now_v7().to_string();
    let input = || Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: None,
        payload: json!({"title":"Once"}),
        request_id: request_id.clone(),
        epoch: engine.journal.epoch.clone(),
        expected: None,
    };
    let first = engine.mutate(input()).unwrap();
    let second = engine.mutate(input()).unwrap();
    assert_eq!(first.body["result"], second.body["result"]);
    assert_eq!(second.body["replayed"], true);
}

#[test]
fn undo_restores_one_change_and_refuses_later_edits() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Original");
    let original = &created.body["result"]["resource"];
    let id = original["metadata"]["id"].as_str().unwrap();
    let edited = patch(
        &engine,
        &project,
        id,
        original["version"].as_str().unwrap(),
        json!({"set":{"title":"Edited"}}),
    );
    let version = edited.body["result"]["resource"]["version"]
        .as_str()
        .unwrap();
    let history = engine.history(&project, Kind::Card, id, None, 50).unwrap();
    wire::validate("HistoryPage", &history).unwrap();
    let entry = history["items"][0]["id"].as_str().unwrap();
    assert_eq!(history["items"][0]["can_undo"], true);
    let undone = patch(
        &engine,
        &project,
        id,
        version,
        json!({"undo":{"history_entry_id":entry}}),
    );
    assert_eq!(undone.http_status, 200, "{undone:?}");
    assert_eq!(
        undone.body["result"]["resource"]["metadata"]["title"],
        "Original"
    );
    let current = undone.body["result"]["resource"]["version"]
        .as_str()
        .unwrap();
    let stale = patch(
        &engine,
        &project,
        id,
        current,
        json!({"undo":{"history_entry_id":entry}}),
    );
    assert_eq!(stale.http_status, 409);
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["title"],
        "Original"
    );
}

#[test]
fn card_acceptance_lifecycle_keeps_status_body_and_conflict_history() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let acceptance = json!([
        {"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","text":"CriterionOne","completed":false},
        {"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","text":"CriterionTwo","completed":true}
    ]);
    let body = "# Context\n\nKeep spacing and UTF-8: żółć.  \n";
    let created = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: None,
            payload: json!({
                "title": "Structured card",
                "body": body,
                "expected_result": "SearchableOutcome",
                "owner": "ResponsiblePerson",
                "acceptance": acceptance,
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(created.http_status, 200, "{created:?}");
    let original = &created.body["result"]["resource"];
    wire::validate("CardResource", original).unwrap();
    let id = original["metadata"]["id"].as_str().unwrap();
    let original_version = original["version"].as_str().unwrap();
    let mut completed = acceptance.clone();
    completed[0]["completed"] = json!(true);
    let edited = patch(
        &engine,
        &project,
        id,
        original_version,
        json!({"set":{"acceptance":completed}}),
    );
    assert_eq!(edited.http_status, 200, "{edited:?}");
    let current = &edited.body["result"]["resource"];
    assert_eq!(
        current["metadata"]["status"], "planned",
        "Checklist completion is not card acceptance"
    );
    assert_eq!(current["metadata"]["acceptance"], completed);
    assert_eq!(current["body"], body);

    let stale = patch(
        &engine,
        &project,
        id,
        original_version,
        json!({"set":{"acceptance":acceptance}}),
    );
    assert_eq!(stale.http_status, 412);
    let titled = patch(
        &engine,
        &project,
        id,
        current["version"].as_str().unwrap(),
        json!({"set":{"title":"Renamed card"}}),
    );
    assert_eq!(titled.http_status, 200);
    assert_eq!(
        titled.body["result"]["resource"]["metadata"]["acceptance"],
        completed
    );

    for term in [
        "SearchableOutcome",
        "ResponsiblePerson",
        "CriterionOne",
        "CriterionTwo",
    ] {
        let page = engine
            .list(
                Some("card"),
                &Query {
                    project: Some(project.clone()),
                    search: Some(term.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        wire::validate("SummaryPage", &page).unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 1, "{term}");
        assert_eq!(page["items"][0]["owner"], "ResponsiblePerson");
        assert_eq!(
            page["items"][0]["acceptance_progress"],
            json!({"total":2,"completed":2})
        );
        assert!(
            page["items"][0].get("acceptance").is_none(),
            "Lists must stay compact"
        );
    }

    let cleared = patch(
        &engine,
        &project,
        id,
        titled.body["result"]["version"].as_str().unwrap(),
        json!({"clear":["expected_result","owner","acceptance"]}),
    );
    assert_eq!(cleared.http_status, 200, "{cleared:?}");
    for field in ["expected_result", "owner", "acceptance"] {
        assert!(
            cleared.body["result"]["resource"]["metadata"]
                .get(field)
                .is_none()
        );
    }
    let history = engine.history(&project, Kind::Card, id, None, 50).unwrap();
    let restored = patch(
        &engine,
        &project,
        id,
        cleared.body["result"]["version"].as_str().unwrap(),
        json!({"undo":{"history_entry_id":history["items"][0]["id"]}}),
    );
    assert_eq!(restored.http_status, 200, "{restored:?}");
    assert_eq!(
        restored.body["result"]["resource"]["metadata"]["acceptance"],
        completed
    );
    assert_eq!(
        restored.body["result"]["resource"]["metadata"]["expected_result"],
        "SearchableOutcome"
    );
    assert_eq!(restored.body["result"]["resource"]["body"], body);

    let mut invalid_items = completed.clone();
    invalid_items[1]["id"] = invalid_items[0]["id"].clone();
    let invalid = patch(
        &engine,
        &project,
        id,
        restored.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"acceptance":invalid_items}}),
    );
    assert_eq!(invalid.http_status, 422);
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["acceptance"],
        completed
    );
}
