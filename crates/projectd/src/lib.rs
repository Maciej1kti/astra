use axum::{
    Router,
    body::to_bytes,
    extract::{ConnectInfo, Request, State, connect_info::Connected},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
};
use project_application::{AppError, Reply, auth::csrf_matches, engine::Engine, now_millis};
use std::{sync::Arc, time::Duration};
use tokio::{
    net::UnixListener,
    sync::{OwnedSemaphorePermit, Semaphore, watch},
};
use url::Url;
mod assets;
mod dispatch;
mod events;
mod picker;

#[derive(Clone)]
pub struct Service {
    pub engine: Arc<Engine>,
    picker: Arc<picker::Picker>,
    origin: String,
    host: String,
    slots: Arc<Semaphore>,
    streams: Arc<Semaphore>,
    shutdown: watch::Sender<bool>,
    body_timeout: Duration,
}
impl Service {
    pub fn new(engine: Engine, public_origin: &str) -> Result<Self, String> {
        let url = Url::parse(public_origin).map_err(|_| "Invalid public origin")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Public origin must be an HTTPS origin without credentials, path, query or fragment".into());
        }
        let host = match url.port() {
            Some(port) => format!("{}:{port}", url.host_str().unwrap()),
            None => url.host_str().unwrap().into(),
        };
        Ok(Self {
            engine: Arc::new(engine),
            picker: Arc::new(picker::Picker::default()),
            origin: url.origin().ascii_serialization(),
            host,
            slots: Arc::new(Semaphore::new(8)),
            streams: Arc::new(Semaphore::new(64)),
            shutdown: watch::channel(false).0,
            body_timeout: Duration::from_secs(10),
        })
    }
    pub fn browser_router(&self) -> Router {
        Router::new()
            .fallback(any(browser))
            .with_state(self.clone())
    }
    pub fn local_router(&self) -> Router {
        Router::new().fallback(any(local)).with_state(self.clone())
    }
    /// Stop long-lived responses before the listeners finish graceful shutdown.
    pub fn shutdown(&self) {
        self.shutdown.send_replace(true);
    }
}
#[derive(Clone)]
pub struct LocalPeer(pub Option<u32>);
impl Connected<axum::serve::IncomingStream<'_, UnixListener>> for LocalPeer {
    fn connect_info(stream: axum::serve::IncomingStream<'_, UnixListener>) -> Self {
        Self(stream.io().peer_cred().ok().map(|c| c.uid()))
    }
}
struct Input {
    method: String,
    path: String,
    query: String,
    headers: HeaderMap,
    body: serde_json::Value,
    local: bool,
}
enum Handled {
    Response(Response),
    Events(Input, OwnedSemaphorePermit),
}
fn header<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}
fn cookie(headers: &HeaderMap, name: &str) -> String {
    let mut values = headers
        .get_all("cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|s| s.split(';'))
        .filter_map(|s| s.trim().split_once('='))
        .filter(|(key, _)| *key == name)
        .map(|(_, value)| value);
    let first = values.next().unwrap_or("");
    if values.next().is_some() {
        String::new()
    } else {
        first.into()
    }
}
fn response(reply: Reply) -> Response {
    (
        StatusCode::from_u16(reply.http_status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        axum::Json(reply.body),
    )
        .into_response()
}
fn failure(error: AppError) -> Response {
    response(match error {
        AppError::Rejected(reply) => reply,
        error => {
            eprintln!("Application request failed: {}", failure_diagnostic(&error));
            Reply::error(503, "SERVICE_UNAVAILABLE", "")
        }
    })
}
fn failure_diagnostic(error: &AppError) -> String {
    // Only static operation labels are safe here; source errors can contain user data.
    match error {
        AppError::LockPoisoned(context) => format!("poisoned lock ({context})"),
        AppError::StoredData { context, .. } => format!("invalid stored data ({context})"),
        AppError::SourceValidation { context, .. } => format!("invalid source ({context})"),
        AppError::Unavailable(context) => format!("unavailable source ({context})"),
        AppError::Invariant(context) => format!("broken invariant ({context})"),
        AppError::Store(_) => "source storage error".into(),
        AppError::Database(_) => "state database error".into(),
        AppError::State => "invalid operational state".into(),
        AppError::Rejected(_) => "request rejected".into(),
    }
}
fn secured(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers
        .entry("cache-control")
        .or_insert(HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("content-security-policy", HeaderValue::from_static("default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"));
    response
}
async fn browser(State(service): State<Service>, request: Request) -> Response {
    secured(handle(service, request, false).await)
}
async fn local(
    State(service): State<Service>,
    ConnectInfo(peer): ConnectInfo<LocalPeer>,
    request: Request,
) -> Response {
    if peer.0 != Some(rustix::process::getuid().as_raw()) {
        return secured(response(Reply::error(403, "PEER_UID_MISMATCH", "")));
    }
    secured(handle(service, request, true).await)
}
async fn handle(service: Service, request: Request, local: bool) -> Response {
    let (parts, body) = request.into_parts();
    let path = parts.uri.path().to_string();
    let mutation = !matches!(parts.method.as_str(), "GET" | "HEAD");
    if !local {
        if parts.headers.get_all("host").iter().count() != 1
            || header(&parts.headers, "host") != service.host
        {
            return response(Reply::error(403, "HOST_MISMATCH", ""));
        }
        if path.starts_with("/local/") {
            return response(Reply::error(404, "NOT_FOUND", ""));
        }
        let origin = header(&parts.headers, "origin");
        if (mutation || !origin.is_empty()) && origin != service.origin {
            return response(Reply::error(403, "ORIGIN_MISMATCH", ""));
        }
        if header(&parts.headers, "sec-fetch-site") == "cross-site" {
            return response(Reply::error(403, "CROSS_SITE_REQUEST", ""));
        }
    }
    if mutation
        && header(&parts.headers, "content-type")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            != "application/json"
    {
        return response(Reply::error(415, "JSON_REQUIRED", ""));
    }
    // Admission bounds body collectors as well as the blocking worker queue.
    let permit = match service.slots.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => return response(Reply::error(503, "SERVER_BUSY", "")),
    };
    let mut shutdown = service.shutdown.subscribe();
    if *shutdown.borrow() {
        return response(Reply::error(503, "SERVICE_UNAVAILABLE", ""));
    }
    let bytes = tokio::select! {
        _ = shutdown.changed() => return response(Reply::error(503, "SERVICE_UNAVAILABLE", "")),
        result = tokio::time::timeout(service.body_timeout, to_bytes(body, 1_100_000)) => match result {
            Ok(Ok(bytes)) => bytes,
            Ok(Err(_)) => return response(Reply::error(413, "BODY_TOO_LARGE", "")),
            Err(_) => return response(Reply::error(408, "REQUEST_TIMEOUT", "")),
        },
    };
    let mut input = Input {
        method: parts.method.to_string(),
        path,
        query: parts.uri.query().unwrap_or("").into(),
        headers: parts.headers,
        body: serde_json::Value::Null,
        local,
    };
    let worker = service.clone();
    match tokio::task::spawn_blocking(move || {
        // Near-limit JSON parsing must not run on a Tokio event-loop thread.
        input.body = if bytes.is_empty() && !mutation {
            serde_json::json!({})
        } else {
            match serde_json::from_slice(&bytes) {
                Ok(value) => value,
                Err(_) => {
                    return Handled::Response(response(Reply::error(400, "INVALID_JSON", "")));
                }
            }
        };
        if input.method == "GET" && input.path == "/api/v1/events" {
            return Handled::Events(input, permit);
        }
        let _permit = permit;
        Handled::Response(dispatch(&worker, input).unwrap_or_else(failure))
    })
    .await
    {
        Ok(Handled::Response(response)) => response,
        Ok(Handled::Events(input, permit)) => events::serve(service, input, permit).await,
        Err(_) => failure(AppError::State),
    }
}
fn dispatch(service: &Service, input: Input) -> Result<Response, AppError> {
    let auth = service.engine.auth();
    let now = now_millis();
    if input.method == "GET" && input.path == "/healthz" {
        return Ok(axum::Json(serde_json::json!({"status":"ok"})).into_response());
    }
    if !input.local
        && matches!(input.method.as_str(), "GET" | "HEAD")
        && !input.path.starts_with("/api/")
    {
        return Ok(assets::serve(
            &input.path,
            &input.headers,
            input.method == "HEAD",
        ));
    }
    if !input.local {
        match (input.method.as_str(), input.path.as_str()) {
            ("POST", "/api/v1/auth/pairings") => {
                let started = auth.start(&input.body, now)?;
                let mut reply = axum::Json(started.view).into_response();
                set_cookie(
                    &mut reply,
                    "__Host-project_pending",
                    &started.pending_token,
                    300,
                );
                return Ok(reply);
            }
            ("GET", "/api/v1/auth/pairings/current") => {
                return Ok(axum::Json(
                    auth.current(&cookie(&input.headers, "__Host-project_pending"), now)?,
                )
                .into_response());
            }
            ("POST", "/api/v1/auth/pairings/claim") => {
                if input.body != serde_json::json!({}) {
                    return Err(AppError::reject(400, "INVALID_INPUT"));
                }
                let claimed = auth.claim(
                    &cookie(&input.headers, "__Host-project_pending"),
                    header(&input.headers, "x-csrf-token"),
                    now,
                )?;
                let mut reply = axum::Json(claimed.view).into_response();
                set_cookie(
                    &mut reply,
                    "__Host-project_session",
                    &claimed.session_token,
                    90 * 86400,
                );
                return Ok(reply);
            }
            _ => {}
        }
    }
    let session = if input.local {
        None
    } else {
        Some(auth.authenticate(&cookie(&input.headers, "__Host-project_session"), now)?)
    };
    if let Some(session) = &session
        && !matches!(input.method.as_str(), "GET" | "HEAD")
        && !csrf_matches(&session.csrf, header(&input.headers, "x-csrf-token"))
    {
        return Err(AppError::reject(403, "CSRF_MISMATCH"));
    }
    dispatch::run(service, input, session)
}
fn set_cookie(response: &mut Response, name: &str, token: &str, seconds: u32) {
    response.headers_mut().append(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "{name}={token}; Path=/; Max-Age={seconds}; Secure; HttpOnly; SameSite=Strict"
        ))
        .expect("generated cookie"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use std::convert::Infallible;

    fn service() -> (tempfile::TempDir, Service) {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let service =
            Service::new(Engine::open(state.path()).unwrap(), "https://projects.test").unwrap();
        (temp, service)
    }
    fn pending_request() -> Request {
        Request::builder()
            .method("POST")
            .uri("/api/v1/auth/pairings")
            .header("content-type", "application/json")
            .body(Body::from_stream(async_stream::stream! {
                let chunk = std::future::pending::<Result<&'static str, Infallible>>().await;
                yield chunk;
            }))
            .unwrap()
    }
    async fn code(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["error"]["code"]
            .as_str()
            .unwrap()
            .to_owned()
    }
    #[tokio::test]
    async fn internal_failures_keep_diagnostics_and_public_responses_free_of_source_data() {
        let error = AppError::Database(rusqlite::Error::InvalidParameterName(
            "private-user-content".into(),
        ));
        assert!(error.to_string().contains("private-user-content"));
        assert_eq!(failure_diagnostic(&error), "state database error");
        let response = failure(error);
        assert_eq!(response.status(), 503);
        let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&bytes).unwrap(),
            Reply::error(503, "SERVICE_UNAVAILABLE", "").body,
        );
        assert_eq!(
            failure_diagnostic(&AppError::LockPoisoned("workspace operation gate")),
            "poisoned lock (workspace operation gate)",
        );
        let rejected = failure(AppError::reject(412, "VERSION_CONFLICT"));
        assert_eq!(rejected.status(), 412);
        assert_eq!(code(rejected).await, "VERSION_CONFLICT");
    }
    #[tokio::test]
    async fn admission_bounds_body_collectors_and_releases_cancelled_requests() {
        let (_temp, service) = service();
        let mut requests = Vec::new();
        for _ in 0..8 {
            let service = service.clone();
            requests.push(tokio::spawn(handle(service, pending_request(), true)));
        }
        tokio::time::timeout(Duration::from_secs(1), async {
            while service.slots.available_permits() != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let busy = handle(
            service.clone(),
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
            true,
        )
        .await;
        assert_eq!(busy.status(), 503);
        assert_eq!(code(busy).await, "SERVER_BUSY");
        for request in requests {
            request.abort();
            let _ = request.await;
        }
        assert_eq!(service.slots.available_permits(), 8);
        let healthy = handle(
            service,
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
            true,
        )
        .await;
        assert_eq!(healthy.status(), 200);
    }
    #[tokio::test]
    async fn body_timeout_and_invalid_inputs_release_admission() {
        let (_temp, mut service) = service();
        service.body_timeout = Duration::from_millis(20);
        let timeout = handle(service.clone(), pending_request(), true).await;
        assert_eq!(timeout.status(), 408);
        assert_eq!(code(timeout).await, "REQUEST_TIMEOUT");
        for (body, status, expected) in [
            ("{".to_owned(), 400, "INVALID_JSON"),
            ("x".repeat(1_100_001), 413, "BODY_TOO_LARGE"),
        ] {
            let request = Request::builder()
                .method("POST")
                .uri("/api/v1/auth/pairings")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap();
            let response = handle(service.clone(), request, true).await;
            assert_eq!(response.status(), status);
            assert_eq!(code(response).await, expected);
            assert_eq!(service.slots.available_permits(), 8);
        }
        // Header security checks still take precedence over body processing.
        assert_eq!(
            handle(service.clone(), pending_request(), false)
                .await
                .status(),
            403
        );
        service.shutdown();
        assert_eq!(
            handle(service.clone(), pending_request(), true)
                .await
                .status(),
            503
        );
        assert_eq!(service.slots.available_permits(), 8);
    }
    #[tokio::test]
    async fn open_streams_use_their_own_limit_after_admission() {
        let (_temp, mut service) = service();
        service.slots = Arc::new(Semaphore::new(1));
        service.streams = Arc::new(Semaphore::new(2));
        let request = || {
            Request::builder()
                .uri("/api/v1/events")
                .body(Body::empty())
                .unwrap()
        };
        let first = handle(service.clone(), request(), true).await;
        let second = handle(service.clone(), request(), true).await;
        assert_eq!(first.status(), 200);
        assert_eq!(second.status(), 200);
        assert_eq!(service.slots.available_permits(), 1);
        assert_eq!(
            code(handle(service.clone(), request(), true).await).await,
            "STREAM_LIMIT"
        );
        drop((first, second));
        assert_eq!(service.streams.available_permits(), 2);
    }
    #[tokio::test]
    async fn browser_stream_expires_without_index_changes() {
        let (_temp, service) = service();
        let auth = service.engine.auth();
        let now = now_millis();
        let pending = auth
            .start(
                &serde_json::json!({"device_label":"Expiry regression"}),
                now,
            )
            .unwrap();
        auth.decide(
            pending.view["id"].as_str().unwrap(),
            pending.view["challenge"].as_str().unwrap(),
            true,
            now,
        )
        .unwrap();
        let session = auth
            .claim(
                &pending.pending_token,
                pending.view["pending_csrf_token"].as_str().unwrap(),
                now,
            )
            .unwrap();
        // Shorten a normally issued fixture session instead of waiting thirty days.
        rusqlite::Connection::open(_temp.path().join("state/state.sqlite"))
            .unwrap()
            .execute(
                "UPDATE sessions SET expires_at=?1 WHERE id=?2",
                rusqlite::params![
                    project_application::instant(now_millis() + 500),
                    session.view["id"].as_str().unwrap()
                ],
            )
            .unwrap();
        let request = Request::builder()
            .uri("/api/v1/events")
            .header("host", "projects.test")
            .header(
                "cookie",
                format!("__Host-project_session={}", session.session_token),
            )
            .body(Body::empty())
            .unwrap();
        let response = handle(service, request, false).await;
        assert_eq!(response.status(), 200);
        tokio::time::timeout(Duration::from_secs(2), to_bytes(response.into_body(), 4096))
            .await
            .expect("session expiry must wake an otherwise idle stream")
            .unwrap();
    }
}
