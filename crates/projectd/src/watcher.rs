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

pub async fn run(engine: Arc<Engine>, mut shutdown: watch::Receiver<bool>) {
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
    let mut membership = tokio::time::interval(Duration::from_secs(2));
    membership.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut reconcile = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(if watcher.is_some() { 900 } else { 30 }),
        Duration::from_secs(if watcher.is_some() { 900 } else { 30 }),
    );
    reconcile.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        if *shutdown.borrow() {
            break;
        }
        tokio::select! {
            _ = shutdown.changed() => break,
            _ = membership.tick() => {
                // Read the small registry and directory identities, never document bodies.
                let worker = engine.clone();
                let initial = reconcile_startup;
                if let Ok(Ok((registered, desired, pending))) = tokio::task::spawn_blocking(move || membership_paths(&worker, initial)).await {
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
                if overflow.swap(false,Ordering::Relaxed) { refresh(&engine, &projects, None, &mut shutdown).await; retry_refresh = tokio::time::Instant::now(); }
            },
            _ = reconcile.tick() => {
                refresh(&engine, &projects, None, &mut shutdown).await;
                let worker=engine.clone();
                let _=tokio::task::spawn_blocking(move || worker.retain_history(project_application::now_millis())).await;
            },
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
type Projects = BTreeMap<PathBuf, String>;
type DirectoryIdentities = BTreeMap<PathBuf, (u64, u64)>;

// Every filesystem metadata lookup stays on the blocking worker, including idle scans.
fn membership_paths(
    engine: &Engine,
    initial: bool,
) -> Result<(Projects, DirectoryIdentities, Vec<String>), project_application::AppError> {
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
        ["project.md"] => Some(Some((Kind::Project, project.into()))),
        [directory, filename] => {
            let kind = match *directory {
                "cards" => Kind::Card,
                "milestones" => Kind::Milestone,
                "updates" => Kind::Update,
                _ => return Some(None),
            };
            let Some(id) = filename.strip_suffix(".md") else {
                return Some(None);
            };
            if uuid::Uuid::parse_str(id)
                .is_ok_and(|uuid| uuid.get_version_num() == 4 && uuid.to_string() == id)
            {
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
        let id = id.clone();
        let worker = tokio::task::spawn_blocking(move || {
            engine.refresh_project(&id, if full { None } else { Some(&targets) })
        });
        let result = tokio::select! {
            _ = shutdown.changed() => return,
            result = worker => result,
        };
        if !matches!(result, Ok(Ok(()))) {
            eprintln!("Source refresh failed; project diagnostics are degraded");
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
            ".project/cards/invalid.md",
        ] {
            assert_eq!(classify(root, &root.join(suffix), id), Some(None));
        }
        assert_eq!(
            classify(root, &root.join(format!(".project/cards/{id}.md")), id),
            Some(Some((Kind::Card, id.into())))
        );
        assert_eq!(classify(root, &root.join(".project/cards"), id), None);
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
