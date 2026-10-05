//! Native notifications are hints; source reads still use no-follow descriptors.
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use project_application::engine::Engine;
use project_store::document::Kind;
use std::{
    collections::{BTreeMap, BTreeSet},
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::{mpsc, watch};

/// Profiles keep the existing watcher/reconciliation lifecycle, including users
/// created while this daemon is running. The bound on profiles also bounds tasks.
pub async fn run_users(service: projectd::Service, shutdown: watch::Receiver<bool>) {
    supervise(
        move || {
            let worker = service.clone();
            async move {
                match tokio::task::spawn_blocking(move || worker.user_engines()).await {
                    Ok(Ok(engines)) => engines,
                    Ok(Err(error)) => {
                        project_application::record_failure(
                            "user_watcher_membership",
                            &error,
                            None,
                            None,
                        );
                        Vec::new()
                    }
                    Err(error) => {
                        project_application::record_worker_failure(
                            "user_watcher_membership",
                            &error,
                            None,
                        );
                        Vec::new()
                    }
                }
            }
        },
        run,
        Supervision::default(),
        shutdown,
    )
    .await;
}

/// How often membership is read and how a stopped watcher is restarted.
#[derive(Clone, Copy)]
struct Supervision {
    membership: Duration,
    /// Delay before the first restart; it doubles up to `restart_limit`.
    restart: Duration,
    restart_limit: Duration,
    /// A watcher that ran this long starts again from the first delay.
    stable: Duration,
}
impl Default for Supervision {
    fn default() -> Self {
        Self {
            membership: Duration::from_secs(2),
            restart: Duration::from_secs(2),
            restart_limit: Duration::from_secs(300),
            stable: Duration::from_secs(600),
        }
    }
}

impl Supervision {
    fn delay(&self, failures: u32) -> Duration {
        let doubled = self
            .restart
            .saturating_mul(1u32 << failures.saturating_sub(1).min(16));
        doubled.min(self.restart_limit)
    }
}

/// One member's task. A profile without a running task has lost its source
/// notifications, reconciliation, retention and recovery passes.
struct Supervised {
    task: Option<tokio::task::Id>,
    started: tokio::time::Instant,
    failures: u32,
    restart_at: tokio::time::Instant,
}

/// Keep one background task per member for as long as the daemon runs. A task
/// that returns or panics is recorded and started again after a growing delay.
async fn supervise<T, M, F>(
    mut members: impl FnMut() -> M,
    start: impl Fn(T, watch::Receiver<bool>) -> F,
    supervision: Supervision,
    mut shutdown: watch::Receiver<bool>,
) where
    M: Future<Output = Vec<(String, T)>>,
    F: Future<Output = ()> + Send + 'static,
{
    let mut supervised: BTreeMap<String, Supervised> = BTreeMap::new();
    let mut tasks = tokio::task::JoinSet::new();
    let mut membership = tokio::time::interval(supervision.membership);
    membership.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        if *shutdown.borrow() {
            break;
        }
        tokio::select! {
            _ = shutdown.changed() => break,
            Some(ended) = tasks.join_next_with_id(), if !tasks.is_empty() => {
                if *shutdown.borrow() {
                    break;
                }
                let task = match &ended {
                    Ok((task, ())) => *task,
                    Err(error) => error.id(),
                };
                match &ended {
                    Ok(_) => project_application::record_failure(
                        "user_watcher_stopped",
                        &project_application::AppError::Unavailable("source watcher"),
                        None,
                        None,
                    ),
                    Err(error) => {
                        project_application::record_worker_failure("user_watcher_stopped", error, None)
                    }
                }
                if let Some(entry) = supervised.values_mut().find(|entry| entry.task == Some(task)) {
                    entry.task = None;
                    if entry.started.elapsed() >= supervision.stable {
                        entry.failures = 0;
                    }
                    entry.failures = entry.failures.saturating_add(1);
                    entry.restart_at = tokio::time::Instant::now() + supervision.delay(entry.failures);
                }
            }
            _ = membership.tick() => {
                for (id, member) in members().await {
                    let now = tokio::time::Instant::now();
                    let entry = supervised.entry(id).or_insert(Supervised {
                        task: None,
                        started: now,
                        failures: 0,
                        restart_at: now,
                    });
                    if entry.task.is_some() || now < entry.restart_at {
                        continue;
                    }
                    entry.task = Some(tasks.spawn(start(member, shutdown.clone())).id());
                    entry.started = now;
                }
            }
        }
    }
    tasks.abort_all();
}

