use super::{Input, Service, header, response, set_cookie};
use axum::response::{IntoResponse, Response};
use project_application::{AppError, Mutation, Query, auth::Session, instant, now_millis, wire};
use project_store::document::Kind;
use serde_json::{Value, json};
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, AppError> {
    value[key]
        .as_str()
        .ok_or_else(|| AppError::reject(400, "INVALID_INPUT"))
}
fn kind(value: &str) -> Result<Kind, AppError> {
    match value {
        "cards" => Ok(Kind::Card),
        "milestones" => Ok(Kind::Milestone),
        "updates" => Ok(Kind::Update),
        _ => Err(AppError::reject(404, "NOT_FOUND")),
    }
}
fn query(input: &Input) -> Result<Query, AppError> {
    let mut fields = serde_json::Map::new();
    for (key, value) in url::form_urlencoded::parse(input.query.as_bytes()) {
        let value = match key.as_ref() {
            "limit" => json!(
                value
                    .parse::<u32>()
                    .map_err(|_| AppError::reject(400, "INVALID_QUERY"))?
            ),
            "archived" => json!(
                value
                    .parse::<bool>()
                    .map_err(|_| AppError::reject(400, "INVALID_QUERY"))?
            ),
            _ => json!(value),
        };
        if fields.insert(key.into_owned(), value).is_some() {
            return Err(AppError::reject(400, "DUPLICATE_QUERY"));
        }
    }
    serde_json::from_value(Value::Object(fields))
        .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
}
/// One request after transport admission and authentication.
struct Route<'a> {
    service: &'a Service,
    input: &'a Input,
    session: Option<&'a Session>,
    parts: &'a [&'a str],
    now: i64,
    picker_owner: String,
}
/// Reads return a value for the shared representation rules; commands and
/// cookie changes build their own reply.
enum Routed {
    Value(Value),
    Reply(Response),
}
pub(super) fn run(
    service: &Service,
    input: Input,
    session: Option<Session>,
) -> Result<Response, AppError> {
    // Exactly one leading slash: "//local/…" is not another spelling of a route.
    let parts: Vec<_> = input
        .path
        .strip_prefix('/')
        .unwrap_or(&input.path)
        .split('/')
        .collect();
    // A malformed ID cannot name a source. Answer definitely here, before a
    // store error for it would read as an unavailable service.
    if let [
        "api",
        "v1",
        "projects",
        _,
        "cards" | "milestones" | "updates",
        id,
        ..,
    ] = parts.as_slice()
        && !project_store::filesystem::is_resource_id(id)
    {
        return Err(AppError::reject(404, "RESOURCE_NOT_FOUND"));
    }
    let route = Route {
        service,
        input: &input,
        session: session.as_ref(),
        parts: &parts,
        now: now_millis(),
        picker_owner: format!(
            "{}:{}",
            service.user.id,
            session.as_ref().map_or("local-uid", |s| s.id.as_str())
        ),
    };
    let routed = match parts.as_slice() {
        // The socket is the only way in; no arm repeats this check.
        ["local", "v1", ..] if input.local => local(&route)?,
        ["api", "v1", "users", ..] => users(&route)?,
        ["api", "v1", "views", ..] => views(&route)?,
        ["api", "v1", "projects", ..] => projects(&route)?,
        ["api", "v1", "workspace", ..] => workspace(&route)?,
        ["api", "v1", "auth", ..] => sessions(&route)?,
        ["api", "v1", ..] => host(&route)?,
        _ => return Err(AppError::reject(404, "NOT_FOUND")),
    };
    let value = match routed {
        Routed::Value(value) => value,
        Routed::Reply(reply) => return Ok(reply),
    };
    let version = value
        .get("version")
        .and_then(Value::as_str)
        // Enriched reads combine observations with a conditional source version;
        // that version cannot validate the complete response representation.
        .filter(|_| {
            !matches!(
                input.path.as_str(),
                "/api/v1/workspace/tags"
                    | "/api/v1/workspace/tags/preview"
                    | "/api/v1/workspace/focus"
            ) && value["type"] != "update"
        })
        .map(str::to_owned);
    if version.is_none() && super::read_response::eligible(&input.method, &parts) {
        return super::read_response::json(&value, &input.headers);
    }
    let mut reply = axum::Json(value).into_response();
    if let Some(version) = version {
        reply.headers_mut().insert(
            "etag",
            format!("\"{version}\"")
                .parse()
                .map_err(|_| AppError::invariant("resource ETag header"))?,
        );
    }
    Ok(reply)
}
/// Trusted profile registry.
fn users(route: &Route<'_>) -> Result<Routed, AppError> {
    let service = route.service;
    let input = route.input;
    let request_id = header(&route.input.headers, "x-request-id");
    let epoch = header(&route.input.headers, "x-command-epoch");
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("PATCH", ["api", "v1", "users", id]) => {
                parameters(input, &[])?;
                let expected = expected_version(input)?;
                return Ok(Routed::Reply(response(service.users.rename(
                    id,
                    &input.body,
                    request_id,
                    epoch,
                    expected.as_deref(),
                )?)));
            }
            ("GET", ["api", "v1", "users"]) => {
                parameters(input, &[])?;
                service.users.list(&service.user.id)?
            }
            ("POST", ["api", "v1", "users"]) => {
                parameters(input, &[])?;
                return Ok(Routed::Reply(response(service.users.create(
                    &input.body,
                    request_id,
                    epoch,
                )?)));
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Bounded list, planning and attention projections.
fn views(route: &Route<'_>) -> Result<Routed, AppError> {
    let engine = &route.service.engine;
    let input = route.input;
    let now = route.now;
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("GET", ["api", "v1", "views", "list"]) => {
                let fields = parameters(
                    input,
                    &[
                        "type",
                        "q",
                        "project_id",
                        "limit",
                        "cursor",
                        "status",
                        "priority",
                        "label",
                        "folder",
                        "archived",
                        "target_type",
                        "target_id",
                    ],
                )?;
                let resource_type = parameter(&fields, "type")?;
                if !matches!(resource_type, "card" | "milestone" | "update") {
                    return Err(AppError::reject(400, "INVALID_TYPE"));
                }
                let query = Query {
                    project: fields.get("project_id").cloned(),
                    search: fields.get("q").cloned(),
                    limit: Some(number(&fields, "limit", 50)?),
                    cursor: fields.get("cursor").cloned(),
                    status: fields.get("status").cloned(),
                    priority: fields.get("priority").cloned(),
                    label: fields.get("label").cloned(),
                    folder: fields.get("folder").cloned(),
                    target_type: fields.get("target_type").cloned(),
                    target_id: fields.get("target_id").cloned(),
                    archived: fields
                        .get("archived")
                        .map(|value| {
                            value
                                .parse()
                                .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
                        })
                        .transpose()?,
                };
                engine.list(Some(resource_type), &query)?
            }
            ("GET", ["api", "v1", "views", view]) => {
                let fields = parameters(
                    input,
                    match *view {
                        "calendar" => &["project_id", "from", "to", "cursor", "limit"][..],
                        "counters" => &[
                            "project_id",
                            "from",
                            "to",
                            "include_archived",
                            "cursor",
                            "limit",
                        ],
                        "board" | "gantt" => &["project_id", "cursor", "limit"],
                        "attention" => &["cursor", "limit", "project_id", "folder", "focus"],
                        "focus-cards" => &["cursor", "limit", "folder", "section"],
                        "folders" => &["cursor", "limit"],
                        _ => return Err(AppError::reject(404, "NOT_FOUND")),
                    },
                )?;
                let cursor = fields.get("cursor").map(String::as_str);
                let limit = number(
                    &fields,
                    "limit",
                    if *view == "board" || *view == "attention" {
                        50
                    } else if *view == "counters" {
                        100
                    } else {
                        200
                    },
                )?;
                match *view {
                    "folders" => engine.folders(cursor, limit)?,
                    "focus-cards" => engine.focus_cards(
                        parameter(&fields, "section")?,
                        fields.get("folder").map(String::as_str),
                        cursor,
                        limit,
                        now,
                    )?,
                    "attention" => engine.attention_mode(
                        fields.get("project_id").map(String::as_str),
                        fields.get("folder").map(String::as_str),
                        cursor,
                        limit,
                        now,
                        fields
                            .get("focus")
                            .map(|value| {
                                value
                                    .parse::<bool>()
                                    .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
                            })
                            .transpose()?
                            .unwrap_or(false),
                    )?,
                    "calendar" => engine.calendar(
                        fields.get("project_id").map(String::as_str),
                        parameter(&fields, "from")?,
                        parameter(&fields, "to")?,
                        cursor,
                        limit,
                    )?,
                    "counters" => engine.counter_series(
                        fields.get("project_id").map(String::as_str),
                        parameter(&fields, "from")?,
                        parameter(&fields, "to")?,
                        fields
                            .get("include_archived")
                            .map(|value| {
                                value
                                    .parse::<bool>()
                                    .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
                            })
                            .transpose()?
                            .unwrap_or(false),
                        cursor,
                        limit,
                    )?,
                    "board" => engine.board(parameter(&fields, "project_id")?, cursor, limit)?,
                    "gantt" => engine.gantt(parameter(&fields, "project_id")?, cursor, limit)?,
                    // The parameter list above already refused every other view.
                    _ => return Err(AppError::reject(404, "NOT_FOUND")),
                }
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Project resources, their history, tags and deletion.
fn projects(route: &Route<'_>) -> Result<Routed, AppError> {
    let engine = &route.service.engine;
    let input = route.input;
    let request_id = header(&route.input.headers, "x-request-id");
    let epoch = header(&route.input.headers, "x-command-epoch");
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("GET", ["api", "v1", "projects", project, "deletion-plan"]) => {
                parameters(input, &[])?;
                engine.project_deletion_plan(project)?
            }
            ("GET", ["api", "v1", "projects", project, "git"]) => {
                parameters(input, &[])?;
                engine.git_observation(project)?
            }
            ("GET", ["api", "v1", "projects", project, "validation"]) => {
                parameters(input, &[])?;
                engine.validate_sources(project)?
            }
            ("GET", ["api", "v1", "projects", project, "context"]) => {
                let fields = parameters(input, &["max_bytes"])?;
                let max = number(&fields, "max_bytes", 24576)?;
                engine.context(project, max as usize)?
            }
            ("GET", ["api", "v1", "projects", project, "tags"]) => {
                parameters(input, &[])?;
                engine.project_tag_catalog(project)?
            }
            ("POST", ["api", "v1", "projects", project, "tags", "preview"]) => {
                parameters(input, &[])?;
                engine.project_tag_rename_plan(project, &input.body)?
            }
            ("POST", ["api", "v1", "projects", project, "tags", "rename"]) => {
                parameters(input, &[])?;
                wire::validate("RegistrationCommit", &input.body)?;
                let plan = input.body["plan_id"]
                    .as_str()
                    .ok_or_else(|| AppError::reject(422, "VALIDATION_FAILED"))?;
                return Ok(Routed::Reply(response(
                    engine.commit_project_tag_rename(project, plan, request_id, epoch)?,
                )));
            }
            ("GET", ["api", "v1", "projects", project, "history"]) => {
                let q = query(input)?;
                engine.history(
                    project,
                    Kind::Project,
                    project,
                    q.cursor.as_deref(),
                    q.limit.unwrap_or(50),
                )?
            }
            ("GET", ["api", "v1", "projects", project, collection, id, "history"])
                if *collection != "updates" =>
            {
                let q = query(input)?;
                engine.history(
                    project,
                    kind(collection)?,
                    id,
                    q.cursor.as_deref(),
                    q.limit.unwrap_or(50),
                )?
            }
            ("GET", ["api", "v1", "projects"]) => engine.list(Some("project"), &query(input)?)?,
            ("GET", ["api", "v1", "projects", project]) => {
                engine.get(project, Kind::Project, project)?
            }
            ("GET", ["api", "v1", "projects", project, collection]) => {
                let kind = kind(collection)?;
                let mut query = query(input)?;
                query.project = Some((*project).into());
                engine.list(Some(kind.as_str()), &query)?
            }
            ("GET", ["api", "v1", "projects", project, collection, id]) => {
                engine.get(project, kind(collection)?, id)?
            }
            ("PATCH", ["api", "v1", "projects", project]) => {
                return mutate(engine, input, project, Kind::Project, Some(project))
                    .map(Routed::Reply);
            }
            ("DELETE", ["api", "v1", "projects", project]) => {
                parameters(input, &[])?;
                let expected = expected_version(input)?;
                return Ok(Routed::Reply(response(engine.delete_project(
                    project,
                    input.body.clone(),
                    request_id,
                    epoch,
                    expected,
                )?)));
            }
            ("DELETE", ["api", "v1", "projects", project, "cards", id]) => {
                parameters(input, &[])?;
                let expected = expected_version(input)?;
                return Ok(Routed::Reply(response(engine.delete_card(
                    project,
                    id,
                    input.body.clone(),
                    request_id,
                    epoch,
                    expected,
                )?)));
            }
            ("DELETE", ["api", "v1", "projects", project, "updates", id]) => {
                parameters(input, &[])?;
                let expected = expected_version(input)?;
                return Ok(Routed::Reply(response(engine.delete_report(
                    project,
                    id,
                    input.body.clone(),
                    request_id,
                    epoch,
                    expected,
                )?)));
            }
            ("POST", ["api", "v1", "projects", project, collection]) => {
                return mutate(engine, input, project, kind(collection)?, None).map(Routed::Reply);
            }
            ("PATCH", ["api", "v1", "projects", project, collection, id])
                if *collection != "updates" =>
            {
                return mutate(engine, input, project, kind(collection)?, Some(id))
                    .map(Routed::Reply);
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Workspace focus, preferences, legacy tags and read receipts.
fn workspace(route: &Route<'_>) -> Result<Routed, AppError> {
    let engine = &route.service.engine;
    let input = route.input;
    let parts = route.parts;
    let request_id = header(&route.input.headers, "x-request-id");
    let epoch = header(&route.input.headers, "x-command-epoch");
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("POST", ["api", "v1", "workspace", "read-receipts"]) => {
                return Ok(Routed::Reply(response(engine.receipts(
                    &input.body,
                    request_id,
                    epoch,
                )?)));
            }
            ("GET", ["api", "v1", "workspace", "tags"]) => {
                parameters(input, &[])?;
                engine.tag_catalog()?
            }
            ("POST", ["api", "v1", "workspace", "tags", "preview"]) => {
                parameters(input, &[])?;
                engine.tag_preview(&input.body)?
            }
            ("PUT", ["api", "v1", "workspace", "tags"])
            | ("PUT", ["api", "v1", "workspace", "focus"])
            | ("PATCH", ["api", "v1", "workspace", "preferences"]) => {
                let expected = expected_version(input)?;
                return Ok(Routed::Reply(response(engine.mutate_workspace(
                    parts[3],
                    &input.body,
                    request_id,
                    epoch,
                    expected.as_deref(),
                )?)));
            }
            ("GET", ["api", "v1", "workspace", "focus"]) => engine.focus_resource()?,
            ("GET", ["api", "v1", "workspace", "preferences"]) => {
                let project_application::Versioned {
                    value: workspace,
                    version,
                } = engine.workspace()?;
                json!({"timezone":workspace.timezone,"locale":workspace.locale,"preferences":workspace.preferences,"version":version})
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Pairing decisions and session management for an authenticated caller.
fn sessions(route: &Route<'_>) -> Result<Routed, AppError> {
    let auth = route.service.users.owner.auth();
    let input = route.input;
    let now = route.now;
    let current = route.session.map(|s| s.id.as_str());
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("GET", ["api", "v1", "auth", "pairings"]) => auth.pairings(now)?,
            ("GET", ["api", "v1", "auth", "sessions"]) => auth.sessions(current, now)?,
            ("POST", ["api", "v1", "auth", "pairings", id, decision])
                if matches!(*decision, "approve" | "deny") =>
            {
                auth.decide(
                    id,
                    input.body["challenge"].as_str().unwrap_or(""),
                    *decision == "approve",
                    now,
                )?
            }
            ("DELETE", ["api", "v1", "auth", "sessions", id]) => auth.revoke(id, current, now)?,
            ("POST", ["api", "v1", "auth", "logout"]) => {
                let id =
                    current.ok_or_else(|| AppError::reject(400, "BROWSER_SESSION_REQUIRED"))?;
                auth.revoke(id, current, now)?;
                let mut reply = axum::http::StatusCode::NO_CONTENT.into_response();
                set_cookie(&mut reply, "__Host-project_session", "", 0)?;
                return Ok(Routed::Reply(reply));
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Instance-level reads, registration and command status.
fn host(route: &Route<'_>) -> Result<Routed, AppError> {
    let service = route.service;
    let engine = &route.service.engine;
    let input = route.input;
    let now = route.now;
    let request_id = header(&route.input.headers, "x-request-id");
    let epoch = header(&route.input.headers, "x-command-epoch");
    let session = route.session;
    let picker_owner = &route.picker_owner;
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("POST", ["api", "v1", "native-folder-selections"]) => service.picker.start(
                service.users.clone(),
                &service.user.id,
                picker_owner,
                &input.body,
            )?,
            ("GET", ["api", "v1", "native-folder-selections", id]) => {
                service.picker.get(picker_owner, id)?
            }
            ("GET", ["api", "v1", "roots"]) => engine.roots()?,
            ("GET", ["api", "v1", "roots", id, "directories"]) => {
                let mut relative = String::new();
                let mut cursor = None;
                for (key, value) in url::form_urlencoded::parse(input.query.as_bytes()) {
                    match key.as_ref() {
                        "relative_path" => relative = value.into_owned(),
                        "cursor" => cursor = Some(value.into_owned()),
                        _ => return Err(AppError::reject(400, "INVALID_QUERY")),
                    }
                }
                engine.browse_root(id, &relative, cursor.as_deref())?
            }
            ("POST", ["api", "v1", "registration-plans"]) => service
                .users
                .browser_registration_plan(&service.user.id, &input.body)?,
            ("GET", ["api", "v1", "bootstrap"]) => {
                let project_application::Versioned {
                    value: workspace,
                    version: _,
                } = engine.workspace()?;
                json!({
                    "api_version": "1",
                    "build_id": env!("CARGO_PKG_VERSION"),
                    "instance_id": workspace.instance_id,
                    "instance_name": "Local Projects",
                    "command_epoch": engine.command_epoch(),
                    "server_time": instant(now),
                    "timezone": workspace.timezone,
                    "locale": workspace.locale,
                    "user": service.user,
                    "csrf_token": session.map(|s| s.csrf.as_str()).unwrap_or("local-uid"),
                    "snapshot_cursor": engine.snapshot_cursor()?,
                    "capabilities": ["projects","cards","milestones","updates","registration","search"],
                })
            }
            ("GET", ["api", "v1", "diagnostics"]) => engine.diagnostics()?,
            ("POST", ["api", "v1", "registrations"]) => {
                wire::validate("RegistrationCommit", &input.body)?;
                return Ok(Routed::Reply(response(service.users.commit_registration(
                    &service.user.id,
                    text(&input.body, "plan_id")?,
                    request_id,
                    epoch,
                )?)));
            }
            ("GET", ["api", "v1", "jobs", id]) => engine.job(id)?,
            ("GET", ["api", "v1", "search"]) => {
                let fields = parameters(input, &["q", "project_id", "limit", "cursor"])?;
                let search = parameter(&fields, "q")?;
                if search.trim().is_empty() {
                    return Err(AppError::reject(400, "SEARCH_REQUIRED"));
                }
                engine.list(
                    None,
                    &Query {
                        search: Some(search.into()),
                        project: fields.get("project_id").cloned(),
                        limit: Some(number(&fields, "limit", 50)?),
                        cursor: fields.get("cursor").cloned(),
                        ..Default::default()
                    },
                )?
            }
            ("GET", ["api", "v1", "commands", id]) => {
                let fields = parameters(input, &["epoch"])?;
                engine.command_status(id, parameter(&fields, "epoch")?)?
            }
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
/// Operator routes. The caller reached them through the peer-verified socket.
fn local(route: &Route<'_>) -> Result<Routed, AppError> {
    let service = route.service;
    let engine = &route.service.engine;
    let auth = route.service.users.owner.auth();
    let input = route.input;
    let now = route.now;
    Ok(Routed::Value(
        match (route.input.method.as_str(), route.parts) {
            ("POST", ["local", "v1", "roots"]) => engine.add_root(
                text(&input.body, "absolute_path")?,
                text(&input.body, "label")?,
            )?,
            ("DELETE", ["local", "v1", "roots", id]) => engine.remove_root(id)?,
            ("POST", ["local", "v1", "maintenance", "plans"]) => service
                .users
                .maintenance_plan(&service.user.id, &input.body)?,
            ("POST", ["local", "v1", "maintenance", "jobs"]) => {
                if input.body.as_object().is_none_or(|o| o.len() != 3) {
                    return Err(AppError::reject(422, "INVALID_INPUT"));
                }
                return Ok(Routed::Reply(response(service.users.commit_maintenance(
                    &service.user.id,
                    text(&input.body, "plan_id")?,
                    text(&input.body, "request_id")?,
                    text(&input.body, "command_epoch")?,
                )?)));
            }
            ("GET", ["local", "v1", "recovery", "intents"]) => {
                let fields = parameters(input, &["project_id"])?;
                engine.recovery_intents(fields.get("project_id").map(String::as_str))?
            }
            ("POST", ["local", "v1", "recovery", "intents", request, "abandon"]) => {
                // The operator states the source version they reviewed; `null` is
                // an absent source and must be said, not implied by omission.
                let body = input
                    .body
                    .as_object()
                    .filter(|body| body.len() == 2)
                    .ok_or_else(|| AppError::reject(422, "INVALID_INPUT"))?;
                let (Some(project), Some(current)) = (
                    body.get("project_id").and_then(Value::as_str),
                    body.get("current_version")
                        .filter(|version| version.is_null() || version.is_string()),
                ) else {
                    return Err(AppError::reject(422, "INVALID_INPUT"));
                };
                engine.abandon_reviewed_intent(project, request, current.as_str())?
            }
            ("POST", ["local", "v1", "projects", "resolve"]) => {
                if !input
                    .body
                    .as_object()
                    .is_some_and(|o| o.len() == 1 && o.contains_key("absolute_path"))
                {
                    return Err(AppError::reject(400, "INVALID_INPUT"));
                }
                let path = text(&input.body, "absolute_path")?;
                if !std::path::Path::new(path).is_absolute() {
                    return Err(AppError::reject(400, "ABSOLUTE_PATH_REQUIRED"));
                }
                json!({"project_id":engine.resolve_path(path)?})
            }
            ("GET", ["local", "v1", "hello"]) => {
                let project_application::Versioned {
                    value: workspace,
                    version: _,
                } = engine.workspace()?;
                json!({"api_version":"1","instance_id":workspace.instance_id,"command_epoch":engine.command_epoch(),"server_time":instant(now)})
            }
            ("POST", ["local", "v1", "registration-plans"]) => {
                let allowed = ["absolute_path", "name", "git_mode"];
                if !input
                    .body
                    .as_object()
                    .is_some_and(|o| o.keys().all(|k| allowed.contains(&k.as_str())))
                {
                    return Err(AppError::reject(400, "INVALID_INPUT"));
                }
                if input
                    .body
                    .get("git_mode")
                    .is_some_and(|v| v != "private" && v != "tracked")
                {
                    return Err(AppError::reject(400, "INVALID_INPUT"));
                }
                service.users.registration_plan(
                    &service.user.id,
                    text(&input.body, "absolute_path")?,
                    input.body["name"].as_str(),
                    input.body["git_mode"] != "tracked",
                )?
            }
            ("POST", ["local", "v1", "pairings", id, decision])
                if matches!(*decision, "approve" | "deny") =>
            {
                auth.decide(
                    id,
                    input.body["challenge"].as_str().unwrap_or(""),
                    *decision == "approve",
                    now,
                )?
            }
            ("GET", ["local", "v1", "doctor"]) => engine.diagnostics()?,
            _ => return Err(AppError::reject(404, "NOT_FOUND")),
        },
    ))
}
fn mutate(
    engine: &project_application::engine::Engine,
    input: &Input,
    project: &str,
    kind: Kind,
    id: Option<&str>,
) -> Result<Response, AppError> {
    let expected = expected_version(input)?;
    Ok(response(engine.mutate(Mutation {
        project_id: project.into(),
        kind,
        id: id.map(str::to_owned),
        payload: input.body.clone(),
        request_id: header(&input.headers, "x-request-id").into(),
        epoch: header(&input.headers, "x-command-epoch").into(),
        expected,
    })?))
}

fn expected_version(input: &Input) -> Result<Option<String>, AppError> {
    let raw = header(&input.headers, "if-match");
    let expected = if raw.is_empty() {
        None
    } else {
        Some(
            raw.strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .filter(|s| {
                    s.starts_with("r1.")
                        && s.len() == 67
                        && s[3..]
                            .bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                })
                .ok_or_else(|| AppError::reject(400, "INVALID_IF_MATCH"))?
                .into(),
        )
    };
    Ok(expected)
}

fn parameters(
    input: &Input,
    allowed: &[&str],
) -> Result<std::collections::BTreeMap<String, String>, AppError> {
    let mut fields = std::collections::BTreeMap::new();
    for (key, value) in url::form_urlencoded::parse(input.query.as_bytes()) {
        if !allowed.contains(&key.as_ref())
            || fields
                .insert(key.into_owned(), value.into_owned())
                .is_some()
        {
            return Err(AppError::reject(400, "INVALID_QUERY"));
        }
    }
    Ok(fields)
}
fn parameter<'a>(
    fields: &'a std::collections::BTreeMap<String, String>,
    key: &str,
) -> Result<&'a str, AppError> {
    fields
        .get(key)
        .map(String::as_str)
        .ok_or_else(|| AppError::reject(400, "MISSING_QUERY_PARAMETER"))
}
fn number(
    fields: &std::collections::BTreeMap<String, String>,
    key: &str,
    default: u32,
) -> Result<u32, AppError> {
    fields
        .get(key)
        .map(|v| {
            v.parse()
                .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
        })
        .unwrap_or(Ok(default))
}
