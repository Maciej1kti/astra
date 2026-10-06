//! The in-app agent: runs of a local coding agent (Claude Code or Codex) started
//! from the browser. The daemon starts the provider's command line for one chat
//! message, supervises the process and exposes only the agent's final text.
//!
//! All state is in memory, in one registry owned by `Service`. Each profile owns
//! its conversations and runs. The registry lock is held for decisions and
//! bookkeeping only, never while a child runs or while its output is read; each
//! run has its own supervisor thread that settles the run when the child is gone.
mod context;
mod process;
mod protocol;

use process::{Launch, Outcome, SpawnFailure, Watched};
use project_application::{
    AppError, Reply, engine::Engine, instant, now_millis, users::UserProfile, wire,
};
use protocol::{Final, Provider};
use rustix::fs::{Access, access};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Condvar, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

/// Conversations kept per host; the least recently used idle one makes room.
const MAX_CONVERSATIONS: usize = 32;
/// Runs kept per conversation; the oldest finished ones are dropped.
const MAX_RUNS: usize = 50;
/// Runs that may be running at once on the host.
const MAX_RUNNING: usize = 2;
/// `AGENTS.md` larger than this is not accepted as instructions.
const MAX_INSTRUCTIONS: u64 = 64 * 1024;

/// How the daemon starts a local coding agent. Without one the feature is off.
#[derive(Clone, Debug)]
pub struct AgentConfig {
    /// The agent's working directory; it holds the `AGENTS.md` the agent reads.
    pub directory: PathBuf,
    /// The daemon's local socket, handed to the agent as `ASTRA_SOCKET`.
    pub socket: PathBuf,
    /// The directory containing `projectctl`, put first on the agent's `PATH`.
    pub cli_dir: PathBuf,
    /// Explicit provider executables; otherwise they are found on `PATH`.
    pub claude: Option<PathBuf>,
    pub codex: Option<PathBuf>,
    /// The wall-clock limit of one run.
    pub timeout: Duration,
}

/// A conversation belongs to one profile.
type Key = (String, String);

struct Run {
    id: String,
    /// The request body, to recognise an identical retry.
    input: Value,
    /// The `AgentRun` as the API returns it.
    record: Value,
    cancel: Arc<AtomicBool>,
}
impl Run {
    fn running(&self) -> bool {
        self.record["state"] == "running"
    }
    fn settle(&mut self, result: &Final) {
        let (state, reply, truncated, error) = match result {
            Final::Succeeded { reply, truncated } => {
                ("succeeded", json!(reply), *truncated, Value::Null)
            }
            Final::Failed { code, detail } => (
                "failed",
                Value::Null,
                false,
                json!({"code": code, "detail": detail}),
            ),
            Final::Cancelled => ("cancelled", Value::Null, false, Value::Null),
            Final::TimedOut => ("timed_out", Value::Null, false, Value::Null),
        };
        self.record["state"] = json!(state);
        self.record["reply"] = reply;
        self.record["reply_truncated"] = json!(truncated);
        self.record["error"] = error;
        self.record["finished_at"] = json!(instant(now_millis()));
    }
}

struct Conversation {
    /// Fixed when the first run starts; later preference changes do not apply.
    provider: Provider,
    /// The provider's own ID for the conversation, once a run has reported one.
    session: Option<String>,
    /// Oldest first.
    runs: Vec<Run>,
    /// Recency, for eviction.
    used: u64,
}

#[derive(Default)]
struct State {
    conversations: HashMap<Key, Conversation>,
    /// Which conversation holds each known run ID.
    runs: HashMap<String, Key>,
    /// Runs in state `running`, which is also the number of live supervisors.
    running: usize,
    clock: u64,
}
impl State {
    fn touch(&mut self, key: &Key) {
        self.clock += 1;
        let clock = self.clock;
        if let Some(conversation) = self.conversations.get_mut(key) {
            conversation.used = clock;
        }
    }
    /// The conversation and position of a run of this profile.
    fn locate(&self, profile: &str, run_id: &str) -> Option<(Key, usize)> {
        let key = self.runs.get(run_id).filter(|key| key.0 == profile)?;
        let index = self
            .conversations
            .get(key)?
            .runs
            .iter()
            .position(|run| run.id == run_id)?;
        Some((key.clone(), index))
    }
}

pub(crate) struct Agents {
    config: AgentConfig,
    boot_id: String,
    state: Mutex<State>,
    /// Signalled when the last running run has settled.
    idle: Condvar,
    /// Set when the daemon is shutting down; supervisors end their children.
    stopping: AtomicBool,
}

