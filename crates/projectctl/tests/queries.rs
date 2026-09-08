use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::Path,
    process::{Command, Output},
    time::{Duration, Instant},
};

const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
const JOB: &str = "22222222-2222-4222-8222-222222222222";

struct ReadReply {
    method: &'static str,
    path: String,
    query: BTreeMap<String, String>,
    payload: Option<Value>,
    status: u16,
    body: Value,
}

impl ReadReply {
    fn ok(path: &str, query: &[(&str, &str)], body: Value) -> Self {
        Self {
            method: "GET",
            path: path.into(),
            query: query
                .iter()
                .map(|(key, value)| ((*key).into(), (*value).into()))
                .collect(),
            payload: None,
            status: 200,
            body,
        }
    }
}

fn parsed(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|_| {
        panic!(
            "Expected one JSON response, got stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    })
}

fn accept(listener: &UnixListener) -> UnixStream {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match listener.accept() {
            Ok((stream, _)) => return stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(
                    Instant::now() < deadline,
                    "CLI did not send the expected read"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(error) => panic!("Mock socket failed: {error}"),
        }
    }
}

fn run_read(args: &[&str], project: Option<&Path>, mut replies: Vec<ReadReply>) -> Output {
    let temp = tempfile::tempdir().unwrap();
    let socket = temp.path().join("server.sock");
    let listener = UnixListener::bind(&socket).unwrap();
    listener.set_nonblocking(true).unwrap();
    if let Some(project) = project {
        let mut resolve = ReadReply::ok(
            "/local/v1/projects/resolve",
            &[],
            json!({"project_id": PROJECT}),
        );
        resolve.method = "POST";
        resolve.payload = Some(json!({"absolute_path": project}));
        replies.insert(0, resolve);
    }
    let worker = std::thread::spawn(move || {
        for expected in replies {
            let mut stream = accept(&listener);
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 4096];
            let header_end = loop {
                let count = stream.read(&mut chunk).unwrap();
                assert!(count > 0, "CLI closed before sending its headers");
                request.extend_from_slice(&chunk[..count]);
                assert!(request.len() <= 16_384, "Unbounded request headers");
                if let Some(end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .map(str::to_owned)
                        })
                        .map(|length| length.parse::<usize>().unwrap())
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break end;
                    }
                }
            };
            let headers = std::str::from_utf8(&request[..header_end]).unwrap();
            let mut line = headers.lines().next().unwrap().split_whitespace();
            assert_eq!(line.next(), Some(expected.method));
            let target = line.next().unwrap();
            let url = url::Url::parse(&format!("http://localhost{target}")).unwrap();
            assert_eq!(url.path(), expected.path, "{headers}");
            let pairs = url.query_pairs().into_owned().collect::<Vec<_>>();
            assert_eq!(pairs.len(), expected.query.len(), "{headers}");
            assert_eq!(
                pairs.into_iter().collect::<BTreeMap<_, _>>(),
                expected.query
            );
            let lowercase = headers.to_ascii_lowercase();
            assert!(!lowercase.contains("x-request-id:"));
            assert!(!lowercase.contains("x-command-epoch:"));
            if let Some(payload) = expected.payload {
                assert_eq!(
                    serde_json::from_slice::<Value>(&request[header_end + 4..]).unwrap(),
                    payload
                );
            } else {
                assert!(request[header_end + 4..].is_empty());
            }
            let body = expected.body.to_string();
            write!(
                stream,
                "HTTP/1.1 {} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                expected.status,
                body.len()
            )
            .unwrap();
        }
    });
    let mut command = Command::new(env!("CARGO_BIN_EXE_projectctl"));
    command.args(["--socket", socket.to_str().unwrap(), "--timeout", "2"]);
    if let Some(project) = project {
        command.arg("--project").arg(project);
    }
    let output = command.args(args).output().unwrap();
    worker.join().unwrap();
    assert!(
        output.stderr.is_empty(),
        "Reads must not print mutation identities"
    );
    let value = parsed(&output);
    assert!(value["request_id"].is_null());
    assert!(value["command_epoch"].is_null());
    output
}

#[test]
fn search_encodes_text_and_cursor_and_resolves_only_explicit_project_scope() {
    let temp = tempfile::tempdir().unwrap();
    let selected = temp.path().canonicalize().unwrap().join("chosen & project");
    std::fs::create_dir(&selected).unwrap();
    let query = "roadmap & \"Łódź\" /+?";
    let cursor = "[\"scope&project_id=other\", \"+/=?\", 10]";
    for project in [None, Some(selected.as_path())] {
        let mut expected = vec![("q", query), ("limit", "200"), ("cursor", cursor)];
        if project.is_some() {
            expected.push(("project_id", PROJECT));
        }
        let output = run_read(
            &["search", query, "--limit", "200", "--cursor", cursor],
            project,
            vec![ReadReply::ok(
                "/api/v1/search",
                &expected,
                json!({"items": []}),
            )],
        );
        assert_eq!(output.status.code(), Some(0));
        assert_eq!(parsed(&output)["data"]["items"], json!([]));
    }
}

