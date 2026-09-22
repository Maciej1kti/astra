use project_application::{AppError, Mutation, Query, Reply, engine::Engine, wire};
use project_store::{
    document::Kind,
    filesystem::Directory,
    tree_removal::{self, EntryKind},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    os::unix::fs::symlink,
    path::{Path, PathBuf},
    process,
};
use uuid::Uuid;

struct Environment {
    _temp: tempfile::TempDir,
    root: PathBuf,
}

impl Environment {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let state = Directory::open(&root).unwrap();
        state.child("state", true).unwrap();
        state.child("project", true).unwrap();
        Self { _temp: temp, root }
    }

    fn engine(&self) -> Engine {
        Engine::open(&self.root.join("state")).unwrap()
    }

    fn project_path(&self) -> PathBuf {
        self.root.join("project")
    }

    fn project_text_path(&self, suffix: &str) -> PathBuf {
        self.project_path().join(".project").join(suffix)
    }
}

fn register(engine: &Engine, path: &Path) -> String {
    let path = path.to_str().unwrap();
    let plan = engine
        .registration_plan(path, Some("Deletion test project"), true)
        .unwrap();
    let reply = engine
        .commit_registration(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.body["status"], "running");
    let job = engine.job(reply.body["job_id"].as_str().unwrap()).unwrap();
    assert_eq!(job["state"], "done", "{job}");
    plan["project_id"].as_str().unwrap().to_owned()
}

