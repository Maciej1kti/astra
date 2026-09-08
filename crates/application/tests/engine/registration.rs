use super::*;

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
        json!(engine.workspace().unwrap().value)["projects"]
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
        json!(engine.workspace().unwrap().value)["projects"]
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