#[test]
fn named_views_forward_exact_project_scope_and_bounded_pagination() {
    let temp = tempfile::tempdir().unwrap();
    let selected = temp.path().canonicalize().unwrap();
    let cursor = "[\"scope with & and +\", 12]";
    for (name, limit) in [
        ("board", "200"),
        ("gantt", "500"),
        ("calendar", "1000"),
        ("attention", "200"),
    ] {
        let mut args = vec!["view", name, "--limit", limit, "--cursor", cursor];
        let mut query = vec![
            ("project_id", PROJECT),
            ("limit", limit),
            ("cursor", cursor),
        ];
        if name == "calendar" {
            args.extend(["--from", "2026-09-01", "--to", "2026-09-30"]);
            query.extend([("from", "2026-09-01"), ("to", "2026-09-30")]);
        }
        let output = run_read(
            &args,
            Some(&selected),
            vec![ReadReply::ok(
                &format!("/api/v1/views/{name}"),
                &query,
                json!({"items": []}),
            )],
        );
        assert_eq!(output.status.code(), Some(0), "{name}");
    }
}

#[test]
fn optional_views_without_project_read_only_the_current_instance() {
    for (name, limit) in [("calendar", "200"), ("attention", "50")] {
        let mut args = vec!["view", name];
        let mut query = vec![("limit", limit)];
        if name == "calendar" {
            args.extend(["--from", "2026-09-01", "--to", "2026-09-30"]);
            query.extend([("from", "2026-09-01"), ("to", "2026-09-30")]);
        }
        let output = run_read(
            &args,
            None,
            vec![ReadReply::ok(
                &format!("/api/v1/views/{name}"),
                &query,
                json!({"items": []}),
            )],
        );
        assert_eq!(output.status.code(), Some(0));
    }
}

#[test]
fn job_reads_preserve_unfinished_exit_status_without_polling_or_identity_calls() {
    for (status, state, exit) in [
        (200, "running", 9),
        (202, "running", 9),
        (200, "needs_review", 9),
        (200, "done", 0),
    ] {
        let mut reply = ReadReply::ok(
            &format!("/api/v1/jobs/{JOB}"),
            &[],
            json!({"id": JOB, "kind": "registration", "state": state, "completed_steps": 1, "total_steps": 2}),
        );
        reply.status = status;
        let output = run_read(&["job", JOB], None, vec![reply]);
        assert_eq!(output.status.code(), Some(exit));
        assert_eq!(parsed(&output)["data"]["state"], state);
    }
}

#[test]
fn missing_scope_required_dates_and_invalid_limits_fail_before_a_request() {
    let temp = tempfile::tempdir().unwrap();
    let socket = temp.path().join("missing.sock");
    for args in [
        vec!["view", "board"],
        vec!["view", "gantt"],
        vec!["view", "calendar", "--from", "2026-09-01"],
        vec!["view", "calendar", "--to", "2026-09-30"],
        vec!["search", "query", "--limit", "0"],
        vec!["search", "query", "--limit", "201"],
        vec!["view", "board", "--limit", "201"],
        vec!["view", "gantt", "--limit", "501"],
        vec![
            "view",
            "calendar",
            "--from",
            "2026-09-01",
            "--to",
            "2026-09-30",
            "--limit",
            "1001",
        ],
        vec!["view", "attention", "--limit", "201"],
        vec!["job", "../commands/other"],
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
            .arg("--socket")
            .arg(&socket)
            .args(&args)
            .output()
            .unwrap();
        assert_eq!(
            output.status.code(),
            Some(2),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stdout)
        );
        let value = parsed(&output);
        assert_eq!(value["ok"], false);
        if args == ["view", "board"] || args == ["view", "gantt"] {
            assert!(
                value["error"]["message"]
                    .as_str()
                    .unwrap()
                    .contains("--project")
            );
        }
    }
}

#[test]
fn calendar_encodes_dates_and_preserves_server_validation_errors() {
    let from = "2026-09-01&project_id=injected";
    let mut reply = ReadReply::ok(
        "/api/v1/views/calendar",
        &[("from", from), ("to", "2026-09-30"), ("limit", "200")],
        json!({"api_version": "1", "error": {"code": "INVALID_DATE_RANGE", "message": "Invalid calendar range"}}),
    );
    reply.status = 400;
    let output = run_read(
        &["view", "calendar", "--from", from, "--to", "2026-09-30"],
        None,
        vec![reply],
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(parsed(&output)["error"]["code"], "INVALID_DATE_RANGE");
}