fn create_card(engine: &Engine, project_id: &str) -> String {
    let reply = engine
        .mutate(Mutation {
            project_id: project_id.into(),
            kind: Kind::Card,
            id: None,
            payload: json!({"title":"Focus before deletion"}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    reply.body["result"]["resource"]["metadata"]["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn focus(engine: &Engine, project_id: &str, card_id: &str) {
    let project_application::Versioned { version, .. } = engine.workspace().unwrap();
    engine
        .mutate_workspace(
            "focus",
            &json!({"items":[{"project_id":project_id,"card_id":card_id}]}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(&version),
        )
        .unwrap();
}

fn plan(engine: &Engine, project_id: &str) -> Value {
    let plan = engine.project_deletion_plan(project_id).unwrap();
    assert_eq!(plan["project_id"], project_id);
    assert!(
        plan["display_path"]
            .as_str()
            .unwrap()
            .ends_with("/.project")
    );
    assert!(plan["version"].as_str().unwrap().starts_with("r1."));
    assert!(plan["file_count"].as_u64().unwrap() > 0);
    plan
}

fn delete(engine: &Engine, project_id: &str, version: &str, request_id: &str) -> Reply {
    engine
        .delete_project(
            project_id,
            json!({}),
            request_id,
            &engine.journal.epoch,
            Some(version.to_owned()),
        )
        .unwrap()
}

fn assert_preserved(root: &Path) {
    assert!(!root.join(".project").exists());
    assert!(root.join("AGENTS.md").is_file());
    assert!(root.join(".gitignore").is_file());
    assert_eq!(
        fs::read_to_string(root.join("user-data.txt")).unwrap(),
        "keep this repository content\n"
    );
}

fn projection_failure(env: &Environment) -> rusqlite::Connection {
    let db = rusqlite::Connection::open(env.root.join("state/index.sqlite")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_project_delete BEFORE DELETE ON documents
         BEGIN SELECT RAISE(ABORT, 'injected project projection delete failure'); END;",
    )
    .unwrap();
    db
}

fn rejection_code(result: Result<Value, AppError>) -> String {
    match result {
        Err(AppError::Rejected(reply)) => reply.body["error"]["code"].as_str().unwrap().to_owned(),
        other => panic!("expected a rejection, got {other:?}"),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeleteCase {
    project_id: String,
    version: String,
    request_id: String,
    epoch: String,
}

fn case_path(env: &Environment) -> PathBuf {
    env.root.join("delete-case.json")
}

fn run_delete_child() {
    let Some(root) = std::env::var_os("ASTRA_DELETE_HOME") else {
        return;
    };
    let root = PathBuf::from(root);
    let case: DeleteCase =
        serde_json::from_slice(&fs::read(root.join("delete-case.json")).unwrap()).unwrap();
    let engine = Engine::open(&root.join("state")).unwrap();
    let point = std::env::var("ASTRA_DELETE_POINT").unwrap();
    let reply = engine
        .delete_project_with(
            &case.project_id,
            json!({}),
            &case.request_id,
            &case.epoch,
            Some(case.version),
            |reached| {
                if format!("{reached:?}") == point {
                    process::exit(77);
                }
                Ok(())
            },
        )
        .unwrap();
    panic!("delete fault point was not reached: {reply:?}");
}

fn write_case(env: &Environment, case: &DeleteCase) {
    fs::write(case_path(env), serde_json::to_vec(case).unwrap()).unwrap();
}

fn subprocess_delete(env: &Environment, case: &DeleteCase, point: &str) {
    write_case(env, case);
    let status = process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "project_deletion_tests::delete_fault_child",
            "--nocapture",
        ])
        .env("ASTRA_DELETE_HOME", &env.root)
        .env("ASTRA_DELETE_POINT", point)
        .stdout(process::Stdio::null())
        .stderr(process::Stdio::inherit())
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(77), "{point}");
}

#[test]
fn delete_fault_child() {
    run_delete_child();
}

#[test]
fn deleting_last_focused_project_removes_only_project_data() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let card = create_card(&engine, &project);
    focus(&engine, &project, &card);
    fs::write(
        env.project_path().join("user-data.txt"),
        "keep this repository content\n",
    )
    .unwrap();
    let agents = fs::read(env.project_path().join("AGENTS.md")).unwrap();
    let gitignore = fs::read(env.project_path().join(".gitignore")).unwrap();
    let deletion = plan(&engine, &project);
    let request_id = Uuid::now_v7().to_string();
    let reply = delete(
        &engine,
        &project,
        deletion["version"].as_str().unwrap(),
        &request_id,
    );
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(reply.body["status"], "committed");
    assert_eq!(
        reply.body["result"],
        json!({"type":"project","id":project,"deleted":true})
    );
    assert_preserved(&env.project_path());
    assert_eq!(
        fs::read(env.project_path().join("AGENTS.md")).unwrap(),
        agents
    );
    assert_eq!(
        fs::read(env.project_path().join(".gitignore")).unwrap(),
        gitignore
    );
    assert!(engine.workspace().unwrap().value.projects.is_empty());
    assert!(engine.workspace().unwrap().value.focus.is_empty());
}

#[test]
fn changed_or_added_tree_content_rejects_stale_plan_without_unlinking() {
    for added in [false, true] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.project_path());
        let deletion = plan(&engine, &project);
        let target = if added {
            env.project_text_path("new-file.txt")
        } else {
            env.project_text_path("README.md")
        };
        if added {
            fs::write(&target, "added after preview").unwrap();
        } else {
            fs::write(&target, "changed after preview").unwrap();
        }
        let reply = delete(
            &engine,
            &project,
            deletion["version"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
        );
        assert_eq!(reply.body["error"]["code"], "VERSION_CONFLICT");
        assert!(env.project_path().join(".project").exists());
        assert!(target.exists());
        assert_eq!(engine.workspace().unwrap().value.projects.len(), 1);
    }
}

#[test]
fn unsupported_symlink_hardlink_and_fifo_are_rejected_by_preview() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let outside = env.root.join("outside.txt");
    fs::write(&outside, "outside").unwrap();
    symlink(&outside, env.project_text_path("link.txt")).unwrap();
    assert!(engine.project_deletion_plan(&project).is_err());
    fs::remove_file(env.project_text_path("link.txt")).unwrap();
    fs::hard_link(&outside, env.project_text_path("hardlink.txt")).unwrap();
    assert!(engine.project_deletion_plan(&project).is_err());
    fs::remove_file(env.project_text_path("hardlink.txt")).unwrap();
    rustix::fs::mkfifoat(
        rustix::fs::CWD,
        env.project_text_path("fifo"),
        rustix::fs::Mode::from_raw_mode(0o600),
    )
    .unwrap();
    assert!(engine.project_deletion_plan(&project).is_err());
}

#[test]
fn committed_delete_replays_after_the_tree_is_gone() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let deletion = plan(&engine, &project);
    let request_id = Uuid::now_v7().to_string();
    let first = delete(
        &engine,
        &project,
        deletion["version"].as_str().unwrap(),
        &request_id,
    );
    assert_eq!(first.body["status"], "committed");
    assert!(!env.project_path().join(".project").exists());
    let replay = delete(
        &engine,
        &project,
        deletion["version"].as_str().unwrap(),
        &request_id,
    );
    assert_eq!(replay.body["status"], first.body["status"]);
    assert_eq!(replay.body["result"], first.body["result"]);
    assert_eq!(replay.body["replayed"], true);
}

#[test]
fn subprocess_recovery_finishes_each_delete_durability_boundary() {
    for point in [
        "Prepared",
        "EntryRemoved(0)",
        "CursorSaved(0)",
        "WorkspaceWritten",
        "Committed",
    ] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.project_path());
        let deletion = plan(&engine, &project);
        let case = DeleteCase {
            project_id: project.clone(),
            version: deletion["version"].as_str().unwrap().to_owned(),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
        };
        drop(engine);
        subprocess_delete(&env, &case, point);
        let engine = env.engine();
        assert!(!env.project_path().join(".project").exists(), "{point}");
        assert!(
            engine.workspace().unwrap().value.projects.is_empty(),
            "{point}"
        );
        let status = engine
            .command_status(&case.request_id, &case.epoch)
            .unwrap();
        assert_eq!(status["state"], "committed", "{point}: {status}");
        let replay = engine
            .delete_project(
                &case.project_id,
                json!({}),
                &case.request_id,
                &case.epoch,
                Some(case.version),
            )
            .unwrap();
        assert_eq!(replay.body["replayed"], true, "{point}");
    }
}

