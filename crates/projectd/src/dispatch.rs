use super::{Input, Service, header, response, set_cookie};
use axum::response::{IntoResponse, Response};
use project_application::{
    AppError, Mutation, Reply,
    auth::{Auth, Session},
    index::Query,
    instant, now_millis, wire,
    workflow::Workflows,
};
use project_store::document::Kind;
use rusqlite::OptionalExtension;
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
pub(super) fn run(
    service: &Service,
    input: Input,
    session: Option<Session>,
) -> Result<Response, AppError> {
    let engine = &service.engine;
    let auth = Auth {
        journal: &engine.journal,
    };
    let now = now_millis();
    let parts: Vec<_> = input.path.trim_start_matches('/').split('/').collect();
    let request_id = header(&input.headers, "x-request-id");
    let epoch = header(&input.headers, "x-command-epoch");
    let current = session.as_ref().map(|s| s.id.as_str());
    let value = match (input.method.as_str(), parts.as_slice()) {
        ("GET", ["api", "v1", "views", "list"]) => {
            let fields = parameters(
                &input,
                &[
                    "type",
                    "project_id",
                    "limit",
                    "cursor",
                    "status",
                    "priority",
                    "label",
                    "milestone_id",
                    "archived",
                ],
            )?;
            let resource_type = parameter(&fields, "type")?;
            if !matches!(resource_type, "card" | "milestone" | "update") {
                return Err(AppError::reject(400, "INVALID_TYPE"));
            }
            let query = Query {
                project: fields.get("project_id").cloned(),
                limit: Some(number(&fields, "limit", 50)?),
                cursor: fields.get("cursor").cloned(),
                status: fields.get("status").cloned(),
                priority: fields.get("priority").cloned(),
                label: fields.get("label").cloned(),
                milestone_id: fields.get("milestone_id").cloned(),
                archived: fields
                    .get("archived")
                    .map(|value| {
                        value
                            .parse()
                            .map_err(|_| AppError::reject(400, "INVALID_QUERY"))
                    })
                    .transpose()?,
                ..Default::default()
            };
            engine.list(Some(resource_type), &query)?
        }

        ("GET", ["api", "v1", "projects", project, "context"]) => {
            let fields = parameters(&input, &["max_bytes"])?;
            let max = number(&fields, "max_bytes", 24576)?;
            engine.context(project, max as usize)?
        }
        ("GET", ["api", "v1", "views", view]) => {
            let fields = parameters(
                &input,
                match *view {
                    "calendar" => &["project_id", "from", "to", "cursor", "limit"][..],
                    "board" | "gantt" => &["project_id", "cursor", "limit"],
                    "attention" => &["cursor", "limit"],
                    _ => return Err(AppError::reject(404, "NOT_FOUND")),
                },
            )?;
            let cursor = fields.get("cursor").map(String::as_str);
            let limit = number(
                &fields,
                "limit",
                if *view == "board" || *view == "attention" {
                    50
                } else {
                    200
                },
            )?;
            match *view {
                "attention" => engine.attention(cursor, limit, now)?,
                "calendar" => engine.calendar(
                    fields.get("project_id").map(String::as_str),
                    parameter(&fields, "from")?,
                    parameter(&fields, "to")?,
                    cursor,
                    limit,
                )?,
                "board" => engine.board(parameter(&fields, "project_id")?, cursor, limit)?,
                "gantt" => engine.gantt(parameter(&fields, "project_id")?, cursor, limit)?,
                _ => unreachable!(),
            }
        }

        ("POST", ["api", "v1", "workspace", "read-receipts"]) => {
            return Ok(response(engine.receipts(&input.body, request_id, epoch)?));
        }
        ("PUT", ["api", "v1", "workspace", "focus"])
        | ("PATCH", ["api", "v1", "workspace", "preferences"]) => {
            let expected = expected_version(&input)?;
            return Ok(response(engine.mutate_workspace(
                parts[3],
                &input.body,
                request_id,
                epoch,
                expected.as_deref(),
            )?));
        }
        ("GET", ["api", "v1", "projects", project, "history"]) => {
            let q = query(&input)?;
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
            let q = query(&input)?;
            engine.history(
                project,
                kind(collection)?,
                id,
                q.cursor.as_deref(),
                q.limit.unwrap_or(50),
            )?
        }

        ("GET", ["api", "v1", "roots"]) => engine.roots()?,
        ("POST", ["local", "v1", "roots"]) if input.local => engine.add_root(
            text(&input.body, "absolute_path")?,
            text(&input.body, "label")?,
        )?,
        ("DELETE", ["local", "v1", "roots", id]) if input.local => engine.remove_root(id)?,
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
        ("POST", ["api", "v1", "registration-plans"]) => {
            engine.browser_registration_plan(&input.body)?
        }

        ("GET", ["local", "v1", "hello"]) if input.local => {
            let (workspace, _) = engine.workspace()?;
            json!({"api_version":"1","instance_id":workspace["instance_id"],"command_epoch":engine.journal.epoch,"server_time":instant(now)})
        }
        ("POST", ["local", "v1", "registration-plans"]) if input.local => {
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
            engine.registration_plan(
                text(&input.body, "absolute_path")?,
                input.body["name"].as_str(),
                input.body["git_mode"] != "tracked",
            )?
        }
        ("POST", ["local", "v1", "pairings", id, decision])
            if input.local && matches!(*decision, "approve" | "deny") =>
        {
            auth.decide(
                id,
                input.body["challenge"].as_str().unwrap_or(""),
                *decision == "approve",
                now,
            )?
        }
        ("GET", ["api", "v1", "bootstrap"]) => {
            let (workspace, _) = engine.workspace()?;
            json!({"api_version":"1","build_id":env!("CARGO_PKG_VERSION"),"instance_id":workspace["instance_id"],"instance_name":"Local Projects","command_epoch":engine.journal.epoch,"server_time":instant(now),"timezone":workspace["timezone"],"locale":workspace["locale"],"csrf_token":session.as_ref().map(|s|s.csrf.as_str()).unwrap_or("local-uid"),"snapshot_cursor":engine.index.cursor()?,"capabilities":["projects","cards","milestones","updates","registration","search"]})
        }
        ("GET", ["api", "v1", "diagnostics"]) | ("GET", ["local", "v1", "doctor"]) => {
            let count = engine.index.issue_count()?;
            let pending:i64 = engine.journal.db()?.query_row("SELECT count(*) FROM commands WHERE state IN ('prepared','blocked','needs_review')", [], |r| r.get(0))?;
            json!({"instance_id":engine.workspace()?.0["instance_id"],"state":if count+pending>0 {"degraded"}else{"ready"},"invalid_documents":count,"pending_commands":pending,"index_state":if count>0{"degraded"}else{"ready"},"warnings":[]})
        }
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
            let id = current.ok_or_else(|| AppError::reject(400, "BROWSER_SESSION_REQUIRED"))?;
            auth.revoke(id, current, now)?;
            let mut reply = axum::http::StatusCode::NO_CONTENT.into_response();
            set_cookie(&mut reply, "__Host-project_session", "", 0);
            return Ok(reply);
        }
        ("POST", ["api", "v1", "registrations"]) => {
            wire::validate("RegistrationCommit", &input.body)?;
            return Ok(response(engine.commit_registration(
                text(&input.body, "plan_id")?,
                request_id,
                epoch,
            )?));
        }
        ("GET", ["api", "v1", "jobs", id]) => Workflows {
            journal: &engine.journal,
        }
        .job(id)?,
        ("GET", ["api", "v1", "projects"]) => engine.list(Some("project"), &query(&input)?)?,
        ("GET", ["api", "v1", "search"]) => {
            let fields = parameters(&input, &["q", "project_id", "limit", "cursor"])?;
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
        ("GET", ["api", "v1", "projects", project]) => {
            engine.get(project, Kind::Project, project)?
        }
        ("GET", ["api", "v1", "projects", project, collection]) => {
            let kind = kind(collection)?;
            let mut query = query(&input)?;
            query.project = Some((*project).into());
            engine.list(Some(kind.as_str()), &query)?
        }
        ("GET", ["api", "v1", "projects", project, collection, id]) => {
            engine.get(project, kind(collection)?, id)?
        }
        ("PATCH", ["api", "v1", "projects", project]) => {
            return mutate(engine, &input, project, Kind::Project, Some(project));
        }
        ("POST", ["api", "v1", "projects", project, collection]) => {
            return mutate(engine, &input, project, kind(collection)?, None);
        }
        ("PATCH", ["api", "v1", "projects", project, collection, id])
            if *collection != "updates" =>
        {
            return mutate(engine, &input, project, kind(collection)?, Some(id));
        }
        ("GET", ["api", "v1", "workspace", "focus"]) => {
            let (workspace, version) = engine.workspace()?;
            json!({"items":workspace["focus"],"version":version})
        }
        ("GET", ["api", "v1", "workspace", "preferences"]) => {
            let (workspace, version) = engine.workspace()?;
            json!({"timezone":workspace["timezone"],"locale":workspace["locale"],"preferences":workspace["preferences"],"version":version})
        }
        ("GET", ["api", "v1", "commands", id]) => {
            if !project_application::valid_request_id(id) {
                return Err(AppError::reject(400, "INVALID_REQUEST_ID"));
            }
            let row: Option<(String, Option<String>)> = engine
                .journal
                .db()?
                .query_row(
                    "SELECT state,result_json FROM commands WHERE epoch=?1 AND request_id=?2",
                    [engine.journal.epoch.as_str(), id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let (state, result) = row.ok_or_else(|| AppError::reject(404, "COMMAND_NOT_FOUND"))?;
            let mut value = json!({"api_version":"1","request_id":id,"state":state});
            if let Some(result) = result {
                let reply: Reply = serde_json::from_str(&result).map_err(|_| AppError::State)?;
                if reply.body.get("result").is_some() {
                    value["result"] = reply.body;
                } else if let Some(error) = reply.body.get("error") {
                    value["error"] = error.clone();
                }
            }
            value
        }
        _ => return Err(AppError::reject(404, "NOT_FOUND")),
    };
    let version = value
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let mut reply = axum::Json(value).into_response();
    if let Some(version) = version {
        reply.headers_mut().insert(
            "etag",
            format!("\"{version}\"")
                .parse()
                .map_err(|_| AppError::State)?,
        );
    }
    Ok(reply)
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
