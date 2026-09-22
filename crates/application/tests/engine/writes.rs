use super::*;
use rusqlite::params;

#[test]
fn project_undo_rejects_historical_retired_metadata_without_resurrection() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let source_path = env.root.join("project/.project/project.md");
    let current = fs::read(&source_path).unwrap();
    let current_version = project_store::document::version(&current);
    let mut historical = String::from_utf8(current.clone()).unwrap();
    historical = historical.replacen(
        "\"state\": \"active\"\n",
        "\"state\": \"active\"\n\"phase\": \"Legacy\"\n\"review_on\": \"2026-09-16\"\n",
        1,
    );
    assert!(historical.contains("\"phase\": \"Legacy\""));
    let historical = historical.into_bytes();
    let historical_version = project_store::document::version(&historical);
    let history_id = Uuid::new_v4().to_string();
    let request_id = Uuid::now_v7().to_string();
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO history(
                id, project_id, target_kind, target_id, epoch, request_id,
                before_hash, after_hash, before_bytes, after_bytes, recorded_at
             ) VALUES (?1, ?2, 'project', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                history_id.clone(),
                project.clone(),
                engine.journal.epoch.clone(),
                request_id,
                historical_version,
                current_version.clone(),
                historical,
                current.clone(),
                "2026-09-22T00:00:00Z",
            ],
        )
        .unwrap();

    let reply = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Project,
            id: Some(project.clone()),
            payload: json!({"undo":{"history_entry_id":history_id}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(current_version),
        })
        .unwrap();
    assert_eq!(reply.http_status, 409, "{reply:?}");
    assert_eq!(reply.body["error"]["code"], "HISTORY_UNAVAILABLE");
    assert_eq!(fs::read(source_path).unwrap(), current);
}

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
fn removed_card_fields_are_rejected_on_create_patch_and_undo() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: None,
            payload: json!({
                "title": "Preserved",
                "body": "Keep this body",
                "schedule": {"start":"2026-09-08", "end":"2026-09-09"}
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(created.http_status, 200, "{created:?}");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let version = created.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let source_path = env.root.join(format!("project/.project/cards/{id}.md"));
    let original_bytes = fs::read(&source_path).unwrap();
    let fields = [
        ("due", json!({"date":"2026-09-10", "kind":"hard"})),
        ("review_on", json!("2026-09-10")),
        ("milestone_id", json!(Uuid::new_v4().to_string())),
        ("blocked", json!({"reason":"Waiting"})),
        ("depends_on", json!([Uuid::new_v4().to_string()])),
    ];
    for (field, value) in &fields {
        let mut create_payload = json!({
            "title": "Rejected",
            "body": "Rejected body",
            "schedule": {"start":"2026-09-08", "end":"2026-09-09"}
        });
        create_payload[field] = value.clone();
        let rejected = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Card,
                id: None,
                payload: create_payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: None,
            })
            .unwrap();
        assert_eq!(rejected.http_status, 422, "create field {field}");

        let mut patch_set = serde_json::Map::new();
        patch_set.insert(field.to_string(), value.clone());
        let rejected = patch(&engine, &project, &id, &version, json!({"set": patch_set}));
        assert_eq!(rejected.http_status, 422, "patch field {field}");
        let current = engine.get(&project, Kind::Card, &id).unwrap();
        assert_eq!(current["version"], version);
        assert_eq!(current["body"], "Keep this body");
        assert_eq!(
            current["metadata"]["schedule"],
            json!({"start":"2026-09-08", "end":"2026-09-09"})
        );

        let current_bytes = fs::read(&source_path).unwrap();
        assert_eq!(current_bytes, original_bytes);
        let current_text = String::from_utf8(current_bytes.clone()).unwrap();
        let needle = "\"title\": \"Preserved\"\n";
        let historical_text = current_text.replacen(
            needle,
            &format!(
                "{needle}\"{field}\": {}\n",
                serde_json::to_string(value).unwrap()
            ),
            1,
        );
        let historical = historical_text.into_bytes();
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
                    id,
                    engine.journal.epoch.clone(),
                    Uuid::now_v7().to_string(),
                    project_store::document::version(&historical),
                    version,
                    historical,
                    current_bytes,
                    "2026-09-22T00:00:00Z",
                ],
            )
            .unwrap();
        let rejected = patch(
            &engine,
            &project,
            &id,
            &version,
            json!({"undo": {"history_entry_id": history_id}}),
        );
        assert_eq!(rejected.http_status, 409, "undo field {field}");
        assert_eq!(rejected.body["error"]["code"], "HISTORY_UNAVAILABLE");
        assert_eq!(fs::read(&source_path).unwrap(), original_bytes);
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
fn card_delete_removes_source_replays_and_keeps_non_undoable_history() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Delete me");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let version = created.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let request = Uuid::now_v7().to_string();
    let first = engine
        .delete_card(
            &project,
            &id,
            json!({}),
            &request,
            &engine.journal.epoch,
            Some(version.clone()),
        )
        .unwrap();
    assert_eq!(first.http_status, 200, "{first:?}");
    wire::validate("CommandResponse", &first.body).unwrap();
    assert_eq!(first.body["result"]["deleted"], true);
    assert!(
        !env.root
            .join(format!("project/.project/cards/{id}.md"))
            .exists()
    );
    let replay = engine
        .delete_card(
            &project,
            &id,
            json!({}),
            &request,
            &engine.journal.epoch,
            Some(version),
        )
        .unwrap();
    assert_eq!(replay.body["result"], first.body["result"]);
    assert_eq!(replay.body["status"], first.body["status"]);
    assert_eq!(replay.body["replayed"], true);
    let history = engine.history(&project, Kind::Card, &id, None, 50).unwrap();
    assert_eq!(history["items"][0]["after_version"], Value::Null);
    assert_eq!(history["items"][0]["can_undo"], false);
}