#[test]
fn subprocess_recovery_handles_dynamic_writer_lock_local_and_root_boundaries() {
    let boundaries = [
        vec![".project", ".local", "writer.lock"],
        vec![".project", ".local"],
        vec![".project"],
    ];
    for boundary in boundaries {
        for checkpoint in ["EntryRemoved", "CursorSaved"] {
            let env = Environment::new();
            let engine = env.engine();
            let project = register(&engine, &env.project_path());
            // Opening the store creates the operational lease entries.  The
            // cursor is derived from the actual bounded inventory so this
            // test remains valid when ordinary source files change.
            create_card(&engine, &project);
            let inventory = tree_removal::inventory(&env.project_path()).unwrap();
            let cursor = inventory
                .entries
                .iter()
                .position(|entry| {
                    entry.path.len() == boundary.len()
                        && entry
                            .path
                            .iter()
                            .zip(&boundary)
                            .all(|(actual, expected)| actual == *expected)
                })
                .unwrap_or_else(|| panic!("missing deletion boundary {boundary:?}"));
            let expected_kind = match boundary.as_slice() {
                [".project"] | [".project", ".local"] => EntryKind::Directory,
                _ => EntryKind::File,
            };
            assert_eq!(inventory.entries[cursor].kind, expected_kind);
            let deletion = plan(&engine, &project);
            let case = DeleteCase {
                project_id: project.clone(),
                version: deletion["version"].as_str().unwrap().to_owned(),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
            };
            drop(engine);
            subprocess_delete(&env, &case, &format!("{checkpoint}({cursor})"));
            let engine = env.engine();
            assert!(
                !env.project_path().join(".project").exists(),
                "{boundary:?}/{checkpoint}"
            );
            assert!(engine.workspace().unwrap().value.projects.is_empty());
            assert_eq!(
                engine
                    .command_status(&case.request_id, &case.epoch)
                    .unwrap()["state"],
                "committed",
                "{boundary:?}/{checkpoint}"
            );
        }
    }
}

#[test]
fn committed_project_delete_survives_projection_failure_and_repairs_projection() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    create_card(&engine, &project);
    let deletion = plan(&engine, &project);
    let request_id = Uuid::now_v7().to_string();
    let fault = projection_failure(&env);
    let reply = delete(
        &engine,
        &project,
        deletion["version"].as_str().unwrap(),
        &request_id,
    );
    assert_eq!(reply.http_status, 200, "{reply:?}");
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(reply.body["status"], "committed");
    assert_eq!(reply.body["warnings"][0]["code"], "PROJECTION_DEGRADED");
    assert!(!env.project_path().join(".project").exists());
    assert!(engine.workspace().unwrap().value.projects.is_empty());
    assert_eq!(
        engine
            .command_status(&request_id, &engine.journal.epoch)
            .unwrap()["state"],
        "committed"
    );

    // The failed projection still contains the source row until the queued
    // repair can run.  It is disposable state and must never change the
    // already committed deletion result.
    assert_eq!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    fault
        .execute_batch("DROP TRIGGER fail_project_delete")
        .unwrap();
    engine
        .retry_projection_repairs_at(std::time::Instant::now() + std::time::Duration::from_secs(31))
        .unwrap();
    assert!(
        engine.list(Some("card"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        engine
            .command_status(&request_id, &engine.journal.epoch)
            .unwrap()["state"],
        "committed"
    );
    let replay = delete(
        &engine,
        &project,
        deletion["version"].as_str().unwrap(),
        &request_id,
    );
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(replay.body["status"], "committed");
}

#[test]
fn project_deletion_rejects_daemon_state_inside_project_tree() {
    let env = Environment::new();
    let state = Directory::open(&env.project_path())
        .unwrap()
        .child(".project", true)
        .unwrap()
        .child(".local", true)
        .unwrap()
        .child("server-state", true)
        .unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let project = register(&engine, &env.project_path());
    assert_eq!(
        rejection_code(engine.project_deletion_plan(&project)),
        "PROJECT_CONTAINS_SERVER_STATE"
    );
    assert!(env.project_path().join(".project").exists());
}

#[test]
fn project_deletion_rejects_another_registered_root_inside_project_tree() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let nested = env.project_path().join(".project/nested-repository");
    fs::create_dir_all(&nested).unwrap();
    let nested_project = register(&engine, &nested);
    assert_ne!(project, nested_project);
    assert_eq!(
        rejection_code(engine.project_deletion_plan(&project)),
        "PROJECT_CONTAINS_REGISTERED_PROJECT"
    );
    assert!(nested.join(".project/project.md").exists());
}

