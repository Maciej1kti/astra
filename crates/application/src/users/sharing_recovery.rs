use super::*;
use crate::{
    journal::{Command, Target},
    workflow::Workflows,
    writer::{CommitPoint, Writer},
};
use project_store::StoreError;

fn interrupted_write(engine: &Engine, project: &str, source: &Value, stop: CommitPoint) -> Command {
    let command = Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.command_epoch().into(),
        method: "PATCH".into(),
        target: Target {
            project_id: project.into(),
            kind: Kind::Card,
            id: source["metadata"]["id"].as_str().unwrap().into(),
        },
        expected: Some(source["version"].as_str().unwrap().into()),
        payload: json!({"set":{"title":"Recovered title"}}),
    };
    let _gate = engine.gate.read().unwrap();
    let handle = engine.store(project).unwrap();
    let mut store = handle.lock().unwrap();
    let reply = Writer {
        journal: &engine.journal,
    }
    .execute_with(
        &mut store,
        &command,
        vec![],
        now_millis(),
        |old| {
            let mut next = old.unwrap().clone();
            next["metadata"]["title"] = json!("Recovered title");
            Ok(next)
        },
        |point| {
            if point == stop {
                Err(StoreError::Invalid("TEST_SHARED_INTERRUPTION"))
            } else {
                Ok(())
            }
        },
    )
    .unwrap();
    assert_eq!(reply.http_status, 202);
    command
}

#[test]
fn every_profile_blocks_peer_writes_for_prepared_blocked_and_review_source_intents() {
    for child_writer in [false, true] {
        for point in [
            CommitPoint::Prepared,
            CommitPoint::Renamed,
            CommitPoint::DirectorySynced,
        ] {
            let (temporary, users, second, project, _) = shared_setup();
            let (_, other) = users.select(Some(&second)).unwrap();
            let created = card(&users.owner, &project, false);
            let writer = if child_writer { &other } else { &users.owner };
            let peer = if child_writer { &users.owner } else { &other };
            let command = interrupted_write(writer, &project, &created, point);
            let id = created["metadata"]["id"].as_str().unwrap();
            let current = peer.get(&project, Kind::Card, id).unwrap();
            for state in ["prepared", "needs_review", "blocked"] {
                writer
                    .journal
                    .db()
                    .unwrap()
                    .execute(
                        "UPDATE commands SET state=?1 WHERE request_id=?2",
                        params![state, command.request_id],
                    )
                    .unwrap();
                let rejected = patch(
                    peer,
                    &project,
                    &current,
                    json!({"set":{"title":"Peer overwrite"}}),
                );
                assert_eq!(rejected.body["error"]["code"], "PROJECT_RECOVERY_REQUIRED");
                assert_eq!(peer.get(&project, Kind::Card, id).unwrap(), current);
            }
            drop(other);
            drop(users);
            let users = Users::open(
                Engine::open_for_service(&temporary.path().canonicalize().unwrap().join("state"))
                    .unwrap(),
                false,
            )
            .unwrap();
            let (_, other) = users.select(Some(&second)).unwrap();
            let writer = if child_writer { &other } else { &users.owner };
            let peer = if child_writer { &users.owner } else { &other };
            assert_eq!(
                writer
                    .command_status(&command.request_id, &command.epoch)
                    .unwrap()["state"],
                "committed"
            );
            let current = peer.get(&project, Kind::Card, id).unwrap();
            assert_eq!(current["metadata"]["title"], "Recovered title");
            assert_eq!(
                patch(
                    peer,
                    &project,
                    &current,
                    json!({"set":{"title":"After recovery"}})
                )
                .http_status,
                200
            );
        }
    }
}

