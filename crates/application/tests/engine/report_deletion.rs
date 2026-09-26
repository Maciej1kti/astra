use super::*;
use crate::{
    journal::{Command, Reference, Target},
    writer::{CommitPoint, Writer},
};

fn report(engine: &Engine, project: &str, extra: Value) -> Value {
    let mut payload = json!({"kind":"decision_needed","target":{"type":"project","id":project},"summary":"Delete report test","author":{"kind":"human","label":"Owner"}});
    payload
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    let reply = engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Update,
            id: None,
            payload,
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
    reply.body["result"]["resource"].clone()
}
fn delete(engine: &Engine, project: &str, report: &Value, request: &str) -> Reply {
    engine
        .delete_report(
            project,
            report["metadata"]["id"].as_str().unwrap(),
            json!({}),
            request,
            engine.command_epoch(),
            Some(report["version"].as_str().unwrap().into()),
        )
        .unwrap()
}
#[test]
fn report_delete_is_conditional_durable_and_replayed_after_restart() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let resource = report(&engine, &project, json!({}));
    let id = resource["metadata"]["id"].as_str().unwrap();
    for (expected, payload, code) in [
        (None, json!({}), "PRECONDITION_REQUIRED"),
        (
            Some(format!("r1.{}", "0".repeat(64))),
            json!({}),
            "VERSION_CONFLICT",
        ),
        (
            Some(resource["version"].as_str().unwrap().into()),
            json!({"force":true}),
            "VALIDATION_FAILED",
        ),
    ] {
        let reply = engine
            .delete_report(
                &project,
                id,
                payload,
                &Uuid::now_v7().to_string(),
                engine.command_epoch(),
                expected,
            )
            .unwrap();
        assert_eq!(reply.body["error"]["code"], code);
        let mut observed = engine.get(&project, Kind::Update, id).unwrap();
        observed.as_object_mut().unwrap().remove("read");
        assert_eq!(observed, resource);
    }
    let request = Uuid::now_v7().to_string();
    let reply = delete(&engine, &project, &resource, &request);
    assert_eq!(reply.http_status, 200);
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(
        reply.body["result"],
        json!({"type":"update","id":id,"deleted":true})
    );
    assert!(
        !env.root
            .join(format!("project/.project/updates/{id}.json"))
            .exists()
    );
    assert!(
        engine.list(Some("update"), &Query::default()).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        delete(&engine, &project, &resource, &request).body["replayed"],
        true
    );
    assert_eq!(
        delete(&engine, &project, &resource, &Uuid::now_v7().to_string()).body["error"]["code"],
        "RESOURCE_NOT_FOUND"
    );
    let changed = engine
        .delete_report(
            &project,
            id,
            json!({"force":true}),
            &request,
            engine.command_epoch(),
            Some(resource["version"].as_str().unwrap().into()),
        )
        .unwrap();
    assert_eq!(changed.body["error"]["code"], "IDEMPOTENCY_KEY_REUSED");
}
#[test]
fn referencing_reports_must_be_deleted_first() {
    for field in ["supersedes", "resolves"] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.path());
        let original = report(&engine, &project, json!({}));
        let id = &original["metadata"]["id"];
        let extra = if field == "supersedes" {
            json!({"kind":"correction","supersedes":id})
        } else {
            json!({"kind":"resolution","resolves":[id]})
        };
        let dependent = report(&engine, &project, extra);
        let reply = delete(&engine, &project, &original, &Uuid::now_v7().to_string());
        assert_eq!(reply.body["error"]["code"], "REPORT_REFERENCED");
        assert_eq!(
            reply.body["error"]["details"]["referencing_report_id"],
            dependent["metadata"]["id"]
        );
        assert_eq!(
            delete(&engine, &project, &dependent, &Uuid::now_v7().to_string()).http_status,
            200
        );
        assert_eq!(
            delete(&engine, &project, &original, &Uuid::now_v7().to_string()).http_status,
            200
        );
    }
}
#[test]
fn report_delete_recovery_rechecks_new_external_references() {
    for add_reference in [false, true] {
        let env = Environment::new();
        let engine = env.engine();
        let project = register(&engine, &env.path());
        let original = report(&engine, &project, json!({}));
        let id = original["metadata"]["id"].as_str().unwrap();
        let cmd = Command {
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            method: "DELETE".into(),
            target: Target {
                project_id: project.clone(),
                kind: Kind::Update,
                id: id.into(),
            },
            expected: Some(original["version"].as_str().unwrap().into()),
            payload: json!({}),
        };
        let handle = engine.store(&project).unwrap();
        let mut store = handle.lock().unwrap();
        let project_version = crate::source::read(&store, Kind::Project, &project)
            .unwrap()
            .version;
        let reply = Writer {
            journal: &engine.journal,
        }
        .execute_delete(
            &mut store,
            &cmd,
            vec![Reference {
                kind: Kind::Project,
                id: project.clone(),
                version: Some(project_version),
            }],
            now_millis(),
            |_| Ok(()),
            |point| {
                if matches!(point, CommitPoint::Prepared) {
                    return Err(project_store::StoreError::Conflict);
                }
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(reply.http_status, 202);
        if add_reference {
            let mut value = original.clone();
            value.as_object_mut().unwrap().remove("version");
            let new_id = Uuid::new_v4().to_string();
            value["metadata"]["id"] = json!(new_id);
            value["metadata"]["kind"] = json!("correction");
            value["metadata"]["supersedes"] = json!(id);
            let bytes = project_store::document::serialize(
                &project_domain::validate_document(value).unwrap(),
            )
            .unwrap();
            let (dir, name) = store.location(Kind::Update, &new_id, true).unwrap();
            dir.replace(&name, &bytes, None).unwrap();
        }
        drop(store);
        drop(handle);
        drop(engine);
        let engine = env.engine();
        assert_eq!(
            env.root
                .join(format!("project/.project/updates/{id}.json"))
                .exists(),
            add_reference
        );
        let status = engine.command_status(&cmd.request_id, &cmd.epoch).unwrap();
        assert_eq!(
            status["state"],
            if add_reference {
                "needs_review"
            } else {
                "committed"
            }
        );
    }
}
