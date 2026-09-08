use project_application::{
    AppError,
    journal::Journal,
    now_millis,
    workflow::{Plan, PlanLocation, Step, Workflows},
};
use project_store::filesystem::Directory;
use serde_json::json;
use uuid::Uuid;

#[test]
fn existing_workflow_records_keep_their_wire_shape_and_command_digest() {
    for kind in [
        "registration",
        "normalize",
        "rebalance",
        "unregister",
        "relocate",
        "index_rebuild",
    ] {
        let record = json!({
            "id": "plan", "kind": kind, "project_id": "project", "expires_at": 100,
            "steps": [], "view": {"display_path": "/synthetic/project", "extra": "retained"},
            "approved_root": null, "collection_guard": null,
        });
        let plan: Plan = serde_json::from_value(record.clone()).unwrap();
        assert_eq!(serde_json::to_value(&plan).unwrap(), record);
        let legacy_digest = project_store::document::version(
            &serde_json::to_vec(&json!([
                1, format!("WORKFLOW:{kind}"),
                {"project_id": "project", "kind": "project", "id": "project"},
                null, {"plan_id": "plan"}
            ]))
            .unwrap(),
        );
        assert_eq!(plan.command("request", "epoch").digest(), legacy_digest);
    }
}

#[test]
fn full_legacy_saved_plan_preserves_approval_preview_extensions_and_steps() {
    let record = json!({
        "id":"22222222-2222-4222-8222-222222222222", "kind":"relocate",
        "project_id":"11111111-1111-4111-8111-111111111111", "expires_at":1788825600000i64,
        "steps":[{"root":"/synthetic/new", "identity":[12,34], "path":[".project","project.md"], "before":[1,2], "after":[3,4]}],
        "view":{
            "plan_id":"22222222-2222-4222-8222-222222222222", "kind":"relocate",
            "project_id":"11111111-1111-4111-8111-111111111111", "display_path":"/synthetic/new",
            "previous_path":"/synthetic/old", "steps":[], "warnings":[],
            "expires_at":"2026-09-08T00:00:00.000Z", "future_preview":{"retained":true}
        },
        "approved_root":{"root_id":"33333333-3333-4333-8333-333333333333", "relative_path":"new", "identity":[12,34]},
        "collection_guard":["/synthetic/new/.project/cards",["one.md","two.md"]]
    });
    let plan: Plan = serde_json::from_value(record.clone()).unwrap();
    assert_eq!(serde_json::to_value(&plan).unwrap(), record);
    assert_eq!(plan.location.destination.as_str(), "/synthetic/new");
    assert_eq!(plan.location.previous_path().unwrap(), "/synthetic/old");
    assert_eq!(plan.presentation().unwrap(), record["view"]);
    assert_eq!(
        serde_json::to_string(&plan.location).unwrap(),
        record["view"].to_string()
    );
    assert_eq!(
        serde_json::to_string(&plan.approved_root).unwrap(),
        record["approved_root"].to_string()
    );
    let expected = project_store::document::version(&serde_json::to_vec(&json!([
        1,"WORKFLOW:relocate",{"project_id":record["project_id"],"kind":"project","id":record["project_id"]},
        null,{"plan_id":record["id"]}
    ])).unwrap());
    assert_eq!(plan.command("request", "epoch").digest(), expected);
}

#[test]
fn restart_recovers_a_raw_legacy_registration_plan_with_approved_root() {
    use crate::{engine::Engine, instant};
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let project = root.child("project", true).unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let approval = engine
        .add_root(root.path().to_str().unwrap(), "Fixture root")
        .unwrap();
    let now = now_millis();
    let project_id = Uuid::new_v4().to_string();
    let plan_id = Uuid::new_v4().to_string();
    let request_id = Uuid::now_v7().to_string();
    let epoch = engine.command_epoch().to_owned();
    let document = project_domain::validate_document(json!({"type":"project","metadata":{
        "schema_version":1,"id":project_id,"name":"Legacy restart fixture","state":"active",
        "created_at":instant(now),"updated_at":instant(now)},"body":"Preserved source"}))
    .unwrap();
    let project_bytes = project_store::document::serialize(&document).unwrap();
    let before_workspace = state.read("workspace.json").unwrap().unwrap();
    let mut workspace: serde_json::Value = serde_json::from_slice(&before_workspace).unwrap();
    workspace["projects"].as_array_mut().unwrap().push(json!({
        "project_id":project_id,"path":project.path(),"added_at":instant(now)
    }));
    let after_workspace = serde_json::to_vec_pretty(&workspace).unwrap();
    // This is the previous persisted format, assembled without serializing Plan.
    let record = json!({"id":plan_id,"kind":"registration","project_id":project_id,"expires_at":now+300_000,
        "steps":[
            {"root":project.path(),"identity":project.identity().unwrap(),"path":[".project","project.md"],"before":null,"after":project_bytes},
            {"root":state.path(),"identity":state.identity().unwrap(),"path":["workspace.json"],"before":before_workspace,"after":after_workspace}
        ],
        "view":{"plan_id":plan_id,"project_id":project_id,"expires_at":instant(now+300_000),
            "display_path":project.path(),"changes":[],"warnings":[],"future_preview":"keep me"},
        "approved_root":{"root_id":approval["id"],"relative_path":"project","identity":project.identity().unwrap()},
        "collection_guard":null
    });
    engine
        .journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO workflow_plans(id,plan_json) VALUES(?1,?2)",
            rusqlite::params![plan_id, record.to_string()],
        )
        .unwrap();
    let workflows = Workflows {
        journal: &engine.journal,
    };
    assert_eq!(
        serde_json::to_value(workflows.plan(&plan_id).unwrap()).unwrap(),
        record
    );
    let accepted = workflows
        .commit_with(&plan_id, &request_id, &epoch, now, |_| {
            Err(AppError::invariant("fixture interruption"))
        })
        .unwrap();
    let job = accepted.body["job_id"].as_str().unwrap().to_owned();
    assert_eq!(workflows.job(&job).unwrap()["state"], "running");
    drop(engine);

    let reopened = Engine::open(state.path()).unwrap();
    assert_eq!(reopened.job(&job).unwrap()["state"], "done");
    assert_eq!(
        reopened.command_status(&request_id, &epoch).unwrap()["state"],
        "committed"
    );
    assert_eq!(
        reopened
            .resolve_path(project.path().to_str().unwrap())
            .unwrap(),
        project_id
    );
    assert_eq!(
        project
            .child(".project", false)
            .unwrap()
            .read("project.md")
            .unwrap()
            .unwrap(),
        project_bytes
    );
    assert_eq!(
        serde_json::to_value(
            (Workflows {
                journal: &reopened.journal
            })
            .plan(&plan_id)
            .unwrap()
        )
        .unwrap(),
        record
    );
    let replay = reopened
        .commit_registration(&plan_id, &request_id, &epoch)
        .unwrap();
    assert_eq!(replay.body, accepted.body);
}