#[test]
fn card_delete_ignores_unrelated_archived_cards() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let target = create(&engine, &project, "Dependency target");
    let incoming = create(&engine, &project, "Archived incoming");
    let target_id = target.body["result"]["id"].as_str().unwrap();
    let incoming_id = incoming.body["result"]["id"].as_str().unwrap();
    let version = incoming.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let reply = patch(
        &engine,
        &project,
        incoming_id,
        &version,
        json!({"set":{"archived":true}}),
    );
    assert_eq!(reply.http_status, 200, "{reply:?}");
    let deleted = engine
        .delete_card(
            &project,
            target_id,
            json!({}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(
                target.body["result"]["version"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
            ),
        )
        .unwrap();
    assert_eq!(deleted.http_status, 200, "{deleted:?}");
    assert!(
        !env.root
            .join(format!("project/.project/cards/{target_id}.md"))
            .exists()
    );
}

#[test]
fn card_delete_requires_explicit_focus_removal() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Focused card");
    let id = created.body["result"]["id"].as_str().unwrap();
    let workspace = engine.workspace().unwrap();
    engine
        .mutate_workspace(
            "focus",
            &json!({"items":[{"project_id":project,"card_id":id}]}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(&workspace.version),
        )
        .unwrap();
    let blocked = engine
        .delete_card(
            &project,
            id,
            json!({}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(
                created.body["result"]["version"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
            ),
        )
        .unwrap();
    assert_eq!(blocked.http_status, 409);
    assert_eq!(blocked.body["error"]["code"], "CARD_IN_FOCUS");
}

#[test]
fn stale_card_delete_precedes_bounded_dependency_scan_and_replays() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Stale delete");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let observed = created.body["result"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let _current = patch(
        &engine,
        &project,
        &id,
        &observed,
        json!({"set":{"title":"Changed"}}),
    );
    fs::write(
        env.root
            .join(format!("project/.project/cards/{}.md", Uuid::new_v4())),
        b"invalid source",
    )
    .unwrap();
    let request = Uuid::now_v7().to_string();
    let first = engine
        .delete_card(
            &project,
            &id,
            json!({}),
            &request,
            &engine.journal.epoch,
            Some(observed.clone()),
        )
        .unwrap();
    assert_eq!(first.body["error"]["code"], "VERSION_CONFLICT");
    let replay = engine
        .delete_card(
            &project,
            &id,
            json!({}),
            &request,
            &engine.journal.epoch,
            Some(observed),
        )
        .unwrap();
    assert_eq!(replay.body, first.body);
}

#[test]
fn card_delete_recovery_does_not_scan_incoming_cards() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let target = create(&engine, &project, "Recovery target");
    let incoming = create(&engine, &project, "Recovery incoming");
    let target_id = target.body["result"]["id"].as_str().unwrap().to_owned();
    let incoming_id = incoming.body["result"]["id"].as_str().unwrap().to_owned();
    let command = crate::journal::Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: "DELETE".into(),
        target: crate::journal::Target {
            project_id: project.clone(),
            kind: Kind::Card,
            id: target_id.clone(),
        },
        expected: Some(target.body["result"]["version"].as_str().unwrap().into()),
        payload: json!({}),
    };
    let handle = engine.store(&project).unwrap();
    {
        let mut store = handle.lock().unwrap();
        let reply = crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute_delete(
            &mut store,
            &command,
            vec![],
            now_millis(),
            |_| Ok(()),
            |point| {
                if point == crate::writer::CommitPoint::Prepared {
                    Err(project_store::StoreError::Invalid("INJECTED_FAILURE"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
        assert_eq!(reply.http_status, 202);
    }

    fs::write(
        env.root
            .join(format!("project/.project/cards/{incoming_id}.md")),
        b"invalid unrelated source",
    )
    .unwrap();

    let mut store = handle.lock().unwrap();
    let recovered = crate::writer::Writer {
        journal: &engine.journal,
    }
    .recover_with_guard(&mut store, &project, now_millis(), |store, intent| {
        crate::card_deletion::recovery_guard(&engine, store, intent)
    })
    .unwrap();
    assert_eq!(recovered, 1);
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::Committed
    );
    let (directory, name) = store.location(Kind::Card, &target_id, false).unwrap();
    assert!(directory.read(&name).unwrap().is_none());
}

#[test]
fn card_delete_projection_failure_is_repaired_after_retry() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Projection delete");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let version = card.body["result"]["version"].as_str().unwrap().to_owned();
    let source = env.root.join(format!("project/.project/cards/{id}.md"));
    let fault = super::maintenance::projection_failure(&env);
    let request = Uuid::now_v7().to_string();
    let reply = engine
        .delete_card(
            &project,
            &id,
            json!({}),
            &request,
            &engine.journal.epoch,
            Some(version),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    assert_eq!(reply.body["status"], "committed");
    assert_eq!(reply.body["result"]["deleted"], true);
    assert!(!source.exists(), "source deletion must remain committed");
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1,
        "the injected projection failure leaves stale index data before repair"
    );

    fault
        .execute_batch("DROP TRIGGER fail_projection_update; DROP TRIGGER fail_projection_delete;")
        .unwrap();
    engine
        .retry_projection_repairs_at(std::time::Instant::now() + std::time::Duration::from_secs(31))
        .unwrap();
    assert!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty(),
        "deferred projection repair must remove the deleted card"
    );
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
    let body = "# Context\n\nSearchableBody keeps spacing and UTF-8: żółć.  \n";
    let created = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: None,
            payload: json!({
                "title": "Structured card",
                "body": body,
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

    for term in ["SearchableBody", "CriterionOne", "CriterionTwo"] {
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
        json!({"clear":["acceptance"]}),
    );
    assert_eq!(cleared.http_status, 200, "{cleared:?}");
    assert!(
        cleared.body["result"]["resource"]["metadata"]
            .get("acceptance")
            .is_none()
    );
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
