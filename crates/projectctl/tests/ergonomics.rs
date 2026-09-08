//! Exercise the public CLI grammar and its actual HTTP requests using isolated sockets.
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::PathBuf,
    process::{Command, Output, Stdio},
    thread::JoinHandle,
    time::{Duration, Instant},
};

const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
const RESOURCE: &str = "22222222-2222-4222-8222-222222222222";
const HISTORY: &str = "33333333-3333-4333-8333-333333333333";
const REQUEST: &str = "019913e8-8000-7000-8000-000000000001";
const EPOCH: &str = "44444444-4444-4444-8444-444444444444";
const VERSION: &str = "r1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[derive(Debug)]
struct Request {
    method: String,
    path: String,
    headers: BTreeMap<String, String>,
    body: Value,
}

struct Host {
    directory: tempfile::TempDir,
    socket: PathBuf,
    worker: JoinHandle<Vec<Request>>,
}

impl Host {
    fn new(replies: Vec<(u16, Value)>) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let socket = directory.path().join("host.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        listener.set_nonblocking(true).unwrap();
        let worker = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in replies {
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "Expected another CLI request");
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(error) => panic!("Could not accept CLI request: {error}"),
                    }
                };
                requests.push(read_request(&mut stream));
                let body = body.to_string();
                write!(
                    stream,
                    "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
            requests
        });
        Self {
            directory,
            socket,
            worker,
        }
    }

    fn command(&self) -> Command {
        let mut command = cli();
        command.arg("--socket").arg(&self.socket);
        command
    }

    fn scoped_command(&self) -> Command {
        let mut command = self.command();
        command.arg("--project").arg(self.directory.path());
        command
    }

    fn finish(self) -> Vec<Request> {
        self.worker.join().unwrap()
    }
}

fn cli() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_projectctl"));
    command.env_remove("ASTRA_SOCKET").args(["--timeout", "2"]);
    command
}

fn read_request(stream: &mut UnixStream) -> Request {
    stream.set_nonblocking(false).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let mut bytes = Vec::new();
    let (header_end, body_length) = loop {
        let mut chunk = [0; 8192];
        let length = stream.read(&mut chunk).unwrap();
        assert!(length > 0, "CLI closed an incomplete HTTP request");
        bytes.extend_from_slice(&chunk[..length]);
        assert!(bytes.len() < 2_000_000, "Unexpectedly large test request");
        if let Some(end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let body_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + body_length {
                break (end, body_length);
            }
        }
    };
    let text = std::str::from_utf8(&bytes[..header_end]).unwrap();
    let mut lines = text.lines();
    let mut request_line = lines.next().unwrap().split_whitespace();
    let method = request_line.next().unwrap().to_owned();
    let path = request_line.next().unwrap().to_owned();
    let headers = lines
        .map(|line| {
            let (key, value) = line.split_once(':').unwrap();
            (key.to_ascii_lowercase(), value.trim().to_owned())
        })
        .collect();
    let body = if body_length == 0 {
        Value::Null
    } else {
        serde_json::from_slice(&bytes[header_end + 4..header_end + 4 + body_length]).unwrap()
    };
    Request {
        method,
        path,
        headers,
        body,
    }
}