#[test]
fn malformed_saved_plans_report_the_operation_and_preserve_the_cause() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let journal = Journal::open(state.path()).unwrap();
    journal
        .db()
        .unwrap()
        .execute(
            "INSERT INTO workflow_plans(id,plan_json) VALUES(?1,?2)",
            ["broken", "{invalid JSON"],
        )
        .unwrap();
    let error = (Workflows { journal: &journal })
        .plan("broken")
        .unwrap_err();
    assert!(matches!(
        error,
        AppError::StoredData {
            context: "stored workflow plan",
            ..
        }
    ));
    assert!(std::error::Error::source(&error).is_some());
}

#[test]
fn saved_workflow_operational_inputs_are_required_and_presentation_cannot_replace_them() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let journal = Journal::open(state.path()).unwrap();
    for (index, view, approval) in [
        (0, json!({"warnings":[]}), serde_json::Value::Null),
        (
            1,
            json!({"display_path":"relative/project"}),
            serde_json::Value::Null,
        ),
        (
            2,
            json!({"display_path":"/project"}),
            json!({"root_id":"root","relative_path":"project"}),
        ),
    ] {
        let id = format!("invalid-{index}");
        let record = json!({"id":id,"kind":"registration","project_id":"project","expires_at":100,
            "steps":[],"view":view,"approved_root":approval,"collection_guard":null});
        journal
            .db()
            .unwrap()
            .execute(
                "INSERT INTO workflow_plans(id,plan_json) VALUES(?1,?2)",
                rusqlite::params![id, record.to_string()],
            )
            .unwrap();
        let error = (Workflows { journal: &journal }).plan(&id).unwrap_err();
        assert!(matches!(
            error,
            AppError::StoredData {
                context: "stored workflow plan",
                ..
            }
        ));
        assert!(std::error::Error::source(&error).is_some());
    }
    assert!(PlanLocation::registration("/project", json!({"display_path":"/elsewhere"})).is_err());
    assert!(
        PlanLocation::maintenance("/new", "/old", json!({"previous_path":"/elsewhere"})).is_err()
    );
}

#[test]
fn recovery_rechecks_completed_steps_before_publishing_registration() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let journal = Journal::open(state.path()).unwrap();
    let workflows = Workflows { journal: &journal };
    let plan = Plan {
        approved_root: None,
        collection_guard: None,
        id: Uuid::new_v4().to_string(),
        kind: crate::workflow_kind::WorkflowKind::Registration,
        project_id: Uuid::new_v4().to_string(),
        expires_at: now_millis() + 300_000,
        steps: ["first", "second", "registry"]
            .iter()
            .map(|name| Step::plan(&root, &[name], b"approved".to_vec()).unwrap())
            .collect(),
        location: PlanLocation::registration(root.path().to_str().unwrap(), json!({})).unwrap(),
    };
    workflows.save(&plan).unwrap();
    let result = workflows
        .commit_with(
            &plan.id,
            &Uuid::now_v7().to_string(),
            &journal.epoch,
            now_millis(),
            |index| {
                if index == 1 {
                    Err(AppError::invariant("injected test failure"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    let job = result.body["job_id"].as_str().unwrap();
    std::fs::write(root.path().join("first"), b"external change").unwrap();
    assert!(workflows.resume(job).is_err());
    assert_eq!(workflows.job(job).unwrap()["state"], "needs_review");
    assert!(!root.path().join("registry").exists());
    assert_eq!(
        std::fs::read(root.path().join("first")).unwrap(),
        b"external change"
    );
}
