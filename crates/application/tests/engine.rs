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
