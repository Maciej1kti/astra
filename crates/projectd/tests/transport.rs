use project_application::engine::Engine;
use project_store::filesystem::Directory;
use projectd::{LocalPeer, Service};
use serde_json::{Value, json};
use tokio::net::{TcpListener, UnixListener};
use uuid::Uuid;
struct Running {
    _temp: tempfile::TempDir,
    tcp: String,
    browser: reqwest::Client,
    local: reqwest::Client,
    tasks: Vec<tokio::task::JoinHandle<()>>,
    project: String,
}

#[tokio::test]
async fn command_status_requires_the_original_epoch_and_validates_its_response() {
    let app = Running::new().await;
    let hello: Value = app
        .local("GET", "/local/v1/hello")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let epoch = hello["command_epoch"].as_str().unwrap();
    let catalog: Value = app
        .local("GET", "/api/v1/workspace/tags")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = Uuid::now_v7().to_string();
    let saved = app
        .local("PUT", "/api/v1/workspace/tags")
        .header("x-request-id", &id)
        .header("x-command-epoch", epoch)
        .header(
            "if-match",
            format!("\"{}\"", catalog["version"].as_str().unwrap()),
        )
        .json(&json!({"tags":["Epoch test"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let path = format!("/api/v1/commands/{id}");
    for (query, status, code) in [
        (String::new(), 400, "MISSING_QUERY_PARAMETER"),
        ("?epoch=invalid".into(), 400, "INVALID_EPOCH"),
        (format!("?epoch={}", Uuid::new_v4()), 409, "EPOCH_CHANGED"),
        (
            format!("?epoch={epoch}&epoch={epoch}"),
            400,
            "INVALID_QUERY",
        ),
    ] {
        let response = app
            .local("GET", &format!("{path}{query}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{query}");
        let value: Value = response.json().await.unwrap();
        assert_eq!(value["error"]["code"], code);
        project_application::wire::validate("Error", &value).unwrap();
    }
    let value: Value = app
        .local("GET", &format!("{path}?epoch={epoch}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("CommandStatus", &value).unwrap();
    assert_eq!(value["state"], "committed");
    let rejected_id = Uuid::now_v7().to_string();
    let rejected = app
        .local("PUT", "/api/v1/workspace/tags")
        .header("x-request-id", &rejected_id)
        .header("x-command-epoch", epoch)
        .header(
            "if-match",
            format!("\"{}\"", catalog["version"].as_str().unwrap()),
        )
        .json(&json!({"tags":[]}))
        .send()
        .await
        .unwrap();
    assert_eq!(rejected.status(), 412);
    let status: Value = app
        .local(
            "GET",
            &format!("/api/v1/commands/{rejected_id}?epoch={epoch}"),
        )
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["state"], "rejected");
    project_application::wire::validate("CommandStatus", &status).unwrap();
}
impl Drop for Running {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
    }
}
impl Running {
    async fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
        let state = root.child("state", true).unwrap();
        let project = root
            .child("project", true)
            .unwrap()
            .path()
            .to_str()
            .unwrap()
            .to_owned();
        let service =
            Service::new(Engine::open(state.path()).unwrap(), "https://projects.test").unwrap();
        let tcp = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("http://{}", tcp.local_addr().unwrap());
        let socket = state.path().join("test.sock");
        let unix = UnixListener::bind(&socket).unwrap();
        let browser = service.browser_router();
        let local = service.local_router();
        let tasks = vec![
            tokio::spawn(async move {
                axum::serve(tcp, browser).await.unwrap();
            }),
            tokio::spawn(async move {
                axum::serve(
                    unix,
                    local.into_make_service_with_connect_info::<LocalPeer>(),
                )
                .await
                .unwrap();
            }),
        ];
        Self {
            _temp: temp,
            tcp: address,
            browser: reqwest::Client::builder().no_proxy().build().unwrap(),
            local: reqwest::Client::builder()
                .unix_socket(socket)
                .no_proxy()
                .build()
                .unwrap(),
            tasks,
            project,
        }
    }
    fn browser(&self, method: &str, path: &str) -> reqwest::RequestBuilder {
        self.browser
            .request(method.parse().unwrap(), format!("{}{path}", self.tcp))
            .header("host", "projects.test")
    }
    fn local(&self, method: &str, path: &str) -> reqwest::RequestBuilder {
        self.local
            .request(method.parse().unwrap(), format!("http://localhost{path}"))
    }
}
#[tokio::test]
async fn browser_pairing_csrf_and_local_uid_transport() {
    let app = Running::new().await;
    assert_eq!(
        app.browser
            .get(format!("{}/healthz", app.tcp))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        app.browser("GET", "/healthz")
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        app.browser("GET", "/local/v1/hello")
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        app.browser("GET", "/api/v1/bootstrap")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        app.browser("POST", "/api/v1/auth/pairings")
            .json(&json!({"device_label":"Test"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let pairing = app
        .browser("POST", "/api/v1/auth/pairings")
        .header("origin", "https://projects.test")
        .json(&json!({"device_label":"Test"}))
        .send()
        .await
        .unwrap();
    assert_eq!(pairing.status(), 200);
    let cookie = pairing.headers()["set-cookie"].to_str().unwrap().to_owned();
    assert!(cookie.contains("Secure; HttpOnly; SameSite=Strict"));
    let pending_cookie = cookie.split(';').next().unwrap();
    let pairing: Value = pairing.json().await.unwrap();
    let claim = || {
        app.browser("POST", "/api/v1/auth/pairings/claim")
            .header("origin", "https://projects.test")
            .header("cookie", pending_cookie)
            .header(
                "x-csrf-token",
                pairing["pending_csrf_token"].as_str().unwrap(),
            )
            .json(&json!({}))
    };
    assert_eq!(claim().send().await.unwrap().status(), 409);
    let id = pairing["id"].as_str().unwrap();
    assert_eq!(
        app.local("POST", &format!("/local/v1/pairings/{id}/approve"))
            .json(&json!({"challenge":pairing["challenge"]}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let claimed = claim().send().await.unwrap();
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
    for (method, path, body) in [
        (
            "PUT",
            "/api/v1/workspace/tags",
            json!({"tags":["Protected"]}),
        ),
        (
            "POST",
            "/api/v1/workspace/tags/preview",
            json!({"source":"Source","target":"Target"}),
        ),
    ] {
        assert_eq!(
            app.browser(method, path)
                .header("origin", "https://projects.test")
                .header("cookie", &session_cookie)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            403,
            "tag operations must use the existing authenticated CSRF boundary"
        );
    }
    let diagnostics: Value = app
        .local("GET", "/local/v1/doctor")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("Diagnostics", &diagnostics).unwrap();
    assert_eq!(diagnostics["state"], "ready");

    assert_eq!(
        app.browser("POST", "/api/v1/auth/logout")
            .header("origin", "https://projects.test")
            .header("cookie", &session_cookie)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        app.browser("POST", "/api/v1/auth/logout")
            .header("origin", "https://projects.test")
            .header("cookie", &session_cookie)
            .header("x-csrf-token", bootstrap["csrf_token"].as_str().unwrap())
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        app.browser("GET", "/api/v1/bootstrap")
            .header("cookie", &session_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
}
#[tokio::test]
async fn workspace_tag_transport_preserves_command_contracts_and_view_versions() {
    let app = Running::new().await;
    assert_eq!(
        app.browser("GET", "/api/v1/workspace/tags")
            .send()
            .await
            .unwrap()
            .status(),
        401,
    );
    assert_eq!(
        app.browser("POST", "/api/v1/workspace/tags/preview")
            .header("origin", "https://projects.test")
            .json(&json!({"source":"Source","target":"Target"}))
            .send()
            .await
            .unwrap()
            .status(),
        401,
    );
    let hello: Value = app
        .local("GET", "/local/v1/hello")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let epoch = hello["command_epoch"].as_str().unwrap();
    let catalog = app
        .local("GET", "/api/v1/workspace/tags")
        .send()
        .await
        .unwrap();
    assert_eq!(catalog.status(), 200);
    assert!(!catalog.headers().contains_key("etag"));
    let catalog: Value = catalog.json().await.unwrap();
    project_application::wire::validate("TagCatalog", &catalog).unwrap();
    let request = Uuid::now_v7().to_string();
    let save = || {
        app.local("PUT", "/api/v1/workspace/tags")
            .header("x-request-id", &request)
            .header("x-command-epoch", epoch)
            .header(
                "if-match",
                format!("\"{}\"", catalog["version"].as_str().unwrap()),
            )
            .json(&json!({"tags":["Source","Target"]}))
    };
    let saved = save().send().await.unwrap();
    assert_eq!(saved.status(), 200);
    let saved: Value = saved.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &saved).unwrap();
    assert_eq!(saved["result"]["type"], "tags");
    let replay: Value = save().send().await.unwrap().json().await.unwrap();
    project_application::wire::validate("CommandResponse", &replay).unwrap();
    assert_eq!(replay["replayed"], true);
    let plan: Value = app
        .local("POST", "/local/v1/registration-plans")
        .json(&json!({"absolute_path":app.project,"git_mode":"private"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        app.local("POST", "/api/v1/registrations")
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", epoch)
            .json(&json!({"plan_id":plan["plan_id"]}))
            .send()
            .await
            .unwrap()
            .status(),
        202
    );
    let path = format!(
        "/api/v1/projects/{}/cards",
        plan["project_id"].as_str().unwrap()
    );
    let card = app
        .local("POST", &path)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", epoch)
        .json(&json!({"title":"Rename over real transport","labels":["Source","Other"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(card.status(), 200);
    let card: Value = card.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &card).unwrap();
    let catalog_before: Value = app
        .local("GET", "/api/v1/workspace/tags")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let preview = app
        .local("POST", "/api/v1/workspace/tags/preview")
        .json(&json!({"source":"Source","target":"Target"}))
        .send()
        .await
        .unwrap();
    assert_eq!(preview.status(), 200);
    assert!(!preview.headers().contains_key("etag"));
    let preview: Value = preview.json().await.unwrap();
    project_application::wire::validate("TagPreview", &preview).unwrap();
    assert_eq!(preview["changes"].as_array().unwrap().len(), 1);
    let change = &preview["changes"][0];
    assert_eq!(change["labels"], json!(["Target", "Other"]));
    assert_eq!(change["version"], card["result"]["version"]);
    let path = format!("{}/{}", path, change["card_id"].as_str().unwrap());
    let read = app.local("GET", &path).send().await.unwrap();
    assert!(
        read.headers().contains_key("etag"),
        "ordinary source resources retain strong ETags"
    );
    let read: Value = read.json().await.unwrap();
    assert_eq!(
        read["metadata"]["labels"],
        json!(["Source", "Other"]),
        "preview must not apply any card changes"
    );
    let applied = app
        .local("PATCH", &path)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", epoch)
        .header(
            "if-match",
            format!("\"{}\"", change["version"].as_str().unwrap()),
        )
        .json(&json!({"set":{"labels":change["labels"]}}))
        .send()
        .await
        .unwrap();
    assert_eq!(applied.status(), 200);
    let applied: Value = applied.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &applied).unwrap();
    let after = app
        .local("GET", "/api/v1/workspace/tags")
        .send()
        .await
        .unwrap();
    assert!(!after.headers().contains_key("etag"));
    let after: Value = after.json().await.unwrap();
    project_application::wire::validate("TagCatalog", &after).unwrap();
    assert_eq!(
        after["version"], catalog_before["version"],
        "card changes do not alter the workspace write version"
    );
    assert_ne!(
        after["tags"], catalog_before["tags"],
        "source usage changes independently of that version"
    );
    assert_eq!(
        after["tags"]
            .as_array()
            .unwrap()
            .iter()
            .find(|tag| tag["name"] == "Target")
            .unwrap()["usage"],
        1
    );
}

#[tokio::test]
async fn registration_mutation_preconditions_and_replay_over_unix() {
    let app = Running::new().await;
    let hello: Value = app
        .local("GET", "/local/v1/hello")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let epoch = hello["command_epoch"].as_str().unwrap();
    let plan: Value = app
        .local("POST", "/local/v1/registration-plans")
        .json(&json!({"absolute_path":app.project,"git_mode":"private"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let registration = app
        .local("POST", "/api/v1/registrations")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", epoch)
        .json(&json!({"plan_id":plan["plan_id"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(registration.status(), 202);
    let validation: Value = app
        .local(
            "GET",
            &format!(
                "/api/v1/projects/{}/validation",
                plan["project_id"].as_str().unwrap()
            ),
        )
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    project_application::wire::validate("SourceValidation", &validation).unwrap();
    assert_eq!(validation["valid"], true);

    let path = format!(
        "/api/v1/projects/{}/cards",
        plan["project_id"].as_str().unwrap()
    );
    let id = Uuid::now_v7().to_string();
    let create = || {
        app.local("POST", &path)
            .header("x-request-id", &id)
            .header("x-command-epoch", epoch)
            .json(&json!({"title":"Real socket write"}))
    };
    let first: Value = create().send().await.unwrap().json().await.unwrap();
    project_application::wire::validate("CommandResponse", &first).unwrap();
    let retry: Value = create().send().await.unwrap().json().await.unwrap();
    assert_eq!(retry["replayed"], true);
    let resource = &first["result"]["resource"];
    let path = format!("{}/{}", path, resource["metadata"]["id"].as_str().unwrap());
    assert_eq!(
        app.local("PATCH", &path)
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", epoch)
            .json(&json!({"set":{"title":"Missing precondition"}}))
            .send()
            .await
            .unwrap()
            .status(),
        428
    );
    let read = app.local("GET", &path).send().await.unwrap();
    assert_eq!(read.status(), 200);
    assert!(read.headers().contains_key("etag"));
    let project = plan["project_id"].as_str().unwrap();
    let resolved: Value = app
        .local("POST", "/local/v1/projects/resolve")
        .json(&json!({"absolute_path":app.project}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(resolved["project_id"], project);
    assert_eq!(
        app.local("POST", "/local/v1/projects/resolve")
            .json(&json!({"absolute_path":format!("{}/child",app.project)}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );

    for (path, schema) in [
        (format!("/api/v1/projects/{project}/git"), "GitObservation"),
        (
            format!("/api/v1/views/list?type=card&project_id={project}&limit=1&q=socket"),
            "SummaryPage",
        ),
        ("/api/v1/search?q=socket".into(), "SummaryPage"),
        (
            format!("/api/v1/projects/{project}/context?max_bytes=4096"),
            "Context",
        ),
        (
            format!("/api/v1/views/board?project_id={project}"),
            "BoardView",
        ),
        (
            format!("/api/v1/views/gantt?project_id={project}"),
            "GanttPage",
        ),
        (
            "/api/v1/views/calendar?from=2026-09-01&to=2026-09-30".into(),
            "CalendarPage",
        ),
        ("/api/v1/views/attention".into(), "AttentionPage"),
    ] {
        let response = app.local("GET", &path).send().await.unwrap();
        assert_eq!(response.status(), 200, "{path}");
        let value: Value = response.json().await.unwrap();
        project_application::wire::validate(schema, &value).unwrap();
        if schema == "SummaryPage" {
            assert_eq!(value["items"].as_array().unwrap().len(), 1);
        }
    }
    let card = resource["metadata"]["id"].as_str().unwrap();
    for target in [
        json!({"type":"card","id":card}),
        json!({"type":"project","id":project}),
    ] {
        let report = app.local("POST", &format!("/api/v1/projects/{project}/updates"))
            .header("x-request-id", Uuid::now_v7().to_string()).header("x-command-epoch", epoch)
            .json(&json!({"kind":"note","summary":"Targeted report","target":target,"body":"","author":{"kind":"human","label":"Test"}}))
            .send().await.unwrap();
        assert_eq!(report.status(), 200);
    }
    for path in [
        format!("/api/v1/projects/{project}/updates?target_type=card&target_id={card}"),
        format!(
            "/api/v1/views/list?type=update&project_id={project}&target_type=card&target_id={card}"
        ),
    ] {
        let response = app.local("GET", &path).send().await.unwrap();
        assert_eq!(response.status(), 200);
        let value: Value = response.json().await.unwrap();
        project_application::wire::validate("SummaryPage", &value).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
        assert_eq!(
            value["items"][0]["target"],
            json!({"type":"card","id":card})
        );
    }
    for path in [
        format!("/api/v1/projects/{project}/updates?target_type=card"),
        format!("/api/v1/views/list?type=card&target_type=card&target_id={card}"),
    ] {
        assert_eq!(app.local("GET", &path).send().await.unwrap().status(), 422);
    }
    let plan: Value = app
        .local("POST", "/local/v1/maintenance/plans")
        .json(&json!({"operation":"index_rebuild","project_id":project}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(plan["kind"], "index_rebuild");
    let applied=app.local("POST","/local/v1/maintenance/jobs").json(&json!({"plan_id":plan["plan_id"],"request_id":Uuid::now_v7().to_string(),"command_epoch":epoch})).send().await.unwrap();
    assert_eq!(applied.status(), 202);
    for path in [
        "/api/v1/views/list?type=unknown",
        "/api/v1/views/list?type=card&type=update",
        "/api/v1/search?search=socket",
    ] {
        assert_eq!(app.local("GET", path).send().await.unwrap().status(), 400);
    }
}

#[tokio::test]
async fn static_assets_negotiate_gzip_and_keep_api_responses_private() {
    let app = Running::new().await;
    let document = app.browser("GET", "/").send().await.unwrap();
    assert_eq!(document.headers()["cache-control"], "no-cache");
    let html = document.text().await.unwrap();
    let asset = html
        .split("src=\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    assert!(asset.starts_with("/assets/"));
    let identity = app.browser("GET", asset).send().await.unwrap();
    assert_eq!(
        identity.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(identity.headers()["vary"], "Accept-Encoding");
    assert!(identity.headers().get("content-encoding").is_none());
    let identity = identity.bytes().await.unwrap();
    let compressed = app
        .browser("GET", asset)
        .header("accept-encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(compressed.headers()["content-encoding"], "gzip");
    let compressed = compressed.bytes().await.unwrap();
    assert!(compressed.len() < identity.len());
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), &compressed).unwrap();
    let decoded = std::process::Command::new("gzip")
        .args(["-d", "-c"])
        .arg(file.path())
        .output()
        .unwrap();
    assert!(decoded.status.success());
    assert_eq!(decoded.stdout, identity);
    let veto = app
        .browser("GET", asset)
        .header("accept-encoding", "gzip;q=0, *;q=1")
        .send()
        .await
        .unwrap();
    assert!(veto.headers().get("content-encoding").is_none());
    assert_eq!(veto.bytes().await.unwrap(), identity);
    let head = app
        .browser("HEAD", asset)
        .header("accept-encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(head.headers()["content-encoding"], "gzip");
    assert_eq!(
        head.headers()["content-length"]
            .to_str()
            .unwrap()
            .parse::<usize>()
            .unwrap(),
        compressed.len()
    );
    assert!(head.bytes().await.unwrap().is_empty());
    let missing = app
        .browser("GET", "/assets/obsolete-Abcd1234.js")
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);
    assert_eq!(missing.headers()["cache-control"], "no-store");
    let api = app
        .local("GET", "/local/v1/hello")
        .header("accept-encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(api.headers()["cache-control"], "no-store");
    assert!(api.headers().get("content-encoding").is_none());
}

#[tokio::test]
async fn session_revocation_closes_the_browser_event_stream() {
    let app = Running::new().await;
    let pending = app
        .browser("POST", "/api/v1/auth/pairings")
        .header("origin", "https://projects.test")
        .json(&json!({"device_label":"Stream regression"}))
        .send()
        .await
        .unwrap();
    let cookie = pending.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let pending: Value = pending.json().await.unwrap();
    let approved = app
        .local(
            "POST",
            &format!(
                "/local/v1/pairings/{}/approve",
                pending["id"].as_str().unwrap()
            ),
        )
        .json(&json!({"challenge":pending["challenge"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(approved.status(), 200);
    let claimed = app
        .browser("POST", "/api/v1/auth/pairings/claim")
        .header("origin", "https://projects.test")
        .header("cookie", cookie)
        .header(
            "x-csrf-token",
            pending["pending_csrf_token"].as_str().unwrap(),
        )
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(claimed.status(), 200);
    let cookie = claimed.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let session: Value = claimed.json().await.unwrap();
    let mut stream = app
        .browser("GET", "/api/v1/events")
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    assert!(stream.chunk().await.unwrap().is_some());
    let revoked = app
        .local(
            "DELETE",
            &format!("/api/v1/auth/sessions/{}", session["id"].as_str().unwrap()),
        )
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(revoked.status(), 200);
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while stream.chunk().await.unwrap().is_some() {}
    })
    .await
    .expect("revocation must actively close an existing stream");
    assert_eq!(
        app.browser("GET", "/api/v1/bootstrap")
            .header("cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
}