impl Agents {
    pub fn new(config: AgentConfig) -> Self {
        Self {
            config,
            boot_id: uuid::Uuid::new_v4().to_string(),
            state: Mutex::default(),
            idle: Condvar::new(),
            stopping: AtomicBool::new(false),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, State>, AppError> {
        self.state
            .lock()
            .map_err(|_| AppError::LockPoisoned("agent registry"))
    }

    /// The executable a provider currently resolves to, if it is a file this
    /// process may execute.
    fn resolve(&self, provider: Provider) -> Option<PathBuf> {
        let configured = match provider {
            Provider::Claude => &self.config.claude,
            Provider::Codex => &self.config.codex,
        };
        match configured {
            Some(path) => executable(path).then(|| path.clone()),
            None => std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths)
                    .filter(|directory| directory.is_absolute())
                    .map(|directory| directory.join(provider.name()))
                    .find(|candidate| executable(candidate))
            }),
        }
    }

    /// The profile's provider preference; `claude` when it has none.
    fn preference(engine: &Engine) -> Result<Provider, AppError> {
        let workspace = engine.workspace()?.value;
        Ok(serde_json::to_value(workspace.preferences.agent_provider)
            .ok()
            .as_ref()
            .and_then(Value::as_str)
            .and_then(Provider::parse)
            .unwrap_or(Provider::Claude))
    }

    pub fn status(&self, engine: &Engine) -> Result<Value, AppError> {
        let provider = Self::preference(engine)?;
        let available = |provider| self.resolve(provider).is_some();
        Ok(json!({
            "boot_id": self.boot_id,
            "provider": provider.name(),
            "providers": [
                {"id": "claude", "available": available(Provider::Claude)},
                {"id": "codex", "available": available(Provider::Codex)},
            ],
        }))
    }

    /// Start a run. Returns the HTTP status (202 for a new run, 200 for an
    /// identical retry of a known one) and the `AgentRun`.
    pub fn start(
        self: &Arc<Self>,
        profile: &UserProfile,
        engine: &Engine,
        input: &Value,
    ) -> Result<Reply, AppError> {
        wire::validate("AgentRunInput", input)?;
        let text = |name: &str| {
            input[name]
                .as_str()
                .ok_or(AppError::invariant("validated agent run input"))
        };
        let (run_id, conversation_id) = (text("run_id")?, text("conversation_id")?);
        if text("boot_id")? != self.boot_id {
            return Err(AppError::reject(409, "AGENT_HOST_RESTARTED"));
        }
        // Read before the registry lock: this only reads the profile's own data.
        let preference = Self::preference(engine)?;
        let prompt = context::gather(engine, &profile.name, input, now_millis())?;

        let mut state = self.lock()?;
        if self.stopping.load(Ordering::Acquire) {
            return Err(AppError::reject(503, "SERVICE_UNAVAILABLE"));
        }
        if let Some((key, index)) = state.locate(&profile.id, run_id) {
            // The run is known and it is this profile's: only an identical
            // request is a retry.
            let run = &state.conversations[&key].runs[index];
            return if run.input == *input {
                Ok(Reply {
                    http_status: 200,
                    body: run.record.clone(),
                })
            } else {
                Err(AppError::reject(409, "AGENT_RUN_ID_REUSED"))
            };
        }
        if state.runs.contains_key(run_id) {
            return Err(AppError::reject(409, "AGENT_RUN_ID_REUSED"));
        }
        let key: Key = (profile.id.clone(), conversation_id.to_owned());
        let existing = state.conversations.get(&key);
        if existing.is_some_and(|conversation| conversation.runs.iter().any(Run::running)) {
            return Err(AppError::reject(409, "AGENT_RUN_ACTIVE"));
        }
        if state.running >= MAX_RUNNING {
            return Err(AppError::reject(429, "AGENT_BUSY"));
        }
        // A new conversation may need room; decide now, evict only once the run starts.
        let evict = if existing.is_none() && state.conversations.len() >= MAX_CONVERSATIONS {
            let idle = state
                .conversations
                .iter()
                .filter(|(_, conversation)| !conversation.runs.iter().any(Run::running))
                .min_by_key(|(_, conversation)| conversation.used)
                .map(|(key, _)| key.clone());
            Some(idle.ok_or(AppError::reject(429, "AGENT_BUSY"))?)
        } else {
            None
        };
        let provider = existing.map_or(preference, |conversation| conversation.provider);
        let session = existing.and_then(|conversation| conversation.session.clone());

        if !instructions_usable(&self.config.directory) {
            return Err(AppError::reject(409, "AGENT_INSTRUCTIONS_MISSING"));
        }
        if !executable(&self.config.cli_dir.join("projectctl")) {
            return Err(AppError::reject(409, "AGENT_CLI_UNAVAILABLE"));
        }
        let executable = self
            .resolve(provider)
            .ok_or(AppError::reject(409, "AGENT_PROVIDER_UNAVAILABLE"))?;

        // The supervisor exists before the child, so a failure to create it
        // cannot strand a started process. It waits here for its child.
        let (hand_over, receive) = mpsc::channel::<Watched>();
        let (agents, supervised, id) = (self.clone(), key.clone(), run_id.to_owned());
        let resumed = session.is_some();
        std::thread::Builder::new()
            .name("agent-run".into())
            .spawn(move || {
                let Ok(watched) = receive.recv() else { return };
                let (provider, started) = (watched.provider, Instant::now());
                let outcome = process::supervise(watched, &agents.stopping);
                agents.finish(&supervised, &id, provider, resumed, outcome, started);
            })
            .map_err(|_| AppError::reject(429, "AGENT_BUSY"))?;
        let arguments = protocol::arguments(provider, &self.config.directory, session.as_deref());
        let process = process::spawn(&Launch {
            executable: &executable,
            arguments: &arguments,
            directory: &self.config.directory,
            socket: &self.config.socket,
            cli_dir: &self.config.cli_dir,
            profile: &profile.id,
            stdin: prompt,
        })
        .map_err(|failure| match failure {
            SpawnFailure::Provider => AppError::reject(409, "AGENT_PROVIDER_UNAVAILABLE"),
            SpawnFailure::Cli => AppError::reject(409, "AGENT_CLI_UNAVAILABLE"),
            SpawnFailure::Resources => AppError::reject(429, "AGENT_BUSY"),
        })?;

        let record = json!({
            "run_id": run_id,
            "conversation_id": conversation_id,
            "provider": provider.name(),
            "state": "running",
            "message": text("message")?,
            "reply": null,
            "reply_truncated": false,
            "error": null,
            "created_at": instant(now_millis()),
            "finished_at": null,
        });
        let cancel = Arc::new(AtomicBool::new(false));
        if let Some(victim) = evict
            && let Some(removed) = state.conversations.remove(&victim)
        {
            for run in removed.runs {
                state.runs.remove(&run.id);
            }
        }
        state.clock += 1;
        let clock = state.clock;
        let conversation = state
            .conversations
            .entry(key.clone())
            .or_insert_with(|| Conversation {
                provider,
                session: None,
                runs: Vec::new(),
                used: clock,
            });
        conversation.used = clock;
        conversation.runs.push(Run {
            id: run_id.to_owned(),
            input: input.clone(),
            record: record.clone(),
            cancel: cancel.clone(),
        });
        let mut dropped = Vec::new();
        while conversation.runs.len() > MAX_RUNS {
            let Some(oldest) = conversation.runs.iter().position(|run| !run.running()) else {
                break;
            };
            dropped.push(conversation.runs.remove(oldest).id);
        }
        for id in dropped {
            state.runs.remove(&id);
        }
        state.runs.insert(run_id.to_owned(), key);
        state.running += 1;
        // The supervisor is waiting for this; it cannot have gone away.
        let _ = hand_over.send(Watched {
            process,
            provider,
            deadline: Instant::now() + self.config.timeout,
            cancel,
        });
        Ok(Reply {
            http_status: 202,
            body: record,
        })
    }

    /// Settle a run whose process is gone. Runs on the supervisor's thread.
    fn finish(
        &self,
        key: &Key,
        run_id: &str,
        provider: Provider,
        resumed: bool,
        outcome: Outcome,
        started: Instant,
    ) {
        let state_name = match &outcome.result {
            Final::Succeeded { .. } => "succeeded",
            Final::Failed { .. } => "failed",
            Final::Cancelled => "cancelled",
            Final::TimedOut => "timed_out",
        };
        {
            // Settling must not be lost to a panic elsewhere.
            let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
            state.running = state.running.saturating_sub(1);
            if let Some(conversation) = state.conversations.get_mut(key) {
                if let Some(run) = conversation.runs.iter_mut().find(|run| run.id == run_id) {
                    run.settle(&outcome.result);
                }
                match outcome.session {
                    Some(session) => conversation.session = Some(session),
                    // The provider did not know the session it was asked to
                    // resume: start a fresh one next time. Killing a run says
                    // nothing about the session, so that case keeps it.
                    None if resumed
                        && !matches!(outcome.result, Final::Cancelled | Final::TimedOut) =>
                    {
                        conversation.session = None;
                    }
                    None => {}
                }
            }
            if state.running == 0 {
                self.idle.notify_all();
            }
        }
        // Only the provider, the final state and the duration: never message
        // text, replies, stderr or paths.
        eprintln!(
            "{}",
            json!({
                "event": "agent_run_finished",
                "provider": provider.name(),
                "state": state_name,
                "duration_ms": u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
            })
        );
    }

    pub fn run(&self, profile: &str, run_id: &str) -> Result<Value, AppError> {
        let mut state = self.lock()?;
        let (key, index) = state
            .locate(profile, run_id)
            .ok_or(AppError::reject(404, "AGENT_RUN_NOT_FOUND"))?;
        state.touch(&key);
        Ok(state.conversations[&key].runs[index].record.clone())
    }

    /// Ask a running run to stop. The supervisor settles it, so the answer may
    /// still say `running`.
    pub fn cancel(&self, profile: &str, run_id: &str) -> Result<Value, AppError> {
        let mut state = self.lock()?;
        let (key, index) = state
            .locate(profile, run_id)
            .ok_or(AppError::reject(404, "AGENT_RUN_NOT_FOUND"))?;
        state.touch(&key);
        let run = &state.conversations[&key].runs[index];
        if run.running() {
            run.cancel.store(true, Ordering::Release);
        }
        Ok(run.record.clone())
    }

    pub fn conversation(&self, profile: &str, conversation_id: &str) -> Result<Value, AppError> {
        let mut state = self.lock()?;
        let key: Key = (profile.to_owned(), conversation_id.to_owned());
        if !state.conversations.contains_key(&key) {
            return Err(AppError::reject(404, "AGENT_CONVERSATION_NOT_FOUND"));
        }
        state.touch(&key);
        let conversation = &state.conversations[&key];
        Ok(json!({
            "conversation_id": conversation_id,
            "provider": conversation.provider.name(),
            "runs": conversation.runs.iter().map(|run| run.record.clone()).collect::<Vec<_>>(),
        }))
    }

    /// The daemon is shutting down: no run starts, and every child is ended.
    pub fn begin_stop(&self) {
        let _guard = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        self.stopping.store(true, Ordering::Release);
    }

    /// Wait until every run has settled, which means its process group is gone.
    /// True when nothing is left running.
    pub fn wait_idle(&self, limit: Duration) -> bool {
        let deadline = Instant::now() + limit;
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        while state.running > 0 {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            state = self
                .idle
                .wait_timeout(state, left)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
        true
    }
}

