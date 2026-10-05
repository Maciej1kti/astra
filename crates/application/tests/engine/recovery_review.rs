use super::*;
use crate::command_state::CommandState;
use crate::journal::{Command, Target};
use crate::writer::{CommitPoint, Writer};
use project_store::{StoreError, document};

fn retitle(old: Option<&Value>) -> Result<Value, Reply> {
    let mut next = old.unwrap().clone();
    next["metadata"]["title"] = json!("Retitled by Astra");
    Ok(next)
}

fn source(env: &Environment, id: &str) -> PathBuf {
    env.root.join(format!("project/.project/cards/{id}.json"))
}

/// Interrupts a retitle after its intent is journaled and leaves it pending.
fn interrupted(engine: &Engine, project: &str, card: &Reply) -> Command {
    let command = Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: "PATCH".into(),
        target: Target {
            project_id: project.into(),
            kind: Kind::Card,
            id: card.body["result"]["id"].as_str().unwrap().into(),
        },
        expected: Some(card.body["result"]["version"].as_str().unwrap().into()),
        payload: json!({}),
    };
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
        retitle,
        |point| {
            if point == CommitPoint::Prepared {
                Err(StoreError::Invalid("TEST_INTERRUPTION"))
            } else {
                Ok(())
            }
        },
    )
    .unwrap();
    assert_eq!(reply.http_status, 202);
    command
}

/// An interrupted write whose source another tool then changed: recovery at
/// the next write must leave it for review.
fn under_review(env: &Environment, engine: &Engine, project: &str) -> (Command, Reply, Vec<u8>) {
    let card = create(engine, project, "Interrupted");
    let other = create(engine, project, "Other card");
    let id = card.body["result"]["id"].as_str().unwrap();
    let command = interrupted(engine, project, &card);
    let mut edited: Value = serde_json::from_slice(&fs::read(source(env, id)).unwrap()).unwrap();
    edited["metadata"]["title"] = json!("Edited by another tool");
    let external = serde_json::to_vec_pretty(&edited).unwrap();
    fs::write(source(env, id), &external).unwrap();
    let blocked = patch(
        engine,
        project,
        other.body["result"]["id"].as_str().unwrap(),
        other.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"title":"Blocked"}}),
    );
    assert_eq!(blocked.body["error"]["code"], "PROJECT_RECOVERY_REQUIRED");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        CommandState::NeedsReview
    );
    (command, other, external)
}

#[test]
fn unresolved_intents_report_the_observed_versions() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    assert_eq!(engine.recovery_intents(None).unwrap()["items"], json!([]));
    let (command, _, external) = under_review(&env, &engine, &project);

    for scope in [None, Some(project.as_str())] {
        let listed = engine.recovery_intents(scope).unwrap();
        let items = listed["items"].as_array().unwrap();
        assert_eq!(items.len(), 1, "{listed}");
        let item = &items[0];
        assert_eq!(item["request_id"], command.request_id);
        assert_eq!(item["command_epoch"], command.epoch);
        assert_eq!(item["state"], "needs_review");
        assert_eq!(item["project_id"], project);
        assert_eq!(
            item["target"],
            json!({"type":"card","id":command.target.id})
        );
        assert_eq!(item["operation"], "replace");
        assert_eq!(item["before_version"], json!(command.expected));
        assert_eq!(item["current_version"], document::version(&external));
        assert_ne!(item["after_version"], item["before_version"]);
        assert_ne!(item["after_version"], item["current_version"]);
    }
}

