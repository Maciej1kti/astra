use super::*;

fn external_pins(env: &Environment, template: &Value, count: usize) {
    for _ in 0..count {
        let mut source = template.clone();
        source.as_object_mut().unwrap().remove("version");
        let id = Uuid::new_v4().to_string();
        source["metadata"]["id"] = json!(id);
        source["metadata"]["pinned"] = json!(true);
        fs::write(
            env.root.join(format!("project/.project/cards/{id}.json")),
            serde_json::to_vec(&source).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn focus_isolates_invalid_sources_retains_pins_and_recovers() {
    let env = Environment::new();
    let engine = env.engine();
    let good = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let bad = register(&engine, other.to_str().unwrap());
    let card = create(&engine, &good, "Healthy pin");
    let id = card.body["result"]["id"].as_str().unwrap();
    patch(
        &engine,
        &good,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    let broken = create(&engine, &bad, "Unrelated unpinned card");
    let path = other.join(format!(
        ".project/cards/{}.json",
        broken.body["result"]["id"].as_str().unwrap()
    ));
    let bytes = fs::read(&path).unwrap();
    fs::write(&path, b"{").unwrap();
    engine.refresh_project(&bad, None).unwrap();
    let read = engine
        .focus_resource()
        .expect("one invalid source must not block healthy pins");
    wire::validate("FocusResource", &read).unwrap();
    assert_eq!(read["items"][0]["card_id"], id);
    assert_eq!(read["cards"][0]["id"], id);
    assert_eq!(read["cards"][0]["title"], "Healthy pin");
    assert_eq!(read["cards"][0]["availability"], "ready");
    assert_eq!(
        read["cards"][0]["version"],
        engine.get(&good, Kind::Card, id).unwrap()["version"]
    );
    assert!(read["cards"][0].get("body").is_none());
    assert_eq!(read["complete"], false);
    assert!(!read["warnings"].as_array().unwrap().is_empty());
    fs::write(&path, bytes).unwrap();
    engine.refresh_project(&bad, None).unwrap();
    assert_eq!(engine.focus_resource().unwrap()["complete"], true);
    fs::rename(env.root.join("project"), env.root.join("moved")).unwrap();
    let _ = engine.refresh_project(&good, None);
    let read = engine.focus_resource().unwrap();
    wire::validate("FocusResource", &read).unwrap();
    assert_eq!(read["items"][0]["card_id"], id);
    assert_eq!(read["cards"][0]["availability"], "unavailable");
    assert_eq!(read["complete"], false);
}

#[test]
fn focus_summaries_remain_stale_until_source_reconciliation() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Retained pin");
    let id = card.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200);
    drop(engine);
    let engine = Engine::open_for_service(&env.root.join("state")).unwrap();
    let pending = engine.focus_resource().unwrap();
    wire::validate("FocusResource", &pending).unwrap();
    assert_eq!(pending["complete"], false);
    assert_eq!(pending["cards"][0]["availability"], "stale");
    assert_eq!(
        pending["cards"][0]["version"],
        pinned.body["result"]["version"]
    );
    engine.refresh_project(&project, None).unwrap();
    let ready = engine.focus_resource().unwrap();
    assert_eq!(ready["complete"], true);
    assert_eq!(ready["cards"][0]["availability"], "ready");
    assert_eq!(ready["cards"][0]["version"], pending["cards"][0]["version"]);
}

#[test]
fn cold_focus_preserves_unavailable_saved_pins_without_restoring_removed_membership() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Saved pin");
    let id = card.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200);
    let items = json!([{"project_id":project,"card_id":id}]);
    assert_eq!(
        engine
            .mutate_workspace(
                "focus",
                &json!({"items":items}),
                &Uuid::now_v7().to_string(),
                &engine.journal.epoch,
                Some(&engine.workspace().unwrap().version),
            )
            .unwrap()
            .http_status,
        200
    );
    drop(engine);
    fs::rename(env.root.join("project"), env.root.join("moved")).unwrap();
    fs::remove_file(env.root.join("state/index.sqlite")).unwrap();
    let engine = Engine::open_for_service(&env.root.join("state")).unwrap();
    for reconciled in [false, true] {
        if reconciled {
            assert!(engine.refresh_project(&project, None).is_err());
        }
        let read = engine.focus_resource().unwrap();
        wire::validate("FocusResource", &read).unwrap();
        assert_eq!(read["items"], items);
        assert_eq!(read["cards"], json!([]));
        assert_eq!(read["complete"], false);
    }
    fs::rename(env.root.join("moved"), env.root.join("project")).unwrap();
    engine.refresh_project(&project, None).unwrap();
    assert_eq!(engine.focus_resource().unwrap()["complete"], true);
    let unpinned = patch(
        &engine,
        &project,
        id,
        pinned.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":false}}),
    );
    assert_eq!(unpinned.http_status, 200);
    drop(engine);
    let engine = env.engine();
    assert_eq!(json!(engine.workspace().unwrap().value.focus), items);
    let read = engine.focus_resource().unwrap();
    assert_eq!(read["complete"], true);
    assert_eq!(read["items"], json!([]));
}

