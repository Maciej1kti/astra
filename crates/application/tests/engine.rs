use project_application::{
    Mutation, Reply,
    engine::Engine,
    index::{Indexed, Query},
    now_millis, wire,
    workflow::Workflows,
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
fn summaries_drop_retired_card_fields_and_keep_milestone_due() {
    let project = Indexed {
        project_id: "project".into(),
        kind: "project".into(),
        id: "project".into(),
        version: "r1.project".into(),
        metadata: json!({
            "id": "project",
            "name": "Project",
            "state": "active",
            "phase": "Legacy",
        }),
        validity: "valid".into(),
    };
    let summary = project.summary();
    assert!(summary.get("phase").is_none());
    assert!(summary.get("review_on").is_none());

    let card = Indexed {
        project_id: "project".into(),
        kind: "card".into(),
        id: "card".into(),
        version: "r1.card".into(),
        metadata: json!({
            "id": "card",
            "title": "Card",
            "status": "active",
            "due": {"date": "2026-09-16", "kind": "hard"},
            "blocked": {"reason": "legacy"},
            "depends_on": ["legacy"],
            "milestone_id": "legacy",
        }),
        validity: "valid".into(),
    };
    assert!(card.summary().get("due").is_none());
    assert!(card.summary().get("blocked").is_none());
    assert!(card.summary().get("depends_on").is_none());
    assert!(card.summary().get("milestone_id").is_none());
    let milestone = Indexed {
        project_id: "project".into(),
        kind: "milestone".into(),
        id: "milestone".into(),
        version: "r1.milestone".into(),
        metadata: json!({
            "id": "milestone",
            "title": "Milestone",
            "status": "planned",
            "due": {"date": "2026-09-16", "kind": "hard"},
        }),
        validity: "valid".into(),
    };
    assert_eq!(milestone.summary()["due"], json!({"date": "2026-09-16"}));
}

#[path = "engine/projections.rs"]
mod projections;

#[path = "engine/writes.rs"]
mod writes;

#[path = "engine/card_fields.rs"]
mod card_fields;

#[path = "engine/registration.rs"]
mod registration;

#[path = "engine/workspace.rs"]
mod workspace;

#[path = "engine/planning.rs"]
mod planning;

#[path = "engine/context.rs"]
mod context;

#[path = "engine/maintenance.rs"]
mod maintenance;

#[path = "engine/git.rs"]
mod git;

#[path = "engine/tags.rs"]
mod tags;
