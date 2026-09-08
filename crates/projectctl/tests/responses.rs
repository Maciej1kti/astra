use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    os::unix::net::UnixListener,
    process::{Command, Output},
    time::{Duration, Instant},
};

const REQUEST: &str = "019913e8-8000-7000-8000-000000000001";
const OTHER_REQUEST: &str = "019913e8-8000-7000-8000-000000000002";
const EPOCH: &str = "11111111-1111-4111-8111-111111111111";
const RESOURCE: &str = "22222222-2222-4222-8222-222222222222";

fn committed() -> Value {
    json!({
        "api_version":"1", "request_id":REQUEST, "status":"committed",
        "result":{"type":"card", "id":RESOURCE, "version":format!("r1.{}", "a".repeat(64))},
        "warnings":[], "replayed":false,
    })
}

fn accepted() -> Value {
    json!({"api_version":"1", "request_id":REQUEST, "status":"running", "job_id":RESOURCE})
}

fn run(arguments: &[&str], status: u16, body: Value) -> (Output, String) {
    let temp = tempfile::tempdir().unwrap();
    let socket = temp.path().join("server.sock");
    let input = temp.path().join("input.json");
    std::fs::write(&input, b"{}").unwrap();
    let listener = UnixListener::bind(&socket).unwrap();
    listener.set_nonblocking(true).unwrap();
    let worker = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline, "CLI never connected");
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("accept failed: {error}"),
            }
        };
        stream.set_nonblocking(false).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut chunk = [0; 4096];
        loop {
            let count = stream.read(&mut chunk).unwrap();
            assert!(count > 0, "request ended early");
            bytes.extend_from_slice(&chunk[..count]);
            assert!(bytes.len() <= 16384);
            if let Some(end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                let length = headers
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length: "))
                    .map(|value| value.parse::<usize>().unwrap())
                    .unwrap_or(0);
                if bytes.len() >= end + 4 + length {
                    break;
                }
            }
        }
        let body = body.to_string();
        write!(stream, "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
        String::from_utf8(bytes).unwrap()
    });
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args(["--socket", socket.to_str().unwrap(), "--timeout", "2"])
        .args(arguments.iter().map(|argument| {
            if *argument == "$INPUT" {
                input.to_str().unwrap()
            } else {
                argument
            }
        }))
        .output()
        .unwrap();
    (output, worker.join().unwrap())
}

fn source_arguments() -> Vec<&'static str> {
    vec![
        "command",
        "PATCH",
        "/api/v1/projects/11111111-1111-4111-8111-111111111111/cards/22222222-2222-4222-8222-222222222222",
        "--json-file",
        "$INPUT",
        "--request-id",
        REQUEST,
        "--epoch",
        EPOCH,
    ]
}

fn uncertain(output: Output) {
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(output.status.code(), Some(9), "{value}");
    assert_eq!(value["ok"], false, "{value}");
    assert_eq!(value["error"]["code"], "RESULT_UNCERTAIN", "{value}");
    assert_eq!(value["request_id"], REQUEST);
    assert_eq!(value["command_epoch"], EPOCH);
}

#[test]
fn incomplete_successful_commands_retain_uncertainty() {
    for body in [
        json!({}),
        Value::Null,
        json!([]),
        json!({"status":"committed"}),
    ] {
        uncertain(run(&source_arguments(), 200, body).0);
    }
}

#[test]
fn another_commands_reply_cannot_replace_the_submitted_identity() {
    let mut body = committed();
    body["request_id"] = json!(OTHER_REQUEST);
    uncertain(run(&source_arguments(), 200, body).0);
}

#[test]
fn command_and_workflow_success_kinds_are_not_interchangeable() {
    uncertain(run(&source_arguments(), 200, accepted()).0);
    uncertain(run(&source_arguments(), 202, accepted()).0);
    uncertain(
        run(
            &[
                "register",
                RESOURCE,
                "--request-id",
                REQUEST,
                "--epoch",
                EPOCH,
            ],
            200,
            committed(),
        )
        .0,
    );
}

#[test]
fn valid_source_confirmation_and_unresolved_states_keep_their_meaning() {
    for status in [200, 201] {
        let (output, request) = run(&source_arguments(), status, committed());
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(0), "{value}");
        assert_eq!(value["data"]["status"], "committed");
        assert_eq!(value["request_id"], REQUEST);
        assert_eq!(value["command_epoch"], EPOCH);
        assert!(
            request
                .to_lowercase()
                .contains(&format!("x-request-id: {REQUEST}"))
        );
    }
    let mut replay = committed();
    replay["status"] = json!("noop");
    replay["replayed"] = json!(true);
    replay["warnings"] = json!([{"code":"PROJECTION_DEGRADED","message":"Source committed; projection refresh is pending"}]);
    let output = run(&source_arguments(), 200, replay.clone()).0;
    assert_eq!(output.status.code(), Some(0));
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap()["data"],
        replay
    );

    for state in ["prepared", "blocked", "needs_review"] {
        let body = json!({"api_version":"1", "request_id":REQUEST, "state":state});
        let output = run(&source_arguments(), 202, body.clone()).0;
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(9), "{value}");
        assert_eq!(value["ok"], true);
        assert_eq!(value["data"], body);
        assert_eq!(value["request_id"], REQUEST);
    }
}

