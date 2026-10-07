//! New project folders and their private repositories over real transport,
//! with a stand-in GitHub CLI and real Git.
use super::*;
use project_application::wire;
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

async fn call(app: &Running, method: &str, path: &str, body: Option<&Value>) -> (u16, Value) {
    let mut request = app.local(method, path);
    if let Some(body) = body {
        request = request.json(body);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap())
}
fn code(reply: &(u16, Value)) -> &str {
    reply.1["error"]["code"].as_str().unwrap_or("")
}
/// Approve a new directory of the test as a registration root.
async fn root(app: &Running, name: &str) -> (String, PathBuf) {
    let path = app._temp.path().canonicalize().unwrap().join(name);
    std::fs::create_dir(&path).unwrap();
    let reply = call(
        app,
        "POST",
        "/local/v1/roots",
        Some(&json!({"absolute_path": path, "label": name})),
    )
    .await;
    assert_eq!(reply.0, 200, "{}", reply.1);
    (reply.1["id"].as_str().unwrap().to_owned(), path)
}
async fn create(app: &Running, id: &str, name: &str) -> (u16, Value) {
    call(
        app,
        "POST",
        "/api/v1/project-folders",
        Some(&json!({"creation_id": id, "name": name})),
    )
    .await
}
/// Create a folder for a new project, register it and return its ID and folder name.
async fn add(app: &Running, name: &str) -> (String, String) {
    let reply = create(app, &Uuid::new_v4().to_string(), name).await;
    assert_eq!(reply.0, 200, "{}", reply.1);
    wire::validate("ProjectFolder", &reply.1).unwrap();
    let (_, boot) = call(app, "GET", "/api/v1/bootstrap", None).await;
    let response = app
        .local("POST", "/api/v1/registrations")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", boot["command_epoch"].as_str().unwrap())
        .json(&json!({"plan_id": reply.1["plan"]["plan_id"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 202);
    let accepted: Value = response.json().await.unwrap();
    let job = accepted["job_id"].as_str().unwrap();
    let (_, job) = call(app, "GET", &format!("/api/v1/jobs/{job}"), None).await;
    assert_eq!(job["state"], "done");
    (
        reply.1["plan"]["project_id"].as_str().unwrap().to_owned(),
        reply.1["folder"].as_str().unwrap().to_owned(),
    )
}
async fn publish(app: &Running, project: &str) -> (u16, Value) {
    let reply = call(
        app,
        "POST",
        &format!("/api/v1/projects/{project}/repository"),
        Some(&json!({})),
    )
    .await;
    wire::validate("ProjectRepository", &reply.1).unwrap();
    reply
}
async fn settled(app: &Running, project: &str) -> Value {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let (status, value) = call(
            app,
            "GET",
            &format!("/api/v1/projects/{project}/repository"),
            None,
        )
        .await;
        assert_eq!(status, 200, "{value}");
        wire::validate("ProjectRepository", &value).unwrap();
        if value["state"] != "publishing" {
            return value;
        }
        assert!(Instant::now() < deadline, "the publication did not finish");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
fn account(app: &Running) -> PathBuf {
    app._temp.path().canonicalize().unwrap().join("github")
}
fn log(app: &Running) -> Vec<String> {
    std::fs::read_to_string(account(app).join("log"))
        .unwrap_or_default()
        .lines()
        .map(str::to_owned)
        .collect()
}
fn git(directory: &Path, arguments: &[&str]) -> String {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .output()
        .unwrap();
    assert!(output.status.success(), "git {arguments:?}");
    String::from_utf8(output.stdout).unwrap()
}

#[tokio::test]
async fn a_named_project_gets_a_folder_in_the_default_root_and_a_private_repository() {
    let app = Running::with_github().await;
    let (_, projects) = root(&app, "projects").await;
    let (_, boot) = call(&app, "GET", "/api/v1/bootstrap", None).await;
    assert_eq!(boot["github_enabled"], true);

    let id = Uuid::new_v4().to_string();
    let first = create(&app, &id, "  Żółta Łódź ").await;
    assert_eq!(first.0, 200, "{}", first.1);
    wire::validate("ProjectFolder", &first.1).unwrap();
    assert_eq!(first.1["folder"], "zolta-lodz");
    assert!(projects.join("zolta-lodz").is_dir());
    // A repeated request returns the first result and creates nothing.
    assert_eq!(create(&app, &id, "  Żółta Łódź ").await, first);
    assert_eq!(std::fs::read_dir(&projects).unwrap().count(), 1);
    let reused = create(&app, &id, "Another name").await;
    assert_eq!((reused.0, code(&reused)), (409, "CREATION_ID_REUSED"));

    let (project, folder) = add(&app, "Astra").await;
    assert_eq!(folder, "astra");
    let (_, summary) = call(&app, "GET", &format!("/api/v1/projects/{project}"), None).await;
    assert_eq!(summary["metadata"]["name"], "Astra", "{summary}");
    let path = format!("/api/v1/projects/{project}/repository");
    let before = call(&app, "GET", &path, None).await;
    assert_eq!(before.1, json!({"state":"absent","url":null,"error":null}));

    let started = publish(&app, &project).await;
    assert_eq!(
        (started.0, &started.1["state"]),
        (202, &json!("publishing"))
    );
    let state = settled(&app, &project).await;
    let remote = format!("file://{}/remotes/octo/astra.git", account(&app).display());
    assert_eq!(
        state,
        json!({"state":"published","url":remote,"error":null})
    );
    assert!(log(&app).contains(&"repo create octo/astra --private".to_owned()));
    let pushed = git(
        &account(&app).join("remotes/octo/astra.git"),
        &["ls-tree", "-r", "--name-only", "main"],
    );
    let files: Vec<_> = pushed.lines().collect();
    assert!(files.contains(&".project/project.json"), "{files:?}");
    assert!(files.contains(&"AGENTS.md"), "{files:?}");
    assert!(!files.iter().any(|file| file.starts_with(".project/.local")));

    // Publishing a published folder starts nothing.
    let creations = log(&app).len();
    let again = publish(&app, &project).await;
    assert_eq!((again.0, &again.1["state"]), (200, &json!("published")));
    assert!(
        !log(&app)[creations..]
            .iter()
            .any(|line| line.starts_with("repo create"))
    );
    let invalid = call(&app, "POST", &path, Some(&json!({"name":"other"}))).await;
    assert_eq!((invalid.0, code(&invalid)), (422, "VALIDATION_FAILED"));
    let missing = call(
        &app,
        "GET",
        &format!("/api/v1/projects/{}/repository", Uuid::new_v4()),
        None,
    )
    .await;
    assert_eq!((missing.0, code(&missing)), (404, "PROJECT_NOT_FOUND"));
}

#[tokio::test]
async fn a_name_taken_in_the_root_or_on_github_receives_the_first_free_suffix() {
    let app = Running::with_github().await;
    let (_, projects) = root(&app, "projects").await;
    std::fs::write(projects.join("astra"), "a file of that name").unwrap();
    std::fs::create_dir_all(account(&app).join("remotes/octo/astra-2.git")).unwrap();

    let (project, folder) = add(&app, "Astra").await;
    assert_eq!(folder, "astra-3");
    assert_eq!(publish(&app, &project).await.0, 202);
    assert_eq!(settled(&app, &project).await["state"], "published");
    assert!(
        account(&app)
            .join("remotes/octo/astra-3.git/HEAD")
            .is_file()
    );
    assert_eq!(
        std::fs::read_to_string(projects.join("astra")).unwrap(),
        "a file of that name"
    );

    // A repository created after the folder was named moves only the repository.
    let (late, folder) = add(&app, "Late").await;
    assert_eq!(folder, "late");
    std::fs::create_dir_all(account(&app).join("remotes/octo/late.git")).unwrap();
    publish(&app, &late).await;
    let state = settled(&app, &late).await;
    assert_eq!(state["state"], "published", "{state}");
    assert!(state["url"].as_str().unwrap().ends_with("/octo/late-2.git"));
}

#[tokio::test]
async fn a_github_failure_leaves_the_project_local_and_publication_can_be_repeated() {
    let app = Running::with_github().await;
    root(&app, "projects").await;
    std::fs::write(account(&app).join("offline"), "").unwrap();

    let (project, folder) = add(&app, "Offline project").await;
    assert_eq!(folder, "offline-project");
    let (status, summary) = call(&app, "GET", &format!("/api/v1/projects/{project}"), None).await;
    assert_eq!(status, 200, "{summary}");
    publish(&app, &project).await;
    assert_eq!(
        settled(&app, &project).await,
        json!({"state":"failed","url":null,"error":"GITHUB_UNAVAILABLE"})
    );

    std::fs::remove_file(account(&app).join("offline")).unwrap();
    std::fs::write(account(&app).join("signed-out"), "").unwrap();
    // The account is asked again: nothing was learned while GitHub was unreachable.
    assert_eq!(publish(&app, &project).await.0, 202);
    assert_eq!(
        settled(&app, &project).await["error"],
        "GITHUB_AUTH_REQUIRED"
    );

    std::fs::remove_file(account(&app).join("signed-out")).unwrap();
    assert_eq!(publish(&app, &project).await.0, 202);
    let state = settled(&app, &project).await;
    assert_eq!(state["state"], "published", "{state}");
    assert_eq!(state["error"], Value::Null);

    // A host signed out after the account was learned is still told apart
    // from an unreachable GitHub.
    let (later, _) = add(&app, "Signed out later").await;
    std::fs::write(account(&app).join("signed-out"), "").unwrap();
    publish(&app, &later).await;
    assert_eq!(settled(&app, &later).await["error"], "GITHUB_AUTH_REQUIRED");
}

#[tokio::test]
async fn the_default_root_is_the_preference_or_the_only_approved_root() {
    let app = Running::new().await;
    let (_, boot) = call(&app, "GET", "/api/v1/bootstrap", None).await;
    assert_eq!(boot["github_enabled"], false);
    let none = create(&app, &Uuid::new_v4().to_string(), "First").await;
    assert_eq!((none.0, code(&none)), (409, "PROJECT_ROOT_NOT_SET"));

    let (_, first) = root(&app, "first").await;
    let (project, _) = add(&app, "First").await;
    assert!(first.join("first/.project/project.json").is_file());
    let disabled = call(
        &app,
        "GET",
        &format!("/api/v1/projects/{project}/repository"),
        None,
    )
    .await;
    assert_eq!((disabled.0, code(&disabled)), (404, "GITHUB_DISABLED"));
    let disabled = call(
        &app,
        "POST",
        &format!("/api/v1/projects/{project}/repository"),
        Some(&json!({})),
    )
    .await;
    assert_eq!((disabled.0, code(&disabled)), (404, "GITHUB_DISABLED"));

    let (second_id, second) = root(&app, "second").await;
    let ambiguous = create(&app, &Uuid::new_v4().to_string(), "Second").await;
    assert_eq!(
        (ambiguous.0, code(&ambiguous)),
        (409, "PROJECT_ROOT_NOT_SET")
    );
    let patch = |root: String| {
        let app = &app;
        let epoch = boot["command_epoch"].as_str().unwrap().to_owned();
        async move {
            let (_, preferences) = call(app, "GET", "/api/v1/workspace/preferences", None).await;
            app.local("PATCH", "/api/v1/workspace/preferences")
                .header("x-request-id", Uuid::now_v7().to_string())
                .header("x-command-epoch", epoch)
                .header(
                    "if-match",
                    format!("\"{}\"", preferences["version"].as_str().unwrap()),
                )
                .json(&json!({"preferences":{"project_root_id":root}}))
                .send()
                .await
                .unwrap()
        }
    };
    let unknown = patch(Uuid::new_v4().to_string()).await;
    assert_eq!(unknown.status(), 422);
    let unknown: Value = unknown.json().await.unwrap();
    assert_eq!(unknown["error"]["code"], "PROJECT_ROOT_NOT_FOUND");
    assert_eq!(patch(second_id.clone()).await.status(), 200);
    add(&app, "Second").await;
    assert!(second.join("second/.project/project.json").is_file());

    // A revoked root is not replaced by another one silently.
    let removed = call(
        &app,
        "DELETE",
        &format!("/local/v1/roots/{second_id}"),
        Some(&json!({})),
    )
    .await;
    assert_eq!(removed.0, 200);
    let revoked = create(&app, &Uuid::new_v4().to_string(), "Third").await;
    assert_eq!((revoked.0, code(&revoked)), (409, "PROJECT_ROOT_NOT_FOUND"));
    let empty = create(&app, &Uuid::new_v4().to_string(), "   ").await;
    assert_eq!((empty.0, code(&empty)), (422, "VALIDATION_FAILED"));
}
