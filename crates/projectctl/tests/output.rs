use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    os::unix::net::UnixListener,
    process::{Command, Output},
};
fn parsed(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|_| {
        panic!(
            "Not a single JSON output: {}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

#[test]
fn preliminary_and_final_requests_preserve_structured_server_errors() {
    let project = "11111111-1111-4111-8111-111111111111";
    let report = "22222222-2222-4222-8222-222222222222";
    for phase in ["hello", "resolve", "report", "final"] {
        let temp = tempfile::tempdir().unwrap();
        let socket = temp.path().join("server.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        let worker = std::thread::spawn(move || {
            let replies = if phase == "report" {
                vec![
                    (200, json!({"project_id":project})),
                    (
                        409,
                        json!({"api_version":"1","error":{"code":"PROJECT_RECOVERY_REQUIRED","message":"Review the interrupted write","details":{"phase":phase}}}),
                    ),
                ]
            } else {
                vec![(
                    409,
                    json!({"api_version":"1","error":{"code":"PROJECT_RECOVERY_REQUIRED","message":"Review the interrupted write","details":{"phase":phase}}}),
                )]
            };
            for (status, body) in replies {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0; 8192];
                assert!(stream.read(&mut request).unwrap() > 0);
                let body = body.to_string();
                write!(stream, "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
        });
        let mut command = Command::new(env!("CARGO_BIN_EXE_projectctl"));
        command.args([
            "--socket",
            socket.to_str().unwrap(),
            "--project",
            temp.path().to_str().unwrap(),
        ]);
        match phase {
            "hello" => {
                command.args(["maintenance-apply", "example-plan"]);
            }
            "resolve" => {
                command.args(["card", "list"]);
            }
            "report" => {
                command.args(["report", "resolve", report, "--summary", "Resolved"]);
            }
            _ => {
                command.args(["get", "/api/v1/projects"]);
            }
        }
        let output = command.output().unwrap();
        worker.join().unwrap();
        let value = parsed(&output);
        assert_eq!(
            value["error"]["code"], "PROJECT_RECOVERY_REQUIRED",
            "{phase}: {value}"
        );
        assert_eq!(value["error"]["details"]["phase"], phase);
        assert_eq!(value["http_status"], 409);
        assert_eq!(output.status.code(), Some(7), "{phase}: {value}");
    }
}
#[test]
fn malformed_error_envelopes_never_hide_an_uncertain_command() {
    for phase in ["hello", "read", "command"] {
        for body in ["", "{}", "[]", r#"{"error":{"code":"BROKEN"}}"#] {
            let temp = tempfile::tempdir().unwrap();
            let socket = temp.path().join("server.sock");
            let listener = UnixListener::bind(&socket).unwrap();
            let worker = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0; 8192];
                assert!(stream.read(&mut request).unwrap() > 0);
                write!(stream, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            });
            let mut command = Command::new(env!("CARGO_BIN_EXE_projectctl"));
            command.args(["--socket", socket.to_str().unwrap()]);
            match phase {
                "hello" => {
                    command.args(["maintenance-apply", "plan"]);
                }
                "read" => {
                    command.args(["get", "/api/v1/projects"]);
                }
                _ => {
                    let payload = temp.path().join("input.json");
                    std::fs::write(&payload, b"{}").unwrap();
                    command.args([
                        "command",
                        "PATCH",
                        "/api/v1/example",
                        "--json-file",
                        payload.to_str().unwrap(),
                        "--request-id",
                        "019913e8-8000-7000-8000-000000000001",
                        "--epoch",
                        "example-epoch",
                    ]);
                }
            }
            let output = command.output().unwrap();
            worker.join().unwrap();
            let value = parsed(&output);
            assert_eq!(
                value["error"]["code"],
                if phase == "command" {
                    "RESULT_UNCERTAIN"
                } else {
                    "INVALID_RESPONSE"
                },
                "{phase}: {body:?}: {value}"
            );
            assert_eq!(
                output.status.code(),
                Some(if phase == "command" { 9 } else { 8 })
            );
            assert_eq!(value["http_status"], 502);
            if phase == "command" {
                assert_eq!(value["request_id"], "019913e8-8000-7000-8000-000000000001");
                assert_eq!(value["command_epoch"], "example-epoch");
            }
        }
    }
}
#[test]
fn argument_and_transport_failures_are_single_json_with_stable_exits() {
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .arg("--unknown")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(parsed(&output)["error"]["code"], "INVALID_ARGUMENTS");
    let temp = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args([
            "--socket",
            temp.path().join("missing.sock").to_str().unwrap(),
            "hello",
        ])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert_eq!(parsed(&output)["error"]["code"], "TRANSPORT_UNAVAILABLE");
}
#[test]
fn accepted_and_malformed_mutation_replies_preserve_command_identity() {
    for malformed in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let socket = temp.path().join("server.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        let request = "019913e8-8000-7000-8000-000000000001";
        let payload = temp.path().join("input.json");
        std::fs::write(&payload, b"{}").unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0; 8192];
            let _ = stream.read(&mut buf).unwrap();
            let body = if malformed {
                "not JSON".into()
            } else {
                json!({"request_id":request,"state":"prepared"}).to_string()
            };
            write!(stream,"HTTP/1.1 202 Accepted\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
        });
        let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
            .args([
                "--socket",
                socket.to_str().unwrap(),
                "command",
                "PATCH",
                "/api/v1/example",
                "--json-file",
                payload.to_str().unwrap(),
                "--if-version",
                "r1.example",
                "--request-id",
                request,
                "--epoch",
                "example-epoch",
            ])
            .output()
            .unwrap();
        worker.join().unwrap();
        assert_eq!(
            output.status.code(),
            Some(9),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
        let value = parsed(&output);
        assert_eq!(value["request_id"], request);
        assert_eq!(value["command_epoch"], "example-epoch");
        if malformed {
            assert_eq!(value["error"]["code"], "RESULT_UNCERTAIN");
        }
    }
}

