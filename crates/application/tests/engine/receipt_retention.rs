//! Receipts leave the journal with their report or project.
use super::*;
use crate::{
    journal::{Command, Target},
    writer::{CommitPoint, Writer},
};

fn report(engine: &Engine, project: &str) -> Value {
    let reply = engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "kind":"note","summary":"Receipt retention",
                "target":{"type":"project","id":project},
                "author":{"kind":"human","label":"Owner"}
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    reply.body["result"]["resource"].clone()
}

fn id(report: &Value) -> &str {
    report["metadata"]["id"].as_str().unwrap()
}

fn mark_read(engine: &Engine, items: &[(&str, &Value)]) {
    let items: Vec<_> = items
        .iter()
        .map(|(project, report)| json!({"project_id":project,"update_id":id(report),"read":true}))
        .collect();
    let reply = engine
        .receipts(
            &json!({"items":items}),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
}

fn receipts(engine: &Engine) -> Vec<(String, String)> {
    let db = engine.journal.db().unwrap();
    let mut statement = db
        .prepare("SELECT project_id,update_id FROM read_receipts ORDER BY project_id,update_id")
        .unwrap();
    statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn key(project: &str, report: &Value) -> (String, String) {
    (project.to_owned(), id(report).to_owned())
}

fn sorted(mut keys: Vec<(String, String)>) -> Vec<(String, String)> {
    keys.sort();
    keys
}

#[test]
fn report_deletion_removes_its_receipt_with_the_commit() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let deleted = report(&engine, &project);
    let interrupted = report(&engine, &project);
    let kept = report(&engine, &project);
    mark_read(
        &engine,
        &[
            (&project, &deleted),
            (&project, &interrupted),
            (&project, &kept),
        ],
    );
    let reply = engine
        .delete_report(
            &project,
            id(&deleted),
            json!({}),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
            Some(deleted["version"].as_str().unwrap().into()),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    assert_eq!(
        receipts(&engine),
        sorted(vec![key(&project, &interrupted), key(&project, &kept)]),
        "the receipt must leave with its report"
    );

    // An interrupted deletion keeps its receipt until recovery commits it.
    let command = Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.command_epoch().into(),
        method: "DELETE".into(),
        target: Target {
            project_id: project.clone(),
            kind: Kind::Update,
            id: id(&interrupted).into(),
        },
        expected: Some(interrupted["version"].as_str().unwrap().into()),
        payload: json!({}),
    };
    let handle = engine.store(&project).unwrap();
    {
        let mut store = handle.lock().unwrap();
        let prepared = Writer {
            journal: &engine.journal,
        }
        .execute_delete(
            &mut store,
            &command,
            vec![],
            now_millis(),
            |_| Ok(()),
            |point| {
                if point == CommitPoint::Unlinked {
                    return Err(project_store::StoreError::Invalid("TEST_INTERRUPTION"));
                }
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(prepared.http_status, 202, "{prepared:?}");
    }
    assert!(receipts(&engine).contains(&key(&project, &interrupted)));
    drop(handle);
    drop(engine);
    let engine = env.engine();
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert_eq!(receipts(&engine), vec![key(&project, &kept)]);
    // The surviving receipt still marks its report as read.
    assert_eq!(
        engine.get(&project, Kind::Update, id(&kept)).unwrap()["read"],
        true
    );
}

#[test]
fn unregistration_and_project_deletion_remove_the_projects_receipts() {
    let env = Environment::new();
    let engine = env.engine();
    let mut projects = Vec::new();
    for name in ["kept", "unregistered", "deleted"] {
        let path = env.root.join(name);
        fs::create_dir(&path).unwrap();
        let project = register(&engine, path.to_str().unwrap());
        let report = report(&engine, &project);
        mark_read(&engine, &[(&project, &report)]);
        projects.push((project, report));
    }
    let [kept, unregistered, deleted] = &projects[..] else {
        panic!("three fixture projects");
    };
    assert_eq!(receipts(&engine).len(), 3);

    let plan = engine
        .maintenance_plan(&json!({
            "operation":"unregister","project_id":unregistered.0,
            "expected_workspace_version":engine.workspace().unwrap().version
        }))
        .unwrap();
    let reply = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
        )
        .unwrap();
    assert_eq!(
        engine.job(reply.body["job_id"].as_str().unwrap()).unwrap()["state"],
        "done"
    );
    assert!(
        !receipts(&engine).contains(&key(&unregistered.0, &unregistered.1)),
        "unregistration must remove the project's receipts"
    );

    let plan = engine.project_deletion_plan(&deleted.0).unwrap();
    let reply = engine
        .delete_project(
            &deleted.0,
            json!({}),
            &Uuid::now_v7().to_string(),
            engine.command_epoch(),
            Some(plan["version"].as_str().unwrap().into()),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    assert_eq!(receipts(&engine), vec![key(&kept.0, &kept.1)]);
}

#[test]
fn retention_sweeps_receipts_of_unregistered_projects_in_bounded_batches() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = report(&engine, &project);
    let second = report(&engine, &project);
    let third = report(&engine, &project);
    mark_read(&engine, &[(&project, &first)]);
    let now = now_millis();
    let unread = |report: &Value| format!("{project}:{}:unread_report", id(report));
    let expected = {
        let mut expected = vec![unread(&second), unread(&third)];
        expected.sort();
        expected
    };
    let page = engine
        .attention_mode(None, None, None, 1, now, true)
        .unwrap();
    assert_eq!(page["items"][0]["id"], expected[0]);
    let cursor = page["page"]["next_cursor"].as_str().unwrap().to_owned();
    // A sweep with nothing to remove leaves an issued cursor usable.
    engine.retain_history(now).unwrap();
    assert_eq!(receipts(&engine), vec![key(&project, &first)]);
    let next = engine
        .attention_mode(None, None, Some(&cursor), 1, now, true)
        .unwrap();
    assert_eq!(next["items"][0]["id"], expected[1]);

    // Receipts left behind by projects that are no longer registered.
    {
        let db = engine.journal.db().unwrap();
        for _ in 0..3 {
            let orphan = Uuid::new_v4().to_string();
            for _ in 0..250 {
                db.execute(
                    "INSERT INTO read_receipts(project_id,update_id,read_at) VALUES(?1,?2,?3)",
                    rusqlite::params![
                        orphan,
                        Uuid::new_v4().to_string(),
                        "2026-01-01T00:00:00.000Z"
                    ],
                )
                .unwrap();
            }
        }
    }
    assert_eq!(receipts(&engine).len(), 751);
    engine.retain_history(now).unwrap();
    assert_eq!(receipts(&engine).len(), 251, "one bounded batch per pass");
    engine.retain_history(now).unwrap();
    assert_eq!(receipts(&engine), vec![key(&project, &first)]);
    engine.retain_history(now).unwrap();
    assert_eq!(receipts(&engine), vec![key(&project, &first)]);

    // Surviving receipts keep their meaning and the same cursor identity.
    let again = engine
        .attention_mode(None, None, Some(&cursor), 1, now, true)
        .unwrap();
    assert_eq!(again["items"][0]["id"], expected[1]);
    assert_eq!(
        engine.get(&project, Kind::Update, id(&first)).unwrap()["read"],
        true
    );
}

#[test]
fn receipt_sweep_never_runs_without_a_readable_workspace() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let report = report(&engine, &project);
    mark_read(&engine, &[(&project, &report)]);
    let workspace = env.root.join("state/workspace.json");
    let bytes = fs::read(&workspace).unwrap();
    fs::write(&workspace, b"{").unwrap();
    // An orphan would be removed if the sweep guessed an empty registry.
    let orphan = (Uuid::new_v4().to_string(), Uuid::new_v4().to_string());
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO read_receipts(project_id,update_id,read_at) VALUES(?1,?2,?3)",
            rusqlite::params![orphan.0, orphan.1, "2026-01-01T00:00:00.000Z"],
        )
        .unwrap();
    let before = receipts(&engine);
    assert!(engine.prune_receipts().is_err());
    // History retention still completes; only the receipt sweep is skipped.
    engine.retain_history(now_millis()).unwrap();
    assert_eq!(receipts(&engine), before);
    fs::write(&workspace, bytes).unwrap();
    assert_eq!(engine.prune_receipts().unwrap(), 1);
    assert_eq!(receipts(&engine), vec![key(&project, &report)]);
}
