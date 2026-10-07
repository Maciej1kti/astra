//! Publishing a project folder to a private GitHub repository, and creating
//! the folders of new projects. Enabled only by the host's `--github` option.
//! Every command line is fixed here; a request selects a registered project
//! or names a new one and never supplies a path, a URL or an argument.
use project_application::{AppError, users::Users, wire};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    ffi::OsString,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// Publications that may run at once.
const RUNNING_LIMIT: usize = 4;
/// Repository names tried after the folder's own: `name-2` … `name-20`.
const LAST_SUFFIX: u32 = 20;
const OUTPUT_LIMIT: u64 = 64 * 1024;
/// Limit of the questions asked while a browser waits for a folder name.
const NAME_CHECK_LIMIT: Duration = Duration::from_secs(10);

/// How the host publishes project repositories.
#[derive(Clone, Debug)]
pub struct GithubConfig {
    /// GitHub CLI executable, signed in by the OS owner.
    pub gh: PathBuf,
    pub git: PathBuf,
    /// Prefix of a new repository's remote, followed by `owner/name.git`.
    pub remote_base: String,
    /// Wall-clock limit of one `gh` or `git` process.
    pub timeout: Duration,
}

enum Job {
    Running,
    Failed(&'static str),
}

pub(crate) struct Github {
    config: GithubConfig,
    /// By project folder. A finished publication leaves no entry.
    jobs: Mutex<HashMap<PathBuf, Job>>,
    login: Mutex<Option<String>>,
}

struct Output {
    success: bool,
    stdout: String,
    stderr: String,
}

fn bounded(mut pipe: impl Read + Send + 'static) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = pipe.by_ref().take(OUTPUT_LIMIT).read_to_end(&mut bytes);
        // Keep reading so that a talkative child is never blocked on a full pipe.
        let _ = std::io::copy(&mut pipe, &mut std::io::sink());
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

/// A repository name GitHub accepts, derived from a folder name.
fn repository_name(folder: &str) -> String {
    let name: String = folder
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .take(80)
        .collect();
    if name.trim_matches(['.', '-']).is_empty() {
        "projekt".into()
    } else {
        name
    }
}

/// A remote URL without user information; `None` when it is not a URL.
fn public_url(remote: &str) -> Option<String> {
    let mut url = url::Url::parse(remote).ok()?;
    if url.cannot_be_a_base() {
        return None;
    }
    let _ = url.set_username("");
    let _ = url.set_password(None);
    Some(url.to_string()).filter(|url| url.len() <= 2000)
}

impl Github {
    pub fn new(config: GithubConfig) -> Self {
        Self {
            config,
            jobs: Mutex::new(HashMap::new()),
            login: Mutex::new(None),
        }
    }

    /// Run one process to its end or to the time limit. Nothing reads a
    /// terminal or opens a dialog: prompts are disabled and stdin is empty.
    fn run(
        &self,
        program: &Path,
        directory: Option<&Path>,
        arguments: &[OsString],
        limit: Duration,
        unavailable: &'static str,
    ) -> Result<Output, &'static str> {
        let mut command = Command::new(program);
        command
            .args(arguments)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_NO_UPDATE_NOTIFIER", "1")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(directory) = directory {
            command.current_dir(directory);
        }
        let mut child = command.spawn().map_err(|_| unavailable)?;
        let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(unavailable);
        };
        let (stdout, stderr) = (bounded(stdout), bounded(stderr));
        let deadline = Instant::now() + limit;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("GITHUB_TIMEOUT");
                }
            }
        };
        Ok(Output {
            success: status.success(),
            stdout: stdout.join().unwrap_or_default(),
            stderr: stderr.join().unwrap_or_default(),
        })
    }

    fn gh(&self, arguments: &[&str], limit: Duration) -> Result<Output, &'static str> {
        let arguments: Vec<OsString> = arguments.iter().map(OsString::from).collect();
        self.run(
            &self.config.gh,
            None,
            &arguments,
            limit,
            "GITHUB_CLI_UNAVAILABLE",
        )
    }

    /// Git in a project folder. Hooks, signing and the owner's credential
    /// helpers are off, so nothing can ask for a passphrase or open a keychain
    /// dialog; HTTPS credentials come from the GitHub CLI.
    fn git(&self, directory: &Path, arguments: &[&str]) -> Result<Output, &'static str> {
        let mut helper = OsString::from("credential.helper=!\"");
        helper.push(self.config.gh.as_os_str());
        helper.push("\" auth git-credential");
        let mut all: Vec<OsString> = [
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "credential.helper=",
            "-c",
        ]
        .iter()
        .map(OsString::from)
        .collect();
        all.push(helper);
        all.extend(arguments.iter().map(OsString::from));
        self.run(
            &self.config.git,
            Some(directory),
            &all,
            self.config.timeout,
            "GIT_UNAVAILABLE",
        )
    }

    /// The signed-in account, read once per daemon run.
    fn login(&self, limit: Duration) -> Result<String, &'static str> {
        if let Some(login) = self.login.lock().map_err(|_| "GITHUB_UNAVAILABLE")?.clone() {
            return Ok(login);
        }
        let output = self.gh(&["api", "user", "--jq", ".login"], limit)?;
        if !output.success {
            return Err(refusal(&output));
        }
        let login = output.stdout.trim().to_owned();
        let valid = (1..=39).contains(&login.len())
            && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if !valid {
            return Err("GITHUB_UNAVAILABLE");
        }
        if let Ok(mut known) = self.login.lock() {
            *known = Some(login.clone());
        }
        Ok(login)
    }

    /// Whether the account already has a repository of this name.
    fn exists(&self, login: &str, name: &str, limit: Duration) -> Result<bool, &'static str> {
        let output = self.gh(
            &["api", &format!("repos/{login}/{name}"), "--jq", ".id"],
            limit,
        )?;
        if output.success {
            Ok(true)
        } else if output.stderr.contains("HTTP 404") {
            Ok(false)
        } else {
            Err(refusal(&output))
        }
    }

    /// For choosing a new folder's name. An unreachable GitHub does not block
    /// local creation: the name then counts as free.
    pub fn name_taken(&self, name: &str) -> bool {
        let limit = self.config.timeout.min(NAME_CHECK_LIMIT);
        self.login(limit)
            .and_then(|login| self.exists(&login, name, limit))
            .unwrap_or(false)
    }

    fn origin(&self, directory: &Path) -> Result<Option<String>, &'static str> {
        let output = self.git(directory, &["config", "--get", "remote.origin.url"])?;
        Ok(Some(output.stdout.trim().to_owned()).filter(|url| output.success && !url.is_empty()))
    }

    pub fn state(&self, directory: &Path) -> Result<Value, AppError> {
        let failed = match self
            .jobs
            .lock()
            .map_err(|_| AppError::LockPoisoned("repository publications"))?
            .get(directory)
        {
            Some(Job::Running) => {
                return Ok(json!({"state":"publishing","url":null,"error":null}));
            }
            Some(Job::Failed(code)) => Some(*code),
            None => None,
        };
        let unavailable = |code| AppError::reject(503, code);
        let origin = if directory.join(".git").exists() {
            self.origin(directory).map_err(unavailable)?
        } else {
            None
        };
        let pushed = origin.is_some()
            && !self
                .git(
                    directory,
                    &["for-each-ref", "--count=1", "refs/remotes/origin"],
                )
                .map_err(unavailable)?
                .stdout
                .trim()
                .is_empty();
        let state = match (pushed, failed, &origin) {
            (true, _, _) => "published",
            (false, Some(_), _) => "failed",
            (false, None, Some(_)) => "unpushed",
            (false, None, None) => "absent",
        };
        let value = json!({
            "state": state,
            "url": origin.as_deref().and_then(public_url),
            "error": failed.filter(|_| !pushed),
        });
        wire::validate("ProjectRepository", &value)?;
        Ok(value)
    }

    /// Start a publication unless one runs or the folder is already published.
    /// Returns whether a publication was started, and the state to report.
    pub fn publish(self: &Arc<Self>, directory: &Path) -> Result<(bool, Value), AppError> {
        let current = self.state(directory)?;
        if matches!(current["state"].as_str(), Some("publishing" | "published")) {
            return Ok((false, current));
        }
        {
            let mut jobs = self
                .jobs
                .lock()
                .map_err(|_| AppError::LockPoisoned("repository publications"))?;
            if matches!(jobs.get(directory), Some(Job::Running)) {
                return Ok((false, json!({"state":"publishing","url":null,"error":null})));
            }
            if jobs
                .values()
                .filter(|job| matches!(job, Job::Running))
                .count()
                >= RUNNING_LIMIT
            {
                return Err(AppError::reject(429, "GITHUB_BUSY"));
            }
            jobs.insert(directory.to_owned(), Job::Running);
        }
        let github = self.clone();
        let folder = directory.to_owned();
        let spawned = std::thread::Builder::new()
            .name("repository-publication".into())
            .spawn(move || {
                let outcome = github.publication(&folder);
                if let Ok(mut jobs) = github.jobs.lock() {
                    match outcome {
                        Ok(()) => jobs.remove(&folder),
                        Err(code) => jobs.insert(folder, Job::Failed(code)),
                    };
                }
            });
        if spawned.is_err() {
            if let Ok(mut jobs) = self.jobs.lock() {
                jobs.remove(directory);
            }
            return Err(AppError::reject(503, "GITHUB_UNAVAILABLE"));
        }
        Ok((true, json!({"state":"publishing","url":null,"error":null})))
    }

    fn step(
        &self,
        directory: &Path,
        arguments: &[&str],
        failure: &'static str,
    ) -> Result<Output, &'static str> {
        let output = self.git(directory, arguments)?;
        if output.success {
            Ok(output)
        } else {
            report(failure, &output);
            Err(failure)
        }
    }

    fn publication(&self, directory: &Path) -> Result<(), &'static str> {
        if !directory.join(".git").exists() {
            self.step(directory, &["init", "-b", "main"], "GIT_FAILED")?;
        }
        let committed = self
            .git(directory, &["rev-parse", "--verify", "-q", "HEAD"])?
            .success;
        if !committed {
            // Only the files registration wrote; other content stays the owner's to commit.
            let mut add = vec!["add", "--", ".project", "AGENTS.md"];
            if directory.join(".gitignore").is_file() {
                add.push(".gitignore");
            }
            self.step(directory, &add, "GIT_FAILED")?;
            let mut commit = Vec::new();
            if !self
                .git(directory, &["config", "--get", "user.email"])?
                .success
            {
                commit.extend(["-c", "user.name=Astra", "-c", "user.email=astra@localhost"]);
            }
            commit.extend(["commit", "-m", "Add project planning data"]);
            self.step(directory, &commit, "GIT_FAILED")?;
        }
        if self.origin(directory)?.is_none() {
            let limit = self.config.timeout;
            let login = self.login(limit)?;
            let base = repository_name(
                directory
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("projekt"),
            );
            let mut created = None;
            for suffix in 1..=LAST_SUFFIX {
                let name = if suffix == 1 {
                    base.clone()
                } else {
                    format!("{base}-{suffix}")
                };
                if self.exists(&login, &name, limit)? {
                    continue;
                }
                let repository = format!("{login}/{name}");
                let output = self.gh(&["repo", "create", &repository, "--private"], limit)?;
                if output.success {
                    created = Some(repository);
                    break;
                }
                // Another client took the name after the check above.
                if !output.stderr.contains("already exists") {
                    report("GITHUB_CREATE_FAILED", &output);
                    return Err(match refusal(&output) {
                        "GITHUB_AUTH_REQUIRED" => "GITHUB_AUTH_REQUIRED",
                        _ => "GITHUB_CREATE_FAILED",
                    });
                }
            }
            let repository = created.ok_or("GITHUB_NAME_EXHAUSTED")?;
            let remote = format!("{}{repository}.git", self.config.remote_base);
            self.step(
                directory,
                &["remote", "add", "origin", &remote],
                "GIT_FAILED",
            )?;
        }
        self.step(
            directory,
            &["push", "-u", "origin", "HEAD"],
            "GITHUB_PUSH_FAILED",
        )?;
        Ok(())
    }
}