#[test]
fn tag_preview_sends_one_read_only_post_and_classifies_failures_as_reads() {
    for malformed in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let socket = temp.path().join("server.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 4096];
            loop {
                let count = stream.read(&mut chunk).unwrap();
                assert!(count > 0);
                request.extend_from_slice(&chunk[..count]);
                assert!(request.len() < 16384);
                if let Some(end) = request.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                    let length: usize = headers
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length: "))
                        .unwrap()
                        .parse()
                        .unwrap();
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let end = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .unwrap();
            let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
            assert!(
                headers.starts_with("post /api/v1/workspace/tags/preview http/1.1\r\n"),
                "{headers}"
            );
            assert!(!headers.contains("x-request-id:"));
            assert!(!headers.contains("x-command-epoch:"));
            let payload: Value = serde_json::from_slice(&request[end + 4..]).unwrap();
            assert_eq!(
                payload,
                json!({"source":"Research, discovery","target":"Reviewed"})
            );
            let body = if malformed {
                "not JSON".into()
            } else {
                json!({"version":"w1.example","source":"Research, discovery","target":"Reviewed","complete":true,"issues":[],"changes":[]}).to_string()
            };
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
        });
        let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
            .args([
                "--socket",
                socket.to_str().unwrap(),
                "tags",
                "preview",
                "--source",
                "Research, discovery",
                "--target",
                "Reviewed",
            ])
            .output()
            .unwrap();
        worker.join().unwrap();
        let value = parsed(&output);
        assert!(value["request_id"].is_null());
        assert!(value["command_epoch"].is_null());
        assert!(
            output.stderr.is_empty(),
            "Preview must not announce a mutation identity"
        );
        if malformed {
            assert_eq!(output.status.code(), Some(8));
            assert_eq!(value["error"]["code"], "INVALID_RESPONSE");
        } else {
            assert_eq!(output.status.code(), Some(0));
            assert_eq!(value["data"]["source"], "Research, discovery");
            assert_eq!(value["data"]["changes"], json!([]));
        }
    }
    let temp = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args([
            "--socket",
            temp.path().join("missing.sock").to_str().unwrap(),
            "tags",
            "preview",
            "--source",
            "Old",
            "--target",
            "New",
        ])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert_eq!(parsed(&output)["error"]["code"], "TRANSPORT_UNAVAILABLE");
    assert!(parsed(&output)["request_id"].is_null());
}

#[test]
fn offline_validation_does_not_initialize_or_modify_the_selected_folder() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let project = root.join(".project");
    std::fs::create_dir(&project).unwrap();
    std::fs::write(
        project.join("project.md"),
        b"invalid source remains untouched",
    )
    .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args(["--project", root.to_str().unwrap(), "validate", "--offline"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(7));
    let value = parsed(&output);
    assert_eq!(value["data"]["invalid"], 1);
    assert_eq!(value["data"]["checked"], 1);
    assert_eq!(
        std::fs::read(project.join("project.md")).unwrap(),
        b"invalid source remains untouched"
    );
    assert_eq!(std::fs::read_dir(&project).unwrap().count(), 1);
    let child = root.join("child");
    std::fs::create_dir(&child).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_projectctl"))
        .args([
            "--project",
            child.to_str().unwrap(),
            "validate",
            "--offline",
        ])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert_eq!(std::fs::read_dir(child).unwrap().count(), 0);
}