#[test]
fn changed_tree_after_an_interrupted_delete_stops_recovery_for_review() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let deletion = plan(&engine, &project);
    let case = DeleteCase {
        project_id: project.clone(),
        version: deletion["version"].as_str().unwrap().to_owned(),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
    };
    drop(engine);
    subprocess_delete(&env, &case, "EntryRemoved(0)");
    let journal = project_application::journal::Journal::open(&env.root.join("state")).unwrap();
    let manifest: Value = journal
        .db()
        .unwrap()
        .query_row(
            "SELECT before_bytes FROM write_intents WHERE epoch=?1 AND request_id=?2",
            [&case.epoch, &case.request_id],
            |row| row.get::<_, Vec<u8>>(0),
        )
        .map(|bytes| serde_json::from_slice(&bytes).unwrap())
        .unwrap();
    let entry = manifest["inventory"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .skip(1)
        .find(|entry| entry["kind"] == "file")
        .unwrap();
    let relative = entry["path"]
        .as_array()
        .unwrap()
        .iter()
        .map(|part| part.as_str().unwrap())
        .collect::<PathBuf>();
    let changed = env.project_path().join(relative);
    fs::write(&changed, "changed while deletion was interrupted").unwrap();
    drop(journal);
    let engine = env.engine();
    assert!(env.project_path().join(".project").exists());
    assert_eq!(
        fs::read_to_string(changed).unwrap(),
        "changed while deletion was interrupted"
    );
    let status = engine
        .command_status(&case.request_id, &case.epoch)
        .unwrap();
    assert_eq!(status["state"], "needs_review");
}

#[test]
fn added_tree_content_after_an_interrupted_delete_is_never_removed() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let deletion = plan(&engine, &project);
    let case = DeleteCase {
        project_id: project.clone(),
        version: deletion["version"].as_str().unwrap().to_owned(),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
    };
    drop(engine);
    subprocess_delete(&env, &case, "CursorSaved(0)");
    let added = env.project_text_path("added-during-delete.txt");
    fs::write(&added, "must remain for review").unwrap();
    let engine = env.engine();
    assert!(env.project_path().join(".project").exists());
    assert_eq!(
        fs::read_to_string(&added).unwrap(),
        "must remain for review"
    );
    assert_eq!(
        engine
            .command_status(&case.request_id, &case.epoch)
            .unwrap()["state"],
        "needs_review"
    );
}

#[test]
fn workspace_conflict_before_recovery_preserves_registration_and_partial_tree() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let deletion = plan(&engine, &project);
    let case = DeleteCase {
        project_id: project.clone(),
        version: deletion["version"].as_str().unwrap().to_owned(),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
    };
    drop(engine);
    subprocess_delete(&env, &case, "EntryRemoved(0)");
    let workspace_path = env.root.join("state/workspace.json");
    let mut workspace: Value = serde_json::from_slice(&fs::read(&workspace_path).unwrap()).unwrap();
    workspace["preferences"]["default_view"] = json!("board");
    fs::write(
        &workspace_path,
        serde_json::to_vec_pretty(&workspace).unwrap(),
    )
    .unwrap();
    let engine = env.engine();
    assert!(env.project_path().join(".project").exists());
    assert_eq!(engine.workspace().unwrap().value.projects.len(), 1);
    assert_eq!(
        engine
            .command_status(&case.request_id, &case.epoch)
            .unwrap()["state"],
        "needs_review"
    );
}

#[test]
fn pending_delete_blocks_source_and_workspace_writes() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.project_path());
    let deletion = plan(&engine, &project);
    let request_id = Uuid::now_v7().to_string();
    let reply = engine
        .delete_project_with(
            &project,
            json!({}),
            &request_id,
            &engine.journal.epoch,
            Some(deletion["version"].as_str().unwrap().to_owned()),
            |_| Err(AppError::invariant("injected pending deletion")),
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    let card = engine.mutate(Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: None,
        payload: json!({"title":"blocked"}),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: None,
    });
    let card = card.unwrap();
    assert!(matches!(
        card.body["error"]["code"].as_str(),
        Some("PROJECT_RECOVERY_REQUIRED" | "PROJECT_DELETION_PENDING")
    ));
    let project_application::Versioned { version, .. } = engine.workspace().unwrap();
    let workspace = engine
        .mutate_workspace(
            "preferences",
            &json!({"locale":"en"}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(&version),
        )
        .unwrap();
    assert!(matches!(
        workspace.body["error"]["code"].as_str(),
        Some("WORKSPACE_RECOVERY_REQUIRED" | "PROJECT_DELETION_PENDING")
    ));
}
