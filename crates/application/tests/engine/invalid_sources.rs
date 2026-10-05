//! A source that exists in an unacceptable form is a definite rejection while
//! no intent exists; it must never surface as an uncertain storage failure.
use super::*;
use crate::{AppError, command_state::CommandState};
use std::os::unix::fs::symlink;

fn card_input(engine: &Engine, project: &str, title: &str) -> Mutation {
    Mutation {
        project_id: project.into(),
        kind: Kind::Card,
        id: None,
        payload: json!({"title":title}),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: None,
    }
}

fn assert_invalid(result: Result<Reply, AppError>, context: &str) -> Reply {
    let reply = result.unwrap_or_else(|error| panic!("{context}: uncertain failure {error:?}"));
    assert_eq!(reply.http_status, 409, "{context}: {reply:?}");
    assert_eq!(reply.body["error"]["code"], "DOCUMENT_INVALID", "{context}");
    reply
}

fn source_names(env: &Environment, collection: &str) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(env.root.join("project/.project").join(collection))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

#[test]
fn stray_collection_files_reject_create_and_reorder_definitely() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "First");
    let second = create(&engine, &project, "Second");
    let cards = env.root.join("project/.project/cards");
    let first_id = first.body["result"]["id"].as_str().unwrap();
    let second_id = second.body["result"]["id"].as_str().unwrap();
    let valid = Uuid::new_v4();
    type Place<'a> = Box<dyn Fn(&PathBuf) + 'a>;
    let strays: [(&str, PathBuf, Place<'_>); 3] = [
        (
            "a name that is not a canonical UUIDv4",
            cards.join(format!("{}.json", Uuid::now_v7())),
            Box::new(|path| fs::write(path, b"{}").unwrap()),
        ),
        (
            "a symbolic link",
            cards.join(format!("{valid}.json")),
            Box::new(|path| symlink(cards.join(format!("{first_id}.json")), path).unwrap()),
        ),
        (
            "an oversized file",
            cards.join(format!("{valid}.json")),
            Box::new(|path| {
                fs::write(path, vec![b' '; project_store::document::MAX_DOCUMENT + 1]).unwrap()
            }),
        ),
    ];
    for (context, path, place) in &strays {
        place(path);
        let before = source_names(&env, "cards");

        let input = card_input(&engine, &project, "Refused");
        let reply = assert_invalid(engine.mutate(input.clone()), context);
        assert_eq!(reply.body["error"]["request_id"], input.request_id);
        // The rejection is the command's recorded outcome and replays unchanged.
        let (state, recorded) = engine
            .journal
            .command_status(&input.epoch, &input.request_id)
            .unwrap()
            .unwrap();
        assert_eq!(state, CommandState::Rejected, "{context}");
        assert_eq!(recorded.unwrap().body, reply.body, "{context}");
        assert_eq!(engine.mutate(input).unwrap().body, reply.body, "{context}");

        let reorder = engine.mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: Some(second_id.into()),
            payload: json!({"placement":{"after_id":null,"before_id":first_id}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(second.body["result"]["version"].as_str().unwrap().into()),
        });
        assert_invalid(reorder, context);

        // No intent was created and no source changed.
        assert!(!engine.journal.has_pending(&project).unwrap(), "{context}");
        assert_eq!(source_names(&env, "cards"), before, "{context}");
        fs::remove_file(path).unwrap();
    }
    // Once the collection is repaired, a new request is admitted normally.
    let repaired = engine
        .mutate(card_input(&engine, &project, "Repaired"))
        .unwrap();
    assert_eq!(repaired.http_status, 200, "{repaired:?}");
}

