//! On-demand Git metadata/index observation. No working-tree filters are executed.
use crate::{AppError, engine::Engine, instant, now_millis};
use project_store::filesystem::Directory;
use rustix::{
    fs::{OFlags, fcntl_getfl, fcntl_setfl},
    process::{Pid, Signal, kill_process_group},
};
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    io::Read,
    os::unix::process::CommandExt,
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
static SLOTS: Semaphore = Semaphore::const_new(2);
const MAX_OUTPUT: usize = 2 * 1024 * 1024;
fn stop(child: &mut Child) {
    if let Some(pid) = Pid::from_raw(child.id() as i32) {
        let _ = kill_process_group(pid, Signal::KILL);
    }
    let _ = child.kill();
    let _ = child.wait();
}
fn run(
    path: &Path,
    args: &[&str],
    deadline: Instant,
    budget: &mut usize,
) -> Result<Option<Vec<u8>>, &'static str> {
    if Instant::now() >= deadline {
        return Err("GIT_TIMEOUT");
    }
    let mut child = Command::new("/usr/bin/git")
        .args([
            "--no-optional-locks",
            "--no-pager",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.untrackedCache=false",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            "-c",
            "diff.external=",
            "-c",
            "core.attributesFile=/dev/null",
        ])
        .args(args)
        .current_dir(path)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("LANG", "C")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|_| "GIT_UNAVAILABLE")?;
    let mut stdout = child.stdout.take().ok_or("GIT_OUTPUT_UNAVAILABLE")?;
    if fcntl_getfl(&stdout)
        .and_then(|flags| fcntl_setfl(&stdout, flags | OFlags::NONBLOCK))
        .is_err()
    {
        stop(&mut child);
        return Err("GIT_OUTPUT_UNAVAILABLE");
    }
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 16384];
    let status = loop {
        match stdout.read(&mut buffer) {
            Ok(0) => match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(_) => {
                    stop(&mut child);
                    return Err("GIT_FAILED");
                }
            },
            Ok(count) => {
                if bytes.len() + count > *budget {
                    stop(&mut child);
                    return Err("GIT_OUTPUT_LIMIT");
                }
                bytes.extend_from_slice(&buffer[..count]);
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => {
                stop(&mut child);
                return Err("GIT_OUTPUT_UNAVAILABLE");
            }
        }
        if Instant::now() >= deadline {
            stop(&mut child);
            return Err("GIT_TIMEOUT");
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    *budget -= bytes.len();
    Ok(status.success().then_some(bytes))
}
fn text(bytes: Option<Vec<u8>>) -> Result<Option<String>, &'static str> {
    bytes
        .map(|bytes| {
            String::from_utf8(bytes)
                .map(|s| s.trim_end_matches('\n').to_owned())
                .map_err(|_| "GIT_INVALID_OUTPUT")
        })
        .transpose()
}
fn code_path(path: &[u8]) -> bool {
    path != b".project" && !path.starts_with(b".project/")
}
fn inspect(path: &Path) -> Result<Value, &'static str> {
    let root = Directory::open(path).map_err(|_| "GIT_PATH_UNAVAILABLE")?;
    if root.child(".git", false).is_err() {
        let marker = root
            .read(".git")
            .map_err(|_| "GIT_NOT_RECOGNIZED")?
            .ok_or("NOT_A_GIT_ROOT")?;
        if marker.len() > 4096 || !marker.starts_with(b"gitdir: ") {
            return Err("GIT_NOT_RECOGNIZED");
        }
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut budget = MAX_OUTPUT;
    let top = text(run(
        path,
        &["rev-parse", "--show-toplevel"],
        deadline,
        &mut budget,
    )?)?
    .ok_or("GIT_NOT_RECOGNIZED")?;
    if Path::new(&top) != path {
        return Err("GIT_ROOT_MISMATCH");
    }
    let branch = text(run(
        path,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
        deadline,
        &mut budget,
    )?)?;
    let commit = text(run(
        path,
        &["rev-parse", "--verify", "HEAD"],
        deadline,
        &mut budget,
    )?)?;
    if commit.as_ref().is_some_and(|id| {
        ![40, 64].contains(&id.len()) || !id.bytes().all(|c| c.is_ascii_hexdigit())
    }) {
        return Err("GIT_INVALID_OUTPUT");
    }
    if commit.is_none() && branch.is_none() {
        return Err("GIT_HEAD_UNAVAILABLE");
    }
    let conflicts = run(
        path,
        &["ls-files", "--unmerged", "-z"],
        deadline,
        &mut budget,
    )?
    .ok_or("GIT_INDEX_UNAVAILABLE")?;
    let conflicts: BTreeSet<_> = conflicts
        .split(|byte| *byte == 0)
        .filter_map(|entry| {
            entry
                .iter()
                .position(|byte| *byte == b'\t')
                .map(|offset| &entry[offset + 1..])
        })
        .filter(|path| code_path(path))
        .collect();
    let staged = if commit.is_some() {
        run(
            path,
            &[
                "diff-index",
                "--cached",
                "--name-only",
                "-z",
                "--no-renames",
                "--no-ext-diff",
                "--no-textconv",
                "--ignore-submodules=all",
                "HEAD",
                "--",
            ],
            deadline,
            &mut budget,
        )?
    } else {
        run(path, &["ls-files", "--cached", "-z"], deadline, &mut budget)?
    }
    .ok_or("GIT_INDEX_UNAVAILABLE")?;
    let staged = staged
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty() && code_path(path))
        .count();
    root.verify().map_err(|_| "GIT_PATH_CHANGED")?;
    Ok(
        json!({"branch":branch,"commit":commit,"conflicted_paths":conflicts.len(),"staged_paths":staged}),
    )
}
impl Engine {
    pub fn git_observation(&self, project: &str) -> Result<Value, AppError> {
        let workspace = self.workspace()?.0;
        let path = workspace["projects"]
            .as_array()
            .ok_or(AppError::State)?
            .iter()
            .find(|item| item["project_id"] == project)
            .and_then(|item| item["path"].as_str())
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))?;
        let mut result = json!({"project_id":project,"observed_at":instant(now_millis()),"scope":"head_and_index","stale":false,"error":null,"untracked_checked":false,"working_tree_checked":false,"branch":null,"commit":null,"conflicted_paths":null,"staged_paths":null});
        let observed = match SLOTS.try_acquire() {
            Ok(_slot) => inspect(Path::new(path)),
            Err(_) => Err("GIT_BUSY"),
        };
        match observed {
            Ok(value) => result
                .as_object_mut()
                .unwrap()
                .extend(value.as_object().unwrap().clone()),
            Err(code) => {
                result["stale"] = json!(true);
                result["error"] = json!(code);
            }
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn subprocess_output_and_deadline_are_bounded() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            run(
                temp.path(),
                &["--version"],
                Instant::now() + Duration::from_secs(2),
                &mut 1
            ),
            Err("GIT_OUTPUT_LIMIT")
        );
        let mut budget = MAX_OUTPUT;
        assert_eq!(
            run(temp.path(), &["--version"], Instant::now(), &mut budget),
            Err("GIT_TIMEOUT")
        );
    }
}
