use super::*;
use crate::Mutation;
use project_store::filesystem::ProjectStore;
use std::path::Path;

fn share(users: &Users, user: &str, path: &Path) -> String {
    let (_, engine) = users.select(Some(user)).unwrap();
    let plan = users
        .registration_plan(user, path.to_str().unwrap(), None, true)
        .unwrap();
    let reply = users
        .commit_registration(
            user,
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
        )
        .unwrap();
    assert_eq!(reply.http_status, 202, "{reply:?}");
    plan["project_id"].as_str().unwrap().into()
}
fn card(engine: &Engine, project: &str, pinned: bool) -> Value {
    let reply = engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Card,
            id: None,
            payload: json!({"title":"Push-ups"}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    let source = reply.body["result"]["resource"].clone();
    if pinned {
        let pinned = patch(engine, project, &source, json!({"set":{"pinned":true}}));
        assert_eq!(pinned.http_status, 200, "{pinned:?}");
        pinned.body["result"]["resource"].clone()
    } else {
        source
    }
}
fn patch(engine: &Engine, project: &str, source: &Value, payload: Value) -> Reply {
    engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Card,
            id: Some(source["metadata"]["id"].as_str().unwrap().into()),
            payload,
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            expected: Some(source["version"].as_str().unwrap().into()),
        })
        .unwrap()
}
fn unregister(engine: &Engine, project: &str) {
    let plan = engine.maintenance_plan(&json!({"operation":"unregister","project_id":project,"expected_workspace_version":engine.workspace().unwrap().version})).unwrap();
    let result = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
        )
        .unwrap();
    assert_eq!(result.http_status, 202, "{result:?}");
    assert!(
        engine
            .workspace()
            .unwrap()
            .value
            .projects
            .iter()
            .all(|p| p.project_id != project)
    );
}
fn shared_setup() -> (tempfile::TempDir, Users, String, String, std::path::PathBuf) {
    let (temporary, users) = setup();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let path = root.child("shared", true).unwrap();
    let project = register(&users.owner, path.path(), "Exercise");
    let second = create(&users, "Tomek");
    assert_eq!(share(&users, &second, path.path()), project);
    (temporary, users, second, project, path.path().to_owned())
}

#[test]
fn shared_source_counter_versions_replay_and_lease_survive_profile_restart() {
    let (temporary, users, second, project, path) = shared_setup();
    let (_, other) = users.select(Some(&second)).unwrap();
    assert!(Arc::ptr_eq(
        &users.owner.store(&project).unwrap(),
        &other.store(&project).unwrap()
    ));
    assert!(ProjectStore::open(&path, false).is_err());
    let created = card(&users.owner, &project, false);
    let configured = patch(
        &users.owner,
        &project,
        &created,
        json!({"configure_counter":{"name":"Push-ups","unit":"rep","step":1,"archived":false}}),
    );
    assert_eq!(configured.http_status, 200);
    let before = configured.body["result"]["resource"].clone();
    let id = before["metadata"]["id"].as_str().unwrap();
    assert_eq!(other.get(&project, Kind::Card, id).unwrap(), before);
    let command = Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: Some(id.into()),
        payload: json!({"record_counter":{"id":before["metadata"]["counters"][0]["id"],"date":"2026-10-04","value":1}}),
        request_id: Uuid::now_v7().to_string(),
        epoch: other.command_epoch().into(),
        expected: Some(before["version"].as_str().unwrap().into()),
    };
    let result = other.mutate(command.clone()).unwrap();
    assert_eq!(result.http_status, 200, "{result:?}");
    let current = users.owner.get(&project, Kind::Card, id).unwrap();
    assert_eq!(current, result.body["result"]["resource"]);
    assert_eq!(
        current["metadata"]["counters"][0]["values"]["2026-10-04"],
        1
    );
    assert_eq!(
        patch(
            &users.owner,
            &project,
            &before,
            json!({"set":{"title":"Stale overwrite"}})
        )
        .http_status,
        412
    );
    assert_eq!(
        other.mutate(command.clone()).unwrap().body["replayed"],
        true
    );
    assert!(
        users
            .owner
            .command_status(&command.request_id, &command.epoch)
            .is_err()
    );
    drop(other);
    drop(users);
    let users = Users::open(
        Engine::open_for_service(&temporary.path().canonicalize().unwrap().join("state")).unwrap(),
        false,
    )
    .unwrap();
    let (_, other) = users.select(Some(&second)).unwrap();
    assert_eq!(users.owner.get(&project, Kind::Card, id).unwrap(), current);
    assert_eq!(other.get(&project, Kind::Card, id).unwrap(), current);
    assert_eq!(other.mutate(command).unwrap().body["replayed"], true);
    unregister(&users.owner, &project);
    assert!(ProjectStore::open(&path, false).is_err());
    assert_eq!(
        patch(
            &other,
            &project,
            &current,
            json!({"set":{"title":"Still shared source"}})
        )
        .http_status,
        200
    );
    unregister(&other, &project);
    assert!(
        ProjectStore::open(&path, false).is_ok(),
        "Last membership releases the single writer lease"
    );
}

