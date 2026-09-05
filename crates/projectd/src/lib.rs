use axum::{
    Router,
    body::to_bytes,
    extract::{ConnectInfo, Request, State, connect_info::Connected},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
};
use project_application::{
    AppError, Reply,
    auth::{Auth, csrf_matches},
    engine::Engine,
    now_millis,
};
use std::sync::Arc;
use tokio::{net::UnixListener, sync::Semaphore};
use url::Url;
mod dispatch;

#[derive(Clone)]
pub struct Service {
    pub engine: Arc<Engine>,
    origin: String,
    host: String,
    slots: Arc<Semaphore>,
    streams: Arc<Semaphore>,
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
            origin: url.origin().ascii_serialization(),
            host,
            slots: Arc::new(Semaphore::new(8)),
            streams: Arc::new(Semaphore::new(64)),
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
        _ => Reply::error(503, "SERVICE_UNAVAILABLE", ""),
    })
}
fn secured(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
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
    let bytes = match to_bytes(body, 1_100_000).await {
        Ok(bytes) => bytes,
        Err(_) => return response(Reply::error(413, "BODY_TOO_LARGE", "")),
    };
    let body = if bytes.is_empty() && !mutation {
        serde_json::json!({})
    } else {
        match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => return response(Reply::error(400, "INVALID_JSON", "")),
        }
    };
    let input = Input {
        method: parts.method.to_string(),
        path,
        query: parts.uri.query().unwrap_or("").into(),
        headers: parts.headers,
        body,
        local,
    };
    if input.method == "GET" && input.path == "/api/v1/events" {
        return events(service, input).await;
    }
    let permit = match service.slots.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => return response(Reply::error(503, "SERVER_BUSY", "")),
    };
    match tokio::task::spawn_blocking(move || {
        let _permit = permit;
        dispatch(&service, input)
    })
    .await
    {
        Ok(result) => result.unwrap_or_else(failure),
        Err(_) => failure(AppError::State),
    }
}
fn dispatch(service: &Service, input: Input) -> Result<Response, AppError> {
    let auth = Auth {
        journal: &service.engine.journal,
    };
    let now = now_millis();
    if input.method == "GET" && input.path == "/healthz" {
        return Ok(axum::Json(serde_json::json!({"status":"ok"})).into_response());
    }
    if !input.local && input.method == "GET" && !input.path.starts_with("/api/") {
        return Ok(static_file(&input.path));
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
include!(concat!(env!("OUT_DIR"), "/assets.rs"));
fn static_file(path: &str) -> Response {
    let path = if path == "/" { "/index.html" } else { path };
    match ASSETS.iter().find(|(name, _, _)| *name == path) {
        Some((_, mime, bytes)) => ([("content-type", *mime)], *bytes).into_response(),
        None => response(Reply::error(404, "NOT_FOUND", "")),
    }
}

async fn events(service: Service, input: Input) -> Response {
    use axum::response::sse::{Event, KeepAlive, Sse};
    let permit = match service.streams.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => return response(Reply::error(503, "STREAM_LIMIT", "")),
    };
    let token = cookie(&input.headers, "__Host-project_session");
    let mut cursor = header(&input.headers, "last-event-id").to_owned();
    if cursor.is_empty() {
        for (key, value) in url::form_urlencoded::parse(input.query.as_bytes()) {
            if key != "cursor" || !cursor.is_empty() {
                return response(Reply::error(400, "INVALID_QUERY", ""));
            }
            cursor = value.into_owned();
        }
    }
    if cursor.len() > 120 {
        return response(Reply::error(400, "INVALID_CURSOR", ""));
    }
    let engine = service.engine.clone();
    let credential = token.clone();
    let local = input.local;
    let initial = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        if !local {
            Auth {
                journal: &engine.journal,
            }
            .authenticate_passive(&credential, now_millis())?;
        }
        Ok(())
    })
    .await;
    match initial {
        Ok(Ok(())) => {}
        Ok(Err(error)) => return failure(error),
        Err(_) => return failure(AppError::State),
    }
    let mut notifications = service.engine.index.subscribe();
    let stream = async_stream::stream! {
        let _permit = permit;
        yield Ok::<_, std::convert::Infallible>(Event::default().comment("connected"));
        loop {
            let engine = service.engine.clone();
            let credential = token.clone();
            let since = cursor.clone();
            let batch = tokio::task::spawn_blocking(move || -> Result<Vec<serde_json::Value>, AppError> {
                if !local { Auth { journal: &engine.journal }.authenticate_passive(&credential, now_millis())?; }
                engine.index.events_since(&since, now_millis())
            }).await;
            let Ok(Ok(batch)) = batch else { break; };
            for value in batch {
                cursor = value["cursor"].as_str().unwrap_or("").into();
                let event = Event::default().id(&cursor).event(value["kind"].as_str().unwrap_or("change")).data(value.to_string());
                yield Ok::<_, std::convert::Infallible>(event);
            }
            tokio::select! { _ = notifications.changed() => {}, _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {} }
        }
    };
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
