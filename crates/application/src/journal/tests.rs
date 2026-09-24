//! Characterization of the persisted command contract through real application operations.
use super::*;
use crate::{Mutation, engine::Engine, now_millis, writer::CommitPoint};
use std::path::PathBuf;

struct Fixture {
    engine: Engine,
    project: String,
    root: PathBuf,
    _temp: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let directory = Directory::open(&root).unwrap();
        directory.child("state", true).unwrap();
        directory.child("project", true).unwrap();
        let engine = Engine::open(&root.join("state")).unwrap();
        let plan = engine
            .registration_plan(
                root.join("project").to_str().unwrap(),
                Some("Records"),
                true,
            )
            .unwrap();
        let project = plan["project_id"].as_str().unwrap().to_owned();
        let fixture = Self {
            engine,
            project,
            root,
            _temp: temp,
        };
        let command = fixture.command(
            "WORKFLOW:registration",
            Kind::Project,
            &fixture.project,
            None,
            json!({"plan_id": plan["plan_id"]}),
        );
        let reply = fixture
            .engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &command.request_id,
                &command.epoch,
            )
            .unwrap();
        assert_record(
            &fixture.engine.journal,
            &command,
            "registration",
            "committed",
            &reply,
        );
        fixture
    }

    fn command(
        &self,
        method: &str,
        kind: Kind,
        id: &str,
        expected: Option<String>,
        payload: Value,
    ) -> Command {
        Command {
            request_id: Uuid::now_v7().to_string(),
            epoch: self.engine.journal.epoch.clone(),
            method: method.into(),
            target: Target {
                project_id: if method.starts_with("WORKSPACE:") || method == "POST:read-receipts" {
                    "workspace".into()
                } else {
                    self.project.clone()
                },
                kind,
                id: id.into(),
            },
            expected,
            payload,
        }
    }

    fn mutate(&self, command: &Command) -> Result<Reply, AppError> {
        self.engine.mutate(Mutation {
            project_id: command.target.project_id.clone(),
            kind: command.target.kind,
            id: (command.method == "PATCH").then(|| command.target.id.clone()),
            expected: command.expected.clone(),
            payload: command.payload.clone(),
            request_id: command.request_id.clone(),
            epoch: command.epoch.clone(),
        })
    }

    fn report(&self) -> String {
        let id = Uuid::new_v4().to_string();
        let command = self.command(
            "POST",
            Kind::Update,
            &id,
            None,
            json!({
                "id": id, "kind": "note", "summary": "A report",
                "target": {"type": "project", "id": self.project},
                "author": {"kind": "human", "label": "Owner"},
            }),
        );
        let reply = self.mutate(&command).unwrap();
        assert_eq!(reply.http_status, 200);
        assert_record(
            &self.engine.journal,
            &command,
            "update",
            "committed",
            &reply,
        );
        id
    }
}

fn assert_record(journal: &Journal, command: &Command, kind: &str, state: &str, reply: &Reply) {
    let db = journal.db().unwrap();
    let record = db.query_row(
        "SELECT digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json,error_json
         FROM commands WHERE epoch=?1 AND request_id=?2",
        params![command.epoch, command.request_id],
        |row| Ok(json!({
            "digest": row.get::<_, String>(0)?, "state": row.get::<_, String>(1)?,
            "target_kind": row.get::<_, String>(2)?, "project_id": row.get::<_, String>(3)?,
            "target_id": row.get::<_, String>(4)?, "received_at": row.get::<_, String>(5)?,
            "expires_at": row.get::<_, String>(6)?, "result": row.get::<_, Option<String>>(7)?,
            "error": row.get::<_, Option<String>>(8)?,
        })),
    ).unwrap();
    let digest = document::version(
        &serde_json::to_vec(&json!([
            1,
            command.method,
            command.target,
            command.expected,
            command.payload,
        ]))
        .unwrap(),
    );
    assert_eq!(record["digest"], digest);
    assert_eq!(record["state"], state);
    assert_eq!(record["target_kind"], kind);
    assert_eq!(record["project_id"], command.target.project_id);
    assert_eq!(record["target_id"], command.target.id);
    let time =
        |key: &str| chrono::DateTime::parse_from_rfc3339(record[key].as_str().unwrap()).unwrap();
    assert_eq!(
        (time("expires_at") - time("received_at")).num_milliseconds(),
        7 * 86_400_000
    );
    let (saved, absent) = if state == "rejected" {
        ("error", "result")
    } else {
        ("result", "error")
    };
    assert!(record[absent].is_null());
    assert_eq!(
        serde_json::from_str::<Value>(record[saved].as_str().unwrap()).unwrap(),
        json!(reply)
    );
    let replay = Journal::known(&db, command).unwrap().unwrap();
    assert_eq!(replay.http_status, reply.http_status);
    assert_eq!(replay.body, reply.clone().replay().body);
}

