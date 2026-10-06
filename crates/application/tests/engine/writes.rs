use super::*;
use rusqlite::params;

#[test]
fn project_undo_rejects_historical_retired_metadata_without_resurrection() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let source_path = env.root.join("project/.project/project.json");
    let current = fs::read(&source_path).unwrap();
    let current_version = project_store::document::version(&current);
    let mut historical: Value = serde_json::from_slice(&current).unwrap();
    historical["metadata"]["phase"] = json!("Legacy");
    historical["metadata"]["review_on"] = json!("2026-09-16");
    let historical = serde_json::to_vec_pretty(&historical).unwrap();
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
            .join(format!("project/.project/cards/{}.json", Uuid::new_v4())),
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
    let source_path = env.root.join(format!("project/.project/cards/{id}.json"));
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
        let mut historical: Value = serde_json::from_slice(&current_bytes).unwrap();
        historical["metadata"][field] = value.clone();
        let historical = serde_json::to_vec_pretty(&historical).unwrap();
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
            .join(format!("project/.project/cards/{id}.json"))
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
            .join(format!("project/.project/cards/{target_id}.json"))
            .exists()
    );
}

#[test]
fn pinned_card_delete_removes_it_from_focus_in_one_command() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let kept = create(&engine, &project, "Kept in focus");
    let kept_id = kept.body["result"]["id"].as_str().unwrap();
    let kept = patch(
        &engine,
        &project,
        kept_id,
        kept.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(kept.http_status, 200, "{kept:?}");
    let created = create(&engine, &project, "Focused card");
    let id = created.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        created.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200, "{pinned:?}");
    // The local order ranks the card that is about to disappear first.
    let workspace = engine.workspace().unwrap();
    let ordered = engine
        .mutate_workspace(
            "focus",
            &json!({"items":[
                {"project_id": project, "card_id": id},
                {"project_id": project, "card_id": kept_id}
            ]}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(&workspace.version),
        )
        .unwrap();
    assert_eq!(ordered.http_status, 200, "{ordered:?}");
    let deleted = engine
        .delete_card(
            &project,
            id,
            json!({}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(
                pinned.body["result"]["version"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
            ),
        )
        .unwrap();
    assert_eq!(deleted.http_status, 200, "{deleted:?}");
    assert_eq!(deleted.body["result"]["deleted"], true);
    assert!(
        !env.root
            .join(format!("project/.project/cards/{id}.json"))
            .exists()
    );
    // Membership follows the source; the stale local rank names no card.
    let focus = engine.focus_resource().unwrap();
    assert_eq!(focus["complete"], true, "{focus}");
    assert_eq!(
        focus["items"],
        json!([{"project_id": project, "card_id": kept_id}])
    );
    assert_eq!(focus["cards"].as_array().unwrap().len(), 1);
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
            .join(format!("project/.project/cards/{}.json", Uuid::new_v4())),
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
            .join(format!("project/.project/cards/{incoming_id}.json")),
        b"invalid unrelated source",
    )
    .unwrap();

    let mut store = handle.lock().unwrap();
    let recovered = crate::writer::Writer {
        journal: &engine.journal,
    }
    .recover_with_guard(&mut store, &project, now_millis(), |store, intent| {
        crate::source_deletion::recovery_guard(&engine, store, intent)
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
    let source = env.root.join(format!("project/.project/cards/{id}.json"));
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

#[test]
fn json_source_noop_keeps_external_whitespace_and_observed_version() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "JSON no-op");
    let resource = &created.body["result"]["resource"];
    let id = resource["metadata"]["id"].as_str().unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.json"));
    let document: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(document["type"], "card");
    let external = format!("  {}  \n", serde_json::to_string(&document).unwrap());
    fs::write(&path, &external).unwrap();
    let current = engine.get(&project, Kind::Card, id).unwrap();
    let reply = patch(
        &engine,
        &project,
        id,
        current["version"].as_str().unwrap(),
        json!({"set":{"title":"JSON no-op"}}),
    );
    assert_eq!(reply.http_status, 200);
    assert_eq!(
        reply.body["result"]["resource"]["version"],
        current["version"]
    );
    assert_eq!(fs::read(&path).unwrap(), external.as_bytes());
    assert!(!path.with_extension("md").exists());
}

/// Rewrites a card source the way an external editor or checkout would,
/// returning its new bytes.
fn external_card_edit(env: &Environment, id: &str, title: &str) -> Vec<u8> {
    let path = env.root.join(format!("project/.project/cards/{id}.json"));
    let mut source: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    source["metadata"]["title"] = json!(title);
    let bytes = serde_json::to_vec_pretty(&source).unwrap();
    fs::write(&path, &bytes).unwrap();
    bytes
}

fn card_command(
    engine: &Engine,
    project: &str,
    card: &Reply,
    method: &str,
) -> crate::journal::Command {
    crate::journal::Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: method.into(),
        target: crate::journal::Target {
            project_id: project.into(),
            kind: Kind::Card,
            id: card.body["result"]["id"].as_str().unwrap().into(),
        },
        expected: Some(card.body["result"]["version"].as_str().unwrap().into()),
        payload: json!({}),
    }
}

fn retitle(old: Option<&Value>) -> Result<Value, Reply> {
    let mut next = old.unwrap().clone();
    next["metadata"]["title"] = json!("Retitled by Astra");
    Ok(next)
}

#[test]
fn external_edit_after_prepare_rejects_the_write_and_keeps_the_project_writable() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Edited elsewhere");
    let other = create(&engine, &project, "Unrelated");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let command = card_command(&engine, &project, &card, "PATCH");
    let handle = engine.store(&project).unwrap();
    let mut external = Vec::new();
    let reply = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute_with(
            &mut store,
            &command,
            vec![],
            now_millis(),
            retitle,
            |point| {
                if point == crate::writer::CommitPoint::Prepared {
                    external = external_card_edit(&env, &id, "Edited by another tool");
                }
                Ok(())
            },
        )
        .unwrap()
    };

    // Nothing was renamed, so the outcome is definite rather than pending.
    assert_eq!(reply.http_status, 412, "{reply:?}");
    assert_eq!(reply.body["error"]["code"], "VERSION_CONFLICT");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::Rejected
    );
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert_eq!(
        fs::read(env.root.join(format!("project/.project/cards/{id}.json"))).unwrap(),
        external
    );
    // The original request keeps its definite answer, and other writes proceed.
    let replay = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute(&mut store, &command, vec![], now_millis(), retitle)
        .unwrap()
    };
    assert_eq!(replay.http_status, 412);
    assert_eq!(replay.body["error"]["code"], "VERSION_CONFLICT");
    let unrelated = patch(
        &engine,
        &project,
        other.body["result"]["id"].as_str().unwrap(),
        other.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"title":"Still writable"}}),
    );
    assert_eq!(unrelated.http_status, 200, "{unrelated:?}");
}

