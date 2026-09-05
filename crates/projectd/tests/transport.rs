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
    for (path, schema) in [
        (
            format!("/api/v1/views/list?type=card&project_id={project}&limit=1"),
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
    for path in [
        "/api/v1/views/list?type=unknown",
        "/api/v1/views/list?type=card&type=update",
        "/api/v1/search?search=socket",
    ] {
        assert_eq!(app.local("GET", path).send().await.unwrap().status(), 400);
    }
}