#[test]
fn abandoning_a_reviewed_intent_keeps_the_source_and_unblocks_the_project() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let (command, other, external) = under_review(&env, &engine, &project);
    let current = document::version(&external);

    let settled = engine
        .abandon_reviewed_intent(&project, &command.request_id, Some(&current))
        .unwrap();
    assert_eq!(settled["request_id"], command.request_id);
    assert_eq!(settled["state"], "rejected");
    assert_eq!(settled["recovery_pending"], false);

    // The source is exactly what the other tool left, never the saved intent.
    assert_eq!(
        fs::read(source(&env, &command.target.id)).unwrap(),
        external
    );
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        CommandState::Rejected
    );
    assert!(!engine.journal.has_pending(&project).unwrap());
    let status = engine
        .journal
        .command_status(&command.epoch, &command.request_id)
        .unwrap()
        .unwrap()
        .1
        .unwrap();
    assert_eq!(status.http_status, 409);
    assert_eq!(status.body["error"]["code"], "RECOVERY_ABANDONED");
    assert_eq!(status.body["error"]["request_id"], command.request_id);
    wire::validate("Error", &status.body).unwrap();
    assert_eq!(engine.recovery_intents(None).unwrap()["items"], json!([]));

    let unblocked = patch(
        &engine,
        &project,
        other.body["result"]["id"].as_str().unwrap(),
        other.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"title":"Writable again"}}),
    );
    assert_eq!(unblocked.http_status, 200, "{unblocked:?}");
    // Settling twice is refused rather than repeated.
    let again = engine
        .abandon_reviewed_intent(&project, &command.request_id, Some(&current))
        .unwrap_err();
    assert!(
        matches!(&again, crate::AppError::Rejected(reply) if reply.body["error"]["code"] == "RECOVERY_INTENT_NOT_FOUND"),
        "{again:?}"
    );
}

#[test]
fn abandon_requires_the_current_source_version_the_operator_observed() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let (command, _, external) = under_review(&env, &engine, &project);

    for stale in [command.expected.clone(), None] {
        let refused = engine
            .abandon_reviewed_intent(&project, &command.request_id, stale.as_deref())
            .unwrap_err();
        assert!(
            matches!(&refused, crate::AppError::Rejected(reply)
                if reply.http_status == 412 && reply.body["error"]["code"] == "VERSION_CONFLICT"),
            "{refused:?}"
        );
    }
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        CommandState::NeedsReview
    );
    assert_eq!(
        fs::read(source(&env, &command.target.id)).unwrap(),
        external
    );
}

#[test]
fn a_source_removed_during_review_is_settled_as_absent() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let (command, _, _) = under_review(&env, &engine, &project);
    fs::remove_file(source(&env, &command.target.id)).unwrap();

    let listed = engine.recovery_intents(Some(&project)).unwrap();
    assert_eq!(listed["items"][0]["current_version"], Value::Null);
    engine
        .abandon_reviewed_intent(&project, &command.request_id, None)
        .unwrap();
    assert!(!source(&env, &command.target.id).exists());
    assert!(!engine.journal.has_pending(&project).unwrap());
}

#[test]
fn only_an_intent_under_review_can_be_abandoned() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Recoverable");
    let command = interrupted(&engine, &project, &card);
    let current = card.body["result"]["version"].as_str().unwrap();

    // A prepared intent is still completed by ordinary recovery.
    let refused = engine
        .abandon_reviewed_intent(&project, &command.request_id, Some(current))
        .unwrap_err();
    assert!(
        matches!(&refused, crate::AppError::Rejected(reply)
            if reply.http_status == 409 && reply.body["error"]["code"] == "RECOVERY_NOT_IN_REVIEW"),
        "{refused:?}"
    );
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        CommandState::Prepared
    );
    for (request, code, status) in [
        (Uuid::now_v7().to_string(), "RECOVERY_INTENT_NOT_FOUND", 404),
        ("not-a-request".to_owned(), "INVALID_REQUEST_ID", 400),
    ] {
        let refused = engine
            .abandon_reviewed_intent(&project, &request, Some(current))
            .unwrap_err();
        assert!(
            matches!(&refused, crate::AppError::Rejected(reply)
                if reply.http_status == status && reply.body["error"]["code"] == code),
            "{refused:?}"
        );
    }
}
