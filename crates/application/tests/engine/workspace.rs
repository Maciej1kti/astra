use super::*;

#[test]
fn projects_default_view_is_conditional_replayable_and_durable() {
    let env = Environment::new();
    let engine = env.engine();
    let original = engine.workspace().unwrap();
    let request = Uuid::now_v7().to_string();
    let epoch = engine.journal.epoch.clone();
    let payload: Value = serde_json::from_str(include_str!(
        "../../../../examples/requests/projects-view-default.json"
    ))
    .unwrap();
    wire::validate("PreferencesPatch", &payload).unwrap();

    let missing_version = engine
        .mutate_workspace(
            "preferences",
            &payload,
            &Uuid::now_v7().to_string(),
            &epoch,
            None,
        )
        .unwrap();
    assert_eq!(missing_version.http_status, 428);
    let reply = engine
        .mutate_workspace(
            "preferences",
            &payload,
            &request,
            &epoch,
            Some(&original.version),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200);
    wire::validate("CommandResponse", &reply.body).unwrap();
    let current = engine.workspace().unwrap();
    let mut expected = json!(original.value);
    expected["preferences"]["default_view"] = json!("projects");
    assert_eq!(json!(current.value), expected);
    assert_ne!(current.version, original.version);

    let conflict = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"focus"}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&original.version),
        )
        .unwrap();
    assert_eq!(conflict.http_status, 412);
    let invalid = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"Main"}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&current.version),
        )
        .unwrap();
    assert_eq!(invalid.http_status, 422);
    assert_eq!(engine.workspace().unwrap().version, current.version);
    drop(engine);

    let engine = env.engine();
    assert_eq!(json!(engine.workspace().unwrap().value), expected);
    let replay = engine
        .mutate_workspace(
            "preferences",
            &payload,
            &request,
            &epoch,
            Some(&original.version),
        )
        .unwrap();
    assert_eq!(replay.http_status, 200);
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(engine.workspace().unwrap().version, current.version);
}

#[test]
fn agent_provider_preference_is_committed_kept_by_later_patches_and_validated() {
    let env = Environment::new();
    let engine = env.engine();
    let original = engine.workspace().unwrap();
    assert!(json!(original.value)["preferences"]["agent_provider"].is_null());
    let epoch = engine.journal.epoch.clone();
    let payload: Value = serde_json::from_str(include_str!(
        "../../../../examples/requests/agent-provider-preference.json"
    ))
    .unwrap();
    assert_eq!(payload, json!({"preferences":{"agent_provider":"codex"}}));
    wire::validate("PreferencesPatch", &payload).unwrap();

    let reply = engine
        .mutate_workspace(
            "preferences",
            &payload,
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&original.version),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200);
    wire::validate("CommandResponse", &reply.body).unwrap();
    let saved = engine.workspace().unwrap();
    let mut expected = json!(original.value);
    expected["preferences"]["agent_provider"] = json!("codex");
    assert_eq!(json!(saved.value), expected);
    assert_ne!(saved.version, original.version);

    let week = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"week_start":"sunday"}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&saved.version),
        )
        .unwrap();
    assert_eq!(week.http_status, 200);
    let after_week = engine.workspace().unwrap();
    expected["preferences"]["week_start"] = json!("sunday");
    assert_eq!(json!(after_week.value), expected);
    assert_eq!(
        json!(after_week.value)["preferences"]["agent_provider"],
        "codex"
    );

    for invalid in [json!("gemini"), json!("Codex"), json!(null)] {
        let rejected = engine
            .mutate_workspace(
                "preferences",
                &json!({"preferences":{"agent_provider":invalid}}),
                &Uuid::now_v7().to_string(),
                &epoch,
                Some(&after_week.version),
            )
            .unwrap();
        assert_eq!(rejected.http_status, 422);
        assert_eq!(rejected.body["error"]["code"], "VALIDATION_FAILED");
        assert_eq!(engine.workspace().unwrap().version, after_week.version);
    }
    drop(engine);

    let engine = env.engine();
    assert_eq!(json!(engine.workspace().unwrap().value), expected);
}

