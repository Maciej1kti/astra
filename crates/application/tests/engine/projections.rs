use super::*;

#[test]
fn scoped_pages_survive_other_projects_but_reject_relevant_changes() {
    let env = Environment::new();
    let engine = env.engine();
    let a = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let b = register(&engine, other.to_str().unwrap());
    let mut cards = Vec::new();
    for title in ["First", "Second", "Third"] {
        let created = create(&engine, &a, title);
        cards.push(patch(&engine, &a, created.body["result"]["id"].as_str().unwrap(), created.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"blocked":{"reason":"Waiting"},"schedule":{"start":"2026-09-08","end":"2026-09-09"}}})));
    }
    let query = Query {
        project: Some(a.clone()),
        limit: Some(1),
        ..Default::default()
    };
    let list = engine.list(Some("card"), &query).unwrap();
    let attention = engine
        .attention_project(Some(&a), None, 1, now_millis())
        .unwrap();
    let calendar = engine
        .calendar(Some(&a), "2026-09-01", "2026-09-30", None, 1)
        .unwrap();
    let board = engine.board(&a, None, 1).unwrap();
    let gantt = engine.gantt(&a, None, 1).unwrap();
    let cursor = |value: &Value| value["page"]["next_cursor"].as_str().unwrap().to_owned();
    let list_cursor = cursor(&list);
    let attention_cursor = cursor(&attention);
    let calendar_cursor = cursor(&calendar);
    let board_cursor = cursor(&board["columns"][0]);
    let gantt_cursor = cursor(&gantt);
    create(&engine, &b, "Unrelated write");
    let read_pages = || {
        vec![
            engine.list(
                Some("card"),
                &Query {
                    cursor: Some(list_cursor.clone()),
                    ..query.clone()
                },
            ),
            engine.attention_project(Some(&a), Some(&attention_cursor), 1, now_millis()),
            engine.calendar(
                Some(&a),
                "2026-09-01",
                "2026-09-30",
                Some(&calendar_cursor),
                1,
            ),
            engine.board(&a, Some(&board_cursor), 1),
            engine.gantt(&a, Some(&gantt_cursor), 1),
        ]
    };
    for page in read_pages() {
        assert!(
            page.is_ok(),
            "unrelated project must preserve scoped pages: {page:?}"
        );
    }
    create(&engine, &a, "Relevant write");
    for page in read_pages() {
        assert!(
            matches!(page, Err(project_application::AppError::Rejected(reply)) if reply.http_status == 409)
        );
    }
    let page = engine.list(Some("card"), &query).unwrap();
    engine.index.invalidate_workspace(now_millis()).unwrap();
    assert!(
        engine
            .list(
                Some("card"),
                &Query {
                    cursor: Some(cursor(&page)),
                    ..query
                }
            )
            .is_err()
    );
}

#[test]
fn pagination_detects_staleness_and_stream_snapshots_do_not_lose_changes() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "First");
    create(&engine, &project, "Second");
    let query = Query {
        project: Some(project.clone()),
        limit: Some(1),
        ..Default::default()
    };
    let first = engine.list(Some("card"), &query).unwrap();
    let cursor = first["page"]["snapshot_cursor"].as_str().unwrap();
    let next = first["page"]["next_cursor"].as_str().unwrap().to_owned();
    let mut next_query = query.clone();
    next_query.cursor = Some(next);
    assert_eq!(
        engine.list(Some("card"), &next_query).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    create(&engine, &project, "Third");
    assert!(engine.list(Some("card"), &next_query).is_err());
    let events = engine.index.events_since(cursor, now_millis()).unwrap();
    assert!(!events.is_empty());
    for event in events {
        wire::validate("Event", &event).unwrap();
        assert_ne!(event["cursor"], cursor);
    }
    assert_eq!(
        engine
            .index
            .events_since("old-epoch:0", now_millis())
            .unwrap()[0]["kind"],
        "resync_required"
    );
}

