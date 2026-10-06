//! Lifecycle regression against the real daemon and authenticated local transport.
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

mod support;

struct Daemon(Child);
impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[tokio::test]
async fn sigterm_closes_an_open_local_event_stream_and_exits() {
    let temp = tempfile::tempdir().unwrap();
    let root =
        project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let directory = state.path();
    let socket = directory.join("projectd.sock");
    let mut daemon = Daemon(
        Command::new(env!("CARGO_BIN_EXE_projectd"))
            .args([
                "--data-dir",
                directory.to_str().unwrap(),
                "--public-origin",
                "https://lifecycle.test",
                "--port",
                "0",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let deadline = Instant::now() + Duration::from_secs(5);
    while !socket.exists() {
        assert!(
            daemon.0.try_wait().unwrap().is_none(),
            "daemon exited before opening its local socket"
        );
        assert!(Instant::now() < deadline, "daemon startup timed out");
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let client = reqwest::Client::builder()
        .unix_socket(socket)
        .no_proxy()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    let mut response = client
        .get("http://localhost/api/v1/events")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(response.chunk().await.unwrap().is_some());
    assert!(
        Command::new("kill")
            .args(["-TERM", &daemon.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    tokio::time::timeout(Duration::from_secs(2), async {
        while response.chunk().await.unwrap().is_some() {}
        loop {
            if let Some(status) = daemon.0.try_wait().unwrap() {
                assert!(status.success());
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("an open event stream must not hold graceful shutdown indefinitely");
}

/// A private state directory and an agent directory with instructions.
fn agent_directories() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root =
        project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap().path().to_owned();
    let agent = root.child("agent", true).unwrap().path().to_owned();
    std::fs::write(agent.join("AGENTS.md"), "# Instructions\n").unwrap();
    (temp, state, agent)
}
fn daemon_command(state: &Path, extra: &[&str]) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_projectd"));
    command
        .args([
            "--data-dir",
            state.to_str().unwrap(),
            "--public-origin",
            "https://lifecycle.test",
            "--port",
            "0",
        ])
        .args(extra)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    command
}

#[test]
fn agent_options_are_validated_before_the_daemon_listens() {
    let (_temp, state, agent) = agent_directories();
    let file = agent.join("AGENTS.md");
    let fake = support::FAKE_AGENT;
    for (extra, message) in [
        (
            vec!["--agent-dir", "/nonexistent/agent-dir"],
            "Agent directory must be an existing directory",
        ),
        (
            vec!["--agent-dir", file.to_str().unwrap()],
            "Agent directory must be an existing directory",
        ),
        (vec!["--agent-claude-bin", fake], "--agent-dir"),
        (vec!["--agent-codex-bin", fake], "--agent-dir"),
        (vec!["--agent-timeout", "30"], "--agent-dir"),
        (
            vec![
                "--agent-dir",
                agent.to_str().unwrap(),
                "--agent-timeout",
                "0",
            ],
            "agent-timeout",
        ),
        (
            vec![
                "--agent-dir",
                agent.to_str().unwrap(),
                "--agent-timeout",
                "3601",
            ],
            "agent-timeout",
        ),
        (
            vec![
                "--agent-dir",
                agent.to_str().unwrap(),
                "--agent-timeout",
                "soon",
            ],
            "agent-timeout",
        ),
    ] {
        let output = daemon_command(&state, &extra).output().unwrap();
        assert!(!output.status.success(), "{extra:?}");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains(message), "{extra:?}: {stderr}");
        assert!(!state.join("projectd.sock").exists(), "{extra:?}");
    }
}

async fn wait_for(path: &Path) -> String {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(text) = std::fs::read_to_string(path)
            && !text.is_empty()
        {
            return text;
        }
        assert!(
            Instant::now() < deadline,
            "{} never appeared",
            path.display()
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn sigterm_ends_a_running_agent_and_its_process_group_before_the_daemon_exits() {
    // The daemon puts its own directory first on the agent's PATH for projectctl.
    support::projectctl_dir();
    let (_temp, state, agent) = agent_directories();
    let socket = state.join("projectd.sock");
    let mut daemon = Daemon(
        daemon_command(
            &state,
            &[
                "--agent-dir",
                agent.to_str().unwrap(),
                "--agent-claude-bin",
                support::FAKE_AGENT,
                "--agent-codex-bin",
                support::FAKE_AGENT,
                "--agent-timeout",
                "300",
            ],
        )
        .stderr(Stdio::null())
        .spawn()
        .unwrap(),
    );
    let deadline = Instant::now() + Duration::from_secs(10);
    while !socket.exists() {
        assert!(
            daemon.0.try_wait().unwrap().is_none(),
            "daemon exited before opening its local socket"
        );
        assert!(Instant::now() < deadline, "daemon startup timed out");
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let client = reqwest::Client::builder()
        .unix_socket(socket)
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let bootstrap: Value = client
        .get("http://localhost/api/v1/bootstrap")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(bootstrap["agent_enabled"], true);
    let status: Value = client
        .get("http://localhost/api/v1/agent")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        status["providers"],
        json!([{"id":"claude","available":true},{"id":"codex","available":true}])
    );
    let started = client
        .post("http://localhost/api/v1/agent/runs")
        .json(&json!({
            "run_id": uuid::Uuid::now_v7().to_string(),
            "boot_id": status["boot_id"],
            "conversation_id": uuid::Uuid::new_v4().to_string(),
            "message": "[[stubborn]]",
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(started.status(), 202, "{}", started.text().await.unwrap());
    let log = wait_for(&agent.join(".fake-agent.log")).await;
    let pid: i32 = log
        .split(' ')
        .find_map(|part| part.strip_prefix("pid="))
        .unwrap()
        .parse()
        .unwrap();
    let group = rustix::process::Pid::from_raw(pid).unwrap();
    assert!(rustix::process::test_kill_process_group(group).is_ok());

    assert!(
        Command::new("kill")
            .args(["-TERM", &daemon.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    // The agent ignores SIGTERM, so the daemon has to outwait the grace period.
    let deadline = Instant::now() + Duration::from_secs(20);
    let status = loop {
        if let Some(status) = daemon.0.try_wait().unwrap() {
            break status;
        }
        assert!(Instant::now() < deadline, "the daemon did not exit");
        tokio::time::sleep(Duration::from_millis(20)).await;
    };
    assert!(status.success());
    // By the time the daemon is gone, so is everything it started; the grace
    // is only for the system to reap the killed processes.
    let deadline = Instant::now() + Duration::from_secs(3);
    while rustix::process::test_kill_process_group(group).is_ok() {
        assert!(
            Instant::now() < deadline,
            "the agent's process group outlived the daemon"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
