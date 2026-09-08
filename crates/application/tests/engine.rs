use project_application::{
    Mutation, Reply, engine::Engine, index::Query, now_millis, wire, workflow::Workflows,
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

#[path = "engine/projections.rs"]
mod projections;

#[path = "engine/writes.rs"]
mod writes;

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