#[test]
fn undo_cannot_restore_a_pin_past_the_limit_and_succeeds_after_a_slot_is_freed() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Undo candidate");
    let id = card.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200);
    let unpinned = patch(
        &engine,
        &project,
        id,
        pinned.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":false}}),
    );
    assert_eq!(unpinned.http_status, 200);
    let version = unpinned.body["result"]["version"].as_str().unwrap();
    let history = engine.history(&project, Kind::Card, id, None, 50).unwrap();
    assert_eq!(history["items"][0]["can_undo"], true);
    let undo = json!({"undo":{"history_entry_id":history["items"][0]["id"]}});
    external_pins(&env, &card.body["result"]["resource"], 100);
    engine.refresh_project(&project, None).unwrap();
    let rejected = patch(&engine, &project, id, version, undo.clone());
    assert_eq!(rejected.body["error"]["code"], "FOCUS_LIMIT");
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["version"],
        version
    );
    let focus = engine.focus_resource().unwrap();
    let other = focus["items"][0]["card_id"].as_str().unwrap();
    let source = engine.get(&project, Kind::Card, other).unwrap();
    assert_eq!(
        patch(
            &engine,
            &project,
            other,
            source["version"].as_str().unwrap(),
            json!({"set":{"pinned":false}}),
        )
        .http_status,
        200
    );
    let restored = patch(&engine, &project, id, version, undo);
    assert_eq!(restored.http_status, 200, "{restored:?}");
    assert_eq!(
        restored.body["result"]["resource"]["metadata"]["pinned"],
        true
    );
    let focus = engine.focus_resource().unwrap();
    assert_eq!(focus["items"].as_array().unwrap().len(), 100);
    assert_eq!(focus["complete"], true);
}

