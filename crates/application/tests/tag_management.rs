use project_application::{AppError, Mutation, Reply, engine::Engine, wire, writer::CommitPoint};
use project_store::{document, document::Kind, filesystem::Directory};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
use uuid::Uuid;

struct Environment {
    _temp: tempfile::TempDir,
    root: PathBuf,
}
impl Environment {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        Directory::open(&root)
            .unwrap()
            .child("state", true)
            .unwrap();
        Self { _temp: temp, root }
    }
    fn engine(&self) -> Engine {
        Engine::open(&self.root.join("state")).unwrap()
    }
    fn register(&self, engine: &Engine, name: &str) -> String {
        let path = self.root.join(name);
        Directory::open(&self.root)
            .unwrap()
            .child(name, true)
            .unwrap();
        let plan = engine
            .registration_plan(path.to_str().unwrap(), Some(name), true)
            .unwrap();
        let reply = engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                &engine.journal.epoch,
            )
            .unwrap();
        assert_eq!(reply.http_status, 202);
        plan["project_id"].as_str().unwrap().to_owned()
    }
    // Synthetic external sources intentionally bypass the projection, proving
    // that vocabulary discovery is independent of stale or paged view data.
    fn card(&self, project_folder: &str, title: &str, labels: Value, archived: bool) -> String {
        let id = Uuid::new_v4().to_string();
        let timestamp = project_application::instant(project_application::now_millis() - 10_000);
        let value = json!({
            "type": "card",
            "metadata": {
                "id": id,
                "title": title,
                "kind": "outcome",
                "status": "planned",
                "priority": "normal",
                "position": "80000000000000000000000000000000",
                "archived": archived,
                "created_at": timestamp,
                "updated_at": timestamp,
                "labels": labels,
            },
            "body": "Preserve this description.",
        });
        let bytes =
            document::serialize(&project_domain::validate_document(value).unwrap()).unwrap();
        let project = Directory::open(&self.root.join(project_folder).join(".project")).unwrap();
        let cards = project.child("cards", true).unwrap();
        cards.replace(&format!("{id}.md"), &bytes, None).unwrap();
        id
    }
    fn card_bytes(&self, folder: &str, id: &str) -> Vec<u8> {
        fs::read(
            self.root
                .join(folder)
                .join(format!(".project/cards/{id}.md")),
        )
        .unwrap()
    }
}

fn replace_tags(engine: &Engine, tags: Value, expected: Option<&str>, request: &str) -> Reply {
    engine
        .mutate_workspace(
            "tags",
            &json!({"tags":tags}),
            request,
            &engine.journal.epoch,
            expected,
        )
        .unwrap()
}

fn preview_mutation(engine: &Engine, change: &Value) -> Mutation {
    Mutation {
        project_id: change["project_id"].as_str().unwrap().into(),
        kind: Kind::Card,
        id: Some(change["card_id"].as_str().unwrap().into()),
        payload: json!({"set":{"labels":change["labels"]}}),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: Some(change["version"].as_str().unwrap().into()),
    }
}