#[test]
fn stray_card_file_rejects_pin_admission_definitely() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Pinned later");
    let stray = env
        .root
        .join(format!("project/.project/cards/{}.json", Uuid::now_v7()));
    fs::write(&stray, b"{}").unwrap();
    let pin = |request: String| {
        engine.mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: Some(card.body["result"]["id"].as_str().unwrap().into()),
            payload: json!({"set":{"pinned":true}}),
            request_id: request,
            epoch: engine.journal.epoch.clone(),
            expected: Some(card.body["result"]["version"].as_str().unwrap().into()),
        })
    };
    assert_invalid(pin(Uuid::now_v7().to_string()), "pin admission");
    assert!(!engine.journal.has_pending(&project).unwrap());
    fs::remove_file(stray).unwrap();
    let pinned = pin(Uuid::now_v7().to_string()).unwrap();
    assert_eq!(pinned.http_status, 200, "{pinned:?}");
}

#[test]
fn stray_report_file_rejects_report_deletion_definitely() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({"kind":"decision_needed","target":{"type":"project","id":project},"summary":"Kept report","author":{"kind":"human","label":"Owner"}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(created.http_status, 200, "{created:?}");
    let id = created.body["result"]["id"].as_str().unwrap();
    let version = created.body["result"]["version"].as_str().unwrap();
    let stray = env
        .root
        .join(format!("project/.project/updates/{}.json", Uuid::now_v7()));
    fs::write(&stray, b"{}").unwrap();
    let request = Uuid::now_v7().to_string();
    let delete = |request: &str| {
        engine.delete_report(
            &project,
            id,
            json!({}),
            request,
            &engine.journal.epoch,
            Some(version.into()),
        )
    };
    let reply = assert_invalid(delete(&request), "report deletion");
    assert_eq!(delete(&request).unwrap().body, reply.body);
    assert!(!engine.journal.has_pending(&project).unwrap());
    assert!(
        env.root
            .join(format!("project/.project/updates/{id}.json"))
            .exists()
    );
    fs::remove_file(stray).unwrap();
    let deleted = delete(&Uuid::now_v7().to_string()).unwrap();
    assert_eq!(deleted.http_status, 200, "{deleted:?}");
}

#[test]
fn unacceptable_reference_is_rejected_before_an_intent_exists() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "Written");
    let other = create(&engine, &project, "Reference");
    let other_id = other.body["result"]["id"].as_str().unwrap();
    let cards = env.root.join("project/.project/cards");
    let reference = cards.join(format!("{other_id}.json"));
    let bytes = fs::read(&reference).unwrap();
    // The reference becomes a link after preparation observed its version.
    fs::rename(&reference, cards.join("moved-aside")).unwrap();
    symlink(cards.join("moved-aside"), &reference).unwrap();
    let command = crate::journal::Command {
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        method: "PATCH".into(),
        target: crate::journal::Target {
            project_id: project.clone(),
            kind: Kind::Card,
            id: card.body["result"]["id"].as_str().unwrap().into(),
        },
        expected: Some(card.body["result"]["version"].as_str().unwrap().into()),
        payload: json!({}),
    };
    let handle = engine.store(&project).unwrap();
    let references = || {
        vec![crate::journal::Reference {
            kind: Kind::Card,
            id: other_id.into(),
            version: Some(project_store::document::version(&bytes)),
        }]
    };
    let retitle = |old: Option<&Value>| -> Result<Value, Reply> {
        let mut next = old.unwrap().clone();
        next["metadata"]["title"] = json!("Never written");
        Ok(next)
    };
    let writer = crate::writer::Writer {
        journal: &engine.journal,
    };
    let reply = {
        let mut store = handle.lock().unwrap();
        writer.execute(&mut store, &command, references(), now_millis(), retitle)
    };
    assert_invalid(reply, "write reference");
    assert_eq!(
        engine.journal.state(&command).unwrap(),
        CommandState::Rejected
    );
    let mut delete = command.clone();
    delete.request_id = Uuid::now_v7().to_string();
    delete.method = "DELETE".into();
    let reply = {
        let mut store = handle.lock().unwrap();
        writer.execute_delete(
            &mut store,
            &delete,
            references(),
            now_millis(),
            |_| Ok(()),
            |_| Ok(()),
        )
    };
    assert_invalid(reply, "delete reference");
    assert!(!engine.journal.has_pending(&project).unwrap());
}
