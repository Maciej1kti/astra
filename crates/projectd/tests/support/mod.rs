//! Helpers shared by the integration tests that run agents.
use std::{path::PathBuf, process::Command, sync::OnceLock};

/// The fake GitHub CLI; a test copies it beside its own account state.
#[allow(dead_code, reason = "only the transport tests publish repositories")]
pub const FAKE_GH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fake-gh.sh");

/// The fake Claude Code / Codex command line.
pub const FAKE_AGENT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fake-agent.sh");

/// The directory holding a `projectctl` built for this test profile. The CLI
/// belongs to another package, so Cargo does not build it for these tests.
pub fn projectctl_dir() -> PathBuf {
    static BUILT: OnceLock<PathBuf> = OnceLock::new();
    BUILT
        .get_or_init(|| {
            let executable = std::env::current_exe().expect("test executable");
            let profile = executable
                .parent()
                .and_then(|deps| deps.parent())
                .expect("target profile directory")
                .to_path_buf();
            let mut build = Command::new(env!("CARGO"));
            build.args(["build", "--package", "projectctl", "--locked", "--offline"]);
            if profile.file_name().is_some_and(|name| name == "release") {
                build.arg("--release");
            }
            let output = build.output().expect("run cargo");
            assert!(
                output.status.success(),
                "building projectctl failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(profile.join("projectctl").is_file());
            profile
        })
        .clone()
}
