use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    os::unix::net::UnixListener,
    process::Command,
    time::{Duration, Instant},
};
const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
fn card(n: usize) -> String {
    format!("22222222-2222-4222-8222-{n:012x}")
}
fn refs(count: usize) -> Value {
    json!(
        (0..count)
            .map(|n| json!({"project_id":PROJECT,"card_id":card(n)}))
            .collect::<Vec<_>>()
    )
}
fn summary(n: usize, availability: &str) -> Value {
    json!({"type":"card","project_id":PROJECT,"id":card(n),"title":format!("Pin {n} <b>literal</b> $(never-executed)"),"status":"active","availability":availability})
}
fn run(replies: Vec<(String, u16, String)>, args: &[&str]) -> (i32, Value, Vec<String>) {
    run_delayed(replies, args, Duration::ZERO)
}
fn run_delayed(
    replies: Vec<(String, u16, String)>,
    args: &[&str],
    delay: Duration,
) -> (i32, Value, Vec<String>) {
    let temp = tempfile::tempdir().unwrap();
    let socket = temp.path().join("server.sock");
    let server = UnixListener::bind(&socket).unwrap();
    server.set_nonblocking(true).unwrap();
    let worker = std::thread::spawn(move || {
        let mut paths = vec![];
        for (path, status, body) in replies {
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match server.accept() {
                    Ok((stream, _)) => break stream,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(Instant::now() < deadline, "Missing expected read: {path}");
                        std::thread::sleep(Duration::from_millis(1))
                    }
                    Err(e) => panic!("{e}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = vec![];
            let mut chunk = [0; 4096];
            while !request.windows(4).any(|v| v == b"\r\n\r\n") {
                let n = stream.read(&mut chunk).unwrap();
                assert!(n > 0);
                request.extend_from_slice(&chunk[..n]);
                assert!(request.len() < 16384)
            }
            let headers = String::from_utf8(request).unwrap();
            assert_eq!(
                headers.lines().next().unwrap(),
                format!("GET {path} HTTP/1.1")
            );
            assert!(!headers.to_lowercase().contains("x-request-id"));
            assert!(!headers.to_lowercase().contains("x-command-epoch"));
            paths.push(path);
            if paths.len() > 1 {
                std::thread::sleep(delay);
            }
            let response = format!(
                "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes());
        }
        std::thread::sleep(Duration::from_millis(30));
        assert!(
            matches!(server.accept(),Err(e) if e.kind()==std::io::ErrorKind::WouldBlock),
            "Unexpected detail read"
        );
        paths
    });
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args(["--socket", socket.to_str().unwrap(), "focus-preview"])
        .args(args)
        .output()
        .unwrap();
    let paths = worker.join().unwrap();
    assert!(output.stderr.is_empty());
    let value = serde_json::from_slice(&output.stdout).unwrap();
    (output.status.code().unwrap(), value, paths)
}

#[test]
fn a_shorter_total_deadline_stops_legacy_reads_and_retains_membership() {
    let started = Instant::now();
    let (code, out, paths) = run_delayed(
        vec![
            focus(json!({"items":refs(5)})),
            (
                format!("/api/v1/projects/{PROJECT}/cards/{}", card(0)),
                200,
                json!({"type":"card","metadata":{"id":card(0),"title":"Late card"}}).to_string(),
            ),
        ],
        &["--timeout", "1"],
        Duration::from_millis(1400),
    );
    assert_eq!(code, 0);
    assert_eq!(paths.len(), 2);
    assert_eq!(out["data"]["online"], true);
    assert_eq!(out["data"]["total"], 5);
    assert!(
        out["data"]["cards"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["available"] == false)
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}
fn focus(value: Value) -> (String, u16, String) {
    ("/api/v1/workspace/focus".into(), 200, value.to_string())
}
#[test]
fn modern_summary_is_one_read_with_first_five_order_and_literal_titles() {
    let summaries = (0..8)
        .rev()
        .map(|n| summary(n, "ready"))
        .collect::<Vec<_>>();
    let (code, out, paths) = run(vec![focus(json!({"items":refs(8),"cards":summaries}))], &[]);
    assert_eq!(code, 0);
    assert_eq!(out["ok"], true);
    assert_eq!(out["data"]["total"], 8);
    assert_eq!(paths.len(), 1);
    let rows = out["data"]["cards"].as_array().unwrap();
    assert_eq!(rows.len(), 5);
    for (n, row) in rows.iter().enumerate() {
        assert_eq!(row["title"], summary(n, "ready")["title"]);
        assert_eq!(row["available"], true)
    }
    assert!(out["request_id"].is_null());
    assert!(out["command_epoch"].is_null());
}
#[test]
fn missing_invalid_and_stale_rows_remain_in_place_without_detail_reads() {
    let (code, out, _) = run(
        vec![focus(
            json!({"items":refs(5),"cards":[summary(0,"ready"),summary(2,"stale"),summary(3,"invalid"),summary(4,"unavailable")]}),
        )],
        &[],
    );
    assert_eq!(code, 0);
    assert_eq!(out["data"]["online"], true);
    let rows = out["data"]["cards"].as_array().unwrap();
    assert_eq!(rows.len(), 5);
    assert_eq!(rows[0]["available"], true);
    assert!(rows[1..].iter().all(|row| row["available"] == false));
}
#[test]
fn old_reference_only_host_keeps_bounded_detail_reads_and_unavailable_neighbors() {
    let mut replies = vec![focus(json!({"items":refs(8)}))];
    for n in 0..5 {
        let (status, body) = if n == 2 {
            (
                404,
                json!({"api_version":"1","error":{"code":"RESOURCE_NOT_FOUND","message":"Missing synthetic card"}}),
            )
        } else {
            (
                200,
                json!({"type":"card","metadata":{"id":card(n),"title":format!("Legacy {n}"),"status":"active"}}),
            )
        };
        replies.push((
            format!("/api/v1/projects/{PROJECT}/cards/{}", card(n)),
            status,
            body.to_string(),
        ));
    }
    let (code, out, paths) = run(replies, &[]);
    assert_eq!(code, 0);
    assert_eq!(paths.len(), 6);
    assert_eq!(out["data"]["total"], 8);
    assert_eq!(out["data"]["cards"][2]["available"], false);
    assert_eq!(out["data"]["cards"][4]["title"], "Legacy 4");
}

#[test]
fn missing_or_relative_socket_is_a_controlled_error() {
    for socket in ["relative.sock", "/nonexistent/astra-preview-test.sock"] {
        let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
            .args(["--socket", socket, "focus-preview"])
            .output()
            .unwrap();
        assert!(!output.status.success());
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["ok"], false);
        assert!(result.get("data").is_none());
    }
}

#[test]
fn an_unexpected_success_status_cannot_be_reported_as_a_valid_focus_read() {
    let (code, out, _) = run(
        vec![(
            "/api/v1/workspace/focus".into(),
            201,
            json!({"items":[],"cards":[]}).to_string(),
        )],
        &[],
    );
    assert_eq!(code, 8);
    assert_eq!(out["ok"], false);
    assert_eq!(out["http_status"], 201);
    assert_eq!(out["error"]["code"], "INVALID_RESPONSE");
}
#[test]
fn invalid_membership_ids_cannot_become_request_paths() {
    let (code, out, paths) = run(
        vec![focus(
            json!({"items":[{"project_id":"../../local","card_id":card(0)}]}),
        )],
        &[],
    );
    assert_eq!(code, 0);
    assert_eq!(paths.len(), 1);
    assert_eq!(out["data"]["cards"][0]["available"], false);
}
#[test]
fn empty_modern_focus_is_online_and_oversized_or_malformed_snapshots_fail() {
    let (code, out, _) = run(vec![focus(json!({"items":[],"cards":[]}))], &[]);
    assert_eq!(code, 0);
    assert_eq!(out["data"]["online"], true);
    assert_eq!(out["data"]["cards"], json!([]));
    for bad in [
        json!({"items":refs(101),"cards":[]}),
        json!({"items":[],"cards":{}}),
        json!({"items":null}),
    ] {
        let (code, out, _) = run(vec![focus(bad)], &[]);
        assert_ne!(code, 0);
        assert_eq!(out["ok"], false)
    }
}
#[test]
fn preview_response_budget_is_two_mib_and_text_is_bounded_by_characters() {
    let mut row = summary(0, "ready");
    row["title"] = json!("🧪".repeat(500));
    let (code, out, _) = run(vec![focus(json!({"items":refs(1),"cards":[row]}))], &[]);
    assert_eq!(code, 0);
    assert_eq!(
        out["data"]["cards"][0]["title"]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        300
    );
    let (code, out, _) = run(
        vec![focus(
            json!({"items":[],"cards":[],"padding":"x".repeat(2*1024*1024)}),
        )],
        &[],
    );
    assert_eq!(code, 8);
    assert_eq!(out["error"]["code"], "INVALID_RESPONSE");
}
