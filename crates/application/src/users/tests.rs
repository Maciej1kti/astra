use super::*;
use crate::Query;
use project_store::document::Kind;
use uuid::Uuid;

fn setup() -> (tempfile::TempDir, Users) {
    let temporary = tempfile::tempdir().unwrap();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let users = Users::open(engine, false).unwrap();
    (temporary, users)
}
fn create(users: &Users, name: &str) -> String {
    let id = Uuid::new_v4().to_string();
    let reply = users
        .create(
            &json!({"id":id,"name":name}),
            &Uuid::now_v7().to_string(),
            users.owner.command_epoch(),
        )
        .unwrap();
    assert_eq!(reply.http_status, 201);
    id
}
fn register(engine: &Engine, path: &std::path::Path, name: &str) -> String {
    let plan = engine
        .registration_plan(path.to_str().unwrap(), Some(name), true)
        .unwrap();
    let reply = engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
        )
        .unwrap();
    assert!(reply.http_status < 300, "{reply:?}");
    plan["project_id"].as_str().unwrap().into()
}

#[test]
fn profiles_preserve_owner_state_and_isolate_roots_queries_settings_and_commands() {
    let (temporary, users) = setup();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let alice_directory = root.child("alice-project", true).unwrap();
    let bob_directory = root.child("bob-project", true).unwrap();
    let alice = users.owner.clone();
    let initial = alice.workspace().unwrap();
    let old_epoch = alice.command_epoch().to_owned();
    let alice_project = register(&alice, alice_directory.path(), "Alice project");
    let id = create(&users, "Bob");
    let (profile, bob) = users.select(Some(&id)).unwrap();
    assert_eq!(profile.name, "Bob");
    assert_eq!(bob.workspace().unwrap().value.instance_id, id);
    assert_ne!(old_epoch, bob.command_epoch());
    let bob_project = register(&bob, bob_directory.path(), "Bob project");
    alice
        .add_root(alice_directory.path().to_str().unwrap(), "Alice files")
        .unwrap();
    assert_eq!(alice.roots().unwrap()["items"].as_array().unwrap().len(), 1);
    assert_eq!(bob.roots().unwrap()["items"], json!([]));
    assert_eq!(
        alice.list(Some("project"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        bob.list(Some("project"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        alice
            .get(&bob_project, Kind::Project, &bob_project)
            .is_err()
    );
    assert!(
        bob.get(&alice_project, Kind::Project, &alice_project)
            .is_err()
    );
    let version = bob.workspace().unwrap().version;
    let request = Uuid::now_v7().to_string();
    let changed = bob
        .mutate_workspace(
            "preferences",
            &json!({"timezone":"UTC"}),
            &request,
            bob.command_epoch(),
            Some(&version),
        )
        .unwrap();
    assert_eq!(changed.http_status, 200);
    assert_eq!(
        alice.workspace().unwrap().value.timezone,
        initial.value.timezone
    );
    assert_eq!(bob.workspace().unwrap().value.timezone, "UTC");
    assert!(alice.command_status(&request, bob.command_epoch()).is_err());
    assert_eq!(
        bob.command_status(&request, bob.command_epoch()).unwrap()["state"],
        "committed"
    );
    assert_eq!(alice.command_epoch(), old_epoch);
    assert_eq!(
        alice.workspace().unwrap().value.instance_id,
        initial.value.instance_id
    );
    assert_eq!(
        users
            .registration_plan(&id, alice_directory.path().to_str().unwrap(), None, true)
            .unwrap()["project_id"],
        alice_project
    );
}

#[test]
fn profile_creation_replays_original_command_and_rejects_identity_reuse() {
    let (_temporary, users) = setup();
    let id = Uuid::new_v4().to_string();
    let request = Uuid::now_v7().to_string();
    let payload = json!({"id":id,"name":"Bob"});
    let epoch = users.owner.command_epoch();
    let created = users.create(&payload, &request, epoch).unwrap();
    let replay = users.create(&payload, &request, epoch).unwrap();
    assert_eq!(created.body["result"], replay.body["result"]);
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(replay.body["result"]["resource"]["id"], id);
    assert_eq!(
        users.list(&id).unwrap()["items"].as_array().unwrap().len(),
        2
    );
    assert_eq!(
        users.owner.command_status(&request, epoch).unwrap()["state"],
        "committed"
    );
    let altered = users
        .create(&json!({"id":id,"name":"Changed"}), &request, epoch)
        .unwrap();
    assert_eq!(altered.body["error"]["code"], "IDEMPOTENCY_KEY_REUSED");
    let duplicate = users
        .create(&payload, &Uuid::now_v7().to_string(), epoch)
        .unwrap();
    assert_eq!(duplicate.body["error"]["code"], "USER_ALREADY_EXISTS");
    assert!(users.select(Some("../state")).is_err());
    assert!(users.select(Some(&Uuid::new_v4().to_string())).is_err());
}

#[test]
fn profile_creation_recovers_each_durable_boundary_without_changing_identity() {
    for stopped_at in ["prepared", "initialized", "committed"] {
        let (temporary, users) = setup();
        let root = temporary.path().canonicalize().unwrap();
        let epoch = users.owner.command_epoch().to_owned();
        let id = Uuid::new_v4().to_string();
        let request = Uuid::now_v7().to_string();
        let payload = json!({"id":id,"name":"Recovered"});
        assert!(
            users
                .create_with(&payload, &request, &epoch, |point| {
                    if point == stopped_at {
                        Err(AppError::Unavailable("test creation interruption"))
                    } else {
                        Ok(())
                    }
                })
                .is_err()
        );
        drop(users);
        let users = Users::open(
            Engine::open_for_service(&root.join("state")).unwrap(),
            false,
        )
        .unwrap();
        let (_, engine) = users.select(Some(&id)).unwrap();
        assert_eq!(engine.workspace().unwrap().value.instance_id, id);
        let replay = users.create(&payload, &request, &epoch).unwrap();
        assert_eq!(replay.http_status, 201);
        assert_eq!(replay.body["replayed"], true);
        assert_eq!(users.owner.command_epoch(), epoch);
        assert_eq!(
            users.list(&id).unwrap()["items"].as_array().unwrap().len(),
            2
        );
    }
}

#[test]
fn same_process_retry_resumes_prepared_creation() {
    let (_temporary, users) = setup();
    let request = Uuid::now_v7().to_string();
    let payload = json!({"id":Uuid::new_v4().to_string(),"name":"Retry"});
    let epoch = users.owner.command_epoch();
    assert!(
        users
            .create_with(&payload, &request, epoch, |point| {
                if point == "initialized" {
                    Err(AppError::Unavailable("test creation interruption"))
                } else {
                    Ok(())
                }
            })
            .is_err()
    );
    assert_eq!(
        users.create(&payload, &request, epoch).unwrap().body["replayed"],
        true
    );
}

#[test]
fn published_profile_state_is_not_recreated_when_missing() {
    for missing in ["state.sqlite", "workspace.json"] {
        let (temporary, users) = setup();
        let id = create(&users, "Retained");
        drop(users);
        let root = temporary.path().canonicalize().unwrap();
        let file = root.join("state/users").join(&id).join(missing);
        std::fs::remove_file(&file).unwrap();
        assert!(
            Users::open(
                Engine::open_for_service(&root.join("state")).unwrap(),
                false
            )
            .is_err()
        );
        assert!(!file.exists());
    }
}

#[test]
fn restore_rotates_every_profile_epoch_and_retains_user_identity() {
    let (temporary, users) = setup();
    let id = create(&users, "Retained");
    let old = users
        .select(Some(&id))
        .unwrap()
        .1
        .command_epoch()
        .to_owned();
    let old_owner = users.owner.command_epoch().to_owned();
    drop(users);
    let root = temporary.path().canonicalize().unwrap();
    let users = Users::open(Engine::open_for_service(&root.join("state")).unwrap(), true).unwrap();
    assert_ne!(users.owner.command_epoch(), old_owner);
    assert_ne!(users.select(Some(&id)).unwrap().1.command_epoch(), old);
    assert_eq!(users.select(Some(&id)).unwrap().0.name, "Retained");
}

#[test]
fn folder_reservations_are_rechecked_at_commit_and_before_relocation() {
    let (temporary, users) = setup();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let shared = root.child("registered", true).unwrap();
    let own = root.child("second", true).unwrap();
    let first = users.select(None).unwrap().0.id;
    let second = create(&users, "Second");
    let other = users.select(Some(&second)).unwrap().1;
    let stale_plan = users
        .registration_plan(
            &second,
            shared.path().to_str().unwrap(),
            Some("First candidate"),
            true,
        )
        .unwrap();
    let plan = users
        .registration_plan(
            &first,
            shared.path().to_str().unwrap(),
            Some("Owner project"),
            true,
        )
        .unwrap();
    assert!(
        users
            .commit_registration(
                &first,
                plan["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch()
            )
            .unwrap()
            .http_status
            < 300
    );
    let request = Uuid::now_v7().to_string();
    let rejected = users
        .commit_registration(
            &second,
            stale_plan["plan_id"].as_str().unwrap(),
            &request,
            other.command_epoch(),
        )
        .unwrap();
    assert_eq!(rejected.http_status, 409);
    assert_eq!(rejected.body["error"]["code"], "PLAN_STALE");
    assert_eq!(
        other
            .command_status(&request, other.command_epoch())
            .unwrap()["state"],
        "rejected"
    );
    let project = register(&other, own.path(), "Second project");
    let error = users.maintenance_plan(&second, &json!({"operation":"relocate","project_id":project,"new_absolute_path":shared.path(),"expected_workspace_version":other.workspace().unwrap().version})).unwrap_err();
    assert!(
        matches!(error, AppError::Rejected(reply) if reply.body["error"]["code"] == "PROJECT_SHARED")
    );
    let nested = shared
        .child(".project", false)
        .unwrap()
        .child("nested", true)
        .unwrap();
    let error = users
        .registration_plan(
            &second,
            nested.path().to_str().unwrap(),
            Some("Nested"),
            true,
        )
        .unwrap_err();
    assert!(
        matches!(error, AppError::Rejected(reply) if reply.body["error"]["code"] == "PROJECT_IN_USE")
    );
}

#[test]
fn existing_owner_upgrade_keeps_source_registry_auth_and_epoch() {
    let temporary = tempfile::tempdir().unwrap();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let project = root.child("existing", true).unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let project_id = register(&engine, project.path(), "Existing project");
    let epoch = engine.command_epoch().to_owned();
    let workspace = engine.workspace().unwrap();
    let now = now_millis();
    let pending = engine
        .auth()
        .start(&json!({"device_label":"Existing device"}), now)
        .unwrap();
    engine
        .auth()
        .decide(
            pending.view["id"].as_str().unwrap(),
            pending.view["challenge"].as_str().unwrap(),
            true,
            now,
        )
        .unwrap();
    let claimed = engine
        .auth()
        .claim(
            &pending.pending_token,
            pending.view["pending_csrf_token"].as_str().unwrap(),
            now,
        )
        .unwrap();
    drop(engine);
    let db = rusqlite::Connection::open(state.path().join("state.sqlite")).unwrap();
    db.execute_batch(
        "DROP TABLE user_creation_intents; DROP TABLE user_profiles; PRAGMA user_version=2;",
    )
    .unwrap();
    drop(db);
    let users = Users::open(Engine::open_for_service(state.path()).unwrap(), false).unwrap();
    assert_eq!(users.owner.command_epoch(), epoch);
    assert_eq!(users.owner.workspace().unwrap().version, workspace.version);
    assert_eq!(
        users.select(None).unwrap().0.id,
        workspace.value.instance_id
    );
    assert_eq!(
        users
            .owner
            .auth()
            .authenticate(&claimed.session_token, now + 1000)
            .unwrap()
            .view["id"],
        claimed.view["id"]
    );
    assert_eq!(
        users
            .owner
            .get(&project_id, Kind::Project, &project_id)
            .unwrap()["metadata"]["name"],
        "Existing project"
    );
}

#[test]
fn profile_creation_fault_child() {
    let Ok(data) = std::env::var("ASTRA_USER_FAULT_DATA") else {
        return;
    };
    let point = std::env::var("ASTRA_USER_FAULT_POINT").unwrap();
    let payload: Value =
        serde_json::from_str(&std::env::var("ASTRA_USER_FAULT_PAYLOAD").unwrap()).unwrap();
    let request = std::env::var("ASTRA_USER_FAULT_REQUEST").unwrap();
    let users = Users::open(
        Engine::open_for_service(std::path::Path::new(&data)).unwrap(),
        false,
    )
    .unwrap();
    users
        .create_with(&payload, &request, users.owner.command_epoch(), |current| {
            if current == point {
                std::process::exit(91);
            }
            Ok(())
        })
        .unwrap();
    panic!("fault point was not reached");
}

#[test]
fn subprocess_profile_creation_recovers_without_destructor_flushes() {
    for point in ["prepared", "initialized", "committed"] {
        let (temporary, users) = setup();
        let epoch = users.owner.command_epoch().to_owned();
        drop(users);
        let data = temporary.path().canonicalize().unwrap().join("state");
        let request = Uuid::now_v7().to_string();
        let id = Uuid::new_v4().to_string();
        let payload = json!({"id":id,"name":"Crash recovery"});
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "users::tests::profile_creation_fault_child",
                "--nocapture",
            ])
            .env("ASTRA_USER_FAULT_DATA", &data)
            .env("ASTRA_USER_FAULT_POINT", point)
            .env("ASTRA_USER_FAULT_PAYLOAD", payload.to_string())
            .env("ASTRA_USER_FAULT_REQUEST", &request)
            .output()
            .unwrap();
        assert_eq!(
            output.status.code(),
            Some(91),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let users = Users::open(Engine::open_for_service(&data).unwrap(), false).unwrap();
        assert_eq!(users.select(Some(&id)).unwrap().0.name, "Crash recovery");
        let replay = users.create(&payload, &request, &epoch).unwrap();
        assert_eq!(replay.http_status, 201);
        assert_eq!(replay.body["replayed"], true);
        assert_eq!(
            users.list(&id).unwrap()["items"].as_array().unwrap().len(),
            2
        );
    }
}

#[path = "sharing.rs"]
mod sharing;
