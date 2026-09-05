use project_application::{
    Reply, instant,
    journal::{Command, Journal, Reference, Target},
    now_millis,
    writer::{CommitPoint, Writer},
};
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{Directory, ProjectStore},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    process,
};
use uuid::Uuid;

const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
const CARD: &str = "22222222-2222-4222-8222-222222222222";
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
    fn open(&self) -> (Journal, ProjectStore) {
        open(&self.root)
    }
}
fn open(root: &Path) -> (Journal, ProjectStore) {
    (
        Journal::open(&root.join("state")).unwrap(),
        ProjectStore::open(&root.join("project"), true).unwrap(),
    )
}
fn command(journal: &Journal, expected: Option<String>) -> Command {
    Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: journal.epoch.clone(),
        method: if expected.is_some() { "PATCH" } else { "POST" }.into(),
        target: Target {
            project_id: PROJECT.into(),
            kind: Kind::Project,
            id: PROJECT.into(),
        },
        expected,
        payload: json!({"name":"After recovery"}),
    }
}
fn project(now: i64) -> Value {
    json!({"type":"project","metadata":{"schema_version":1,"id":PROJECT,"name":"Initial","state":"active","created_at":instant(now-10_000),"updated_at":instant(now-10_000)},"body":"# Outcome\n\nPreserve this body.\n"})
}
fn create(journal: &Journal, store: &mut ProjectStore) -> Reply {
    Writer { journal }
        .execute(store, &command(journal, None), vec![], now_millis(), |_| {
            Ok(project(now_millis()))
        })
        .unwrap()
}
fn source(store: &ProjectStore) -> Vec<u8> {
    let (dir, name) = store.location(Kind::Project, PROJECT, false).unwrap();
    dir.read(&name).unwrap().unwrap()
}
fn rename(previous: Option<&Value>) -> Result<Value, Reply> {
    let mut next = previous.unwrap().clone();
    next["metadata"]["name"] = json!("After recovery");
    Ok(next)
}
fn assert_contract(reply: &Reply, definition: &str) {
    let spec: Value =
        serde_json::from_str(include_str!("../../../contracts/openapi.generated.json")).unwrap();
    let schema = json!({"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":format!("#/components/schemas/{definition}"),"components":spec["components"]});
    let validator = jsonschema::draft202012::options()
        .should_validate_formats(true)
        .build(&schema)
        .unwrap();
    assert!(
        validator.is_valid(&reply.body),
        "{:?}",
        validator
            .iter_errors(&reply.body)
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
    );
}

#[test]
fn committed_conflicts_replays_and_noops_follow_the_contract() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    let created = create(&journal, &mut store);
    assert_contract(&created, "CommandResponse");
    let initial = source(&store);
    let cmd = command(&journal, Some(document::version(&initial)));
    let reply = Writer { journal: &journal }
        .execute(&mut store, &cmd, vec![], now_millis(), rename)
        .unwrap();
    assert_contract(&reply, "CommandResponse");
    let replay = Writer { journal: &journal }
        .execute(&mut store, &cmd, vec![], now_millis(), |_| {
            panic!("retry must not rebuild intent")
        })
        .unwrap();
    assert_eq!(replay.body["replayed"], true);
    let mut changed = cmd.clone();
    changed.payload = json!({"name":"different intent"});
    let rejected = Writer { journal: &journal }
        .execute(&mut store, &changed, vec![], now_millis(), rename)
        .unwrap();
    assert_eq!(rejected.body["error"]["code"], "IDEMPOTENCY_KEY_REUSED");
    assert_contract(&rejected, "Error");
    let stale = command(&journal, Some(document::version(&initial)));
    let rejected = Writer { journal: &journal }
        .execute(&mut store, &stale, vec![], now_millis(), rename)
        .unwrap();
    assert_eq!(rejected.http_status, 412);
    assert_contract(&rejected, "Error");
    let current = source(&store);
    let noop = command(&journal, Some(document::version(&current)));
    let reply = Writer { journal: &journal }
        .execute(&mut store, &noop, vec![], now_millis() + 1000, |old| {
            Ok(old.unwrap().clone())
        })
        .unwrap();
    assert_eq!(reply.body["status"], "noop");
    assert_contract(&reply, "CommandResponse");
    assert_eq!(source(&store), current);
    let count: i64 = journal
        .db()
        .unwrap()
        .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 2, "no-op and retries do not append history");
}

