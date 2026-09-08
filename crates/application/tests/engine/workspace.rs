use super::*;

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
                    Err(AppError::State)
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
                    Err(AppError::State)
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
    let path = env.root.join(format!("project/.project/updates/{id}.md"));
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
        let source = fs::read(env.root.join("project/.project/project.md")).unwrap();
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
            fs::read(env.root.join("project/.project/project.md")).unwrap(),
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