/// Why the GitHub CLI could not answer: the host is signed out, or GitHub
/// cannot be reached.
fn refusal(output: &Output) -> &'static str {
    let signed_out = ["HTTP 401", "auth login", "authentication"]
        .iter()
        .any(|sign| output.stderr.contains(sign));
    if signed_out {
        "GITHUB_AUTH_REQUIRED"
    } else {
        "GITHUB_UNAVAILABLE"
    }
}
/// The operator's only trace of why a publication failed.
fn report(code: &str, output: &Output) {
    let detail = if output.stderr.trim().is_empty() {
        &output.stdout
    } else {
        &output.stderr
    };
    let tail: String = detail
        .trim()
        .chars()
        .rev()
        .take(600)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    eprintln!("Repository publication failed ({code}): {tail}");
}

/// New project folders by creation ID, so a repeated request cannot create a
/// second folder while the daemon runs.
#[derive(Default)]
pub(crate) struct Creations {
    done: Mutex<HashMap<String, Creation>>,
}
struct Creation {
    owner: String,
    input: Value,
    result: Value,
    created: Instant,
}
impl Creations {
    pub fn create(
        &self,
        users: &Users,
        github: Option<&Github>,
        user: &str,
        owner: &str,
        input: &Value,
    ) -> Result<Value, AppError> {
        wire::validate("ProjectFolderInput", input)?;
        let id = input["creation_id"]
            .as_str()
            .ok_or(AppError::invariant("validated creation ID"))?;
        // Held across the creation: a concurrent repeat waits for the first result.
        let mut done = self
            .done
            .lock()
            .map_err(|_| AppError::LockPoisoned("project creations"))?;
        done.retain(|_, creation| creation.created.elapsed() < Duration::from_secs(600));
        if let Some(creation) = done.get(id) {
            if creation.owner != owner || creation.input != *input {
                return Err(AppError::reject(409, "CREATION_ID_REUSED"));
            }
            return Ok(creation.result.clone());
        }
        if done.len() >= 64 {
            return Err(AppError::reject(429, "PROJECT_CREATION_LIMIT"));
        }
        let name = input["name"]
            .as_str()
            .ok_or(AppError::invariant("validated project name"))?;
        let (folder, plan) = users.create_project_folder(user, name, &|candidate| {
            github.is_some_and(|github| github.name_taken(candidate))
        })?;
        let result = json!({"creation_id": id, "folder": folder, "plan": plan});
        wire::validate("ProjectFolder", &result)?;
        done.insert(
            id.to_owned(),
            Creation {
                owner: owner.into(),
                input: input.clone(),
                result: result.clone(),
                created: Instant::now(),
            },
        );
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_urls_are_reported_without_credentials() {
        assert_eq!(
            public_url("https://user:secret@github.com/owner/name.git").as_deref(),
            Some("https://github.com/owner/name.git")
        );
        assert_eq!(public_url("git@github.com:owner/name.git"), None);
        assert_eq!(public_url("../elsewhere"), None);
    }

    #[test]
    fn repository_names_keep_only_characters_github_accepts() {
        assert_eq!(repository_name("zolta-lodz"), "zolta-lodz");
        assert_eq!(repository_name("Mój projekt"), "M-j-projekt");
        assert_eq!(repository_name(".."), "projekt");
    }
}