#[test]
fn suggestions_use_indexed_names_while_management_still_reads_current_sources() {
    let env = Environment::new();
    let engine = env.engine();
    let project = env.register(&engine, "suggestions");
    env.card(
        "suggestions",
        "First",
        json!(["Indexed", " Historical "]),
        true,
    );
    engine.refresh_project(&project, None).unwrap();
    let suggestions = engine.tag_suggestions().unwrap();
    wire::validate("TagSuggestions", &suggestions).unwrap();
    assert_eq!(suggestions["names"], json!([" Historical ", "Indexed"]));
    env.card("suggestions", "External", json!(["Not indexed yet"]), false);
    assert_eq!(
        engine.tag_suggestions().unwrap()["names"],
        suggestions["names"]
    );
    assert!(
        engine.tag_catalog().unwrap()["tags"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tag| tag["name"] == "Not indexed yet")
    );
    assert_eq!(
        engine
            .tag_preview(&json!({"source":"Not indexed yet","target":"Indexed"}))
            .unwrap()["changes"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    engine.refresh_project(&project, None).unwrap();
    assert!(
        engine.tag_suggestions().unwrap()["names"]
            .as_array()
            .unwrap()
            .contains(&json!("Not indexed yet"))
    );
    engine
        .index
        .mark_unavailable(
            &project,
            "PROJECT_UNAVAILABLE",
            project_application::now_millis(),
        )
        .unwrap();
    let stale = engine.tag_suggestions().unwrap();
    wire::validate("TagSuggestions", &stale).unwrap();
    assert_eq!(stale["complete"], false);
    assert_eq!(stale["freshness"], "stale");
}

#[test]
fn vocabulary_is_optional_versioned_durable_and_does_not_rewrite_card_labels() {
    let env = Environment::new();
    let engine = env.engine();
    let project = env.register(&engine, "One");
    let card = env.card(
        "One",
        "Keep exact tags",
        json!(["Research, discovery", "QA"]),
        false,
    );
    let before = env.card_bytes("One", &card);
    let project_application::Versioned {
        value: workspace,
        version,
    } = engine.workspace().unwrap();
    let workspace = json!(workspace);
    assert!(
        workspace.get("tags").is_none(),
        "opening old workspaces must not migrate them"
    );
    let request = Uuid::now_v7().to_string();
    let tags = json!(["Research, discovery", "Unused", "QA", "qa", "żółć"]);
    let reply = replace_tags(&engine, tags.clone(), Some(&version), &request);
    assert_eq!(reply.http_status, 200, "{reply:?}");
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(reply.body["status"], "committed");
    assert_ne!(reply.body["result"]["version"], version);
    assert_eq!(
        replace_tags(&engine, tags.clone(), Some(&version), &request).body["replayed"],
        true
    );
    assert_eq!(
        replace_tags(&engine, json!(["Other"]), Some(&version), &request).body["error"]["code"],
        "IDEMPOTENCY_KEY_REUSED"
    );
    assert_eq!(
        replace_tags(
            &engine,
            json!([]),
            Some(&version),
            &Uuid::now_v7().to_string()
        )
        .http_status,
        412
    );
    assert_eq!(
        replace_tags(&engine, json!([]), None, &Uuid::now_v7().to_string()).http_status,
        428
    );
    assert_eq!(env.card_bytes("One", &card), before);
    assert_eq!(
        engine.get(&project, Kind::Card, &card).unwrap()["metadata"]["labels"],
        json!(["Research, discovery", "QA"])
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(json!(engine.workspace().unwrap().value)["tags"], tags);
    assert_eq!(env.card_bytes("One", &card), before);
}

#[test]
fn invalid_vocabulary_does_not_replace_valid_names() {
    let env = Environment::new();
    let engine = env.engine();
    let project_application::Versioned { value: _, version } = engine.workspace().unwrap();
    let before = fs::read(env.root.join("state/workspace.json")).unwrap();
    for tags in [
        json!(["QA", "QA"]),
        json!([""]),
        json!(["Tag\u{0}name"]),
        json!(["x".repeat(49)]),
        json!((0..501).map(|i| format!("Tag {i}")).collect::<Vec<_>>()),
    ] {
        let reply = replace_tags(&engine, tags, Some(&version), &Uuid::now_v7().to_string());
        assert_eq!(reply.http_status, 422, "{reply:?}");
        assert_eq!(
            fs::read(env.root.join("state/workspace.json")).unwrap(),
            before
        );
    }
}

#[test]
fn vocabulary_prepared_write_recovers_with_original_identity() {
    let env = Environment::new();
    let engine = env.engine();
    let project_application::Versioned { value: _, version } = engine.workspace().unwrap();
    let request = Uuid::now_v7().to_string();
    let reply = engine
        .mutate_workspace_with(
            "tags",
            &json!({"tags":["After recovery"]}),
            &request,
            &engine.journal.epoch,
            Some(&version),
            |point| {
                if point == CommitPoint::Prepared {
                    Err(AppError::invariant("injected test failure"))
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    assert!(
        json!(engine.workspace().unwrap().value)
            .get("tags")
            .is_none()
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        json!(engine.workspace().unwrap().value)["tags"],
        json!(["After recovery"])
    );
    let replay = replace_tags(&engine, json!(["After recovery"]), Some(&version), &request);
    assert_eq!(replay.body["replayed"], true);
    assert_eq!(replay.body["status"], "committed");
}

#[test]
fn catalog_reads_all_sources_including_archived_and_beyond_first_page() {
    let env = Environment::new();
    let engine = env.engine();
    let first = env.register(&engine, "First");
    let second = env.register(&engine, "Second");
    for i in 0..205 {
        env.card("First", &format!("Card {i}"), json!(["Common"]), i == 204);
    }
    env.card(
        "Second",
        "Exact values",
        json!([
            "Common",
            "Research, discovery",
            " QA ",
            "QA",
            "qa",
            "żółć",
            "e\u{301}",
            "é"
        ]),
        true,
    );
    let project = engine.get(&second, Kind::Project, &second).unwrap();
    assert_eq!(
        engine
            .mutate(Mutation {
                project_id: second.clone(),
                kind: Kind::Project,
                id: Some(second.clone()),
                payload: json!({"set":{"state":"archived"}}),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: Some(project["version"].as_str().unwrap().into()),
            })
            .unwrap()
            .http_status,
        200
    );
    let project_application::Versioned { value: _, version } = engine.workspace().unwrap();
    replace_tags(
        &engine,
        json!(["Common", "Unused"]),
        Some(&version),
        &Uuid::now_v7().to_string(),
    );
    let catalog = engine.tag_catalog().unwrap();
    wire::validate("TagCatalog", &catalog).unwrap();
    assert_eq!(catalog["complete"], true);
    assert_eq!(catalog["issues"], json!([]));
    let tags = catalog["tags"].as_array().unwrap();
    let common = tags.iter().find(|tag| tag["name"] == "Common").unwrap();
    assert_eq!(common["usage"], 206);
    assert_eq!(common["managed"], true);
    assert_eq!(
        common["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["project_id"] == first)
            .unwrap()["count"],
        205
    );
    assert_eq!(
        common["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["project_id"] == second)
            .unwrap()["count"],
        1
    );
    assert_eq!(
        tags.iter().find(|tag| tag["name"] == "Unused").unwrap()["usage"],
        0
    );
    for name in [
        "Research, discovery",
        " QA ",
        "QA",
        "qa",
        "żółć",
        "e\u{301}",
        "é",
    ] {
        let tag = tags.iter().find(|tag| tag["name"] == name).unwrap();
        assert_eq!(tag["usage"], 1);
        assert_eq!(tag["managed"], false);
    }
}

#[test]
fn catalog_and_preview_report_invalid_cards_and_unavailable_projects_individually() {
    let env = Environment::new();
    let engine = env.engine();
    let good_project = env.register(&engine, "Readable");
    let unavailable = env.register(&engine, "Unavailable");
    env.card("Readable", "Valid neighbor", json!(["Source"]), false);
    let broken = env.card("Readable", "Broken source", json!(["Source"]), false);
    fs::write(
        env.root
            .join(format!("Readable/.project/cards/{broken}.md")),
        b"invalid source",
    )
    .unwrap();
    fs::rename(env.root.join("Unavailable"), env.root.join("Moved-away")).unwrap();
    for result in [
        engine.tag_catalog().unwrap(),
        engine
            .tag_preview(&json!({"source":"Source","target":"Target"}))
            .unwrap(),
    ] {
        assert_eq!(result["complete"], false);
        let issues = result["issues"].as_array().unwrap();
        assert!(
            issues
                .iter()
                .any(|issue| issue["project_id"] == good_project && issue["card_id"] == broken)
        );
        assert!(
            issues
                .iter()
                .any(|issue| issue["project_id"] == unavailable)
        );
        assert!(issues.iter().all(|issue| {
            !issue["message"]
                .as_str()
                .unwrap()
                .contains(env.root.to_str().unwrap())
        }));
    }
    let catalog = engine.tag_catalog().unwrap();
    assert_eq!(
        catalog["tags"][0]["usage"], 1,
        "a broken neighbor must not hide valid cards"
    );
}

#[test]
fn preview_merges_exact_tags_without_writes_and_preserves_unrelated_order() {
    let env = Environment::new();
    let engine = env.engine();
    let project = env.register(&engine, "Project");
    let rename = env.card(
        "Project",
        "Rename",
        json!(["Source", "Other", "Research, discovery", "source"]),
        true,
    );
    let merge = env.card(
        "Project",
        "Merge",
        json!(["Source", "Other", "Target"]),
        false,
    );
    let unaffected = env.card("Project", "Keep variant", json!(["source"]), false);
    let before = [&rename, &merge, &unaffected].map(|id| env.card_bytes("Project", id));
    let preview = engine
        .tag_preview(&json!({"source":"Source","target":"Target"}))
        .unwrap();
    wire::validate("TagPreview", &preview).unwrap();
    assert_eq!(preview["complete"], true);
    let changes = preview["changes"].as_array().unwrap();
    assert_eq!(changes.len(), 2);
    assert_eq!(
        changes
            .iter()
            .find(|change| change["card_id"] == rename)
            .unwrap()["labels"],
        json!(["Target", "Other", "Research, discovery", "source"])
    );
    assert_eq!(
        changes
            .iter()
            .find(|change| change["card_id"] == merge)
            .unwrap()["labels"],
        json!(["Other", "Target"])
    );
    for (i, id) in [&rename, &merge, &unaffected].iter().enumerate() {
        assert_eq!(env.card_bytes("Project", id), before[i]);
    }
    assert_eq!(changes[0]["project_id"], project);
    for request in [
        json!({"source":"Source","target":"Source"}),
        json!({"source":"Source","target":" "}),
        json!({"source":"Source","target":" Target "}),
        json!({"source":"Source","target":"Target\u{0}name"}),
        json!({"source":"Source","target":"x".repeat(49)}),
        json!({"source":"Source","target":"Target","force":true}),
    ] {
        assert!(
            engine.tag_preview(&request).is_err(),
            "invalid preview input must not be accepted"
        );
    }
}

#[test]
fn preview_preserves_exact_historical_whitespace_destinations() {
    let env = Environment::new();
    let engine = env.engine();
    env.register(&engine, "Project");
    let with_target = env.card(
        "Project",
        "Existing target",
        json!(["Source", "Other", " Target "]),
        false,
    );
    let without_target = env.card(
        "Project",
        "Reuse source target",
        json!(["Source", "Second"]),
        false,
    );
    let preview = engine
        .tag_preview(&json!({"source":"Source","target":" Target "}))
        .unwrap();
    wire::validate("TagPreview", &preview).unwrap();
    assert_eq!(preview["target"], " Target ");
    let changes = preview["changes"].as_array().unwrap();
    assert_eq!(
        changes
            .iter()
            .find(|change| change["card_id"] == with_target)
            .unwrap()["labels"],
        json!(["Other", " Target "])
    );
    assert_eq!(
        changes
            .iter()
            .find(|change| change["card_id"] == without_target)
            .unwrap()["labels"],
        json!([" Target ", "Second"])
    );
    let project_application::Versioned { value: _, version } = engine.workspace().unwrap();
    replace_tags(
        &engine,
        json!(["Catalog only ", "  "]),
        Some(&version),
        &Uuid::now_v7().to_string(),
    );
    for target in ["Catalog only ", "  "] {
        let preview = engine
            .tag_preview(&json!({"source":"Source","target":target}))
            .unwrap();
        assert_eq!(preview["target"], target);
        assert!(preview["changes"].as_array().unwrap().iter().all(|change| {
            change["labels"]
                .as_array()
                .unwrap()
                .iter()
                .any(|name| name == target)
        }));
    }
    assert!(
        engine
            .tag_preview(&json!({"source":"Source","target":" Unknown "}))
            .is_err()
    );
    let before_catalog = engine.tag_catalog().unwrap();
    assert!(
        before_catalog["tags"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tag| tag["name"] == "Source" && tag["usage"] == 2),
        "preview still must not write source labels"
    );
}

#[test]
fn applying_preview_uses_expected_versions_and_keeps_partial_results_safe() {
    let env = Environment::new();
    let engine = env.engine();
    let project = env.register(&engine, "Project");
    let first = env.card("Project", "First", json!(["Source", "Other"]), false);
    let second = env.card("Project", "Second", json!(["Source"]), false);
    let preview = engine
        .tag_preview(&json!({"source":"Source","target":"Target"}))
        .unwrap();
    let changes = preview["changes"].as_array().unwrap();
    let first_change = changes
        .iter()
        .find(|change| change["card_id"] == first)
        .unwrap();
    let second_change = changes
        .iter()
        .find(|change| change["card_id"] == second)
        .unwrap();
    let second_before = engine.get(&project, Kind::Card, &second).unwrap();
    assert_eq!(
        engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Card,
                id: Some(second.clone()),
                payload: json!({"set":{"title":"Newer title","labels":["Source","Newer tag"]}}),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: Some(second_before["version"].as_str().unwrap().into()),
            })
            .unwrap()
            .http_status,
        200
    );
    let safe = preview_mutation(&engine, first_change);
    assert_eq!(
        engine.mutate(safe.clone()).unwrap().body["status"],
        "committed"
    );
    assert_eq!(engine.mutate(safe).unwrap().body["replayed"], true);
    let stale = preview_mutation(&engine, second_change);
    let rejected = engine.mutate(stale.clone()).unwrap();
    assert_eq!(rejected.http_status, 412);
    wire::validate("Error", &rejected.body).unwrap();
    let retry = engine.mutate(stale).unwrap();
    assert_eq!(retry.http_status, 412);
    assert_eq!(
        retry.body, rejected.body,
        "rejected command retries preserve the original error; Error has no replayed field"
    );
    let latest = engine.get(&project, Kind::Card, &second).unwrap();
    assert_eq!(latest["metadata"]["title"], "Newer title");
    assert_eq!(latest["metadata"]["labels"], json!(["Source", "Newer tag"]));
    assert_eq!(latest["body"], "Preserve this description.");
    assert_eq!(
        engine.get(&project, Kind::Card, &first).unwrap()["metadata"]["labels"],
        json!(["Target", "Other"])
    );
    let next_preview = engine
        .tag_preview(&json!({"source":"Source","target":"Target"}))
        .unwrap();
    assert_eq!(next_preview["changes"].as_array().unwrap().len(), 1);
    assert_eq!(
        next_preview["changes"][0]["labels"],
        json!(["Target", "Newer tag"])
    );
}

#[test]
fn preview_bounds_affected_cards_and_identifies_archived_project_limits() {
    let env = Environment::new();
    let engine = env.engine();
    let project = env.register(&engine, "Project");
    for i in 0..501 {
        env.card("Project", &format!("Card {i}"), json!(["Source"]), false);
    }
    let preview = engine
        .tag_preview(&json!({"source":"Source","target":"Target"}))
        .unwrap();
    assert_eq!(preview["changes"].as_array().unwrap().len(), 500);
    assert_eq!(preview["complete"], false);
    assert!(
        preview["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["message"].as_str().unwrap().contains("500"))
    );
    let before = engine.get(&project, Kind::Project, &project).unwrap();
    engine
        .mutate(Mutation {
            project_id: project.clone(),
            kind: Kind::Project,
            id: Some(project.clone()),
            payload: json!({"set":{"state":"archived"}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(before["version"].as_str().unwrap().into()),
        })
        .unwrap();
    let preview = engine
        .tag_preview(&json!({"source":"Source","target":"Target"}))
        .unwrap();
    assert!(!preview["changes"].as_array().unwrap().is_empty());
    assert_eq!(preview["complete"], false);
    assert!(
        preview["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["project_id"] == project
                && issue["message"].as_str().unwrap().contains("archived"))
    );
    assert_eq!(
        engine.tag_catalog().unwrap()["complete"],
        true,
        "archived sources remain readable in the catalog"
    );
}
