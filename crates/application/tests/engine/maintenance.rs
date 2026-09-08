use super::*;

fn projection_failure(env: &Environment) -> rusqlite::Connection {
    let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_projection_update BEFORE UPDATE ON projection_meta
         BEGIN SELECT RAISE(ABORT, 'injected projection update failure'); END;
         CREATE TRIGGER fail_projection_delete BEFORE DELETE ON documents
         BEGIN SELECT RAISE(ABORT, 'injected projection delete failure'); END;",
    )
    .unwrap();
    db
}

fn completed_maintenance_survives_projection_failure(operation: &str, restart: bool) {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Durable maintenance");
    let id = card.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let old_root = env.root.join("project");
    let mut source_path = old_root.join(format!(".project/cards/{id}.md"));
    let input = match operation {
        "normalize" => {
            let changed = fs::read_to_string(&source_path).unwrap().replacen(
                "---\n",
                "---\n# Normalize this comment\n",
                1,
            ) + "\nNew body to project\n";
            fs::write(&source_path, &changed).unwrap();
            json!({"operation": operation, "project_id": project, "kind": "card", "id": id,
                "expected_version": project_store::document::version(changed.as_bytes())})
        }
        "unregister" => json!({"operation": operation, "project_id": project,
            "expected_workspace_version": engine.workspace().unwrap().version}),
        "relocate" => {
            let destination = env.root.join("moved");
            fs::rename(&old_root, &destination).unwrap();
            source_path = destination.join(format!(".project/cards/{id}.md"));
            json!({"operation": operation, "project_id": project,
                "new_absolute_path": destination,
                "expected_workspace_version": engine.workspace().unwrap().version})
        }
        _ => unreachable!(),
    };
    let plan = engine.maintenance_plan(&input).unwrap();
    if operation == "relocate" {
        // A previous path can be reused after the preview releases its original store.
        // Keep a registry-owned lease there to exercise completion's separate cleanup.
        fs::create_dir(&old_root).unwrap();
        drop(engine.store_path(old_root.to_str().unwrap(), true).unwrap());
    }
    let fault = projection_failure(&env);
    let request = Uuid::now_v7().to_string();
    let reply = engine.commit_maintenance(
        plan["plan_id"].as_str().unwrap(),
        &request,
        &engine.journal.epoch,
    );
    assert!(
        reply.is_ok(),
        "{operation}: durable completion must survive projection failure: {reply:?}"
    );
    let reply = reply.unwrap();
    assert_eq!(reply.http_status, 202);
    wire::validate("Accepted", &reply.body).unwrap();
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(reply.body["job_id"].as_str().unwrap())
    .unwrap();
    assert_eq!(job["state"], "done");
    let state: String = engine
        .journal
        .db()
        .unwrap()
        .query_row(
            "SELECT state FROM commands WHERE request_id=?1",
            [&request],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(state, "committed");
    let source = fs::read(&source_path).unwrap();
    let workspace = fs::read(env.root.join("state/workspace.json")).unwrap();
    let replay = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(replay.http_status, reply.http_status);
    assert_eq!(replay.body, reply.body);
    assert_eq!(fs::read(&source_path).unwrap(), source);
    assert_eq!(
        fs::read(env.root.join("state/workspace.json")).unwrap(),
        workspace
    );
    if matches!(operation, "unregister" | "relocate") {
        let _lease = project_store::filesystem::ProjectStore::open(&old_root, false)
            .expect("completed maintenance releases the previous store despite projection failure");
    }
    if operation == "unregister" {
        assert!(engine.workspace().unwrap().value.projects.is_empty());
        assert_eq!(
            engine.list(Some("card"), &Query::default()).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    fault
        .execute_batch("DROP TRIGGER fail_projection_update; DROP TRIGGER fail_projection_delete;")
        .unwrap();
    let engine = if restart {
        drop(engine);
        env.engine()
    } else {
        let before_retry = engine.index.cursor().unwrap();
        engine.retry_projection_repairs().unwrap();
        assert_eq!(
            engine.index.cursor().unwrap(),
            before_retry,
            "failed repair waits for its backoff"
        );
        engine
            .retry_projection_repairs_at(
                std::time::Instant::now() + std::time::Duration::from_secs(31),
            )
            .unwrap();
        engine
    };
    let page = engine.list(Some("card"), &Query::default()).unwrap();
    if operation == "unregister" {
        assert!(
            page["items"].as_array().unwrap().is_empty(),
            "cleanup repairs even an empty workspace"
        );
    } else {
        assert_eq!(
            page["items"][0]["version"],
            project_store::document::version(&source)
        );
    }
    let repaired_cursor = engine.index.cursor().unwrap();
    engine
        .retry_projection_repairs_at(
            std::time::Instant::now() + std::time::Duration::from_secs(120),
        )
        .unwrap();
    assert_eq!(
        engine.index.cursor().unwrap(),
        repaired_cursor,
        "successful repair leaves no queued work"
    );
    assert_eq!(fs::read(&source_path).unwrap(), source);
    assert_eq!(
        fs::read(env.root.join("state/workspace.json")).unwrap(),
        workspace
    );
}

#[test]
fn completed_normalize_survives_projection_failure() {
    completed_maintenance_survives_projection_failure("normalize", false);
}

#[test]
fn completed_unregister_survives_projection_failure() {
    completed_maintenance_survives_projection_failure("unregister", false);
}

#[test]
fn completed_relocate_survives_projection_failure() {
    completed_maintenance_survives_projection_failure("relocate", false);
}

#[test]
fn completed_unregister_repairs_stale_projection_after_restart() {
    completed_maintenance_survives_projection_failure("unregister", true);
}

#[test]
fn index_rebuild_projection_failure_remains_pending_until_recovered() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Index rebuild work");
    let id = card.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let source_path = env.root.join(format!("project/.project/cards/{id}.md"));
    let plan = engine
        .maintenance_plan(&json!({"operation": "index_rebuild", "project_id": project}))
        .unwrap();
    let source = fs::read_to_string(&source_path).unwrap() + "\nNew body after preview\n";
    fs::write(&source_path, &source).unwrap();
    let fault = projection_failure(&env);
    let request = Uuid::now_v7().to_string();
    let reply = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    wire::validate("Accepted", &reply.body).unwrap();
    let job_id = reply.body["job_id"].as_str().unwrap();
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(job_id)
    .unwrap();
    assert_eq!(job["state"], "running");
    let state: String = engine
        .journal
        .db()
        .unwrap()
        .query_row(
            "SELECT state FROM commands WHERE request_id=?1",
            [&request],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        state, "blocked",
        "refresh is required job work, not optional postcompletion"
    );
    let before = engine.index.cursor().unwrap();
    engine
        .retry_projection_repairs_at(std::time::Instant::now() + std::time::Duration::from_secs(31))
        .unwrap();
    assert_eq!(engine.index.cursor().unwrap(), before);
    fault
        .execute_batch("DROP TRIGGER fail_projection_update; DROP TRIGGER fail_projection_delete;")
        .unwrap();
    drop(engine);
    let engine = env.engine();
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(job_id)
    .unwrap();
    assert_eq!(job["state"], "done");
    let replay = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(replay.body, reply.body);
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"][0]["version"],
        project_store::document::version(source.as_bytes())
    );
    assert_eq!(fs::read_to_string(source_path).unwrap(), source);
}

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
