use project_application::{
    Mutation, Reply, engine::Engine, index::Query, now_millis, wire, workflow::Workflows,
};
use project_store::{document::Kind, filesystem::Directory};
use serde_json::{Value, json};
use std::{fs, path::PathBuf, sync::Arc};
use uuid::Uuid;

struct Environment {
    _temp: tempfile::TempDir,
    root: PathBuf,
}
impl Environment {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let dir = Directory::open(&root).unwrap();
        dir.child("state", true).unwrap();
        dir.child("project", true).unwrap();
        Self { _temp: temp, root }
    }
    fn engine(&self) -> Engine {
        Engine::open(&self.root.join("state")).unwrap()
    }
    fn path(&self) -> String {
        self.root.join("project").to_str().unwrap().into()
    }
}
fn register(engine: &Engine, path: &str) -> String {
    let plan = engine
        .registration_plan(path, Some("Test project"), true)
        .unwrap();
    wire::validate("RegistrationPlan", &plan).unwrap();
    let reply = engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    wire::validate("Accepted", &reply.body).unwrap();
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(reply.body["job_id"].as_str().unwrap())
    .unwrap();
    wire::validate("Job", &job).unwrap();
    assert_eq!(job["state"], "done");
    plan["project_id"].as_str().unwrap().into()
}
fn create(engine: &Engine, project_id: &str, title: &str) -> Reply {
    let reply = engine
        .mutate(Mutation {
            project_id: project_id.into(),
            kind: Kind::Card,
            id: None,
            payload: json!({"title":title}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    wire::validate("CommandResponse", &reply.body).unwrap();
    reply
}
fn patch(engine: &Engine, project_id: &str, id: &str, expected: &str, payload: Value) -> Reply {
    engine
        .mutate(Mutation {
            project_id: project_id.into(),
            kind: Kind::Card,
            id: Some(id.into()),
            payload,
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(expected.into()),
        })
        .unwrap()
}

#[test]
fn registration_is_explicit_preserves_existing_instructions_and_repeats_safely() {
    let env = Environment::new();
    let engine = env.engine();
    let path = env.path();
    fs::write(
        env.root.join("project/AGENTS.md"),
        b"# Owner instructions\nPreserve these bytes.\n",
    )
    .unwrap();
    let plan = engine.registration_plan(&path, None, true).unwrap();
    assert!(!env.root.join("project/.project").exists());
    let reply = engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert!(reply.body.get("job_id").is_some());
    let id = engine.resolve_path(&path).unwrap();
    assert_eq!(register(&engine, &path), id);
    let agents = fs::read_to_string(env.root.join("project/AGENTS.md")).unwrap();
    assert!(agents.starts_with("# Owner instructions\nPreserve these bytes.\n"));
    assert_eq!(agents.matches("local-projects:begin").count(), 1);
    assert_eq!(
        engine.workspace().unwrap().0["projects"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let list = engine.list(Some("project"), &Query::default()).unwrap();
    wire::validate("SummaryPage", &list).unwrap();
    assert_eq!(list["items"][0]["id"], id);
}

#[test]
fn stale_registration_plan_does_not_overwrite_user_edits() {
    let env = Environment::new();
    let engine = env.engine();
    let path = env.path();
    fs::write(env.root.join("project/AGENTS.md"), b"before").unwrap();
    let plan = engine.registration_plan(&path, None, true).unwrap();
    fs::write(env.root.join("project/AGENTS.md"), b"user edit").unwrap();
    let reply = engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.body["error"]["code"], "PLAN_STALE");
    assert_eq!(
        fs::read(env.root.join("project/AGENTS.md")).unwrap(),
        b"user edit"
    );
    assert!(!env.root.join("project/.project/project.md").exists());
    assert!(
        engine.workspace().unwrap().0["projects"]
            .as_array()
            .unwrap()
            .is_empty()
    );
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
fn browser_roots_reject_escape_symlinks_and_replaced_directories() {
    use std::os::unix::fs::symlink;
    let env = Environment::new();
    let engine = env.engine();
    let root = engine.add_root(&env.path(), "Approved projects").unwrap();
    let id = root["id"].as_str().unwrap();
    wire::validate("Roots", &engine.roots().unwrap()).unwrap();
    assert!(engine.browse_root(id, "../state", None).is_err());
    assert!(engine.browse_root(id, "/", None).is_err());
    symlink(env.root.join("state"), env.root.join("project/escape")).unwrap();
    assert!(engine.browse_root(id, "escape", None).is_err());
    assert_eq!(
        engine.browse_root(id, "", None).unwrap()["items"],
        json!([])
    );
    fs::rename(env.root.join("project"), env.root.join("old-project")).unwrap();
    fs::create_dir(env.root.join("project")).unwrap();
    assert!(engine.browse_root(id, "", None).is_err());
    assert_eq!(engine.remove_root(id).unwrap()["removed"], true);
    assert!(engine.browse_root(id, "", None).is_err());
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
fn workspace_writes_replay_and_recover_without_overwriting_external_changes() {
    use project_application::{AppError, writer::CommitPoint};
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Focus card");
    let id = card.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap();
    let (_, version) = engine.workspace().unwrap();
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
    assert_eq!(engine.workspace().unwrap().0["focus"], payload["items"]);
    let replay = engine
        .mutate_workspace("focus", &payload, &request, &epoch, Some(&version))
        .unwrap();
    assert_eq!(replay.body["replayed"], true);
    wire::validate("CommandResponse", &replay.body).unwrap();
    let (_, current) = engine.workspace().unwrap();
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
    let mut workspace = engine.workspace().unwrap().0;
    workspace["preferences"]["default_view"] = json!("calendar");
    fs::write(
        env.root.join("state/workspace.json"),
        serde_json::to_vec_pretty(&workspace).unwrap(),
    )
    .unwrap();
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine.workspace().unwrap().0["preferences"]["default_view"],
        "calendar"
    );
    assert!(engine.journal.has_pending("workspace").unwrap());
}

#[test]
fn read_receipts_are_atomic_shared_and_do_not_modify_reports() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let report=engine.mutate(Mutation{project_id:project.clone(),kind:Kind::Update,id:None,payload:json!({"kind":"decision_needed","summary":"Choose a release date","target":{"type":"project","id":project},"author":{"kind":"human","label":"Owner"}}),request_id:Uuid::now_v7().to_string(),epoch:engine.journal.epoch.clone(),expected:None}).unwrap();
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
            "../../../examples/requests/update-read-response.json"
        ))
        .unwrap(),
    )
    .unwrap();
}

#[test]
fn attention_distinguishes_hard_deadlines_and_reading_from_resolution() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    for (title, kind) in [("Soft target", "target"), ("Hard deadline", "hard")] {
        let card = create(&engine, &project, title);
        let resource = &card.body["result"]["resource"];
        patch(
            &engine,
            &project,
            resource["metadata"]["id"].as_str().unwrap(),
            resource["version"].as_str().unwrap(),
            json!({"set":{"due":{"date":"2026-09-01","kind":kind},"schedule":{"start":"2026-08-30","end":"2026-09-03"}}}),
        );
    }
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-05T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let attention = engine.attention(None, 200, now).unwrap();
    wire::validate("AttentionPage", &attention).unwrap();
    assert_eq!(attention["items"].as_array().unwrap().len(), 1);
    assert_eq!(attention["items"][0]["label"], "Hard deadline");
    let calendar = engine
        .calendar(Some(&project), "2026-09-01", "2026-09-30", None, 100)
        .unwrap();
    wire::validate("CalendarPage", &calendar).unwrap();
    assert_eq!(calendar["items"].as_array().unwrap().len(), 4);
    assert!(
        engine
            .calendar(None, "2026-02-30", "2026-03-01", None, 10)
            .is_err()
    );
    wire::validate("BoardView", &engine.board(&project, None, 50).unwrap()).unwrap();
    wire::validate("GanttPage", &engine.gantt(&project, None, 50).unwrap()).unwrap();
    let report=engine.mutate(Mutation{project_id:project.clone(),kind:Kind::Update,id:None,payload:json!({"kind":"decision_needed","summary":"Choose scope","target":{"type":"project","id":project},"author":{"kind":"human","label":"Owner"}}),request_id:Uuid::now_v7().to_string(),epoch:engine.journal.epoch.clone(),expected:None}).unwrap();
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
    assert_eq!(
        engine.attention(None, 200, now).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let result=engine.mutate(Mutation{project_id:project.clone(),kind:Kind::Update,id:None,payload:json!({"kind":"resolution","summary":"Scope selected","resolves":[id],"target":{"type":"project","id":project},"author":{"kind":"human","label":"Owner"}}),request_id:Uuid::now_v7().to_string(),epoch:engine.journal.epoch.clone(),expected:None}).unwrap();
    assert_eq!(result.http_status, 200);
    assert_eq!(
        engine.attention(None, 200, now).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn agent_context_is_project_scoped_and_counts_utf8_json_overhead() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "A bounded excerpt");
    let resource = &card.body["result"]["resource"];
    patch(
        &engine,
        &project,
        resource["metadata"]["id"].as_str().unwrap(),
        resource["version"].as_str().unwrap(),
        json!({"set":{"body":"🦀 Untrusted project data.\n".repeat(2000)}}),
    );
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let other_id = register(&engine, other.to_str().unwrap());
    create(&engine, &other_id, "Never export this project");
    for budget in [4096, 24576, 131072] {
        let context = engine.context(&project, budget).unwrap();
        wire::validate("Context", &context).unwrap();
        let bytes = serde_json::to_vec(&context).unwrap();
        assert!(bytes.len() <= budget);
        assert!(!String::from_utf8(bytes).unwrap().contains("Never export"));
        assert_eq!(context["truncated"], true);
    }
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
fn completed_registration_replays_after_restart_with_missing_project_folder() {
    let env = Environment::new();
    let engine = env.engine();
    let plan = engine
        .registration_plan(&env.path(), Some("Retry test"), true)
        .unwrap();
    let plan_id = plan["plan_id"].as_str().unwrap();
    let request = Uuid::now_v7().to_string();
    let epoch = engine.journal.epoch.clone();
    let first = engine
        .commit_registration(plan_id, &request, &epoch)
        .unwrap();
    drop(engine);
    fs::rename(env.root.join("project"), env.root.join("temporarily-away")).unwrap();
    let engine = env.engine();
    let retry = engine
        .commit_registration(plan_id, &request, &epoch)
        .unwrap();
    assert_eq!(retry.body["job_id"], first.body["job_id"]);
}

#[test]
fn schedule_warning_is_durable_and_never_moves_deadline() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let request = Uuid::now_v7().to_string();
    let mutation = Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: None,
        payload: json!({"title":"Plan after due","schedule":{"start":"2026-09-01","end":"2026-09-10"},"due":{"date":"2026-09-05","kind":"hard"}}),
        request_id: request,
        epoch: engine.journal.epoch.clone(),
        expected: None,
    };
    let first = engine.mutate(mutation.clone()).unwrap();
    assert_eq!(first.body["warnings"][0]["code"], "SCHEDULE_AFTER_DUE");
    assert_eq!(
        first.body["result"]["resource"]["metadata"]["due"]["date"],
        "2026-09-05"
    );
    let replay = engine.mutate(mutation).unwrap();
    assert_eq!(replay.body["warnings"], first.body["warnings"]);
}
