//! One invalidation stream per client, woken by changes, revocation or shutdown.
use super::{Input, Service, cookie, failure, header, response};
use axum::response::{IntoResponse, Response};
use project_application::{AppError, Reply, engine::Engine, now_millis};
use std::time::Duration;
use tokio::sync::OwnedSemaphorePermit;

pub(super) async fn serve(
    service: Service,
    input: Input,
    admission: OwnedSemaphorePermit,
) -> Response {
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
    // Subscribe before authentication/snapshot reads so a concurrent change is replayed.
    let mut shutdown = service.shutdown.subscribe();
    let mut auth_changes = service.engine.subscribe_auth_changes();
    let mut notifications = service.engine.subscribe_changes();
    if *shutdown.borrow() {
        return response(Reply::error(503, "SERVICE_UNAVAILABLE", ""));
    }
    let engine = service.engine.clone();
    let credential = token.clone();
    let local = input.local;
    let initial = tokio::task::spawn_blocking(move || {
        let _admission = admission;
        session_expiry(&engine, &credential, local)
    });
    let mut expiry = tokio::select! {
        _ = shutdown.changed() => return response(Reply::error(503, "SERVICE_UNAVAILABLE", "")),
        result = initial => match result {
            Ok(Ok(expiry)) => expiry,
            Ok(Err(error)) => return failure(error),
            Err(_) => return failure(AppError::State),
        },
    };
    let stream = async_stream::stream! {
        let _permit = permit;
        yield Ok::<_, std::convert::Infallible>(Event::default().comment("connected"));
        let mut read_events = true;
        let mut check_auth = false;
        'stream: loop {
            if *shutdown.borrow() { break; }
            if !local && (check_auth || auth_changes.has_changed().unwrap_or(true) || expiry.is_some_and(|time| time <= now_millis())) {
                check_auth = false;
                auth_changes.borrow_and_update();
                let engine = service.engine.clone();
                let credential = token.clone();
                let check = tokio::task::spawn_blocking(move || session_expiry(&engine, &credential, false));
                expiry = tokio::select! {
                    _ = shutdown.changed() => break,
                    result = check => match result { Ok(Ok(expiry)) => expiry, _ => break },
                };
            }
            if read_events {
                // Mark the current notification before reading; later publications remain pending.
                notifications.borrow_and_update();
                let engine = service.engine.clone();
                let since = cursor.clone();
                let batch = tokio::task::spawn_blocking(move || engine.events_since(&since, now_millis()));
                let batch = tokio::select! {
                    _ = shutdown.changed() => break,
                    result = batch => match result { Ok(Ok(batch)) => batch, _ => break },
                };
                for value in batch {
                    if *shutdown.borrow() { break 'stream; }
                    if !local && auth_changes.has_changed().unwrap_or(true) { continue 'stream; }
                    cursor = value["cursor"].as_str().unwrap_or("").into();
                    let event = Event::default().id(&cursor).event(value["kind"].as_str().unwrap_or("changed")).data(value.to_string());
                    yield Ok::<_, std::convert::Infallible>(event);
                }
                read_events = false;
            }
            let remaining = Duration::from_millis(expiry.map(|time| time.saturating_sub(now_millis()).max(0) as u64).unwrap_or(86_400_000));
            tokio::select! {
                biased;
                _ = shutdown.changed() => break,
                result = auth_changes.changed(), if !local => { if result.is_err() { break; } check_auth = true; },
                _ = tokio::time::sleep(remaining), if !local => {},
                result = notifications.changed() => { if result.is_err() { break; } read_events = true; },
            }
        }
    };
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(20)))
        .into_response()
}

fn session_expiry(engine: &Engine, token: &str, local: bool) -> Result<Option<i64>, AppError> {
    if local {
        return Ok(None);
    }
    Ok(Some(
        engine
            .auth()
            .authenticate_passive(token, now_millis())?
            .expires_at_ms,
    ))
}
