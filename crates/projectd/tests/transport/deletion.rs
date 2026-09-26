use super::*;
use std::{collections::BTreeMap, fs, os::unix::fs::symlink, path::Path};

fn tree_snapshot(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn visit(root: &Path, path: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let mut entries: Vec<_> = fs::read_dir(path).unwrap().map(Result::unwrap).collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .into_owned();
            let metadata = fs::symlink_metadata(&path).unwrap();
            if metadata.is_dir() {
                out.insert(format!("{relative}/"), Vec::new());
                visit(root, &path, out);
            } else if metadata.is_file() {
                out.insert(relative, fs::read(&path).unwrap());
            } else {
                out.insert(relative, Vec::new());
            }
        }
    }

    let mut snapshot = BTreeMap::new();
    visit(root, root, &mut snapshot);
    snapshot
}

async fn register(app: &Running) -> (String, String) {
    let hello: Value = app
        .local("GET", "/local/v1/hello")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let epoch = hello["command_epoch"].as_str().unwrap().to_owned();
    let response = app
        .local("POST", "/local/v1/registration-plans")
        .json(&json!({"absolute_path":app.project,"git_mode":"private"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let plan: Value = response.json().await.unwrap();
    let project = plan["project_id"].as_str().unwrap().to_owned();
    let registration = app
        .local("POST", "/api/v1/registrations")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", &epoch)
        .json(&json!({"plan_id":plan["plan_id"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(registration.status(), 202);
    (project, epoch)
}

async fn create_card(app: &Running, project: &str, epoch: &str) -> (String, String) {
    let response = app
        .local("POST", &format!("/api/v1/projects/{project}/cards"))
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", epoch)
        .json(&json!({"title":"Transport deletion card"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let value: Value = response.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &value).unwrap();
    (
        value["result"]["resource"]["metadata"]["id"]
            .as_str()
            .unwrap()
            .to_owned(),
        value["result"]["version"].as_str().unwrap().to_owned(),
    )
}

async fn deletion_plan(app: &Running, project: &str) -> Value {
    let response = app
        .local("GET", &format!("/api/v1/projects/{project}/deletion-plan"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let value: Value = response.json().await.unwrap();
    project_application::wire::validate("ProjectDeletionPlan", &value).unwrap();
    value
}

async fn browser_session(app: &Running) -> (String, String) {
    let pending = app
        .browser("POST", "/api/v1/auth/pairings")
        .header("origin", "https://projects.test")
        .json(&json!({"device_label":"Deletion transport test"}))
        .send()
        .await
        .unwrap();
    assert_eq!(pending.status(), 200);
    let pending_cookie = pending.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let pending_value: Value = pending.json().await.unwrap();
    let id = pending_value["id"].as_str().unwrap();
    let approved = app
        .local("POST", &format!("/local/v1/pairings/{id}/approve"))
        .json(&json!({"challenge":pending_value["challenge"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(approved.status(), 200);
    let claimed = app
        .browser("POST", "/api/v1/auth/pairings/claim")
        .header("origin", "https://projects.test")
        .header("cookie", &pending_cookie)
        .header(
            "x-csrf-token",
            pending_value["pending_csrf_token"].as_str().unwrap(),
        )
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(claimed.status(), 200);
    let session_cookie = claimed.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let bootstrap: Value = app
        .browser("GET", "/api/v1/bootstrap")
        .header("cookie", &session_cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("Bootstrap", &bootstrap).unwrap();
    (
        session_cookie,
        bootstrap["csrf_token"].as_str().unwrap().to_owned(),
    )
}

#[tokio::test]
async fn project_deletion_plan_is_schema_valid_and_read_only() {
    let app = Running::new().await;
    let (project, _) = register(&app).await;
    let source = Path::new(&app.project).join(".project");
    let before = tree_snapshot(&source);
    let plan = deletion_plan(&app, &project).await;
    assert_eq!(plan["project_id"], project);
    assert!(
        plan["display_path"]
            .as_str()
            .unwrap()
            .ends_with("/.project")
    );
    assert!(plan["version"].as_str().unwrap().starts_with("r1."));
    assert!(plan["file_count"].as_u64().unwrap() > 0);
    assert_eq!(
        tree_snapshot(&source),
        before,
        "GET plan must not write .project"
    );
}

#[tokio::test]
async fn browser_project_delete_requires_pairing_and_csrf() {
    let app = Running::new().await;
    let project = Uuid::now_v7().to_string();
    let request = || {
        app.browser("DELETE", &format!("/api/v1/projects/{project}"))
            .header("origin", "https://projects.test")
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", Uuid::now_v7().to_string())
            .header("if-match", format!("\"r1.{}\"", "a".repeat(64)))
            .json(&json!({}))
    };
    assert_eq!(request().send().await.unwrap().status(), 401);
    let (cookie, _) = browser_session(&app).await;
    assert_eq!(
        request()
            .header("cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
}

#[tokio::test]
async fn deletion_transport_rejects_missing_stale_and_extra_preconditions() {
    let app = Running::new().await;
    let (project, epoch) = register(&app).await;
    let (card, card_version) = create_card(&app, &project, &epoch).await;
    let plan = deletion_plan(&app, &project).await;
    let card_path = format!("/api/v1/projects/{project}/cards/{card}");
    let project_path = format!("/api/v1/projects/{project}");

    let response = app
        .local("DELETE", &card_path)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", &epoch)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 428);
    let error: Value = response.json().await.unwrap();
    project_application::wire::validate("Error", &error).unwrap();
    assert_eq!(error["error"]["code"], "PRECONDITION_REQUIRED");

    let response = app
        .local("DELETE", &card_path)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", &epoch)
        .header("if-match", format!("\"{card_version}\""))
        .json(&json!({"extra":true}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 422);
    let error: Value = response.json().await.unwrap();
    project_application::wire::validate("Error", &error).unwrap();
    assert_eq!(error["error"]["code"], "VALIDATION_FAILED");

    let response = app
        .local("DELETE", &project_path)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", &epoch)
        .header(
            "if-match",
            format!("\"{}\"", plan["version"].as_str().unwrap()),
        )
        .json(&json!({"extra":true}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 422);
    let error: Value = response.json().await.unwrap();
    project_application::wire::validate("Error", &error).unwrap();
    assert_eq!(error["error"]["code"], "VALIDATION_FAILED");

    fs::write(
        Path::new(&app.project).join(".project/added-after-plan.md"),
        b"new",
    )
    .unwrap();
    let request_id = Uuid::now_v7().to_string();
    let response = app
        .local("DELETE", &project_path)
        .header("x-request-id", &request_id)
        .header("x-command-epoch", &epoch)
        .header(
            "if-match",
            format!("\"{}\"", plan["version"].as_str().unwrap()),
        )
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 412);
    let error: Value = response.json().await.unwrap();
    project_application::wire::validate("Error", &error).unwrap();
    assert_eq!(error["error"]["code"], "VERSION_CONFLICT");
    assert!(Path::new(&app.project).join(".project/project.md").exists());
    assert!(
        Path::new(&app.project)
            .join(".project/added-after-plan.md")
            .exists()
    );
}

#[tokio::test]
async fn card_delete_over_unix_removes_source_and_replays_original_identity() {
    let app = Running::new().await;
    let (project, epoch) = register(&app).await;
    let (card, version) = create_card(&app, &project, &epoch).await;
    let path = format!("/api/v1/projects/{project}/cards/{card}");
    let request_id = Uuid::now_v7().to_string();
    let delete = || {
        app.local("DELETE", &path)
            .header("x-request-id", &request_id)
            .header("x-command-epoch", &epoch)
            .header("if-match", format!("\"{version}\""))
            .json(&json!({}))
    };
    let response = delete().send().await.unwrap();
    assert_eq!(response.status(), 200);
    let value: Value = response.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &value).unwrap();
    assert_eq!(
        value["result"],
        json!({"type":"card","id":card,"deleted":true})
    );
    assert!(
        !Path::new(&app.project)
            .join(".project/cards")
            .join(format!("{card}.md"))
            .exists()
    );
    let replay: Value = delete().send().await.unwrap().json().await.unwrap();
    project_application::wire::validate("CommandResponse", &replay).unwrap();
    assert_eq!(replay["replayed"], true);
    let status: Value = app
        .local(
            "GET",
            &format!("/api/v1/commands/{request_id}?epoch={epoch}"),
        )
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("CommandStatus", &status).unwrap();
    assert_eq!(status["state"], "committed");
}

#[tokio::test]
async fn project_delete_over_unix_removes_only_project_tree_and_replays() {
    let app = Running::new().await;
    let (project, epoch) = register(&app).await;
    let plan = deletion_plan(&app, &project).await;
    let path = format!("/api/v1/projects/{project}");
    let request_id = Uuid::now_v7().to_string();
    let delete = || {
        app.local("DELETE", &path)
            .header("x-request-id", &request_id)
            .header("x-command-epoch", &epoch)
            .header(
                "if-match",
                format!("\"{}\"", plan["version"].as_str().unwrap()),
            )
            .json(&json!({}))
    };
    let response = delete().send().await.unwrap();
    assert_eq!(response.status(), 200);
    let value: Value = response.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &value).unwrap();
    assert_eq!(
        value["result"],
        json!({"type":"project","id":project,"deleted":true})
    );
    assert!(!Path::new(&app.project).join(".project").exists());
    assert!(Path::new(&app.project).join("AGENTS.md").is_file());
    assert!(Path::new(&app.project).join(".gitignore").is_file());
    let replay: Value = delete().send().await.unwrap().json().await.unwrap();
    project_application::wire::validate("CommandResponse", &replay).unwrap();
    assert_eq!(replay["replayed"], true);
    let status: Value = app
        .local(
            "GET",
            &format!("/api/v1/commands/{request_id}?epoch={epoch}"),
        )
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("CommandStatus", &status).unwrap();
    assert_eq!(status["state"], "committed");
}

#[tokio::test]
async fn project_deletion_plan_rejects_symlink_hardlink_and_fifo_entries() {
    for variant in ["symlink", "hardlink", "fifo"] {
        let app = Running::new().await;
        let (project, _) = register(&app).await;
        let source = Path::new(&app.project).join(".project");
        let entry = source.join("unsafe-entry");
        match variant {
            "symlink" => symlink(Path::new("project.md"), &entry).unwrap(),
            "hardlink" => fs::hard_link(source.join("project.md"), &entry).unwrap(),
            "fifo" => {
                assert!(
                    std::process::Command::new("mkfifo")
                        .args(["-m", "400"])
                        .arg(&entry)
                        .status()
                        .unwrap()
                        .success()
                );
                assert!(std::os::unix::fs::FileTypeExt::is_fifo(
                    &fs::symlink_metadata(&entry).unwrap().file_type()
                ));
            }
            _ => unreachable!(),
        }
        let response = app
            .local("GET", &format!("/api/v1/projects/{project}/deletion-plan"))
            .send()
            .await
            .unwrap();
        assert_ne!(response.status(), 200, "{variant} must be rejected");
        let error: Value = response.json().await.unwrap();
        project_application::wire::validate("Error", &error).unwrap();
        assert!(matches!(
            error["error"]["code"].as_str(),
            Some("SPECIAL_FILE_OR_HARDLINK")
                | Some("PROJECT_TREE_UNSUPPORTED")
                | Some("PROJECT_TREE_SPECIAL_FILE_OR_HARDLINK")
                | Some("PROJECT_TREE_CHANGED")
        ));
        assert!(source.join("project.md").exists());
    }
}