#[test]
fn missing_precondition_and_invalid_source_never_write() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    create(&journal, &mut store);
    let before = source(&store);
    let mut cmd = command(&journal, None);
    cmd.method = "PATCH".into();
    let reply = Writer { journal: &journal }
        .execute(&mut store, &cmd, vec![], now_millis(), rename)
        .unwrap();
    assert_eq!(reply.http_status, 428);
    assert_eq!(source(&store), before);
    fs::write(
        store.directory.path().join("project.md"),
        b"invalid YAML source",
    )
    .unwrap();
    let cmd = command(&journal, Some(document::version(b"invalid YAML source")));
    let reply = Writer { journal: &journal }
        .execute(&mut store, &cmd, vec![], now_millis(), rename)
        .unwrap();
    assert_eq!(reply.body["error"]["code"], "DOCUMENT_INVALID");
    assert_eq!(source(&store), b"invalid YAML source");
}

#[test]
fn unknown_expired_ids_and_old_epochs_are_never_reexecuted() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    create(&journal, &mut store);
    let now = now_millis();
    let timestamp_id = |millis: i64| {
        format!(
            "{:08x}-{:04x}-7000-8000-000000000001",
            millis >> 16,
            millis & 65535
        )
    };
    let mut cmd = command(&journal, Some(document::version(&source(&store))));
    cmd.request_id = timestamp_id(now - 86_400_001);
    assert_eq!(
        journal.admit(&cmd, now).unwrap().unwrap().body["error"]["code"],
        "REQUEST_OUTSIDE_WINDOW"
    );
    cmd.request_id = timestamp_id(now + 300_001);
    assert_eq!(
        journal.admit(&cmd, now).unwrap().unwrap().body["error"]["code"],
        "REQUEST_OUTSIDE_WINDOW"
    );
    cmd.request_id = Uuid::now_v7().to_string();
    cmd.epoch = Uuid::new_v4().to_string();
    assert_eq!(
        journal.admit(&cmd, now).unwrap().unwrap().body["error"]["code"],
        "EPOCH_CHANGED"
    );
    cmd.epoch = journal.epoch.clone();
    assert_eq!(
        journal.admit(&cmd, now - 400_000).unwrap().unwrap().body["error"]["code"],
        "CLOCK_ROLLBACK"
    );
}

#[test]
fn subprocess_crashes_at_every_durability_boundary_recover_once() {
    for point in [
        "Prepared",
        "TempWritten",
        "TempSynced",
        "Renamed",
        "DirectorySynced",
        "Committed",
    ] {
        let env = Environment::new();
        let (journal, mut store) = env.open();
        create(&journal, &mut store);
        let epoch = journal.epoch.clone();
        let cmd = command(&journal, Some(document::version(&source(&store))));
        fs::write(
            env.root.join("command.json"),
            serde_json::to_vec(&cmd).unwrap(),
        )
        .unwrap();
        drop(store);
        drop(journal);
        let status = process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "fault_child", "--nocapture"])
            .env("ASTRA_FAULT_HOME", &env.root)
            .env("ASTRA_FAULT_POINT", point)
            .stdout(process::Stdio::null())
            .stderr(process::Stdio::null())
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(77), "{point}");
        let (journal, mut store) = env.open();
        assert_eq!(journal.epoch, epoch);
        assert_eq!(
            Writer { journal: &journal }
                .recover(&mut store, PROJECT, now_millis())
                .unwrap(),
            if point == "Committed" { 0 } else { 1 },
            "{point}"
        );
        let parsed = document::parse(Kind::Project, Some(PROJECT), &source(&store)).unwrap();
        assert_eq!(parsed.value()["metadata"]["name"], "After recovery");
        let retry = Writer { journal: &journal }
            .execute(&mut store, &cmd, vec![], now_millis(), |_| {
                panic!("must replay")
            })
            .unwrap();
        assert_eq!(retry.body["replayed"], true);
        assert_contract(&retry, "CommandResponse");
        assert!(!journal.has_pending(PROJECT).unwrap());
        let count: i64 = journal
            .db()
            .unwrap()
            .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}

#[test]
fn fault_child() {
    let Some(root) = std::env::var_os("ASTRA_FAULT_HOME") else {
        return;
    };
    let root = PathBuf::from(root);
    let point = std::env::var("ASTRA_FAULT_POINT").unwrap();
    let cmd: Command =
        serde_json::from_slice(&fs::read(root.join("command.json")).unwrap()).unwrap();
    let (journal, mut store) = open(&root);
    Writer { journal: &journal }
        .execute_with(&mut store, &cmd, vec![], now_millis(), rename, |reached| {
            if format!("{reached:?}") == point {
                process::exit(77);
            }
            Ok(())
        })
        .unwrap();
    panic!("fault point was not reached");
}