#[test]
fn workspace_day_is_the_civil_date_in_the_workspace_timezone() {
    let env = Environment::new();
    let engine = env.engine();
    let workspace = engine.workspace().unwrap().value;
    assert_eq!(workspace.timezone, "Europe/Warsaw");
    // 22:30 UTC on Monday is already Tuesday 00:30 in Warsaw (UTC+2 until 25 October).
    let now = 1_791_239_400_000;
    let day = engine.workspace_day(now).unwrap();
    assert_eq!(day.date, "2026-10-06");
    assert_eq!(day.weekday, "Tuesday");
    assert_eq!(day.timezone, "Europe/Warsaw");
    // The same instant a few hours earlier is still Monday there.
    let earlier = engine.workspace_day(now - 3 * 3_600_000).unwrap();
    assert_eq!(earlier.date, "2026-10-05");
    assert_eq!(earlier.weekday, "Monday");
}

#[test]
fn legacy_main_preferences_preserve_source_version_and_command_recovery() {
    use project_application::{AppError, writer::CommitPoint};
    use project_store::document::version;

    let env = Environment::new();
    let engine = env.engine();
    let mut legacy = json!(engine.workspace().unwrap().value);
    legacy["preferences"]["default_view"] = json!("main");
    legacy["preferences"]["week_start"] = json!("monday");
    drop(engine);
    let path = env.root.join("state/workspace.json");
    let mut original_bytes = serde_json::to_vec_pretty(&legacy).unwrap();
    original_bytes.push(b'\n');
    fs::write(&path, &original_bytes).unwrap();
    let original_version = version(&original_bytes);

    let engine = env.engine();
    let observed = engine.workspace().unwrap();
    assert_eq!(observed.version, original_version);
    legacy["preferences"]["default_view"] = json!("projects");
    assert_eq!(json!(observed.value), legacy);
    assert_eq!(fs::read(&path).unwrap(), original_bytes);
    let epoch = engine.journal.epoch.clone();

    for view in ["main", "projects"] {
        let noop = engine
            .mutate_workspace(
                "preferences",
                &json!({"preferences":{"default_view":view}}),
                &Uuid::now_v7().to_string(),
                &epoch,
                Some(&original_version),
            )
            .unwrap();
        assert_eq!(noop.http_status, 200);
        assert_eq!(noop.body["status"], "noop");
        assert_eq!(noop.body["result"]["version"], original_version);
        assert_eq!(fs::read(&path).unwrap(), original_bytes);
    }
    let invalid = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"main","unexpected":true}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&original_version),
        )
        .unwrap();
    assert_eq!(invalid.http_status, 422);
    assert_eq!(fs::read(&path).unwrap(), original_bytes);

    let payload = json!({"preferences":{"default_view":"main","week_start":"sunday"}});
    let request = Uuid::now_v7().to_string();
    let pending = engine
        .mutate_workspace_with(
            "preferences",
            &payload,
            &request,
            &epoch,
            Some(&original_version),
            |point| {
                if point == CommitPoint::Prepared {
                    Err(AppError::invariant("injected test failure"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(pending.http_status, 202);
    assert_eq!(fs::read(&path).unwrap(), original_bytes);
    drop(engine);

    let engine = env.engine();
    let current = engine.workspace().unwrap();
    legacy["preferences"]["week_start"] = json!("sunday");
    assert_eq!(json!(current.value), legacy);
    assert_ne!(current.version, original_version);
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),
        legacy
    );
    let replay = engine
        .mutate_workspace(
            "preferences",
            &payload,
            &request,
            &epoch,
            Some(&original_version),
        )
        .unwrap();
    assert_eq!(replay.http_status, 200);
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(replay.body["result"]["version"], current.version);
    let changed_retry = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"projects","week_start":"sunday"}}),
            &request,
            &epoch,
            Some(&original_version),
        )
        .unwrap();
    assert_eq!(changed_retry.http_status, 409);
    assert_eq!(
        changed_retry.body["error"]["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    assert_eq!(engine.workspace().unwrap().version, current.version);
    let conflict = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"main"}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&original_version),
        )
        .unwrap();
    assert_eq!(conflict.http_status, 412);
    assert_eq!(engine.workspace().unwrap().version, current.version);
}

