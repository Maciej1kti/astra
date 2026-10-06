//! Starting one agent process and supervising it until nothing of it is left.
//! The child leads its own process group: it is ended with a signal to the
//! group, and the group is killed once more after the child has exited so that
//! no descendant keeps running or holds the pipes.
use super::protocol::{Ended, Exit, Final, Lines, Observed, Provider, STDERR_TAIL, Tail, settle};
use rustix::{
    fs::{OFlags, fcntl_getfl, fcntl_setfl},
    process::{Pid, Signal, kill_process_group},
};
use std::{
    ffi::OsString,
    io::{ErrorKind, Read, Write},
    os::unix::process::{CommandExt, ExitStatusExt},
    path::Path,
    process::{Child, ChildStderr, ChildStdout, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

/// How long a child may take to leave after SIGTERM before SIGKILL.
const GRACE: Duration = Duration::from_secs(5);
/// How long the pipes are read after the process is gone.
const DRAIN: Duration = Duration::from_secs(2);
/// Pause between polls when nothing moved. Nothing here can block.
const POLL: Duration = Duration::from_millis(5);

/// Everything needed to start one run's process.
pub(super) struct Launch<'a> {
    pub executable: &'a Path,
    pub arguments: &'a [OsString],
    pub directory: &'a Path,
    pub socket: &'a Path,
    pub cli_dir: &'a Path,
    pub profile: &'a str,
    /// The whole prompt; it is written to stdin and never put on a command line.
    pub stdin: String,
}

pub(super) enum SpawnFailure {
    /// The executable could not be started.
    Provider,
    /// `projectctl`'s directory cannot be put on a `PATH`.
    Cli,
    /// Pipes or threads were unavailable.
    Resources,
}

pub(super) struct Process {
    child: Child,
    stdout: ChildStdout,
    stderr: ChildStderr,
}

fn nonblocking(fd: &impl rustix::fd::AsFd) -> rustix::io::Result<()> {
    fcntl_setfl(fd, fcntl_getfl(fd)? | OFlags::NONBLOCK)
}

fn signal_group(child: &Child, signal: Signal) {
    if let Some(pid) = i32::try_from(child.id()).ok().and_then(Pid::from_raw) {
        // The group may already be gone; that is the goal, not an error.
        let _ = kill_process_group(pid, signal);
    }
}

/// End a child that must not outlive a failed start.
fn abandon(child: &mut Child) {
    signal_group(child, Signal::KILL);
    let _ = child.kill();
    let _ = child.wait();
}

pub(super) fn spawn(spec: &Launch<'_>) -> Result<Process, SpawnFailure> {
    let inherited = std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .unwrap_or_default();
    let path = std::env::join_paths(std::iter::once(spec.cli_dir.to_path_buf()).chain(inherited))
        .map_err(|_| SpawnFailure::Cli)?;
    let mut child = Command::new(spec.executable)
        .args(spec.arguments)
        .current_dir(spec.directory)
        .env("ASTRA_SOCKET", spec.socket)
        .env("ASTRA_USER", spec.profile)
        .env("PATH", path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|_| SpawnFailure::Provider)?;
    let (Some(mut stdin), Some(stdout), Some(stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        abandon(&mut child);
        return Err(SpawnFailure::Resources);
    };
    if nonblocking(&stdout).is_err() || nonblocking(&stderr).is_err() {
        abandon(&mut child);
        return Err(SpawnFailure::Resources);
    }
    // A child that never reads its stdin must not block the supervisor, so the
    // blocking write has its own thread; it ends when the pipe closes.
    let text = spec.stdin.clone();
    let writer = std::thread::Builder::new()
        .name("agent-stdin".into())
        .spawn(move || {
            let _ = stdin.write_all(text.as_bytes());
        });
    if writer.is_err() {
        abandon(&mut child);
        return Err(SpawnFailure::Resources);
    }
    Ok(Process {
        child,
        stdout,
        stderr,
    })
}

/// A running run, handed to its supervisor.
pub(super) struct Watched {
    pub process: Process,
    pub provider: Provider,
    pub deadline: Instant,
    pub cancel: Arc<AtomicBool>,
}

pub(super) struct Outcome {
    pub result: Final,
    /// The provider's session, when this run reported one.
    pub session: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Stop {
    Cancel,
    Shutdown,
    Timeout,
}

struct Pipe<R> {
    reader: R,
    open: bool,
}
impl<R: Read> Pipe<R> {
    fn new(reader: R) -> Self {
        Self { reader, open: true }
    }
    /// Take what is available without waiting; true when anything arrived.
    fn pump(&mut self, mut sink: impl FnMut(&[u8])) -> bool {
        let mut moved = false;
        let mut buffer = [0u8; 16 * 1024];
        // Bounded, so cancellation and the time limit are seen under heavy output.
        for _ in 0..64 {
            if !self.open {
                break;
            }
            match self.reader.read(&mut buffer) {
                Ok(0) => self.open = false,
                Ok(count) => {
                    sink(&buffer[..count]);
                    moved = true;
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == ErrorKind::Interrupted => {}
                Err(_) => self.open = false,
            }
        }
        moved
    }
}

fn exit_of(status: std::process::ExitStatus) -> Exit {
    match (status.code(), status.signal()) {
        (Some(code), _) => Exit::Code(code),
        (None, Some(signal)) => Exit::Signal(signal),
        (None, None) => Exit::Unknown,
    }
}

/// Run to the end of the process and settle the run from what was read.
/// `stopping` is the daemon's shutdown flag; a run it ends is reported as
/// cancelled, which nobody is left to read.
pub(super) fn supervise(watched: Watched, stopping: &AtomicBool) -> Outcome {
    let Watched {
        process,
        provider,
        deadline,
        cancel,
    } = watched;
    let Process {
        mut child,
        stdout,
        stderr,
    } = process;
    let (mut out, mut err) = (Pipe::new(stdout), Pipe::new(stderr));
    let mut lines = Lines::default();
    let mut observed = Observed::new(provider);
    let mut tail = Tail::new(STDERR_TAIL);
    let mut stop: Option<Stop> = None;
    let mut terminated_at = Instant::now();
    let mut killed_at: Option<Instant> = None;
    let exit = loop {
        let moved_out = out.pump(|bytes| lines.push(bytes, |line| observed.feed(line)));
        let moved_err = err.pump(|bytes| tail.push(bytes));
        match child.try_wait() {
            Ok(Some(status)) => break exit_of(status),
            Ok(None) => {}
            Err(_) => break Exit::Unknown,
        }
        let now = Instant::now();
        match stop {
            None => {
                stop = if cancel.load(Ordering::Acquire) {
                    Some(Stop::Cancel)
                } else if stopping.load(Ordering::Acquire) {
                    Some(Stop::Shutdown)
                } else if now >= deadline {
                    Some(Stop::Timeout)
                } else {
                    None
                };
                if stop.is_some() {
                    signal_group(&child, Signal::TERM);
                    terminated_at = now;
                }
            }
            Some(_) => match killed_at {
                None if now.duration_since(terminated_at) >= GRACE => {
                    signal_group(&child, Signal::KILL);
                    killed_at = Some(now);
                }
                // A process that survives SIGKILL cannot be waited for forever.
                Some(at) if now.duration_since(at) >= GRACE => break Exit::Unknown,
                _ => {}
            },
        }
        if !(moved_out || moved_err) {
            std::thread::sleep(POLL);
        }
    };
    // Whatever ended the child, nothing of this run may outlive it.
    signal_group(&child, Signal::KILL);
    let drain_until = Instant::now() + DRAIN;
    while (out.open || err.open) && Instant::now() < drain_until {
        let moved_out = out.pump(|bytes| lines.push(bytes, |line| observed.feed(line)));
        let moved_err = err.pump(|bytes| tail.push(bytes));
        if !(moved_out || moved_err) {
            std::thread::sleep(POLL);
        }
    }
    lines.finish(|line| observed.feed(line));
    let result = settle(&Ended {
        observed: &observed,
        stderr: tail.bytes(),
        exit,
        cancelled: cancel.load(Ordering::Acquire) || stop == Some(Stop::Shutdown),
        timed_out: stop == Some(Stop::Timeout),
    });
    Outcome {
        result,
        session: observed.session().map(str::to_owned),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Start `program` with `arguments`, giving it `stdin`.
    fn start(program: &str, arguments: &[&str], stdin: String) -> (Process, tempfile::TempDir) {
        let directory = tempfile::tempdir().unwrap();
        let arguments: Vec<OsString> = arguments.iter().map(OsString::from).collect();
        let process = spawn(&Launch {
            executable: Path::new(program),
            arguments: &arguments,
            directory: directory.path(),
            socket: Path::new("/tmp/test.sock"),
            cli_dir: directory.path(),
            profile: "profile",
            stdin,
        });
        match process {
            Ok(process) => (process, directory),
            Err(_) => panic!("{program} did not start"),
        }
    }
    fn watch(process: Process, limit: Duration) -> (Watched, Arc<AtomicBool>) {
        let cancel = Arc::new(AtomicBool::new(false));
        (
            Watched {
                process,
                provider: Provider::Claude,
                deadline: Instant::now() + limit,
                cancel: cancel.clone(),
            },
            cancel,
        )
    }
    const ANSWER: &str = r#"{"type":"result","is_error":false,"result":"ok"}"#;

    #[test]
    fn the_prompt_reaches_stdin_and_stdout_is_read_as_it_arrives() {
        let script = r#"read first; read second
printf '{"type":"system","subtype":"init","session_id":"0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b"}\n'
printf '{"type":"result","is_error":false,"result":"%s+%s"}' "$first" "$second""#;
        let (process, _directory) = start("/bin/sh", &["-c", script], "one\ntwo\n".into());
        let (watched, _) = watch(process, Duration::from_secs(30));
        let outcome = supervise(watched, &AtomicBool::new(false));
        // The last line had no newline; it still counts.
        assert_eq!(
            outcome.result,
            Final::Succeeded {
                reply: "one+two".into(),
                truncated: false
            }
        );
        assert_eq!(
            outcome.session.as_deref(),
            Some("0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b")
        );
    }

    #[test]
    fn a_failing_process_reports_its_stderr_and_exit_status() {
        let (process, _directory) =
            start("/bin/sh", &["-c", "echo oops >&2; exit 7"], String::new());
        let (watched, _) = watch(process, Duration::from_secs(30));
        let outcome = supervise(watched, &AtomicBool::new(false));
        assert_eq!(
            outcome.result,
            Final::Failed {
                code: "AGENT_PROVIDER_FAILED",
                detail: Some("oops".into())
            }
        );
        let (process, _directory) = start("/bin/sh", &["-c", "exit 7"], String::new());
        let (watched, _) = watch(process, Duration::from_secs(30));
        assert_eq!(
            supervise(watched, &AtomicBool::new(false)).result,
            Final::Failed {
                code: "AGENT_PROVIDER_FAILED",
                detail: Some("exit status 7".into())
            }
        );
    }

    #[test]
    fn a_child_that_never_reads_a_large_prompt_cannot_block_the_supervisor() {
        // Far more than a pipe holds, to a program that does not read at all.
        let prompt = "x".repeat(4 * 1024 * 1024);
        let started = Instant::now();
        let (process, _directory) = start("/bin/sleep", &["30"], prompt);
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "starting blocked"
        );
        let pid = process.child.id();
        let (watched, cancel) = watch(process, Duration::from_secs(60));
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            cancel.store(true, Ordering::Release);
        });
        let outcome = supervise(watched, &AtomicBool::new(false));
        canceller.join().unwrap();
        assert_eq!(outcome.result, Final::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(5));
        let group = Pid::from_raw(pid as i32).unwrap();
        assert!(rustix::process::test_kill_process_group(group).is_err());
    }

    #[test]
    fn the_time_limit_ends_the_process_group() {
        let (process, _directory) = start("/bin/sleep", &["30"], String::new());
        let (watched, _) = watch(process, Duration::from_millis(300));
        let started = Instant::now();
        let outcome = supervise(watched, &AtomicBool::new(false));
        assert_eq!(outcome.result, Final::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn the_daemons_shutdown_flag_ends_a_run_as_cancelled() {
        let (process, _directory) = start("/bin/sleep", &["30"], String::new());
        let (watched, _) = watch(process, Duration::from_secs(60));
        let started = Instant::now();
        let outcome = supervise(watched, &AtomicBool::new(true));
        assert_eq!(outcome.result, Final::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn a_child_that_ignores_sigterm_is_killed_after_the_grace_period() {
        let script = format!("trap '' TERM\nprintf '%s\\n' '{ANSWER}'\nwhile :; do sleep 1; done");
        let (process, _directory) = start("/bin/sh", &["-c", &script], String::new());
        let pid = process.child.id();
        let (watched, cancel) = watch(process, Duration::from_secs(60));
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            cancel.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let outcome = supervise(watched, &AtomicBool::new(false));
        canceller.join().unwrap();
        let elapsed = started.elapsed();
        // It had already answered, which wins over the cancellation.
        assert_eq!(
            outcome.result,
            Final::Succeeded {
                reply: "ok".into(),
                truncated: false
            }
        );
        assert!(
            elapsed >= GRACE,
            "SIGKILL came before the grace period: {elapsed:?}"
        );
        assert!(elapsed < GRACE + Duration::from_secs(4), "{elapsed:?}");
        let group = Pid::from_raw(pid as i32).unwrap();
        assert!(rustix::process::test_kill_process_group(group).is_err());
    }

    #[test]
    fn a_missing_or_unrunnable_executable_is_a_provider_failure_to_start() {
        let directory = tempfile::tempdir().unwrap();
        for program in ["/nonexistent/claude", "/etc/hosts"] {
            let result = spawn(&Launch {
                executable: Path::new(program),
                arguments: &[],
                directory: directory.path(),
                socket: Path::new("/tmp/test.sock"),
                cli_dir: directory.path(),
                profile: "profile",
                stdin: String::new(),
            });
            assert!(matches!(result, Err(SpawnFailure::Provider)), "{program}");
        }
        // A directory whose name cannot be a PATH entry is not usable as the CLI's.
        let colon = Path::new("/tmp/a:b");
        let result = spawn(&Launch {
            executable: Path::new("/bin/sh"),
            arguments: &[],
            directory: directory.path(),
            socket: Path::new("/tmp/test.sock"),
            cli_dir: colon,
            profile: "profile",
            stdin: String::new(),
        });
        assert!(matches!(result, Err(SpawnFailure::Cli)));
    }
}
