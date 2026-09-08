//! Lifecycle regression against the real daemon and authenticated local transport.
use std::{
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

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