#[test]
fn invalid_external_source_preserves_stale_projection_without_repairing_files() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Last valid title");
    let id = created.body["result"]["id"].as_str().unwrap();
    let source = env.root.join(format!("project/.project/cards/{id}.md"));
    fs::write(&source, b"broken document").unwrap();
    engine.refresh_all().unwrap();
    let page = engine.list(Some("card"), &Query::default()).unwrap();
    assert_eq!(page["items"][0]["title"], "Last valid title");
    assert_eq!(page["items"][0]["availability"], "stale");
    assert_eq!(fs::read(&source).unwrap(), b"broken document");
    assert!(engine.get(&project, Kind::Card, id).is_err());
    fs::remove_file(source).unwrap();
    engine.refresh_all().unwrap();
    assert!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn invalid_filenames_are_isolated_by_collection_and_publish_health_changes() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Readable neighbor");
    let id = created.body["result"]["id"].as_str().unwrap();
    let source = env.root.join(format!("project/.project/cards/{id}.md"));
    let original = fs::read(&source).unwrap();
    let malformed = ["cards/foo.md", "milestones/foo.md"];
    let cursor = engine.index.cursor().unwrap();
    for relative in malformed {
        let path = env.root.join("project/.project").join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"Malformed filename, preserved source").unwrap();
    }
    engine.refresh_project(&project, None).unwrap();
    assert_eq!(engine.index.issue_count().unwrap(), 2);
    let projects = engine.list(Some("project"), &Query::default()).unwrap();
    assert_eq!(projects["items"][0]["availability"], "ready");
    let events = engine.index.events_since(&cursor, now_millis()).unwrap();
    assert!(events.iter().any(|event| event["kind"] == "health_changed"));
    for event in &events {
        wire::validate("Event", event).unwrap();
    }
    assert_eq!(fs::read(source).unwrap(), original);
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["title"],
        "Readable neighbor"
    );

    let unchanged = engine.index.cursor().unwrap();
    engine.refresh_project(&project, None).unwrap();
    assert_eq!(engine.index.cursor().unwrap(), unchanged);
    for relative in malformed {
        let path = env.root.join("project/.project").join(relative);
        assert_eq!(
            fs::read(&path).unwrap(),
            b"Malformed filename, preserved source"
        );
        fs::remove_file(path).unwrap();
    }
    engine.refresh_project(&project, None).unwrap();
    assert_eq!(engine.index.issue_count().unwrap(), 0);
    assert!(
        engine
            .index
            .events_since(&unchanged, now_millis())
            .unwrap()
            .iter()
            .any(|event| event["kind"] == "health_changed")
    );
}

#[test]
fn invalid_unindexed_target_emits_health_without_changing_other_issues() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let id = Uuid::new_v4().to_string();
    let cards = env.root.join("project/.project/cards");
    fs::create_dir_all(&cards).unwrap();
    fs::write(cards.join("unrelated.md"), b"Preserved unrelated issue").unwrap();
    engine.refresh_project(&project, None).unwrap();
    let cursor = engine.index.cursor().unwrap();
    let source = cards.join(format!("{id}.md"));
    fs::write(&source, b"Unfinished external document").unwrap();
    let targets = [(Kind::Card, id.clone()), (Kind::Card, id)];
    engine.refresh_project(&project, Some(&targets)).unwrap();
    assert_eq!(engine.index.issue_count().unwrap(), 2);
    assert!(
        engine
            .index
            .events_since(&cursor, now_millis())
            .unwrap()
            .iter()
            .any(|event| event["kind"] == "health_changed")
    );
    let unchanged = engine.index.cursor().unwrap();
    engine.refresh_project(&project, Some(&targets)).unwrap();
    assert_eq!(engine.index.cursor().unwrap(), unchanged);
    fs::remove_file(source).unwrap();
    engine.refresh_project(&project, Some(&targets)).unwrap();
    assert_eq!(engine.index.issue_count().unwrap(), 1);
    assert!(
        engine
            .index
            .events_since(&unchanged, now_millis())
            .unwrap()
            .iter()
            .any(|event| event["kind"] == "health_changed")
    );
}