#[test]
fn sharing_blocks_source_deletion_and_relocation_including_preexisting_plans() {
    let (temporary, users) = setup();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let path = root.child("shared", true).unwrap();
    let project = register(&users.owner, path.path(), "Exercise");
    let deletion = users.owner.project_deletion_plan(&project).unwrap();
    let relocation = users.owner.maintenance_plan(&json!({"operation":"relocate","project_id":project,"new_absolute_path":format!("{}/.", path.path().display()),"expected_workspace_version":users.owner.workspace().unwrap().version})).unwrap();
    let second = create(&users, "Tomek");
    share(&users, &second, path.path());
    let AppError::Rejected(error) = users.owner.project_deletion_plan(&project).unwrap_err() else {
        panic!("Shared deletion must reject")
    };
    assert_eq!(error.body["error"]["code"], "PROJECT_SHARED");
    let request = Uuid::now_v7().to_string();
    let deleted = users
        .owner
        .delete_project(
            &project,
            json!({}),
            &request,
            users.owner.command_epoch(),
            Some(deletion["version"].as_str().unwrap().into()),
        )
        .unwrap();
    assert_eq!(deleted.body["error"]["code"], "PROJECT_SHARED");
    assert_eq!(
        users
            .owner
            .command_status(&request, users.owner.command_epoch())
            .unwrap()["state"],
        "rejected"
    );
    let request = Uuid::now_v7().to_string();
    let relocated = users
        .owner
        .commit_maintenance(
            relocation["plan_id"].as_str().unwrap(),
            &request,
            users.owner.command_epoch(),
        )
        .unwrap();
    assert_eq!(relocated.body["error"]["code"], "PROJECT_SHARED");
    assert_eq!(
        users
            .owner
            .command_status(&request, users.owner.command_epoch())
            .unwrap()["state"],
        "rejected"
    );
    assert!(path.path().join(".project/project.json").exists());
}

#[test]
fn shared_pin_admission_preserves_every_affected_workspace_limit() {
    let (temporary, users, second, project, _) = shared_setup();
    let (_, other) = users.select(Some(&second)).unwrap();
    let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
    let private = root.child("owner-private", true).unwrap();
    let private_project = register(&users.owner, private.path(), "Private");
    let template = card(&users.owner, &private_project, true);
    let mut source = template.clone();
    source.as_object_mut().unwrap().remove("version");
    for index in 0..98 {
        source["metadata"]["id"] = json!(Uuid::new_v4().to_string());
        source["metadata"]["position"] = json!(format!("{:032x}", index + 1));
        project_domain::validate_document(source.clone()).unwrap();
        std::fs::write(
            private.path().join(format!(
                ".project/cards/{}.json",
                source["metadata"]["id"].as_str().unwrap()
            )),
            serde_json::to_vec(&source).unwrap(),
        )
        .unwrap();
    }
    card(&users.owner, &project, true);
    let unpinned = card(&other, &project, false);
    let rejected = patch(&other, &project, &unpinned, json!({"set":{"pinned":true}}));
    assert_eq!(rejected.body["error"]["code"], "FOCUS_LIMIT");
    assert_eq!(
        other
            .get(
                &project,
                Kind::Card,
                unpinned["metadata"]["id"].as_str().unwrap()
            )
            .unwrap(),
        unpinned
    );
    let private_other = root.child("other-private", true).unwrap();
    let private_other_project = register(&other, private_other.path(), "Other private");
    card(&other, &private_other_project, true);
}

#[path = "sharing_recovery.rs"]
mod recovery;
