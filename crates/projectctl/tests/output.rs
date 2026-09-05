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