#[test]
fn external_edits_after_prepared_are_not_overwritten() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    create(&journal, &mut store);
    let cmd = command(&journal, Some(document::version(&source(&store))));
    let reply = Writer { journal: &journal }
        .execute_with(&mut store, &cmd, vec![], now_millis(), rename, |point| {
            if point == CommitPoint::Prepared {
                Err(StoreError::Invalid("INJECTED_FAILURE"))
            } else {
                Ok(())
            }
        })
        .unwrap();
    assert_eq!(reply.http_status, 202);
    assert_contract(&reply, "CommandStatus");
    fs::write(
        store.directory.path().join("project.md"),
        b"external edit must survive",
    )
    .unwrap();
    assert_eq!(
        Writer { journal: &journal }
            .recover(&mut store, PROJECT, now_millis())
            .unwrap(),
        0
    );
    assert_eq!(journal.state(&cmd).unwrap(), "needs_review");
    assert_eq!(source(&store), b"external edit must survive");
}

#[test]
fn recovery_rechecks_dependencies_even_when_target_is_unchanged() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    create(&journal, &mut store);
    let (dir, name) = store.location(Kind::Card, CARD, true).unwrap();
    dir.replace(&name, b"initial reference", None).unwrap();
    let references = vec![Reference {
        kind: Kind::Card,
        id: CARD.into(),
        version: Some(document::version(b"initial reference")),
    }];
    let cmd = command(&journal, Some(document::version(&source(&store))));
    let original = source(&store);
    Writer { journal: &journal }
        .execute_with(
            &mut store,
            &cmd,
            references,
            now_millis(),
            rename,
            |point| {
                if point == CommitPoint::Prepared {
                    Err(StoreError::Invalid("INJECTED_FAILURE"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    dir.replace(
        &name,
        b"changed reference",
        Some(&document::version(b"initial reference")),
    )
    .unwrap();
    assert_eq!(
        Writer { journal: &journal }
            .recover(&mut store, PROJECT, now_millis())
            .unwrap(),
        0
    );
    assert_eq!(journal.state(&cmd).unwrap(), "needs_review");
    assert_eq!(source(&store), original);
}

#[test]
fn state_database_can_grow_beyond_document_limits_and_restart() {
    let env = Environment::new();
    let (journal, store) = env.open();
    journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO meta(key,value) VALUES('large_test',?1)",
            ["a".repeat(2 * 1024 * 1024)],
        )
        .unwrap();
    let epoch = journal.epoch.clone();
    drop(store);
    drop(journal);
    let (journal, _store) = env.open();
    assert_eq!(journal.epoch, epoch);
}

#[test]
fn invalid_request_ids_produce_valid_errors_and_state_loss_changes_epoch() {
    let env = Environment::new();
    let (journal, store) = env.open();
    assert!(
        Journal::open(&env.root.join("state")).is_err(),
        "one instance writer"
    );
    let mut cmd = command(&journal, None);
    for id in ["invalid", "01a0711e-3440-7123-c000-123456789abc"] {
        cmd.request_id = id.into();
        let reply = journal.admit(&cmd, now_millis()).unwrap().unwrap();
        assert_eq!(reply.http_status, 422);
        assert_contract(&reply, "Error");
    }
    cmd.request_id = Uuid::now_v7().to_string();
    let old_epoch = journal.epoch.clone();
    drop(store);
    drop(journal);
    fs::remove_file(env.root.join("state/state.sqlite")).unwrap();
    let (journal, _store) = env.open();
    assert_ne!(journal.epoch, old_epoch);
    assert_eq!(
        journal.admit(&cmd, now_millis()).unwrap().unwrap().body["error"]["code"],
        "EPOCH_CHANGED"
    );
}

#[test]
fn replacement_symlink_after_prepared_requires_review() {
    let env = Environment::new();
    let (journal, mut store) = env.open();
    create(&journal, &mut store);
    let cmd = command(&journal, Some(document::version(&source(&store))));
    Writer { journal: &journal }
        .execute_with(&mut store, &cmd, vec![], now_millis(), rename, |point| {
            if point == CommitPoint::Prepared {
                Err(StoreError::Invalid("INJECTED_FAILURE"))
            } else {
                Ok(())
            }
        })
        .unwrap();
    let target = store.directory.path().join("project.md");
    fs::remove_file(&target).unwrap();
    fs::write(env.root.join("outside"), b"untouchable").unwrap();
    std::os::unix::fs::symlink(env.root.join("outside"), &target).unwrap();
    assert_eq!(
        Writer { journal: &journal }
            .recover(&mut store, PROJECT, now_millis())
            .unwrap(),
        0
    );
    assert_eq!(journal.state(&cmd).unwrap(), "needs_review");
    assert_eq!(fs::read(env.root.join("outside")).unwrap(), b"untouchable");
}
