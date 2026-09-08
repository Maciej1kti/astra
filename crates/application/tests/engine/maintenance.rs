use super::*;

#[test]
fn maintenance_normalizes_conditionally_rebalances_and_unregisters_without_deleting_files() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "Maintenance target");
    let id = first.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.md"));
    let original = fs::read_to_string(&path).unwrap();
    let commented = original.replacen("---\n", "---\n# Preserve in plan\n", 1);
    fs::write(&path, &commented).unwrap();
    let plan = engine
        .maintenance_plan(&json!({
            "operation": "normalize",
            "project_id": project,
            "kind": "card",
            "id": id,
            "expected_version": project_store::document::version(commented.as_bytes()),
        }))
        .unwrap();
    assert_eq!(plan["steps"][0]["before_preview"], commented);
    let result = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(result.http_status, 202);
    assert_eq!(fs::read_to_string(&path).unwrap(), original);
    let before = engine.workspace().unwrap().version;
    let plan = engine
        .maintenance_plan(&json!({
            "operation": "rebalance",
            "project_id": project,
            "kind": "card",
            "expected_projection_revision": engine.index.cursor().unwrap(),
        }))
        .unwrap();
    engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    let plan=engine.maintenance_plan(&json!({"operation":"unregister","project_id":project,"expected_workspace_version":before})).unwrap();
    engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert!(path.exists());
    assert!(
        json!(engine.workspace().unwrap().value)["projects"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let _lease =
        project_store::filesystem::ProjectStore::open(&env.root.join("project"), false).unwrap();
}

#[test]
fn maintenance_plan_rejects_intervening_source_edits_and_relocates_moved_folder() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "Keep external edits");
    let id = first.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.md"));
    let plan = engine
        .maintenance_plan(&json!({
            "operation": "normalize",
            "project_id": project,
            "kind": "card",
            "id": id,
            "expected_version": first.body["result"]["resource"]["version"],
        }))
        .unwrap();
    let edited = fs::read_to_string(&path).unwrap() + "\nExternal body\n";
    fs::write(&path, &edited).unwrap();
    let reply = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.http_status, 409);
    assert_eq!(fs::read_to_string(&path).unwrap(), edited);
    fs::rename(env.root.join("project"), env.root.join("moved")).unwrap();
    let plan = engine
        .maintenance_plan(&json!({
            "operation": "relocate",
            "project_id": project,
            "new_absolute_path": env.root.join("moved"),
            "expected_workspace_version": engine.workspace().unwrap().version,
        }))
        .unwrap();
    let reply = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["title"],
        "Keep external edits"
    );
}

#[test]
fn retention_keeps_retry_window_and_pending_intents() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "Retained card");
    let now = now_millis();
    assert_eq!(
        engine.journal.retain(now + 6 * 86_400_000).unwrap()["commands_removed"],
        0
    );
    let count: i64 = engine
        .journal
        .db()
        .unwrap()
        .query_row("SELECT count(*) FROM commands", [], |r| r.get(0))
        .unwrap();
    assert!(count >= 2);
    let pruned = engine.journal.retain(now + 8 * 86_400_000).unwrap();
    assert!(pruned["commands_removed"].as_u64().unwrap() >= 2);
    assert_eq!(pruned["history_removed"], 0);
    let pending = Uuid::now_v7().to_string();
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO commands(epoch,
    request_id,
    digest,
    state,
    target_kind,
    received_at,
    expires_at)
VALUES (?1,
    ?2,
    'test',
    'needs_review',
    'card',
    ?3,
    ?3)",
            rusqlite::params![
                engine.journal.epoch,
                pending,
                project_application::instant(now)
            ],
        )
        .unwrap();
    let pruned = engine.journal.retain(now + 40 * 86_400_000).unwrap();
    assert!(pruned["history_removed"].as_u64().unwrap() > 0);
    let state: String = engine
        .journal
        .db()
        .unwrap()
        .query_row(
            "SELECT state FROM commands WHERE request_id=?1",
            [pending],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "needs_review");
    assert_eq!(
        engine.get(&project, Kind::Project, &project).unwrap()["metadata"]["name"],
        "Test project"
    );
}

#[test]
fn rebalance_rejects_new_collection_members_and_replays_rejection() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "Original member");
    let id = first.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.md"));
    let original = fs::read(&path).unwrap();
    let plan = engine
        .maintenance_plan(&json!({
            "operation": "rebalance",
            "project_id": project,
            "kind": "card",
            "expected_projection_revision": engine.index.cursor().unwrap(),
        }))
        .unwrap();
    let added = create(&engine, &project, "New member after preview");
    let request = Uuid::now_v7().to_string();
    let result = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(result.http_status, 409);
    assert_eq!(fs::read(&path).unwrap(), original);
    let added_id = added.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    fs::remove_file(
        env.root
            .join(format!("project/.project/cards/{added_id}.md")),
    )
    .unwrap();
    let replay = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(replay.body, result.body);
}