#[test]
fn legacy_main_prepared_intent_recovers_exact_saved_bytes_and_version() {
    use project_application::{
        command_state::CommandState,
        journal::{Command, CommandRecord, Journal, Target},
    };
    use project_store::document::version;
    use rusqlite::params;

    let env = Environment::new();
    let engine = env.engine();
    let original = engine.workspace().unwrap();
    let path = env.root.join("state/workspace.json");
    let before = fs::read(&path).unwrap();
    let mut legacy = json!(original.value);
    legacy["preferences"]["default_view"] = json!("main");
    let after = project_application::source::pretty(&legacy);
    let command = Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: "WORKSPACE:preferences".into(),
        target: Target {
            project_id: "workspace".into(),
            kind: Kind::Project,
            id: "preferences".into(),
        },
        expected: Some(original.version),
        payload: json!({"preferences":{"default_view":"main"}}),
    };
    let reply = Reply {
        http_status: 200,
        body: json!({"api_version":"1","request_id":command.request_id,
            "status":"committed","result":{"type":"preferences","version":version(&after)},
            "warnings":[],"replayed":false}),
    };
    // Model a durable PREPARED record created by the former Main-capable host.
    let mut db = engine.journal.db().unwrap();
    let tx = db.transaction().unwrap();
    Journal::insert_command(
        &tx,
        CommandRecord {
            command: &command,
            state: CommandState::Prepared,
            target_kind: "preferences",
            reply: &reply,
            received_at: now_millis(),
        },
    )
    .unwrap();
    tx.execute(
        "INSERT INTO workspace_intents(epoch,request_id,before_bytes,after_bytes,references_json,result_json) VALUES (?1,?2,?3,?4,'[]',?5)",
        params![command.epoch, command.request_id, before, after, serde_json::to_string(&reply).unwrap()],
    )
    .unwrap();
    tx.commit().unwrap();
    drop(db);
    drop(engine);

    let engine = env.engine();
    let current = engine.workspace().unwrap();
    legacy["preferences"]["default_view"] = json!("projects");
    assert_eq!(json!(current.value), legacy);
    assert_eq!(current.version, version(&after));
    assert_eq!(fs::read(&path).unwrap(), after);
    let replay = engine
        .mutate_workspace(
            "preferences",
            &command.payload,
            &command.request_id,
            &command.epoch,
            command.expected.as_deref(),
        )
        .unwrap();
    assert_eq!(replay.http_status, 200);
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(replay.body["result"]["version"], current.version);
    assert_eq!(fs::read(&path).unwrap(), after);
}

