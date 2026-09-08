use super::*;

#[test]
fn git_observer_is_explicit_bounded_and_never_runs_repository_filters() {
    use std::process::Command;
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let missing = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &missing).unwrap();
    assert_eq!(missing["stale"], true);
    assert_eq!(missing["error"], "NOT_A_GIT_ROOT");
    let git = |args: &[&str]| {
        let output = Command::new("/usr/bin/git")
            .args(args)
            .current_dir(env.path())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    };
    git(&["init", "-b", "main"]);
    fs::write(env.root.join("project/code.txt"), "initial\n").unwrap();
    git(&["add", "-f", "code.txt", ".project"]);
    let unborn = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &unborn).unwrap();
    assert_eq!(unborn["staged_paths"], 1);
    assert_eq!(unborn["commit"], Value::Null);
    git(&[
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "Fixture",
    ]);
    fs::write(env.root.join("project/code.txt"), "staged\n").unwrap();
    git(&["add", "code.txt"]);
    fs::write(
        env.root.join("project/.gitattributes"),
        "*.txt filter=hostile diff=hostile\n",
    )
    .unwrap();
    git(&[
        "config",
        "filter.hostile.clean",
        "touch OBSERVER_EXECUTED; cat",
    ]);
    git(&["config", "diff.hostile.command", "touch OBSERVER_EXECUTED"]);
    git(&["config", "core.fsmonitor", "touch OBSERVER_EXECUTED"]);
    fs::write(env.root.join("project/code.txt"), "unstaged\n").unwrap();
    let observation = engine.git_observation(&project).unwrap();
    wire::validate("GitObservation", &observation).unwrap();
    assert_eq!(observation["stale"], false, "{observation}");
    assert_eq!(observation["branch"], "main");
    assert_eq!(observation["staged_paths"], 1);
    assert_eq!(observation["working_tree_checked"], false);
    assert_eq!(observation["untracked_checked"], false);
    assert!(!env.root.join("project/OBSERVER_EXECUTED").exists());
    git(&["config", "--unset", "core.fsmonitor"]);
    let worktree = env.root.join("worktree");
    git(&[
        "worktree",
        "add",
        "--detach",
        worktree.to_str().unwrap(),
        "HEAD",
    ]);
    fs::remove_dir_all(worktree.join(".project")).unwrap();
    let worktree_id = register(&engine, worktree.to_str().unwrap());
    let detached = engine.git_observation(&worktree_id).unwrap();
    wire::validate("GitObservation", &detached).unwrap();
    assert_eq!(detached["stale"], false, "{detached}");
    assert_eq!(detached["branch"], Value::Null);
    assert!(detached["commit"].is_string());
    let child = env.root.join("project/nested");
    fs::create_dir(&child).unwrap();
    let nested = register(&engine, child.to_str().unwrap());
    assert_eq!(
        engine.git_observation(&nested).unwrap()["error"],
        "NOT_A_GIT_ROOT"
    );
}