#[test]
fn persisted_records_keep_family_labels_digest_replies_and_retry_retention() {
    let fixture = Fixture::new();
    let journal = &fixture.engine.journal;
    let card = Uuid::new_v4().to_string();
    let create = fixture.command(
        "POST",
        Kind::Card,
        &card,
        None,
        json!({"id": card, "title": "Original"}),
    );
    let created = fixture.mutate(&create).unwrap();
    assert_record(journal, &create, "card", "committed", &created);
    let source = fixture
        .root
        .join(format!("project/.project/cards/{card}.md"));
    let bytes = std::fs::read(&source).unwrap();
    let mut patch = fixture.command(
        "PATCH",
        Kind::Card,
        &card,
        Some(document::version(&bytes)),
        json!({"set":{"title":"Original"}}),
    );
    let noop = fixture.mutate(&patch).unwrap();
    assert_eq!(noop.body["status"], "noop");
    assert_record(journal, &patch, "card", "committed", &noop);
    patch.request_id = Uuid::now_v7().to_string();
    patch.expected = Some(format!("r1.{}", "0".repeat(64)));
    let rejected = fixture.mutate(&patch).unwrap();
    assert_eq!(rejected.http_status, 412);
    assert_record(journal, &patch, "card", "rejected", &rejected);
    assert_eq!(std::fs::read(&source).unwrap(), bytes);

    for (payload, kind, state, expected_status) in [
        (
            json!({"locale":"pl"}),
            "preferences",
            "committed",
            "committed",
        ),
        // Legacy no-op/rejection rows use Command.target.kind, not the section label.
        (json!({"locale":"pl"}), "project", "committed", "noop"),
        (json!({"locale":"invalid"}), "project", "rejected", ""),
    ] {
        let command = fixture.command(
            "WORKSPACE:preferences",
            Kind::Project,
            "preferences",
            Some(fixture.engine.workspace().unwrap().version),
            payload,
        );
        let reply = fixture
            .engine
            .mutate_workspace(
                "preferences",
                &command.payload,
                &command.request_id,
                &command.epoch,
                command.expected.as_deref(),
            )
            .unwrap();
        if state == "rejected" {
            assert_eq!(reply.http_status, 422);
        } else {
            assert_eq!(reply.body["status"], expected_status);
        }
        assert_record(journal, &command, kind, state, &reply);
    }
    let report = fixture.report();
    for expected in ["committed", "noop"] {
        let command = fixture.command(
            "POST:read-receipts",
            Kind::Update,
            "receipts",
            None,
            json!({"items":[{"project_id": fixture.project, "update_id": report, "read":true}]}),
        );
        let reply = fixture
            .engine
            .receipts(&command.payload, &command.request_id, &command.epoch)
            .unwrap();
        assert_eq!(reply.body["status"], expected);
        assert_record(journal, &command, "receipt", "committed", &reply);
    }
    let missing = fixture.command(
        "POST:read-receipts",
        Kind::Update,
        "receipts",
        None,
        json!({"items":[{"project_id":fixture.project,"update_id":Uuid::new_v4(),"read":true}]}),
    );
    let rejected = fixture
        .engine
        .receipts(&missing.payload, &missing.request_id, &missing.epoch)
        .unwrap();
    assert_eq!(rejected.http_status, 404);
    assert_record(journal, &missing, "update", "rejected", &rejected);

    let pending = fixture.command(
        "WORKSPACE:preferences",
        Kind::Project,
        "preferences",
        Some(fixture.engine.workspace().unwrap().version),
        json!({"locale":"en"}),
    );
    let reply = fixture
        .engine
        .mutate_workspace_with(
            "preferences",
            &pending.payload,
            &pending.request_id,
            &pending.epoch,
            pending.expected.as_deref(),
            |point| {
                if point == CommitPoint::Prepared {
                    Err(AppError::invariant("injected before source write"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    let status = fixture
        .engine
        .command_status(&pending.request_id, &pending.epoch)
        .unwrap();
    assert_eq!(status["state"], "prepared");
    assert_eq!(status["result"]["status"], "committed");
    crate::wire::validate("CommandStatus", &status).unwrap();
    let now = now_millis();
    assert_eq!(
        journal.retain(now + 6 * 86_400_000).unwrap()["commands_removed"],
        0
    );
    assert!(
        journal.retain(now + 8 * 86_400_000).unwrap()["commands_removed"]
            .as_u64()
            .unwrap()
            >= 9
    );
    let db = journal.db().unwrap();
    let remaining: Vec<String> = db
        .prepare("SELECT request_id FROM commands")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(remaining, [pending.request_id]);
    assert_eq!(std::fs::read(source).unwrap(), bytes);
}

#[test]
fn rejected_command_status_preserves_the_original_error() {
    let fixture = Fixture::new();
    let card = Uuid::new_v4().to_string();
    let create = fixture.command(
        "POST",
        Kind::Card,
        &card,
        None,
        json!({"id": card, "title": "Archived card"}),
    );
    fixture.mutate(&create).unwrap();
    let source = fixture
        .root
        .join(format!("project/.project/cards/{card}.md"));
    let stale = fixture.command(
        "PATCH",
        Kind::Card,
        &card,
        Some(format!("r1.{}", "0".repeat(64))),
        json!({"set":{"title":"Stale change"}}),
    );
    let version_conflict = fixture.mutate(&stale).unwrap();
    let archive = fixture.command(
        "PATCH",
        Kind::Card,
        &card,
        Some(document::version(&std::fs::read(source).unwrap())),
        json!({"set":{"archived":true}}),
    );
    assert_eq!(fixture.mutate(&archive).unwrap().http_status, 200);
    let focus = fixture.command(
        "WORKSPACE:focus",
        Kind::Project,
        "focus",
        Some(fixture.engine.workspace().unwrap().version),
        json!({"items":[{"project_id":fixture.project,"card_id":card}]}),
    );
    let archived_target = fixture
        .engine
        .mutate_workspace(
            "focus",
            &focus.payload,
            &focus.request_id,
            &focus.epoch,
            focus.expected.as_deref(),
        )
        .unwrap();
    for (command, rejected, code) in [
        (&stale, version_conflict, "VERSION_CONFLICT"),
        (&focus, archived_target, "FOCUS_MEMBERSHIP_CHANGED"),
    ] {
        assert_eq!(rejected.body["error"]["code"], code);
        assert_eq!(rejected.body["error"]["request_id"], command.request_id);
        let status = fixture
            .engine
            .command_status(&command.request_id, &command.epoch)
            .unwrap();
        assert_eq!(status["state"], "rejected");
        assert_eq!(status["error"], rejected.body);
        crate::wire::validate("CommandStatus", &status).unwrap();
    }
}

#[test]
fn failure_to_record_a_command_cannot_commit_family_side_effects() {
    let fixture = Fixture::new();
    let report = fixture.report();
    let workspace = std::fs::read(fixture.root.join("state/workspace.json")).unwrap();
    let second = Directory::open(&fixture.root)
        .unwrap()
        .child("second", true)
        .unwrap();
    let plan = fixture
        .engine
        .registration_plan(second.path().to_str().unwrap(), Some("Uncommitted"), true)
        .unwrap();
    fixture
        .engine
        .journal
        .db()
        .unwrap()
        .execute_batch(
            "CREATE TEMP TRIGGER reject_command_record BEFORE INSERT ON commands
         BEGIN SELECT RAISE(ABORT, 'injected command record failure'); END;",
        )
        .unwrap();
    let card = Uuid::new_v4().to_string();
    let command = fixture.command(
        "POST",
        Kind::Card,
        &card,
        None,
        json!({"id": card, "title":"Uncommitted"}),
    );
    assert!(fixture.mutate(&command).is_err());
    assert!(
        !fixture
            .root
            .join(format!("project/.project/cards/{card}.md"))
            .exists()
    );
    assert!(
        fixture
            .engine
            .mutate_workspace(
                "preferences",
                &json!({"locale":"pl"}),
                &Uuid::now_v7().to_string(),
                &command.epoch,
                Some(&document::version(&workspace))
            )
            .is_err()
    );
    assert!(
        fixture
            .engine
            .receipts(
                &json!({"items":[{"project_id":fixture.project,"update_id":report,"read":true}]}),
                &Uuid::now_v7().to_string(),
                &command.epoch
            )
            .is_err()
    );
    assert_eq!(
        fixture
            .engine
            .get(&fixture.project, Kind::Update, &report)
            .unwrap()["read"],
        false
    );
    assert!(
        fixture
            .engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                &command.epoch
            )
            .is_err()
    );
    assert!(!second.path().join(".project/project.md").exists());
    assert_eq!(
        std::fs::read(fixture.root.join("state/workspace.json")).unwrap(),
        workspace
    );
    assert_eq!(
        fixture
            .engine
            .journal
            .db()
            .unwrap()
            .query_row("SELECT count(*) FROM workflow_jobs", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn state_v1_migration_keeps_pending_intents_history_and_epoch() {
    use std::os::unix::fs::PermissionsExt;
    let temp = tempfile::tempdir().unwrap();
    std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let root = temp.path().canonicalize().unwrap();
    let epoch = Uuid::new_v4().to_string();
    let request = Uuid::now_v7().to_string();
    let project = "11111111-1111-4111-8111-111111111111";
    let card = "22222222-2222-4222-8222-222222222222";
    let connection = rusqlite::Connection::open(root.join("state.sqlite")).unwrap();
    let v1_schema = include_str!("../../../../contracts/state-starting-schema.sql")
        .replace("after_hash TEXT,", "after_hash TEXT NOT NULL,")
        .replace(
            "'create','replace','delete','remove_registration','workflow_step'",
            "'create','replace','remove_registration','workflow_step'",
        );
    connection.execute_batch(&v1_schema).unwrap();
    connection
        .execute(
            "INSERT INTO meta(key,value) VALUES('command_epoch',?1)",
            [&epoch],
        )
        .unwrap();
    let command = json!({
        "request_id":request,
        "epoch":epoch,
        "method":"PATCH",
        "target":{"project_id":project,"kind":"card","id":card},
        "expected":"r1.before",
        "payload":{"set":{"title":"after"}}
    });
    connection
        .execute(
            "INSERT INTO commands(epoch,request_id,digest,state,target_kind,project_id,target_id,received_at,expires_at,result_json,error_json) VALUES(?1,?2,'digest','prepared','card',?3,?4,'2026-01-01','2026-01-08',?5,NULL)",
            rusqlite::params![
                epoch,
                request,
                project,
                card,
                json!({"http_status":202,"body":{"api_version":"1","request_id":request,"state":"prepared"}}).to_string()
            ],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO write_intents(epoch,request_id,step,approved_root,relative_path,before_hash,after_hash,before_bytes,after_bytes,intent_kind) VALUES(?1,?2,0,?3,?4,'r1.before','r1.after',?5,?6,'replace')",
            rusqlite::params![
                epoch,
                request,
                root.to_str().unwrap(),
                format!("cards/{card}.md"),
                b"before".as_slice(),
                b"after".as_slice()
            ],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO intent_context(epoch,request_id,command_json,references_json) VALUES(?1,?2,?3,'[]')",
            rusqlite::params![epoch, request, command.to_string()],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO history(id,project_id,target_kind,target_id,epoch,request_id,before_hash,after_hash,before_bytes,after_bytes,recorded_at) VALUES('55555555-5555-4555-8555-555555555555',?1,'card',?2,?3,?4,'r1.before','r1.after',?5,?6,'2026-01-01')",
            rusqlite::params![project, card, epoch, request, b"before".as_slice(), b"after".as_slice()],
        )
        .unwrap();
    connection.pragma_update(None, "user_version", 1).unwrap();
    drop(connection);

    let journal = Journal::open(&root).unwrap();
    assert_eq!(journal.epoch, epoch);
    assert_eq!(
        journal
            .db()
            .unwrap()
            .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        2
    );
    let pending = journal.pending(project).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].after.as_deref(), Some(&b"after"[..]));
    assert_eq!(
        journal
            .db()
            .unwrap()
            .query_row("SELECT count(*) FROM history", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
