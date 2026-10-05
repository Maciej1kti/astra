//! A refused commit and a preview leave no operational state in a folder.
use super::*;
use project_store::filesystem::ProjectStore;

fn expire(engine: &Engine, plan: &Value) {
    let changed = engine
        .journal
        .db()
        .unwrap()
        .execute(
            "UPDATE workflow_plans SET plan_json=json_set(plan_json,'$.expires_at',0) WHERE id=?1",
            [plan["plan_id"].as_str().unwrap()],
        )
        .unwrap();
    assert_eq!(changed, 1);
}

fn code(reply: &Reply) -> &str {
    reply.body["error"]["code"].as_str().unwrap_or("")
}

fn commit_registration(engine: &Engine, plan: &Value) -> Reply {
    engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap()
}

fn commit_maintenance(engine: &Engine, plan: &Value) -> Reply {
    engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap()
}

#[test]
fn refused_registration_commit_creates_nothing_and_holds_no_lease() {
    let env = Environment::new();
    let engine = env.engine();
    let folder = env.root.join("project");

    let expired = engine
        .registration_plan(&env.path(), Some("Expired"), true)
        .unwrap();
    expire(&engine, &expired);
    let reply = commit_registration(&engine, &expired);
    assert_eq!(code(&reply), "PLAN_EXPIRED", "{reply:?}");
    assert!(
        !folder.join(".project").exists(),
        "an expired plan must not create operational state"
    );

    let stale = engine
        .registration_plan(&env.path(), Some("Stale"), true)
        .unwrap();
    fs::write(folder.join("AGENTS.md"), "Written after the preview\n").unwrap();
    let reply = commit_registration(&engine, &stale);
    assert_eq!(code(&reply), "PLAN_STALE", "{reply:?}");
    assert!(!folder.join(".project").exists());

    // An existing project folder gains no private state and no held lease.
    fs::remove_file(folder.join("AGENTS.md")).unwrap();
    let project = register(&engine, &env.path());
    let unregister = engine
        .maintenance_plan(&json!({
            "operation":"unregister","project_id":project,
            "expected_workspace_version":engine.workspace().unwrap().version
        }))
        .unwrap();
    assert_eq!(commit_maintenance(&engine, &unregister).http_status, 202);
    fs::remove_dir_all(folder.join(".project/.local")).unwrap();
    let again = engine.registration_plan(&env.path(), None, true).unwrap();
    expire(&engine, &again);
    let reply = commit_registration(&engine, &again);
    assert_eq!(code(&reply), "PLAN_EXPIRED", "{reply:?}");
    assert!(!folder.join(".project/.local").exists());
    // The folder is still free for a later registration in this process.
    assert_eq!(register(&engine, &env.path()), project);
}

#[test]
fn refusal_after_the_store_was_opened_releases_an_unregistered_folder() {
    let env = Environment::new();
    let engine = env.engine();
    let folder = env.root.join("project");
    let plan = engine
        .registration_plan(&env.path(), Some("Refused later"), true)
        .unwrap();
    // The plan is current, but its project is refused under the lease.
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,
                 target_id,received_at,expires_at)
             VALUES(?1,?2,'digest','needs_review','card',?3,?3,?4,?4)",
            rusqlite::params![
                engine.journal.epoch,
                Uuid::now_v7().to_string(),
                plan["project_id"].as_str().unwrap(),
                "2026-10-05T00:00:00.000Z"
            ],
        )
        .unwrap();
    let reply = commit_registration(&engine, &plan);
    assert_eq!(code(&reply), "PROJECT_RECOVERY_REQUIRED", "{reply:?}");
    // The lease is free for another process even though `.local` now exists.
    drop(ProjectStore::open(&folder, true).unwrap());
}

fn copy_project(env: &Environment, name: &str) -> PathBuf {
    let copy = env.root.join(name);
    fs::create_dir_all(copy.join(".project")).unwrap();
    fs::copy(
        env.root.join("project/.project/project.json"),
        copy.join(".project/project.json"),
    )
    .unwrap();
    copy
}

fn relocation(engine: &Engine, project: &str, destination: &std::path::Path) -> Value {
    engine
        .maintenance_plan(&json!({
            "operation": "relocate",
            "project_id": project,
            "new_absolute_path": destination,
            "expected_workspace_version": engine.workspace().unwrap().version,
        }))
        .unwrap()
}

#[test]
fn relocation_preview_is_read_only_and_a_refused_commit_leases_nothing() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Stays readable");
    let id = card.body["result"]["id"].as_str().unwrap();
    let current = env.root.join("project");
    let copy = copy_project(&env, "copy");

    let plan = relocation(&engine, &project, &copy);
    assert!(
        !copy.join(".project/.local").exists(),
        "a preview must not create state at the new path"
    );
    // The registered folder keeps its writer lease and stays usable.
    assert!(ProjectStore::open(&current, false).is_err());
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["title"],
        "Stays readable"
    );

    expire(&engine, &plan);
    let reply = commit_maintenance(&engine, &plan);
    assert_eq!(code(&reply), "PLAN_EXPIRED", "{reply:?}");
    assert!(!copy.join(".project/.local").exists());
    assert!(ProjectStore::open(&current, false).is_err());

    // An accepted relocation still moves the lease to the new folder.
    let plan = relocation(&engine, &project, &copy);
    let reply = commit_maintenance(&engine, &plan);
    assert_eq!(reply.http_status, 202, "{reply:?}");
    assert_eq!(
        engine.job(reply.body["job_id"].as_str().unwrap()).unwrap()["state"],
        "done"
    );
    assert_eq!(
        engine.workspace().unwrap().value.projects[0].path,
        copy.to_str().unwrap()
    );
    assert!(engine.get(&project, Kind::Project, &project).is_ok());
    assert!(ProjectStore::open(&copy, false).is_err());
    drop(ProjectStore::open(&current, false).unwrap());
}