#[cfg(unix)]
#[test]
fn storage_failure_before_rename_is_forgotten_and_the_same_request_can_retry() {
    use std::os::unix::fs::PermissionsExt;

    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Temporary storage failure");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let cards = env.root.join("project/.project/cards");
    let source = cards.join(format!("{id}.json"));
    let before = fs::read(&source).unwrap();
    let command = card_command(&engine, &project, &card, "PATCH");
    let handle = engine.store(&project).unwrap();
    let failed = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute_with(
            &mut store,
            &command,
            vec![],
            now_millis(),
            retitle,
            |point| {
                if point == crate::writer::CommitPoint::Prepared {
                    // The temporary file can no longer be created beside the target.
                    fs::set_permissions(&cards, fs::Permissions::from_mode(0o500)).unwrap();
                }
                Ok(())
            },
        )
    };
    fs::set_permissions(&cards, fs::Permissions::from_mode(0o700)).unwrap();

    assert!(
        matches!(failed, Err(crate::AppError::Store(_))),
        "{failed:?}"
    );
    assert_eq!(fs::read(&source).unwrap(), before);
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert!(
        engine
            .journal
            .command_status(&command.epoch, &command.request_id)
            .unwrap()
            .is_none()
    );
    // A transient failure must not turn into a replayed rejection.
    let retried = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute(&mut store, &command, vec![], now_millis(), retitle)
        .unwrap()
    };
    assert_eq!(retried.http_status, 200, "{retried:?}");
    assert_eq!(retried.body["status"], "committed");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::Committed
    );
}