#[test]
fn pending_peer_workflow_blocks_source_writes_until_all_profiles_recover() {
    let (temporary, users, second, project, _) = shared_setup();
    let (_, other) = users.select(Some(&second)).unwrap();
    let created = card(&users.owner, &project, false);
    let id = created["metadata"]["id"].as_str().unwrap();
    let plan = other.maintenance_plan(&json!({"operation":"normalize","project_id":project,"kind":"card","id":id,"expected_version":created["version"]})).unwrap();
    let request = Uuid::now_v7().to_string();
    let epoch = other.command_epoch().to_owned();
    {
        let _gate = other.gate.write().unwrap();
        let handle = other.store(&project).unwrap();
        let _store = handle.lock().unwrap();
        Workflows {
            journal: &other.journal,
        }
        .commit_with(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &epoch,
            now_millis(),
            |_| Err(AppError::Unavailable("Test interrupted workflow")),
        )
        .unwrap();
    }
    let current = users.owner.get(&project, Kind::Card, id).unwrap();
    assert_eq!(
        patch(
            &users.owner,
            &project,
            &current,
            json!({"set":{"title":"Do not overwrite workflow"}})
        )
        .body["error"]["code"],
        "PROJECT_RECOVERY_REQUIRED"
    );
    drop(other);
    drop(users);
    let users = Users::open(
        Engine::open_for_service(&temporary.path().canonicalize().unwrap().join("state")).unwrap(),
        false,
    )
    .unwrap();
    let (_, other) = users.select(Some(&second)).unwrap();
    assert_eq!(
        other.command_status(&request, &epoch).unwrap()["state"],
        "committed"
    );
    assert_eq!(
        patch(
            &users.owner,
            &project,
            &current,
            json!({"set":{"title":"Recovered workflow"}})
        )
        .http_status,
        200
    );
}

#[test]
fn shared_source_fault_child() {
    let Ok(data) = std::env::var("ASTRA_SHARED_FAULT_DATA") else {
        return;
    };
    let user = std::env::var("ASTRA_SHARED_FAULT_USER").unwrap();
    let project = std::env::var("ASTRA_SHARED_FAULT_PROJECT").unwrap();
    let card = std::env::var("ASTRA_SHARED_FAULT_CARD").unwrap();
    let request = std::env::var("ASTRA_SHARED_FAULT_REQUEST").unwrap();
    let stop = std::env::var("ASTRA_SHARED_FAULT_POINT").unwrap();
    let users = Users::open(Engine::open_for_service(Path::new(&data)).unwrap(), false).unwrap();
    let (_, engine) = users.select(Some(&user)).unwrap();
    let current = engine.get(&project, Kind::Card, &card).unwrap();
    let command = Command {
        request_id: request,
        epoch: engine.command_epoch().into(),
        method: "PATCH".into(),
        target: Target {
            project_id: project.clone(),
            kind: Kind::Card,
            id: card,
        },
        expected: Some(current["version"].as_str().unwrap().into()),
        payload: json!({"set":{"title":"After hard stop"}}),
    };
    let _gate = engine.gate.read().unwrap();
    let handle = engine.store(&project).unwrap();
    let mut store = handle.lock().unwrap();
    Writer {
        journal: &engine.journal,
    }
    .execute_with(
        &mut store,
        &command,
        vec![],
        now_millis(),
        |old| {
            let mut next = old.unwrap().clone();
            next["metadata"]["title"] = json!("After hard stop");
            Ok(next)
        },
        |point| {
            if format!("{point:?}") == stop {
                std::process::exit(91)
            }
            Ok(())
        },
    )
    .unwrap();
    panic!("fault point was not reached");
}