/// Intervals of one profile's background loop.
#[derive(Clone, Copy)]
struct Schedule {
    membership: Duration,
    /// Full reconciliation and retention when native notifications work.
    reconcile: Duration,
    /// The same pass when sources can only be polled.
    polling_reconcile: Duration,
    /// One retention pass soon after start, for daemons restarted more often
    /// than the reconciliation interval.
    first_retention: Duration,
    /// Retry of interrupted source intents that no write has completed.
    recovery: Duration,
}
impl Default for Schedule {
    fn default() -> Self {
        Self {
            membership: Duration::from_secs(2),
            reconcile: Duration::from_secs(900),
            polling_reconcile: Duration::from_secs(30),
            first_retention: Duration::from_secs(30),
            recovery: Duration::from_secs(30),
        }
    }
}

pub async fn run(engine: Arc<Engine>, shutdown: watch::Receiver<bool>) {
    run_with(engine, shutdown, Schedule::default()).await;
}

async fn run_with(engine: Arc<Engine>, mut shutdown: watch::Receiver<bool>, schedule: Schedule) {
    let (sender, mut receiver) = mpsc::channel(1024);
    let overflow = Arc::new(AtomicBool::new(false));
    let lost = overflow.clone();
    let mut watcher: Option<RecommendedWatcher> =
        match notify::recommended_watcher(move |event: notify::Result<Event>| {
            if sender.try_send(event).is_err() {
                lost.store(true, Ordering::Relaxed);
            }
        }) {
            Ok(watcher) => Some(watcher),
            Err(_) => {
                eprintln!("Native source watcher unavailable; reconciling every 30 seconds");
                None
            }
        };
    let mut watched: BTreeMap<PathBuf, (u64, u64)> = BTreeMap::new();
    let mut retry_refresh = tokio::time::Instant::now() - Duration::from_secs(30);
    let mut projects = BTreeMap::new();
    let mut reconcile_startup = true;
    let mut membership = tokio::time::interval(schedule.membership);
    membership.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let reconcile_every = if watcher.is_some() {
        schedule.reconcile
    } else {
        schedule.polling_reconcile
    };
    let mut reconcile = tokio::time::interval_at(
        tokio::time::Instant::now() + reconcile_every,
        reconcile_every,
    );
    reconcile.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut first_retention = std::pin::pin!(tokio::time::sleep(schedule.first_retention));
    let mut retained = false;
    let mut recovery = tokio::time::interval_at(
        tokio::time::Instant::now() + schedule.recovery,
        schedule.recovery,
    );
    recovery.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        if *shutdown.borrow() {
            break;
        }
        tokio::select! {
            _ = shutdown.changed() => break,
            _ = membership.tick() => {
                // Read registry/directory identities and retry a bounded batch of due
                // maintenance projection repairs, which may scan document bodies.
                let worker = engine.clone();
                let initial = reconcile_startup;
                match tokio::task::spawn_blocking(move || membership_paths(&worker, initial)).await {
                    Ok(Ok((registered, desired, pending))) => {
                        reconcile_startup = false;
                        projects = registered;
                        let mut changed: BTreeSet<_> = projects.iter().filter(|(_, id)| pending.contains(*id)).map(|(root, _)| root.clone()).collect();
                        if let Some(watcher) = &mut watcher {
                            for (path, identity) in &watched {
                                if desired.get(path) != Some(identity) { let _ = watcher.unwatch(path); changed.insert(path.clone()); }
                            }
                            watched.retain(|path, identity| desired.get(path) == Some(identity));
                            for (path, identity) in &desired {
                                if watched.contains_key(path) { continue; }
                                if watcher.watch(path, RecursiveMode::NonRecursive).is_ok() {
                                    watched.insert(path.clone(), *identity);
                                    // Close the scan-before-watch gap, including replaced directories.
                                    changed.insert(path.clone());
                                } else if retry_refresh.elapsed() >= Duration::from_secs(30) {
                                    eprintln!("Source watch registration failed; reconciling affected sources");
                                    overflow.store(true, Ordering::Relaxed);
                                }
                            }
                        }
                        if !changed.is_empty() { refresh(&engine, &projects, Some(&changed), &mut shutdown).await; }
                    }
                    Ok(Err(error)) => project_application::record_failure("watcher_membership", &error, None, None),
                    Err(error) => project_application::record_worker_failure("watcher_membership", &error, None),
                }
                if overflow.swap(false,Ordering::Relaxed) { refresh(&engine, &projects, None, &mut shutdown).await; retry_refresh = tokio::time::Instant::now(); }
            },
            _ = reconcile.tick() => {
                refresh(&engine, &projects, None, &mut shutdown).await;
                retain(&engine).await;
            },
            _ = &mut first_retention, if !retained => {
                retained = true;
                retain(&engine).await;
            },
            _ = recovery.tick() => recover(&engine).await,
            event = receiver.recv(), if watcher.is_some() => {
                let Some(event) = event else { break; };
                let mut paths = BTreeSet::new();
                collect(event, &mut paths, &overflow);
                let deadline = tokio::time::Instant::now()+Duration::from_millis(500);
                loop {
                    let quiet = (tokio::time::Instant::now()+Duration::from_millis(100)).min(deadline);
                    tokio::select! {
                        _ = shutdown.changed() => return,
                        _ = tokio::time::sleep_until(quiet) => break,
                        event = receiver.recv() => { if let Some(event)=event { collect(event,&mut paths,&overflow); } else { return; } }
                    }
                    if paths.len()>2048 { overflow.store(true,Ordering::Relaxed); paths.clear(); break; }
                    if tokio::time::Instant::now()>=deadline { break; }
                }
                if overflow.swap(false,Ordering::Relaxed) { refresh(&engine,&projects,None,&mut shutdown).await; }
                else { refresh(&engine,&projects,Some(&paths),&mut shutdown).await; }
            }
        }
    }
}
/// One bounded retention batch; later passes continue any backlog.
async fn retain(engine: &Arc<Engine>) {
    let worker = engine.clone();
    match tokio::task::spawn_blocking(move || {
        worker.retain_history(project_application::now_millis())
    })
    .await
    {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            project_application::record_failure("watcher_retention", &error, None, None)
        }
        Err(error) => project_application::record_worker_failure("watcher_retention", &error, None),
    }
}
/// Retry this profile's interrupted source intents. Startup and the next write
/// do the same; this pass covers a project that only another profile writes.
async fn recover(engine: &Arc<Engine>) {
    let worker = engine.clone();
    match tokio::task::spawn_blocking(move || worker.recover_pending()).await {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            project_application::record_failure("watcher_recovery", &error, None, None)
        }
        Err(error) => project_application::record_worker_failure("watcher_recovery", &error, None),
    }
}
type Projects = BTreeMap<PathBuf, String>;
type DirectoryIdentities = BTreeMap<PathBuf, (u64, u64)>;