/// A regular file the daemon's user may execute.
fn executable(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file())
        && access(path, Access::EXEC_OK).is_ok()
}

/// `AGENTS.md` must be a regular, non-empty file of at most 64 KiB.
fn instructions_usable(directory: &Path) -> bool {
    std::fs::metadata(directory.join("AGENTS.md")).is_ok_and(|metadata| {
        metadata.is_file() && (1..=MAX_INSTRUCTIONS).contains(&metadata.len())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    struct Fixture {
        _temp: tempfile::TempDir,
        agents: Arc<Agents>,
        engine: Engine,
        profile: UserProfile,
    }
    /// A registry whose configuration points nowhere, so that a start which gets
    /// past the registry's own decisions fails on `AGENTS.md`.
    fn fixture() -> Fixture {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let missing = temp.path().join("missing");
        let agents = Arc::new(Agents::new(AgentConfig {
            directory: missing.clone(),
            socket: missing.join("sock"),
            cli_dir: missing,
            claude: None,
            codex: None,
            timeout: Duration::from_secs(5),
        }));
        Fixture {
            engine: Engine::open(state.path()).unwrap(),
            agents,
            profile: UserProfile {
                id: Uuid::new_v4().to_string(),
                name: "Owner".into(),
                is_default: true,
            },
            _temp: temp,
        }
    }
    impl Fixture {
        fn input(&self, conversation: &str) -> Value {
            json!({
                "run_id": Uuid::now_v7().to_string(),
                "boot_id": self.agents.boot_id,
                "conversation_id": conversation,
                "message": "hi",
            })
        }
        fn code(&self, input: &Value) -> String {
            match self.agents.start(&self.profile, &self.engine, input) {
                Err(AppError::Rejected(reply)) => {
                    reply.body["error"]["code"].as_str().unwrap().to_owned()
                }
                Err(error) => panic!("{error}"),
                Ok(reply) => panic!("started: {}", reply.body),
            }
        }
        fn conversation(&self, id: &str, state: &str, used: u64) -> Key {
            let key = (self.profile.id.clone(), id.to_owned());
            let run_id = Uuid::now_v7().to_string();
            let mut registry = self.agents.state.lock().unwrap();
            registry.conversations.insert(
                key.clone(),
                Conversation {
                    provider: Provider::Claude,
                    session: None,
                    runs: vec![Run {
                        id: run_id.clone(),
                        input: json!({}),
                        record: json!({"state": state}),
                        cancel: Arc::new(AtomicBool::new(false)),
                    }],
                    used,
                },
            );
            registry.runs.insert(run_id, key.clone());
            registry.clock = registry.clock.max(used);
            key
        }
    }

    #[test]
    fn nothing_is_evicted_by_a_start_that_is_then_refused() {
        let fixture = fixture();
        let keys: Vec<Key> = (0..MAX_CONVERSATIONS)
            .map(|n| fixture.conversation(&Uuid::new_v4().to_string(), "succeeded", n as u64 + 1))
            .collect();
        let input = fixture.input(&Uuid::new_v4().to_string());
        assert_eq!(fixture.code(&input), "AGENT_INSTRUCTIONS_MISSING");
        let registry = fixture.agents.state.lock().unwrap();
        assert_eq!(registry.conversations.len(), MAX_CONVERSATIONS);
        assert!(registry.conversations.contains_key(&keys[0]));
        assert!(
            !registry
                .runs
                .contains_key(input["run_id"].as_str().unwrap())
        );
    }

    #[test]
    fn a_registry_full_of_running_conversations_has_nothing_to_evict() {
        let fixture = fixture();
        for n in 0..MAX_CONVERSATIONS {
            fixture.conversation(&Uuid::new_v4().to_string(), "running", n as u64 + 1);
        }
        // The host limit would normally refuse first; leave it out of the way.
        assert_eq!(fixture.agents.state.lock().unwrap().running, 0);
        let input = fixture.input(&Uuid::new_v4().to_string());
        assert_eq!(fixture.code(&input), "AGENT_BUSY");
        assert_eq!(
            fixture.agents.state.lock().unwrap().conversations.len(),
            MAX_CONVERSATIONS
        );
    }

    #[test]
    fn an_unknown_boot_id_is_refused_before_anything_else() {
        let fixture = fixture();
        let mut input = fixture.input(&Uuid::new_v4().to_string());
        input["boot_id"] = json!(Uuid::new_v4().to_string());
        assert_eq!(fixture.code(&input), "AGENT_HOST_RESTARTED");
    }

    #[test]
    fn shutdown_refuses_new_runs_and_waiting_for_none_returns_at_once() {
        let fixture = fixture();
        assert!(fixture.agents.wait_idle(Duration::ZERO));
        fixture.agents.begin_stop();
        let input = fixture.input(&Uuid::new_v4().to_string());
        assert_eq!(fixture.code(&input), "SERVICE_UNAVAILABLE");
        fixture.agents.state.lock().unwrap().running = 1;
        assert!(!fixture.agents.wait_idle(Duration::from_millis(30)));
    }

    #[test]
    fn an_executable_must_be_a_regular_file_the_user_may_run() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("tool");
        std::fs::write(&file, "#!/bin/sh\n").unwrap();
        assert!(!executable(&file));
        std::fs::set_permissions(&file, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();
        assert!(executable(&file));
        assert!(!executable(temp.path()), "a directory is not an executable");
        assert!(!executable(&temp.path().join("absent")));
    }

    #[test]
    fn instructions_are_a_regular_nonempty_file_of_at_most_64_kib() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("AGENTS.md");
        assert!(!instructions_usable(temp.path()));
        std::fs::write(&file, "").unwrap();
        assert!(!instructions_usable(temp.path()));
        std::fs::write(&file, "x").unwrap();
        assert!(instructions_usable(temp.path()));
        std::fs::write(&file, vec![b'x'; 64 * 1024]).unwrap();
        assert!(instructions_usable(temp.path()));
        std::fs::write(&file, vec![b'x'; 64 * 1024 + 1]).unwrap();
        assert!(!instructions_usable(temp.path()));
        std::fs::remove_file(&file).unwrap();
        std::fs::create_dir(&file).unwrap();
        assert!(!instructions_usable(temp.path()));
    }
}