#[test]
fn workspace_writes_replay_and_recover_without_overwriting_external_changes() {
    use project_application::{AppError, writer::CommitPoint};
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Focus card");
    let id = card.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200);
    let project_application::Versioned { value: _, version } = engine.workspace().unwrap();
    let request = Uuid::now_v7().to_string();
    let epoch = engine.journal.epoch.clone();
    let payload = json!({"items":[{"project_id":project,"card_id":id}]});
    let result = engine
        .mutate_workspace_with(
            "focus",
            &payload,
            &request,
            &epoch,
            Some(&version),
            |point| {
                if point == CommitPoint::Renamed {
                    Err(AppError::invariant("injected test failure"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(result.http_status, 202);
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        json!(engine.workspace().unwrap().value)["focus"],
        payload["items"]
    );
    let replay = engine
        .mutate_workspace("focus", &payload, &request, &epoch, Some(&version))
        .unwrap();
    assert_eq!(replay.body["replayed"], true);
    wire::validate("CommandResponse", &replay.body).unwrap();
    let project_application::Versioned {
        value: _,
        version: current,
    } = engine.workspace().unwrap();
    let result = engine
        .mutate_workspace_with(
            "preferences",
            &json!({"locale":"en","preferences":{"default_view":"board"}}),
            &Uuid::now_v7().to_string(),
            &epoch,
            Some(&current),
            |point| {
                if point == CommitPoint::Prepared {
                    Err(AppError::invariant("injected test failure"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(result.http_status, 202);
    let mut workspace = json!(engine.workspace().unwrap().value);
    workspace["preferences"]["default_view"] = json!("calendar");
    fs::write(
        env.root.join("state/workspace.json"),
        serde_json::to_vec_pretty(&workspace).unwrap(),
    )
    .unwrap();
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        json!(engine.workspace().unwrap().value)["preferences"]["default_view"],
        "calendar"
    );
    assert!(engine.journal.has_pending("workspace").unwrap());
}

#[test]
fn source_pin_is_visible_in_another_workspace_and_local_order_cannot_change_membership() {
    let env = Environment::new();
    let first = env.engine();
    let project = register(&first, &env.path());
    let created = create(&first, &project, "Shared pin");
    let card = created.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &first,
        &project,
        card,
        created.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    assert_eq!(pinned.http_status, 200);
    assert_eq!(
        first.focus_resource().unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );

    Directory::open(&env.root)
        .unwrap()
        .child("other-state", true)
        .unwrap();
    drop(first);
    let other = Engine::open(&env.root.join("other-state")).unwrap();
    assert_eq!(register(&other, &env.path()), project);
    let remote = other.focus_resource().unwrap();
    assert_eq!(remote["items"][0]["card_id"], card);
    let rejected = other
        .mutate_workspace(
            "focus",
            &json!({"items":[]}),
            &Uuid::now_v7().to_string(),
            &other.journal.epoch,
            remote["version"].as_str(),
        )
        .unwrap();
    assert_eq!(rejected.body["error"]["code"], "FOCUS_MEMBERSHIP_CHANGED");
    assert_eq!(other.focus_resource().unwrap()["items"][0]["card_id"], card);
}

#[test]
fn read_receipts_are_atomic_shared_and_do_not_modify_reports() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let report = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "kind": "decision_needed",
                "summary": "Choose a release date",
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
    let path = env.root.join(format!("project/.project/updates/{id}.json"));
    let original = fs::read(&path).unwrap();
    assert_eq!(
        engine.get(&project, Kind::Update, id).unwrap()["read"],
        false
    );
    let request = Uuid::now_v7().to_string();
    let input = json!({"items":[{"project_id":project,"update_id":id,"read":true}]});
    let reply = engine
        .receipts(&input, &request, &engine.journal.epoch)
        .unwrap();
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(
        engine
            .receipts(&input, &request, &engine.journal.epoch)
            .unwrap()
            .body["replayed"],
        true
    );
    let resource = engine.get(&project, Kind::Update, id).unwrap();
    wire::validate("UpdateResource", &resource).unwrap();
    assert_eq!(resource["read"], true);
    assert_eq!(resource["metadata"]["kind"], "decision_needed");
    assert_eq!(fs::read(path).unwrap(), original);
    wire::validate(
        "UpdateResource",
        &serde_json::from_str(include_str!(
            "../../../../examples/requests/update-read-response.json"
        ))
        .unwrap(),
    )
    .unwrap();
}

#[test]
fn missing_receipt_target_rejection_remains_stable_after_creation() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let id = Uuid::new_v4().to_string();
    let request = Uuid::now_v7().to_string();
    let payload = json!({"items":[{"project_id":project,"update_id":id,"read":true}]});
    let response = |value: Result<Reply, project_application::AppError>| match value {
        Ok(reply) | Err(project_application::AppError::Rejected(reply)) => reply,
        Err(error) => panic!("{error:?}"),
    };
    let first = response(engine.receipts(&payload, &request, &engine.journal.epoch));
    assert_eq!(first.http_status, 404);
    let created = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "id": id,
                "kind": "note",
                "summary": "Later report",
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
    assert_eq!(created.http_status, 200);
    let second = response(engine.receipts(&payload, &request, &engine.journal.epoch));
    assert_eq!(second.http_status, 404);
    assert_eq!(
        engine.get(&project, Kind::Update, &id).unwrap()["read"],
        false
    );
}

#[test]
fn broken_workspace_keeps_diagnostics_available_without_recreating_sources() {
    for missing in [true, false] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.path());
        let source = fs::read(env.root.join("project/.project/project.json")).unwrap();
        drop(engine);
        let workspace = env.root.join("state/workspace.json");
        if missing {
            fs::remove_file(&workspace).unwrap();
        } else {
            fs::write(&workspace, b"broken workspace").unwrap();
        }
        let engine = env.engine();
        assert!(engine.workspace().is_err());
        let diagnostics = engine.diagnostics().unwrap();
        wire::validate("Diagnostics", &diagnostics).unwrap();
        assert_eq!(diagnostics["state"], "degraded");
        assert_eq!(
            diagnostics["warnings"][0]["code"],
            if missing {
                "WORKSPACE_MISSING"
            } else {
                "WORKSPACE_INVALID"
            }
        );
        assert!(!diagnostics.to_string().contains("broken workspace"));
        assert_eq!(
            fs::read(env.root.join("project/.project/project.json")).unwrap(),
            source
        );
        if missing {
            assert!(!workspace.exists());
        } else {
            assert_eq!(fs::read(&workspace).unwrap(), b"broken workspace");
        }
        assert!(
            engine
                .mutate(Mutation {
                    project_id: project,
                    kind: Kind::Card,
                    id: None,
                    payload: json!({"title":"Must not be created"}),
                    request_id: Uuid::now_v7().to_string(),
                    epoch: engine.journal.epoch.clone(),
                    expected: None
                })
                .is_err()
        );
    }
}