#[test]
fn unresolved_pin_reserves_the_last_slot_across_projects_and_restart() {
    use project_application::{
        journal::{Command, Target},
        writer::{CommitPoint, Writer},
    };
    use project_store::StoreError;

    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let a = create(&engine, &project, "Interrupted pin");
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let second = register(&engine, other.to_str().unwrap());
    let b = create(&engine, &second, "Competing pin");
    external_pins(&env, &a.body["result"]["resource"], 99);
    engine.refresh_project(&project, None).unwrap();
    let command = Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: "PATCH".into(),
        target: Target {
            project_id: project.clone(),
            kind: Kind::Card,
            id: a.body["result"]["id"].as_str().unwrap().into(),
        },
        expected: Some(a.body["result"]["version"].as_str().unwrap().into()),
        payload: json!({"set":{"pinned":true}}),
    };
    {
        let handle = engine.store(&project).unwrap();
        let mut store = handle.lock().unwrap();
        let pending = Writer {
            journal: &engine.journal,
        }
        .execute_with(
            &mut store,
            &command,
            vec![],
            now_millis(),
            |old| {
                let mut next = old.unwrap().clone();
                next["metadata"]["pinned"] = json!(true);
                Ok(next)
            },
            |point| {
                if point == CommitPoint::Prepared {
                    Err(StoreError::Invalid("TEST_INTERRUPTION"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
        assert_eq!(pending.http_status, 202);
    }
    assert_eq!(
        engine.focus_resource().unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        99
    );
    let competing = |engine: &Engine| {
        patch(
            engine,
            &second,
            b.body["result"]["id"].as_str().unwrap(),
            b.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"pinned":true}}),
        )
    };
    assert_eq!(
        competing(&engine).body["error"]["code"],
        "WORKSPACE_RECOVERY_REQUIRED"
    );
    drop(engine);
    let engine = env.engine();
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert_eq!(
        engine
            .get(&project, Kind::Card, &command.target.id)
            .unwrap()["metadata"]["pinned"],
        true
    );
    assert_eq!(competing(&engine).body["error"]["code"], "FOCUS_LIMIT");
    let focus = engine.focus_resource().unwrap();
    assert_eq!(focus["items"].as_array().unwrap().len(), 100);
    assert_eq!(focus["complete"], true);
}

#[test]
fn concurrent_pins_admit_only_the_last_slot_and_overflow_reads_allow_recovery() {
    let env = Environment::new();
    let engine = Arc::new(env.engine());
    let project = register(&engine, &env.path());
    let a = create(&engine, &project, "Candidate A");
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let second = register(&engine, other.to_str().unwrap());
    let b = create(&engine, &second, "Candidate B");
    external_pins(&env, &a.body["result"]["resource"], 99);
    engine.refresh_project(&project, None).unwrap();
    let replies = std::thread::scope(|scope| {
        let handles = [(project.clone(), a.clone()), (second, b)]
            .into_iter()
            .map(|(project, card)| {
                let engine = engine.clone();
                scope.spawn(move || {
                    patch(
                        &engine,
                        &project,
                        card.body["result"]["id"].as_str().unwrap(),
                        card.body["result"]["version"].as_str().unwrap(),
                        json!({"set":{"pinned":true}}),
                    )
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(replies.iter().filter(|r| r.http_status == 200).count(), 1);
    assert_eq!(
        replies
            .iter()
            .filter(|r| r.body["error"]["code"] == "FOCUS_LIMIT")
            .count(),
        1
    );
    external_pins(&env, &a.body["result"]["resource"], 1);
    engine.refresh_project(&project, None).unwrap();
    let read = engine.focus_resource().unwrap();
    assert_eq!(read["items"].as_array().unwrap().len(), 100);
    assert_eq!(read["cards"].as_array().unwrap().len(), 100);
    for (reference, summary) in read["items"]
        .as_array()
        .unwrap()
        .iter()
        .zip(read["cards"].as_array().unwrap())
    {
        assert_eq!(reference["card_id"], summary["id"]);
        assert_eq!(reference["project_id"], summary["project_id"]);
    }
    assert_eq!(read["complete"], false);
    let pin = &read["items"][0];
    let project = pin["project_id"].as_str().unwrap();
    let id = pin["card_id"].as_str().unwrap();
    let source = engine.get(project, Kind::Card, id).unwrap();
    assert_eq!(
        patch(
            &engine,
            project,
            id,
            source["version"].as_str().unwrap(),
            json!({"set":{"pinned":false}})
        )
        .http_status,
        200
    );
    assert_eq!(engine.focus_resource().unwrap()["complete"], true);
}

#[test]
fn focus_and_attention_pages_survive_minutes_but_expire_on_actual_event_boundary() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-29T10:00:00+02:00")
        .unwrap()
        .timestamp_millis();
    for title in ["First", "Second", "Third"] {
        let card = create(&engine, &project, title);
        patch(
            &engine,
            &project,
            card.body["result"]["id"].as_str().unwrap(),
            card.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"schedule":{"start":"2026-09-29","end":"2026-09-29"}}}),
        );
    }
    for section in ["motion", "attention"] {
        let page = if section == "motion" {
            engine.focus_cards("motion", None, None, 1, now)
        } else {
            engine.attention(None, 1, now)
        }
        .unwrap();
        let cursor = page["page"]["next_cursor"].as_str().unwrap();
        let next = if section == "motion" {
            engine.focus_cards("motion", None, Some(cursor), 1, now + 60_000)
        } else {
            engine.attention(Some(cursor), 1, now + 60_000)
        };
        assert!(next.is_ok(), "unchanged minute: {next:?}");
        let tomorrow = if section == "motion" {
            engine.focus_cards("motion", None, Some(cursor), 1, now + 86_400_000)
        } else {
            engine.attention(Some(cursor), 1, now + 86_400_000)
        };
        assert!(
            matches!(tomorrow, Err(project_application::AppError::Rejected(reply)) if reply.body["error"]["code"] == "PAGE_STALE")
        );
    }
    for i in 0..3 {
        let card = create(&engine, &project, "Timed");
        patch(
            &engine,
            &project,
            card.body["result"]["id"].as_str().unwrap(),
            card.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"event":{"start":"2026-09-29T10:00","duration_minutes":i+2}}}),
        );
    }
    for section in ["events", "attention"] {
        let page = if section == "events" {
            engine.focus_cards("events", None, None, 1, now)
        } else {
            engine.attention(None, 1, now)
        }
        .unwrap();
        let cursor = page["page"]["next_cursor"].as_str().unwrap();
        for (elapsed, expires) in [(60_000, false), (120_000, true)] {
            let next = if section == "events" {
                engine.focus_cards("events", None, Some(cursor), 1, now + elapsed)
            } else {
                engine.attention(Some(cursor), 1, now + elapsed)
            };
            if expires {
                assert!(
                    matches!(next, Err(project_application::AppError::Rejected(reply)) if reply.body["error"]["code"] == "PAGE_STALE")
                );
            } else {
                assert!(next.is_ok(), "unchanged minute: {next:?}");
            }
        }
    }
}