// Every filesystem metadata lookup stays on the blocking worker, including idle scans.
fn membership_paths(
    engine: &Engine,
    initial: bool,
) -> Result<(Projects, DirectoryIdentities, Vec<String>), project_application::AppError> {
    engine.retry_projection_repairs()?;
    let project_application::Versioned {
        value: workspace,
        version: _,
    } = engine.workspace()?;
    let projects: Projects = workspace
        .projects
        .into_iter()
        .map(|project| (PathBuf::from(project.path), project.project_id))
        .collect();
    let desired = projects
        .keys()
        .flat_map(|root| {
            [
                root.clone(),
                root.join(".project"),
                root.join(".project/cards"),
                root.join(".project/milestones"),
                root.join(".project/updates"),
            ]
        })
        .filter_map(|path| {
            std::fs::symlink_metadata(&path)
                .ok()
                .filter(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
                .map(|metadata| (path, (metadata.dev(), metadata.ino())))
        })
        .collect();
    let pending = if initial {
        engine.startup_projects()?
    } else {
        Vec::new()
    };
    Ok((projects, desired, pending))
}

fn collect(event: notify::Result<Event>, paths: &mut BTreeSet<PathBuf>, overflow: &AtomicBool) {
    match event {
        Ok(event) if event.need_rescan() => {
            overflow.store(true, Ordering::Relaxed);
        }
        Ok(event) if !matches!(event.kind, EventKind::Access(_)) => paths.extend(event.paths),
        Ok(_) => {}
        Err(_) => {
            overflow.store(true, Ordering::Relaxed);
        }
    }
}
// None means reconcile the project; Some(None) means ignore; Some(Some) is one source.
fn classify(root: &Path, path: &Path, project: &str) -> Option<Option<(Kind, String)>> {
    if path == root {
        return None;
    }
    let Ok(relative) = path.strip_prefix(root.join(".project")) else {
        return Some(None);
    };
    let parts: Vec<_> = relative.iter().filter_map(|part| part.to_str()).collect();
    match parts.as_slice() {
        [] | ["cards" | "milestones" | "updates"] => None,
        ["project.json"] => Some(Some((Kind::Project, project.into()))),
        [directory, filename] => {
            let kind = match *directory {
                "cards" => Kind::Card,
                "milestones" => Kind::Milestone,
                "updates" => Kind::Update,
                _ => return Some(None),
            };
            let Some(id) = filename.strip_suffix(".json") else {
                return Some(None);
            };
            if project_store::filesystem::is_resource_id(id) {
                Some(Some((kind, id.into())))
            } else {
                Some(None)
            }
        }
        _ => Some(None),
    }
}
async fn refresh(
    engine: &Arc<Engine>,
    projects: &BTreeMap<PathBuf, String>,
    paths: Option<&BTreeSet<PathBuf>>,
    shutdown: &mut watch::Receiver<bool>,
) {
    for (root, id) in projects {
        if *shutdown.borrow() {
            return;
        }
        let mut targets = Vec::new();
        let mut full = paths.is_none();
        for path in paths.into_iter().flatten() {
            match classify(root, path, id) {
                None => full = true,
                Some(Some(target)) => targets.push(target),
                Some(None) => {}
            }
        }
        if !full && targets.is_empty() {
            continue;
        }
        let engine = engine.clone();
        let project = id.clone();
        let worker = tokio::task::spawn_blocking(move || {
            engine.refresh_project(&project, if full { None } else { Some(&targets) })
        });
        let result = tokio::select! {
            _ = shutdown.changed() => return,
            result = worker => result,
        };
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                project_application::record_failure("watcher_refresh", &error, Some(id), None)
            }
            Err(error) => {
                project_application::record_worker_failure("watcher_refresh", &error, Some(id))
            }
        }
        tokio::task::yield_now().await;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_events_ignore_private_state_temporary_files_and_unrelated_code() {
        let root = Path::new("/example");
        let id = "10000000-0000-4000-8000-000000000001";
        for suffix in [
            ".project/.local/state.sqlite",
            ".project/cards/.tmp-write",
            "src/main.rs",
            ".project/cards/invalid.json",
        ] {
            assert_eq!(classify(root, &root.join(suffix), id), Some(None));
        }
        assert_eq!(
            classify(root, &root.join(format!(".project/cards/{id}.json")), id),
            Some(Some((Kind::Card, id.into())))
        );
        assert_eq!(classify(root, &root.join(".project/cards"), id), None);
    }
    fn registered_engine() -> (tempfile::TempDir, PathBuf, PathBuf, String) {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let project = root.child("project", true).unwrap();
        let engine = Engine::open(state.path()).unwrap();
        let plan = engine
            .registration_plan(project.path().to_str().unwrap(), Some("Fixture"), true)
            .unwrap();
        engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &uuid::Uuid::now_v7().to_string(),
                engine.command_epoch(),
            )
            .unwrap();
        (
            temp,
            state.path().to_owned(),
            project.path().to_owned(),
            plan["project_id"].as_str().unwrap().to_owned(),
        )
    }
    fn state_value(state: &Path, sql: &str) -> Option<String> {
        use rusqlite::OptionalExtension;
        rusqlite::Connection::open(state.join("state.sqlite"))
            .unwrap()
            .query_row(sql, [], |row| row.get(0))
            .optional()
            .unwrap()
    }
    async fn eventually(what: &str, mut done: impl FnMut() -> bool) {
        tokio::time::timeout(Duration::from_secs(5), async {
            while !done() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("{what}"));
    }
    async fn stop(shutdown: watch::Sender<bool>, task: tokio::task::JoinHandle<()>) {
        shutdown.send(true).unwrap();
        tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .expect("the background loop must stop with the daemon")
            .unwrap();
    }

    #[tokio::test]
    async fn stopped_and_panicked_watchers_are_restarted_with_backoff() {
        use std::sync::Mutex;
        let starts: Arc<Mutex<Vec<(String, std::time::Instant)>>> = Arc::default();
        let observed = starts.clone();
        let supervision = Supervision {
            membership: Duration::from_millis(5),
            restart: Duration::from_millis(60),
            restart_limit: Duration::from_millis(120),
            stable: Duration::from_secs(60),
        };
        let (shutdown, signal) = watch::channel(false);
        let task = tokio::spawn(supervise(
            || async {
                vec![
                    ("failing".to_owned(), "failing"),
                    ("healthy".to_owned(), "healthy"),
                ]
            },
            move |member: &'static str, mut shutdown: watch::Receiver<bool>| {
                let attempt = {
                    let mut starts = observed.lock().unwrap();
                    starts.push((member.to_owned(), std::time::Instant::now()));
                    starts.iter().filter(|(id, _)| id == member).count()
                };
                async move {
                    match (member, attempt) {
                        // The loop ended on its own, as when its event source closes.
                        ("failing", 1) => {}
                        ("failing", 2 | 3) => panic!("Synthetic watcher failure"),
                        _ => {
                            let _ = shutdown.changed().await;
                        }
                    }
                }
            },
            supervision,
            signal,
        ));
        let count = |member: &str| {
            starts
                .lock()
                .unwrap()
                .iter()
                .filter(|(id, _)| id == member)
                .count()
        };
        eventually("a stopped watcher was never restarted", || {
            count("failing") == 4
        })
        .await;
        // The surviving attempt keeps running, and a healthy watcher is untouched.
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert_eq!(count("failing"), 4);
        assert_eq!(count("healthy"), 1);
        let times: Vec<_> = starts
            .lock()
            .unwrap()
            .iter()
            .filter(|(id, _)| id == "failing")
            .map(|(_, time)| *time)
            .collect();
        // Delays double from the first one up to the limit.
        for (index, minimum) in [60, 120, 120].into_iter().enumerate() {
            let waited = times[index + 1] - times[index];
            assert!(
                waited >= Duration::from_millis(minimum),
                "restart {index} waited only {waited:?}"
            );
        }
        stop(shutdown, task).await;
    }

    #[tokio::test]
    async fn retention_runs_shortly_after_startup_without_waiting_for_reconciliation() {
        let (_temp, state, _, _) = registered_engine();
        let retained = "SELECT value FROM meta WHERE key='history_retention'";
        assert_eq!(state_value(&state, retained), None);
        let engine = Arc::new(Engine::open_for_service(&state).unwrap());
        let (shutdown, signal) = watch::channel(false);
        let task = tokio::spawn(run_with(
            engine,
            signal,
            Schedule {
                first_retention: Duration::from_millis(50),
                ..Schedule::default()
            },
        ));
        eventually("retention waited for the reconciliation interval", || {
            state_value(&state, retained).is_some()
        })
        .await;
        stop(shutdown, task).await;
    }

    #[tokio::test]
    async fn interrupted_intents_are_completed_without_a_write_or_a_restart() {
        let (_temp, state, _, project_id) = registered_engine();
        let engine = Arc::new(Engine::open_for_service(&state).unwrap());
        let request = uuid::Uuid::now_v7().to_string();
        let created = engine
            .mutate(project_application::Mutation {
                project_id,
                kind: Kind::Card,
                id: None,
                payload: serde_json::json!({"title":"Interrupted after its rename"}),
                request_id: request.clone(),
                epoch: engine.command_epoch().into(),
                expected: None,
            })
            .unwrap();
        assert_eq!(created.http_status, 200, "{created:?}");
        // Return the journal to the moment after the rename and before the
        // commit record: the source holds the new bytes, the intent is open.
        {
            let db = rusqlite::Connection::open(state.join("state.sqlite")).unwrap();
            for sql in [
                "UPDATE commands SET state='prepared' WHERE request_id=?1",
                "UPDATE write_intents SET resolved=0 WHERE request_id=?1",
                "DELETE FROM history WHERE request_id=?1",
            ] {
                assert_eq!(db.execute(sql, [&request]).unwrap(), 1, "{sql}");
            }
        }
        let committed = format!("SELECT state FROM commands WHERE request_id='{request}'");
        assert_eq!(state_value(&state, &committed).as_deref(), Some("prepared"));
        let (shutdown, signal) = watch::channel(false);
        let task = tokio::spawn(run_with(
            engine,
            signal,
            Schedule {
                recovery: Duration::from_millis(50),
                ..Schedule::default()
            },
        ));
        eventually(
            "the interrupted intent waited for a write or restart",
            || state_value(&state, &committed).as_deref() == Some("committed"),
        )
        .await;
        stop(shutdown, task).await;
    }

    #[tokio::test]
    async fn initial_membership_reconciles_an_empty_index_without_waiting_for_the_timer() {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let project = root.child("project", true).unwrap();
        let engine = Engine::open(state.path()).unwrap();
        let plan = engine
            .registration_plan(
                project.path().to_str().unwrap(),
                Some("Startup fixture"),
                true,
            )
            .unwrap();
        engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &uuid::Uuid::now_v7().to_string(),
                engine.command_epoch(),
            )
            .unwrap();
        let project_id = plan["project_id"].as_str().unwrap().to_owned();
        drop(engine);
        // Only the disposable index in this owned fixture is removed.
        std::fs::remove_file(state.path().join("index.sqlite")).unwrap();
        let engine = Arc::new(Engine::open_for_service(state.path()).unwrap());
        assert_eq!(engine.startup_projects().unwrap(), vec![project_id]);
        let (shutdown, signal) = watch::channel(false);
        let task = tokio::spawn(run(engine.clone(), signal));
        tokio::time::timeout(Duration::from_secs(3), async {
            while !engine.startup_projects().unwrap().is_empty() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("startup reconciliation must not wait for the 30-second/15-minute timer");
        shutdown.send(true).unwrap();
        tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap();
    }
}