#[test]
fn service_reopen_marks_cached_and_empty_projections_until_source_reconciliation() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "Retained projection");
    {
        let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
        db.execute_batch("CREATE TABLE observed_projection_updates(value INTEGER); CREATE TRIGGER audit_unchanged_projection AFTER UPDATE ON documents BEGIN INSERT INTO observed_projection_updates
VALUES (1); END;").unwrap();
    }
    let epoch = engine.journal.epoch.clone();
    drop(engine);
    for remove_index in [false, true] {
        if remove_index {
            fs::remove_file(env.root.join("state/index.sqlite")).unwrap();
        }
        let engine = Engine::open_for_service(&env.root.join("state")).unwrap();
        assert_eq!(engine.journal.epoch, epoch);
        assert_eq!(engine.startup_projects().unwrap(), vec![project.clone()]);
        if !remove_index {
            let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
            assert_eq!(
                db.query_row(
                    "SELECT count(*) FROM observed_projection_updates",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
                0,
                "Startup freshness must not rewrite persisted documents or FTS"
            );
        }
        let query = Query {
            project: Some(project.clone()),
            ..Default::default()
        };
        let page = engine.list(Some("card"), &query).unwrap();
        wire::validate("SummaryPage", &page).unwrap();
        assert_eq!(page["page"]["freshness"], "stale");
        assert!(
            page["warnings"]
                .as_array()
                .unwrap()
                .iter()
                .any(|warning| warning["code"] == "PROJECTION_RECONCILING")
        );
        assert_eq!(
            page["items"].as_array().unwrap().len(),
            usize::from(!remove_index)
        );
        if !remove_index {
            assert_eq!(page["items"][0]["availability"], "stale");
        }
        let diagnostics = engine.diagnostics().unwrap();
        wire::validate("Diagnostics", &diagnostics).unwrap();
        assert_eq!(diagnostics["index_state"], "building");
        let attention = engine.attention(None, 50, now_millis()).unwrap();
        let calendar = engine
            .calendar(Some(&project), "2026-09-01", "2026-09-30", None, 50)
            .unwrap();
        let gantt = engine.gantt(&project, None, 50).unwrap();
        for page in [&attention, &calendar, &gantt] {
            assert_eq!(page["page"]["freshness"], "stale");
            assert!(
                page["warnings"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|warning| warning["code"] == "PROJECTION_RECONCILING")
            );
        }
        let board = engine.board(&project, None, 50).unwrap();
        assert!(
            board["columns"]
                .as_array()
                .unwrap()
                .iter()
                .all(|column| column["page"]["freshness"] == "stale")
        );
        engine.refresh_project(&project, None).unwrap();
        if !remove_index {
            let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
            assert_eq!(
                db.query_row(
                    "SELECT count(*) FROM observed_projection_updates",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
                0,
                "Unchanged warm reconciliation must retain the equal-hash fast path"
            );
        }
        assert!(engine.startup_projects().unwrap().is_empty());
        let page = engine.list(Some("card"), &query).unwrap();
        assert_eq!(page["page"]["freshness"], "index_snapshot");
        assert_eq!(page["items"][0]["availability"], "ready");
        assert!(page["warnings"].as_array().unwrap().is_empty());
    }
}

#[test]
fn service_reopen_finishes_recovery_before_readiness_and_keeps_conflicts_blocked() {
    use project_application::{
        journal::{Command, Journal, Target},
        writer::{CommitPoint, Writer},
    };
    use project_store::{StoreError, filesystem::ProjectStore};
    for conflicting_external_edit in [false, true] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.path());
        let card = create(&engine, &project, "Before interruption");
        let id = card.body["result"]["id"].as_str().unwrap().to_owned();
        let version = card.body["result"]["version"].as_str().unwrap().to_owned();
        drop(engine);
        let journal = Journal::open(&env.root.join("state")).unwrap();
        let mut store = ProjectStore::open(&env.root.join("project"), false).unwrap();
        let command = Command {
            request_id: Uuid::now_v7().to_string(),
            epoch: journal.epoch.clone(),
            method: "PATCH".into(),
            target: Target {
                project_id: project.clone(),
                kind: Kind::Card,
                id: id.clone(),
            },
            expected: Some(version),
            payload: json!({"set":{"title":"Recovered source"}}),
        };
        let pending = Writer { journal: &journal }
            .execute_with(
                &mut store,
                &command,
                vec![],
                now_millis(),
                |old| {
                    let mut next = old.unwrap().clone();
                    next["metadata"]["title"] = json!("Recovered source");
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
        let source = env.root.join(format!("project/.project/cards/{id}.md"));
        if conflicting_external_edit {
            let before = fs::read_to_string(&source).unwrap();
            fs::write(
                &source,
                before.replace("Before interruption", "External conflicting edit"),
            )
            .unwrap();
        }
        drop(store);
        drop(journal);
        let engine = Engine::open_for_service(&env.root.join("state")).unwrap();
        let current = engine.get(&project, Kind::Card, &id).unwrap();
        if conflicting_external_edit {
            assert_eq!(engine.journal.state(&command).unwrap(), "needs_review");
            assert_eq!(current["metadata"]["title"], "External conflicting edit");
            let blocked = patch(
                &engine,
                &project,
                &id,
                current["version"].as_str().unwrap(),
                json!({"set":{"title":"Forbidden overwrite"}}),
            );
            assert_eq!(blocked.body["error"]["code"], "PROJECT_RECOVERY_REQUIRED");
        } else {
            assert_eq!(engine.journal.state(&command).unwrap(), "committed");
            assert_eq!(current["metadata"]["title"], "Recovered source");
        }
        assert_eq!(engine.startup_projects().unwrap(), vec![project]);
    }
}

#[test]
fn upgrading_body_only_search_index_preserves_sources_and_indexes_card_content() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Upgrade fixture");
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let edited = patch(
        &engine,
        &project,
        &id,
        created.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"expected_result":"PreviouslyUnindexed","owner":"CatalogOwner","body":"Original source body\n"}}),
    );
    assert_eq!(edited.http_status, 200);
    let source_path = env.root.join(format!("project/.project/cards/{id}.md"));
    let bytes = fs::read(&source_path).unwrap();
    drop(engine);

    // Recreate the prior disposable projection, including its old FTS columns.
    let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
    db.execute_batch("DROP TRIGGER documents_ai; DROP TRIGGER documents_ad; DROP TRIGGER documents_au; DROP TABLE documents_fts; ALTER TABLE documents DROP COLUMN search_text;
        CREATE VIRTUAL TABLE documents_fts USING fts5(title,
    body,
    content='documents',
    content_rowid='rowid');
        CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN INSERT INTO documents_fts(rowid,
    title,
    body)
VALUES (new.rowid,
    new.title,
    new.body); END;
        CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN INSERT INTO documents_fts(documents_fts,
    rowid,
    title,
    body)
VALUES ('delete',
    old.rowid,
    old.title,
    old.body); END;
        CREATE TRIGGER documents_au AFTER UPDATE OF title,
    body ON documents BEGIN INSERT INTO documents_fts(documents_fts,
    rowid,
    title,
    body)
VALUES ('delete',
    old.rowid,
    old.title,
    old.body); INSERT INTO documents_fts(rowid,
    title,
    body)
VALUES (new.rowid,
    new.title,
    new.body); END;
        INSERT INTO documents_fts(documents_fts)
VALUES ('rebuild'); DELETE
FROM projection_meta
WHERE key='search_format';").unwrap();
    drop(db);

    let engine = env.engine();
    for term in ["PreviouslyUnindexed", "CatalogOwner", "Original"] {
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
        assert_eq!(page["items"][0]["id"], id, "{term}");
    }
    assert_eq!(fs::read(source_path).unwrap(), bytes);
    assert_eq!(
        engine.get(&project, Kind::Card, &id).unwrap()["body"],
        "Original source body\n"
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine.get(&project, Kind::Card, &id).unwrap()["metadata"]["owner"],
        "CatalogOwner"
    );
}