#[test]
fn subprocess_shared_source_recovers_either_journal_without_destructor_flushes() {
    for child_writer in [false, true] {
        for point in ["Prepared", "Renamed", "DirectorySynced"] {
            let (temporary, users, second, project, path) = shared_setup();
            let created = card(&users.owner, &project, false);
            let card = created["metadata"]["id"].as_str().unwrap();
            let user = if child_writer {
                second.clone()
            } else {
                users.select(None).unwrap().0.id
            };
            let epoch = users
                .select(Some(&user))
                .unwrap()
                .1
                .command_epoch()
                .to_owned();
            let request = Uuid::now_v7().to_string();
            drop(users);
            let data = temporary.path().canonicalize().unwrap().join("state");
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "users::tests::sharing::recovery::shared_source_fault_child",
                    "--nocapture",
                ])
                .env("ASTRA_SHARED_FAULT_DATA", &data)
                .env("ASTRA_SHARED_FAULT_USER", &user)
                .env("ASTRA_SHARED_FAULT_PROJECT", &project)
                .env("ASTRA_SHARED_FAULT_CARD", card)
                .env("ASTRA_SHARED_FAULT_REQUEST", &request)
                .env("ASTRA_SHARED_FAULT_POINT", point)
                .output()
                .unwrap();
            assert_eq!(
                output.status.code(),
                Some(91),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            let users = Users::open(Engine::open_for_service(&data).unwrap(), false).unwrap();
            let (_, other) = users.select(Some(&second)).unwrap();
            let current = users.owner.get(&project, Kind::Card, card).unwrap();
            assert_eq!(current["metadata"]["title"], "After hard stop");
            assert_eq!(other.get(&project, Kind::Card, card).unwrap(), current);
            let (_, writer) = users.select(Some(&user)).unwrap();
            assert_eq!(
                writer.command_status(&request, &epoch).unwrap()["state"],
                "committed"
            );
            assert!(ProjectStore::open(&path, false).is_err());
        }
    }
}

#[test]
fn lexical_shared_folder_alias_recovers_after_first_profile_unregisters() {
    let (temporary, users) = setup();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let path = root.child("shared", true).unwrap();
    let alias = format!("{}/./shared", root.path().display());
    let project = register(&users.owner, Path::new(&alias), "Exercise");
    let created = card(&users.owner, &project, false);
    let second = create(&users, "Tomek");
    share(&users, &second, path.path());
    let (_, other) = users.select(Some(&second)).unwrap();
    unregister(&users.owner, &project);
    let command = interrupted_write(&other, &project, &created, CommitPoint::Prepared);
    drop(other);
    drop(users);
    let users = Users::open(
        Engine::open_for_service(&root.path().join("state")).unwrap(),
        false,
    )
    .unwrap();
    let (_, other) = users.select(Some(&second)).unwrap();
    assert_eq!(
        other
            .command_status(&command.request_id, &command.epoch)
            .unwrap()["state"],
        "committed"
    );
    assert_eq!(
        other
            .get(
                &project,
                Kind::Card,
                created["metadata"]["id"].as_str().unwrap()
            )
            .unwrap()["metadata"]["title"],
        "Recovered title"
    );
}

#[test]
fn unresolved_child_recovery_keeps_shared_source_blocked_after_restart() {
    let (temporary, users, second, project, path) = shared_setup();
    let (_, other) = users.select(Some(&second)).unwrap();
    let created = card(&users.owner, &project, false);
    let command = interrupted_write(&other, &project, &created, CommitPoint::Prepared);
    let id = created["metadata"]["id"].as_str().unwrap();
    let file = path.join(format!(".project/cards/{id}.json"));
    let mut external: Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    external["metadata"]["title"] = json!("Keep external edit");
    std::fs::write(&file, serde_json::to_vec(&external).unwrap()).unwrap();
    drop(other);
    drop(users);
    let users = Users::open(
        Engine::open_for_service(&temporary.path().canonicalize().unwrap().join("state")).unwrap(),
        false,
    )
    .unwrap();
    let (_, other) = users.select(Some(&second)).unwrap();
    assert_eq!(
        other
            .command_status(&command.request_id, &command.epoch)
            .unwrap()["state"],
        "needs_review"
    );
    let current = users.owner.get(&project, Kind::Card, id).unwrap();
    assert_eq!(current["metadata"]["title"], "Keep external edit");
    assert_eq!(
        patch(
            &users.owner,
            &project,
            &current,
            json!({"set":{"title":"Do not overwrite unresolved recovery"}})
        )
        .body["error"]["code"],
        "PROJECT_RECOVERY_REQUIRED"
    );
    assert_eq!(users.owner.get(&project, Kind::Card, id).unwrap(), current);
}