#[test]
fn incomplete_confirmation_fields_do_not_report_success() {
    let mut cases = Vec::new();
    for field in [
        "api_version",
        "request_id",
        "result",
        "warnings",
        "replayed",
    ] {
        let mut value = committed();
        value.as_object_mut().unwrap().remove(field);
        cases.push(value);
    }
    let mut unknown_api = committed();
    unknown_api["api_version"] = json!("2");
    cases.push(unknown_api);
    let mut wrong_result = committed();
    wrong_result["result"] = json!({"type":"unknown"});
    cases.push(wrong_result);
    let mut malformed_warning = committed();
    malformed_warning["warnings"] = json!([{"code":"BROKEN"}]);
    cases.push(malformed_warning);
    for body in cases {
        uncertain(run(&source_arguments(), 200, body).0);
    }
}

#[test]
fn registration_and_maintenance_accept_jobs_with_original_identity() {
    for action in ["register", "maintenance-apply"] {
        let arguments = [action, RESOURCE, "--request-id", REQUEST, "--epoch", EPOCH];
        for body in [
            accepted(),
            json!({"api_version":"1", "request_id":REQUEST, "state":"prepared"}),
        ] {
            let (output, request) = run(&arguments, 202, body.clone());
            let value: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(output.status.code(), Some(9), "{value}");
            assert_eq!(value["ok"], true);
            assert_eq!(value["data"], body);
            assert_eq!(value["request_id"], REQUEST);
            assert_eq!(value["command_epoch"], EPOCH);
            if action == "maintenance-apply" {
                let (_, body) = request.split_once("\r\n\r\n").unwrap();
                let body: Value = serde_json::from_str(body).unwrap();
                assert_eq!(body["request_id"], REQUEST);
                assert_eq!(body["command_epoch"], EPOCH);
                assert!(!request.to_lowercase().contains("x-request-id:"));
            } else {
                assert!(
                    request
                        .to_lowercase()
                        .contains(&format!("x-request-id: {REQUEST}"))
                );
            }
        }
        let mut wrong_job = accepted();
        wrong_job["job_id"] = json!("not-a-job-id");
        uncertain(run(&arguments, 202, wrong_job).0);
    }
}

#[test]
fn server_rejections_preserve_details_but_cannot_replace_identity() {
    let rejection = json!({"api_version":"1", "error":{"code":"VERSION_CONFLICT", "message":"Resource changed", "details":{"field":"version"}}});
    for include_id in [false, true] {
        let mut body = rejection.clone();
        if include_id {
            body["error"]["request_id"] = json!(REQUEST);
        }
        let output = run(&source_arguments(), 412, body.clone()).0;
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(5), "{value}");
        assert_eq!(value["error"], body["error"]);
        assert_eq!(value["request_id"], REQUEST);
        assert_eq!(value["command_epoch"], EPOCH);
    }
    let mut wrong = rejection;
    wrong["error"]["request_id"] = json!(OTHER_REQUEST);
    uncertain(run(&source_arguments(), 412, wrong).0);
}

#[test]
fn non_journaled_api_actions_do_not_invent_a_command_identity() {
    let session = json!({"id":RESOURCE,"current":false,"device_label":"Test browser","created_at":"2026-09-08T00:00:00Z","last_seen_at":"2026-09-08T00:00:00Z","expires_at":"2026-10-08T00:00:00Z"});
    let (output, request) = run(&["revoke-session", RESOURCE], 200, session.clone());
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(output.status.code(), Some(0), "{value}");
    assert_eq!(value["data"], session);
    assert!(request.starts_with(&format!("DELETE /api/v1/auth/sessions/{RESOURCE} HTTP/1.1")));
    assert!(!request.to_lowercase().contains("x-request-id:"));
    assert!(output.stderr.is_empty());
    assert!(value["request_id"].is_null());
    assert!(value["command_epoch"].is_null());

    for path in [
        "/api/v1/auth/pairings/22222222-2222-4222-8222-222222222222/deny",
        "/api/v1/registration-plans",
        "/api/v1/native-folder-selections",
        "/api/v1/workspace/tags/preview?example=1",
    ] {
        let (output, request) = run(
            &["command", "POST", path, "--json-file", "$INPUT"],
            200,
            json!({"test_response":true}),
        );
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(0), "{path}: {value}");
        assert!(
            request.starts_with(&format!("POST {path} HTTP/1.1")),
            "{request}"
        );
        assert!(!request.to_lowercase().contains("x-request-id:"));
        assert!(!request.to_lowercase().contains("x-command-epoch:"));
        assert!(output.stderr.is_empty());
        assert!(value["request_id"].is_null());
        assert!(value["command_epoch"].is_null());
    }
}