fn invoke(command: &mut Command, input: Option<&[u8]>) -> Output {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    command.stdin(if input.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    let mut child = command.spawn().unwrap();
    if let Some(input) = input {
        let result = child.stdin.take().unwrap().write_all(input);
        if let Err(error) = result {
            assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
        }
    }
    child.wait_with_output().unwrap()
}

fn parsed(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "Invalid JSON output ({error}): {}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

fn conflict() -> (u16, Value) {
    (
        412,
        json!({"api_version":"1", "error":{
            "code":"VERSION_CONFLICT", "message":"The observed version changed.",
            "request_id":REQUEST, "details":{"expected_version":VERSION}
        }}),
    )
}

fn assert_scoped_mutation(
    args: &[&str],
    input: Option<&[u8]>,
    collection: &str,
    expected: Value,
    create: bool,
) {
    let host = Host::new(vec![(200, json!({"project_id":PROJECT})), conflict()]);
    let project_path = host.directory.path().canonicalize().unwrap();
    let mut command = host.scoped_command();
    command
        .args(args)
        .args(["--request-id", REQUEST, "--epoch", EPOCH]);
    if !create {
        command.args(["--if-version", VERSION]);
    }
    let output = invoke(&mut command, input);
    let requests = host.finish();
    assert_eq!(
        output.status.code(),
        Some(5),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert_eq!(parsed(&output)["error"]["code"], "VERSION_CONFLICT");
    assert_eq!(parsed(&output)["request_id"], REQUEST);
    assert_eq!(parsed(&output)["command_epoch"], EPOCH);
    assert_eq!(
        requests.len(),
        2,
        "Resolve once, then mutate without fetching a version or hello"
    );
    assert_eq!(requests[0].method, "POST");
    assert_eq!(requests[0].path, "/local/v1/projects/resolve");
    assert_eq!(requests[0].body, json!({"absolute_path":project_path}));
    let mutation = &requests[1];
    assert_eq!(mutation.method, if create { "POST" } else { "PATCH" });
    let path = format!("/api/v1/projects/{PROJECT}/{collection}");
    assert_eq!(
        mutation.path,
        if create {
            path
        } else {
            format!("{path}/{RESOURCE}")
        }
    );
    assert_eq!(mutation.body, expected);
    assert_eq!(mutation.headers["x-request-id"], REQUEST);
    assert_eq!(mutation.headers["x-command-epoch"], EPOCH);
    if create {
        assert!(!mutation.headers.contains_key("if-match"));
    } else {
        assert_eq!(mutation.headers["if-match"], format!("\"{VERSION}\""));
    }
}

#[test]
fn create_inputs_preserve_complete_json_from_stdin_and_files() {
    let input = json!({"title":"Zażółć gęślą 🦀", "body":"First line\n\nDruga linia.\n",
        "due":{"date":"2026-09-12", "kind":"target"}, "x-source":{"owner":"社区"}});
    let bytes = serde_json::to_vec(&input).unwrap();
    assert_scoped_mutation(
        &["card", "create", "--input", "-"],
        Some(&bytes),
        "cards",
        input.clone(),
        true,
    );
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("create.json");
    std::fs::write(&file, &bytes).unwrap();
    assert_scoped_mutation(
        &["milestone", "create", "--input", file.to_str().unwrap()],
        None,
        "milestones",
        input,
        true,
    );
}

#[test]
fn title_and_body_create_shorthand_preserves_multiline_stdin() {
    let body = "# Plan 🌱\n\nZażółć gęślą jaźń.\n";
    for (kind, collection) in [("card", "cards"), ("milestone", "milestones")] {
        assert_scoped_mutation(
            &[kind, "create", "--title", "Release", "--body-file", "-"],
            Some(body.as_bytes()),
            collection,
            json!({"title":"Release", "body":body}),
            true,
        );
    }
}

#[test]
fn set_shorthand_puts_body_inside_set_and_never_refetches_the_version() {
    let body = "New body\n\nUnicode: 日本語\n";
    for (kind, collection) in [("card", "cards"), ("milestone", "milestones")] {
        assert_scoped_mutation(
            &[
                kind,
                "set",
                RESOURCE,
                "--title",
                "Reviewed",
                "--status",
                "active",
                "--body-file",
                "-",
            ],
            Some(body.as_bytes()),
            collection,
            json!({"set":{"title":"Reviewed", "status":"active", "body":body}}),
            false,
        );
    }
    assert_scoped_mutation(
        &["card", "set", RESOURCE, "--body-file", "-"],
        Some(b""),
        "cards",
        json!({"set":{"body":""}}),
        false,
    );
}

#[test]
fn exact_json_patches_from_stdin_keep_clear_fields_and_extensions() {
    let patch =
        json!({"set":{"title":"Final", "body":"A\nB\n", "x-owner":"Community"}, "clear":["due"]});
    let bytes = serde_json::to_vec(&patch).unwrap();
    for (kind, collection) in [("card", "cards"), ("milestone", "milestones")] {
        assert_scoped_mutation(
            &[kind, "set", RESOURCE, "--patch-file", "-"],
            Some(&bytes),
            collection,
            patch.clone(),
            false,
        );
    }
}

#[test]
fn schedule_and_undo_translate_to_existing_conditional_patch_contracts() {
    assert_scoped_mutation(
        &[
            "card",
            "schedule",
            RESOURCE,
            "--start",
            "2026-09-08",
            "--end",
            "2026-09-10",
        ],
        None,
        "cards",
        json!({"set":{"schedule":{"start":"2026-09-08", "end":"2026-09-10"}}}),
        false,
    );
    assert_scoped_mutation(
        &["card", "schedule", RESOURCE, "--clear"],
        None,
        "cards",
        json!({"clear":["schedule"]}),
        false,
    );
    for (kind, collection) in [("card", "cards"), ("milestone", "milestones")] {
        assert_scoped_mutation(
            &[kind, "undo", RESOURCE, "--history-entry", HISTORY],
            None,
            collection,
            json!({"undo":{"history_entry_id":HISTORY}}),
            false,
        );
    }
}

#[test]
fn incompatible_or_incomplete_arguments_fail_before_connecting() {
    let directory = tempfile::tempdir().unwrap();
    let socket = directory.path().join("must-not-connect.sock");
    let listener = UnixListener::bind(&socket).unwrap();
    listener.set_nonblocking(true).unwrap();
    let cases = [
        vec!["card", "create"],
        vec!["card", "create", "--input", "-", "--title", "Ambiguous"],
        vec!["milestone", "create", "--input", "-", "--body-file", "-"],
        vec!["card", "set", RESOURCE, "--if-version", VERSION],
        vec!["card", "set", RESOURCE, "--title", "Missing version"],
        vec![
            "milestone",
            "set",
            RESOURCE,
            "--patch-file",
            "-",
            "--title",
            "Ambiguous",
            "--if-version",
            VERSION,
        ],
        vec![
            "card",
            "schedule",
            RESOURCE,
            "--start",
            "2026-09-08",
            "--if-version",
            VERSION,
        ],
        vec![
            "card",
            "schedule",
            RESOURCE,
            "--clear",
            "--start",
            "2026-09-08",
            "--end",
            "2026-09-10",
            "--if-version",
            VERSION,
        ],
        vec!["card", "schedule", RESOURCE, "--if-version", VERSION],
        vec!["milestone", "undo", RESOURCE, "--history-entry", HISTORY],
        vec![
            "card",
            "create",
            "--title",
            "Retry",
            "--request-id",
            REQUEST,
        ],
        vec!["--json", "--output", "text", "hello"],
    ];
    for args in cases {
        let mut command = cli();
        command
            .arg("--socket")
            .arg(&socket)
            .arg("--project")
            .arg(directory.path())
            .args(&args);
        let output = invoke(&mut command, None);
        assert_eq!(
            output.status.code(),
            Some(2),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stdout)
        );
        assert_eq!(
            parsed(&output)["error"]["code"],
            "INVALID_ARGUMENTS",
            "{args:?}"
        );
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock,
            "{args:?}"
        );
    }
}

#[test]
fn oversized_stdin_is_rejected_without_contacting_the_daemon() {
    let directory = tempfile::tempdir().unwrap();
    let socket = directory.path().join("must-not-connect.sock");
    let listener = UnixListener::bind(&socket).unwrap();
    listener.set_nonblocking(true).unwrap();
    let mut command = cli();
    command.arg("--socket").arg(&socket).args([
        "command",
        "PATCH",
        "/api/v1/example",
        "--json-file",
        "-",
        "--request-id",
        REQUEST,
        "--epoch",
        EPOCH,
    ]);
    let input = vec![b'x'; 1_100_001];
    let output = invoke(&mut command, Some(&input));
    assert_eq!(output.status.code(), Some(2));
    assert!(
        parsed(&output)["error"]["message"]
            .as_str()
            .unwrap()
            .contains("exceeds 1.1 MB")
    );
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}

#[test]
fn environment_socket_is_used_and_global_explicit_socket_takes_precedence() {
    for explicit in [false, true] {
        let host = Host::new(vec![(200, json!({"instance":"selected"}))]);
        let unused = tempfile::tempdir().unwrap();
        let unused_socket = unused.path().join("unused.sock");
        let listener = UnixListener::bind(&unused_socket).unwrap();
        listener.set_nonblocking(true).unwrap();
        let mut command = cli();
        command.args(["hello", "--json"]);
        if explicit {
            command
                .env("ASTRA_SOCKET", &unused_socket)
                .arg("--socket")
                .arg(&host.socket);
        } else {
            command.env("ASTRA_SOCKET", &host.socket);
        }
        let output = invoke(&mut command, None);
        assert_eq!(
            output.status.code(),
            Some(0),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
        assert_eq!(parsed(&output)["data"]["instance"], "selected");
        let requests = host.finish();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].path, "/local/v1/hello");
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
}

#[test]
fn text_errors_keep_identity_version_and_escape_untrusted_terminal_controls() {
    let host = Host::new(vec![(
        412,
        json!({"api_version":"1", "error":{
            "code":"VERSION_CONFLICT", "message":"Keep the draft\u{001b}[2J\r\u{202e}",
            "request_id":REQUEST, "details":{"expected_version":VERSION}
        }}),
    )]);
    let mut command = host.command();
    command.args([
        "--output",
        "text",
        "command",
        "PATCH",
        "/api/v1/example",
        "--json-file",
        "-",
        "--if-version",
        VERSION,
        "--request-id",
        REQUEST,
        "--epoch",
        EPOCH,
    ]);
    let output = invoke(&mut command, Some(b"{}"));
    assert_eq!(output.status.code(), Some(5));
    let text = String::from_utf8(output.stdout).unwrap();
    for value in [
        "Error: VERSION_CONFLICT",
        REQUEST,
        EPOCH,
        VERSION,
        "\\u001b[2J",
        "\\r",
        "\\u202e",
    ] {
        assert!(text.contains(value), "Missing {value}: {text}");
    }
    assert!(
        !text
            .chars()
            .any(|character| character.is_control() && character != '\n')
    );
    assert_eq!(host.finish().len(), 1);
}

#[test]
fn a_valid_committed_source_reply_is_successful_with_the_original_identity() {
    let body = "# Shared work\n\nReady for the community.\n";
    let source = json!({"type":"card", "version":VERSION, "body":body, "metadata":{
        "id":RESOURCE,"title":"Open source","kind":"outcome","status":"planned",
        "priority":"normal","position":"80000000000000000000000000000000","archived":false,
        "created_at":"2026-09-08T12:00:00Z","updated_at":"2026-09-08T12:00:00Z"
    }});
    let reply = json!({"api_version":"1", "request_id":REQUEST, "status":"committed",
        "result":{"type":"card","id":RESOURCE,"version":VERSION,"resource":source},
        "warnings":[], "replayed":false});
    let host = Host::new(vec![
        (200, json!({"project_id":PROJECT})),
        (201, reply.clone()),
    ]);
    let mut command = host.scoped_command();
    command.args([
        "card",
        "create",
        "--title",
        "Open source",
        "--body-file",
        "-",
        "--request-id",
        REQUEST,
        "--epoch",
        EPOCH,
    ]);
    let output = invoke(&mut command, Some(body.as_bytes()));
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let envelope = parsed(&output);
    assert_eq!(envelope["ok"], true);
    assert_eq!(envelope["data"], reply);
    assert_eq!(envelope["request_id"], REQUEST);
    assert_eq!(envelope["command_epoch"], EPOCH);
    let requests = host.finish();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[1].body,
        json!({"title":"Open source", "body":body})
    );
}