#[test]
fn external_edit_after_prepare_rejects_a_delete_and_keeps_the_source() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Delete target");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let command = card_command(&engine, &project, &card, "DELETE");
    let handle = engine.store(&project).unwrap();
    let mut external = Vec::new();
    let reply = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
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
                    external = external_card_edit(&env, &id, "Edited before unlink");
                }
                Ok(())
            },
        )
        .unwrap()
    };

    assert_eq!(reply.http_status, 412, "{reply:?}");
    assert_eq!(reply.body["error"]["code"], "VERSION_CONFLICT");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::Rejected
    );
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert_eq!(
        fs::read(env.root.join(format!("project/.project/cards/{id}.json"))).unwrap(),
        external
    );
}

#[test]
fn delete_guard_rejection_after_prepare_is_recorded_as_definite() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Guarded delete");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let command = card_command(&engine, &project, &card, "DELETE");
    let handle = engine.store(&project).unwrap();
    let calls = std::cell::Cell::new(0);
    let reply = {
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute_delete(
            &mut store,
            &command,
            vec![],
            now_millis(),
            |_| {
                calls.set(calls.get() + 1);
                // The dependency appears between admission and the unlink.
                if calls.get() > 1 {
                    Err(crate::AppError::reject(409, "RESOURCE_IN_USE"))
                } else {
                    Ok(())
                }
            },
            |_| Ok(()),
        )
        .unwrap()
    };

    assert_eq!(reply.http_status, 409, "{reply:?}");
    assert_eq!(reply.body["error"]["code"], "RESOURCE_IN_USE");
    assert_eq!(reply.body["error"]["request_id"], command.request_id);
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::Rejected
    );
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert!(
        env.root
            .join(format!("project/.project/cards/{id}.json"))
            .exists()
    );
}