#[test]
fn command_status_checks_the_original_identity_without_submitting_or_fetching_hello() {
    let arguments = ["command-status", REQUEST, "--epoch", EPOCH];
    let body =
        json!({"api_version":"1", "request_id":REQUEST, "state":"committed", "result":committed()});
    let (output, request) = run(&arguments, 200, body.clone());
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(output.status.code(), Some(0), "{value}");
    assert_eq!(value["data"], body);
    assert_eq!(value["request_id"], REQUEST);
    assert_eq!(value["command_epoch"], EPOCH);
    assert!(request.starts_with(&format!(
        "GET /api/v1/commands/{REQUEST}?epoch={EPOCH} HTTP/1.1"
    )));
    assert!(!request.to_lowercase().contains("x-request-id:"));
    assert!(output.stderr.is_empty());

    for body in [
        json!({}),
        json!({"api_version":"1", "request_id":OTHER_REQUEST, "state":"committed"}),
        committed(),
    ] {
        uncertain(run(&arguments, 200, body).0);
    }
}

fn pending_with_planned_result(state: &str) -> Value {
    // Journal preparation saves the intended CommandResponse before writing the source.
    // The status query returns it even while the outer state remains unresolved.
    json!({"api_version":"1", "request_id":REQUEST, "state":state, "result":committed()})
}

#[test]
fn status_queries_preserve_pending_state_when_the_journal_has_a_planned_result() {
    let arguments = ["command-status", REQUEST, "--epoch", EPOCH];
    for state in ["prepared", "blocked", "needs_review"] {
        let body = pending_with_planned_result(state);
        let (output, _) = run(&arguments, 200, body.clone());
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["ok"], true, "{value}");
        assert_eq!(value["data"], body);
        assert_eq!(output.status.code(), Some(9));
        assert_eq!(value["request_id"], REQUEST);
        assert_eq!(value["command_epoch"], EPOCH);
    }
    let mut wrong_plan = pending_with_planned_result("prepared");
    wrong_plan["result"]["request_id"] = json!(OTHER_REQUEST);
    uncertain(run(&arguments, 200, wrong_plan).0);
}

#[test]
fn direct_unresolved_replies_may_include_the_valid_planned_result() {
    for state in ["prepared", "blocked", "needs_review"] {
        let body = pending_with_planned_result(state);
        let output = run(&source_arguments(), 202, body.clone()).0;
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["ok"], true, "{value}");
        assert_eq!(value["data"], body);
        assert_eq!(output.status.code(), Some(9));
    }
}

fn server_failure(code: &str) -> Value {
    json!({
        "api_version":"1",
        "error": {
            "code":code, "message":"Source outcome could not be confirmed",
            "request_id":REQUEST, "details":{"phase":"projection_refresh"},
        },
    })
}

#[test]
fn valid_server_failures_after_durable_submission_preserve_uncertainty_and_diagnostics() {
    let operations = [
        source_arguments(),
        vec![
            "register",
            RESOURCE,
            "--request-id",
            REQUEST,
            "--epoch",
            EPOCH,
        ],
        vec![
            "maintenance-apply",
            RESOURCE,
            "--request-id",
            REQUEST,
            "--epoch",
            EPOCH,
        ],
    ];
    for arguments in operations {
        for status in [500, 503] {
            let body = server_failure("SERVICE_UNAVAILABLE");
            let output = run(&arguments, status, body.clone()).0;
            let value: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(output.status.code(), Some(9), "{value}");
            assert_eq!(value["error"]["details"]["server_error"], body["error"]);
            assert_eq!(value["http_status"], status);
            uncertain(output);
        }
    }
}

#[test]
fn failed_status_lookups_never_prove_that_the_original_command_failed() {
    for (status, code) in [
        (404, "COMMAND_NOT_FOUND"),
        (409, "EPOCH_CHANGED"),
        (503, "SERVICE_UNAVAILABLE"),
    ] {
        let body = server_failure(code);
        let output = run(
            &["command-status", REQUEST, "--epoch", EPOCH],
            status,
            body.clone(),
        )
        .0;
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(9), "{value}");
        assert_eq!(value["error"]["details"]["server_error"], body["error"]);
        assert_eq!(value["http_status"], status);
        uncertain(output);
    }
}

#[test]
fn ordinary_reads_and_non_journaled_actions_keep_server_failure_classification() {
    for arguments in [
        vec!["get", "/api/v1/projects"],
        vec!["revoke-session", RESOURCE],
    ] {
        let mut body = server_failure("SERVICE_UNAVAILABLE");
        body["error"].as_object_mut().unwrap().remove("request_id");
        let output = run(&arguments, 503, body.clone()).0;
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(output.status.code(), Some(8), "{value}");
        assert_eq!(value["error"], body["error"]);
        assert!(value["request_id"].is_null());
        assert!(value["command_epoch"].is_null());
    }
}
