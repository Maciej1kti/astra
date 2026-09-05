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

#[test]
fn browser_registration_plan_cannot_outlive_root_revocation() {
    let env = Environment::new();
    let engine = env.engine();
    let root = engine
        .add_root(env.root.to_str().unwrap(), "Allowed root")
        .unwrap();
    let plan=engine.browser_registration_plan(&json!({"root_id":root["id"],"relative_path":"project","git_mode":"private","name":"Revoked plan"})).unwrap();
    engine.remove_root(root["id"].as_str().unwrap()).unwrap();
    let result = engine.commit_registration(
        plan["plan_id"].as_str().unwrap(),
        &Uuid::now_v7().to_string(),
        &engine.journal.epoch,
    );
    let rejected = match result {
        Ok(reply) => reply.http_status >= 400,
        Err(_) => true,
    };
    assert!(
        rejected,
        "Revoked browser authority must prevent new registration"
    );
    assert!(!env.root.join("project/.project/project.md").exists());
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
    let plan=engine.maintenance_plan(&json!({"operation":"normalize","project_id":project,"kind":"card","id":id,"expected_version":project_store::document::version(commented.as_bytes())})).unwrap();
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
    let before = engine.workspace().unwrap().1;
    let plan=engine.maintenance_plan(&json!({"operation":"rebalance","project_id":project,"kind":"card","expected_projection_revision":engine.index.cursor().unwrap()})).unwrap();
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
        engine.workspace().unwrap().0["projects"]
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
    let plan=engine.maintenance_plan(&json!({"operation":"normalize","project_id":project,"kind":"card","id":id,"expected_version":first.body["result"]["resource"]["version"]})).unwrap();
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
    let plan=engine.maintenance_plan(&json!({"operation":"relocate","project_id":project,"new_absolute_path":env.root.join("moved"),"expected_workspace_version":engine.workspace().unwrap().1})).unwrap();
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
    engine.journal.db().unwrap().execute("INSERT INTO commands(epoch,request_id,digest,state,target_kind,received_at,expires_at) VALUES(?1,?2,'test','needs_review','card',?3,?3)",rusqlite::params![engine.journal.epoch,pending,project_application::instant(now)]).unwrap();
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
    let plan = engine.maintenance_plan(&json!({"operation":"rebalance","project_id":project,"kind":"card","expected_projection_revision":engine.index.cursor().unwrap()})).unwrap();
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

#[test]
fn gantt_pages_include_milestones_and_board_stays_card_only() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "Scheduled card");
    let milestone = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Milestone,
            id: None,
            payload: json!({"title":"Release gate","due":{"date":"2026-09-30","kind":"hard"}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(milestone.http_status, 200, "{milestone:?}");
    let first = engine.gantt(&project, None, 1).unwrap();
    wire::validate("GanttPage", &first).unwrap();
    assert_eq!(first["rows"][0]["type"], "card");
    let second = engine
        .gantt(&project, first["page"]["next_cursor"].as_str(), 1)
        .unwrap();
    wire::validate("GanttPage", &second).unwrap();
    assert_eq!(second["rows"][0]["type"], "milestone");
    assert_eq!(second["rows"][0]["due"]["date"], "2026-09-30");
    let board = engine.board(&project, None, 50).unwrap();
    assert_eq!(
        board["columns"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["items"].as_array().unwrap().len())
            .sum::<usize>(),
        1
    );
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
    let created = engine.mutate(Mutation { project_id: project.clone(), kind: Kind::Update, id: None, payload: json!({"id":id,"kind":"note","summary":"Later report","target":{"type":"project","id":project},"author":{"kind":"human","label":"Owner"}}), request_id:Uuid::now_v7().to_string(), epoch:engine.journal.epoch.clone(), expected:None }).unwrap();
    assert_eq!(created.http_status, 200);
    let second = response(engine.receipts(&payload, &request, &engine.journal.epoch));
    assert_eq!(second.http_status, 404);
    assert_eq!(
        engine.get(&project, Kind::Update, &id).unwrap()["read"],
        false
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

#[test]
fn attention_project_filter_applies_before_pagination() {
    let env = Environment::new();
    let engine = env.engine();
    let first = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let second = register(&engine, other.to_str().unwrap());
    for project in [&first, &second] {
        let card = create(&engine, project, "Needs review");
        let resource = &card.body["result"]["resource"];
        patch(
            &engine,
            project,
            resource["metadata"]["id"].as_str().unwrap(),
            resource["version"].as_str().unwrap(),
            json!({"set":{"status":"review"}}),
        );
    }
    let page = engine
        .attention_project(Some(&second), None, 1, now_millis())
        .unwrap();
    wire::validate("AttentionPage", &page).unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    assert_eq!(page["items"][0]["project_id"], second);
    assert!(page["page"]["next_cursor"].is_null());
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

#[test]
fn git_observer_is_explicit_bounded_and_never_runs_repository_filters() {
    use std::process::Command;
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let missing = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &missing).unwrap();
    assert_eq!(missing["stale"], true);
    assert_eq!(missing["error"], "NOT_A_GIT_ROOT");
    let git = |args: &[&str]| {
        let output = Command::new("/usr/bin/git")
            .args(args)
            .current_dir(env.path())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    };
    git(&["init", "-b", "main"]);
    fs::write(env.root.join("project/code.txt"), "initial\n").unwrap();
    git(&["add", "-f", "code.txt", ".project"]);
    let unborn = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &unborn).unwrap();
    assert_eq!(unborn["staged_paths"], 1);
    assert_eq!(unborn["commit"], Value::Null);
    git(&[
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "Fixture",
    ]);
    fs::write(env.root.join("project/code.txt"), "staged\n").unwrap();
    git(&["add", "code.txt"]);
    fs::write(
        env.root.join("project/.gitattributes"),
        "*.txt filter=hostile diff=hostile\n",
    )
    .unwrap();
    git(&[
        "config",
        "filter.hostile.clean",
        "touch OBSERVER_EXECUTED; cat",
    ]);
    git(&["config", "diff.hostile.command", "touch OBSERVER_EXECUTED"]);
    git(&["config", "core.fsmonitor", "touch OBSERVER_EXECUTED"]);
    fs::write(env.root.join("project/code.txt"), "unstaged\n").unwrap();
    let observation = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &observation).unwrap();
    assert_eq!(observation["stale"], false, "{observation}");
    assert_eq!(observation["branch"], "main");
    assert_eq!(observation["staged_paths"], 1);
    assert_eq!(observation["working_tree_checked"], false);
    assert_eq!(observation["untracked_checked"], false);
    assert!(!env.root.join("project/OBSERVER_EXECUTED").exists());
    git(&["config", "--unset", "core.fsmonitor"]);
    let worktree = env.root.join("worktree");
    git(&[
        "worktree",
        "add",
        "--detach",
        worktree.to_str().unwrap(),
        "HEAD",
    ]);
    fs::remove_dir_all(worktree.join(".project")).unwrap();
    let worktree_id = register(&engine, worktree.to_str().unwrap());
    let detached = engine.git_observation(&worktree_id).unwrap();
    wire::validate("GitObservation", &detached).unwrap();
    assert_eq!(detached["stale"], false, "{detached}");
    assert_eq!(detached["branch"], Value::Null);
    assert!(detached["commit"].is_string());
    let child = env.root.join("project/nested");
    fs::create_dir(&child).unwrap();
    let nested = register(&engine, child.to_str().unwrap());
    assert_eq!(
        engine.git_observation(&nested).unwrap()["error"],
        "NOT_A_GIT_ROOT"
    );
}