#[test]
fn delete_refused_during_recovery_is_not_recorded_as_a_terminal_rejection() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let interrupted = create(&engine, &project, "Interrupted");
    let target = create(&engine, &project, "Delete after recovery");
    let pending = card_command(&engine, &project, &interrupted, "PATCH");
    let delete = card_command(&engine, &project, &target, "DELETE");
    let handle = engine.store(&project).unwrap();
    let mut store = handle.lock().unwrap();
    let writer = crate::writer::Writer {
        journal: &engine.journal,
    };
    let prepared = writer
        .execute_with(
            &mut store,
            &pending,
            vec![],
            now_millis(),
            retitle,
            |point| {
                if point == crate::writer::CommitPoint::Prepared {
                    Err(project_store::StoreError::Invalid("TEST_INTERRUPTION"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(prepared.http_status, 202);
    // A conflict under review cannot be completed by the next write.
    engine
        .journal
        .mark(&pending, crate::command_state::CommandState::NeedsReview)
        .unwrap();

    let refused = writer
        .execute_delete(
            &mut store,
            &delete,
            vec![],
            now_millis(),
            |_| Ok(()),
            |_| Ok(()),
        )
        .unwrap();
    assert_eq!(refused.body["error"]["code"], "PROJECT_RECOVERY_REQUIRED");
    assert!(
        engine
            .journal
            .command_status(&delete.epoch, &delete.request_id)
            .unwrap()
            .is_none()
    );

    // Once recovery finishes, the unchanged request runs instead of replaying 409.
    engine
        .journal
        .mark(&pending, crate::command_state::CommandState::Prepared)
        .unwrap();
    assert_eq!(
        writer.recover(&mut store, &project, now_millis()).unwrap(),
        1
    );
    let retried = writer
        .execute_delete(
            &mut store,
            &delete,
            vec![],
            now_millis(),
            |_| Ok(()),
            |_| Ok(()),
        )
        .unwrap();
    assert_eq!(retried.http_status, 200, "{retried:?}");
}

#[cfg(unix)]
#[test]
fn unreadable_source_is_retryable_rather_than_a_recorded_invalid_document() {
    use std::os::unix::fs::PermissionsExt;

    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Briefly unreadable");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let source = env.root.join(format!("project/.project/cards/{id}.json"));
    let command = card_command(&engine, &project, &card, "PATCH");
    let handle = engine.store(&project).unwrap();
    let mut store = handle.lock().unwrap();
    let writer = crate::writer::Writer {
        journal: &engine.journal,
    };
    fs::set_permissions(&source, fs::Permissions::from_mode(0o000)).unwrap();
    let failed = writer.execute(&mut store, &command, vec![], now_millis(), retitle);
    fs::set_permissions(&source, fs::Permissions::from_mode(0o600)).unwrap();

    assert!(
        matches!(failed, Err(crate::AppError::Store(_))),
        "{failed:?}"
    );
    let retried = writer
        .execute(&mut store, &command, vec![], now_millis(), retitle)
        .unwrap();
    assert_eq!(retried.http_status, 200, "{retried:?}");
}

#[test]
fn interrupted_write_is_completed_by_the_next_write_without_a_restart() {
    for interruption in [
        crate::writer::CommitPoint::Prepared,
        crate::writer::CommitPoint::Renamed,
        crate::writer::CommitPoint::DirectorySynced,
    ] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.path());
        let card = create(&engine, &project, "Interrupted");
        let other = create(&engine, &project, "Next write");
        let id = card.body["result"]["id"].as_str().unwrap().to_owned();
        let command = card_command(&engine, &project, &card, "PATCH");
        {
            let handle = engine.store(&project).unwrap();
            let mut store = handle.lock().unwrap();
            let pending = crate::writer::Writer {
                journal: &engine.journal,
            }
            .execute_with(
                &mut store,
                &command,
                vec![],
                now_millis(),
                retitle,
                |point| {
                    if point == interruption {
                        Err(project_store::StoreError::Invalid("TEST_INTERRUPTION"))
                    } else {
                        Ok(())
                    }
                },
            )
            .unwrap();
            assert_eq!(pending.http_status, 202, "{interruption:?}");
        }

        let next = patch(
            &engine,
            &project,
            other.body["result"]["id"].as_str().unwrap(),
            other.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"title":"Written after recovery"}}),
        );
        assert_eq!(next.http_status, 200, "{interruption:?} {next:?}");
        assert_eq!(
            engine.journal.state(&command).unwrap(),
            crate::command_state::CommandState::Committed,
            "{interruption:?}"
        );
        assert_eq!(
            engine.get(&project, Kind::Card, &id).unwrap()["metadata"]["title"],
            "Retitled by Astra",
            "{interruption:?}"
        );
    }
}

#[test]
fn write_time_recovery_never_overwrites_a_conflicting_external_edit() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Interrupted");
    let other = create(&engine, &project, "Next write");
    let id = card.body["result"]["id"].as_str().unwrap().to_owned();
    let command = card_command(&engine, &project, &card, "PATCH");
    {
        let handle = engine.store(&project).unwrap();
        let mut store = handle.lock().unwrap();
        crate::writer::Writer {
            journal: &engine.journal,
        }
        .execute_with(
            &mut store,
            &command,
            vec![],
            now_millis(),
            retitle,
            |point| {
                if point == crate::writer::CommitPoint::Prepared {
                    Err(project_store::StoreError::Invalid("TEST_INTERRUPTION"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    }
    let external = external_card_edit(&env, &id, "Edited while pending");

    let next = patch(
        &engine,
        &project,
        other.body["result"]["id"].as_str().unwrap(),
        other.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"title":"Must wait for review"}}),
    );
    assert_eq!(next.body["error"]["code"], "PROJECT_RECOVERY_REQUIRED");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        crate::command_state::CommandState::NeedsReview
    );
    assert_eq!(
        fs::read(env.root.join(format!("project/.project/cards/{id}.json"))).unwrap(),
        external
    );
}