#[test]
fn incremental_projection_preserves_other_sources_and_handles_invalid_delete_recreate() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "Changed file");
    let second = create(&engine, &project, "Untouched file");
    let id = first.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let other = second.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.md"));
    let original = fs::read(&path).unwrap();
    let targets = [(Kind::Card, id.to_owned())];
    fs::write(&path, b"unfinished external edit").unwrap();
    engine.refresh_project(&project, Some(&targets)).unwrap();
    let query = Query {
        project: Some(project.clone()),
        ..Default::default()
    };
    let rows = engine.list(Some("card"), &query).unwrap();
    assert_eq!(rows["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        rows["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == id)
            .unwrap()["availability"],
        "stale"
    );
    fs::remove_file(&path).unwrap();
    engine.refresh_project(&project, Some(&targets)).unwrap();
    let rows = engine.list(Some("card"), &query).unwrap();
    assert_eq!(rows["items"].as_array().unwrap().len(), 1);
    assert_eq!(rows["items"][0]["id"], other);
    fs::write(&path, original).unwrap();
    engine.refresh_project(&project, Some(&targets)).unwrap();
    assert_eq!(
        engine.list(Some("card"), &query).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn index_rebuild_cannot_finish_before_projection_succeeds() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "Rebuild target");
    let plan = engine
        .maintenance_plan(&json!({"operation":"index_rebuild","project_id":project}))
        .unwrap();
    let index = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
    index.execute("DROP TABLE projection_issues", []).unwrap();
    let _ = engine.commit_maintenance(
        plan["plan_id"].as_str().unwrap(),
        &Uuid::now_v7().to_string(),
        &engine.journal.epoch,
    );
    let state: String = engine
        .journal
        .db()
        .unwrap()
        .query_row(
            "SELECT state FROM workflow_jobs WHERE plan_id=?1",
            [plan["plan_id"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_ne!(state, "done");
    drop(index);
    drop(engine);
    let engine = env.engine();
    let state: String = engine
        .journal
        .db()
        .unwrap()
        .query_row(
            "SELECT state FROM workflow_jobs WHERE plan_id=?1",
            [plan["plan_id"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "done");
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"][0]["title"],
        "Rebuild target"
    );
}

#[test]
fn foreground_project_read_reconciles_external_changes_with_a_bounded_ttl() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Before foreground");
    let id = card.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let path = env.root.join(format!("project/.project/cards/{id}.md"));
    let original = fs::read_to_string(&path).unwrap();
    fs::write(
        &path,
        original.replace("Before foreground", "After foreground"),
    )
    .unwrap();
    engine.get(&project, Kind::Project, &project).unwrap();
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"][0]["title"],
        "After foreground"
    );
    fs::write(
        &path,
        original.replace("Before foreground", "New direct source"),
    )
    .unwrap();
    engine.get(&project, Kind::Project, &project).unwrap();
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"][0]["title"],
        "After foreground"
    );
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["title"],
        "New direct source"
    );
}
