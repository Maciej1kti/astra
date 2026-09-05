//! Native notifications are hints; source reads still use no-follow descriptors.
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use project_application::engine::Engine;
use project_store::document::Kind;
use std::{
    collections::{BTreeMap, BTreeSet},
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
    let mut watcher: RecommendedWatcher =
        match notify::recommended_watcher(move |event: notify::Result<Event>| {
            if sender.try_send(event).is_err() {
                lost.store(true, Ordering::Relaxed);
            }
        }) {
            Ok(watcher) => watcher,
            Err(_) => {
                eprintln!("Native source watcher unavailable");
                return;
            }
        };
    let mut watched = BTreeSet::new();
    let mut projects = BTreeMap::new();
    let mut membership = tokio::time::interval(Duration::from_secs(2));
    membership.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut reconcile = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(900),
        Duration::from_secs(900),
    );
    reconcile.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = shutdown.changed() => break,
            _ = membership.tick() => {
                // Read the small registry and directory identities, never document bodies.
                let worker = engine.clone();
                if let Ok(Ok((workspace,_))) = tokio::task::spawn_blocking(move || worker.workspace()).await {
                    projects = workspace["projects"].as_array().unwrap().iter().map(|p| (PathBuf::from(p["path"].as_str().unwrap()),p["project_id"].as_str().unwrap().to_owned())).collect();
                    let desired: BTreeSet<_> = projects.keys().flat_map(|root| [root.clone(),root.join(".project"),root.join(".project/cards"),root.join(".project/milestones"),root.join(".project/updates")]).filter(|path| std::fs::symlink_metadata(path).is_ok_and(|m|m.is_dir() && !m.file_type().is_symlink())).collect();
                    for path in watched.difference(&desired) { let _ = watcher.unwatch(path); }
                    watched.retain(|path|desired.contains(path));
                    for path in desired.difference(&watched).cloned().collect::<Vec<_>>() {
                        if watcher.watch(&path, RecursiveMode::NonRecursive).is_ok() { watched.insert(path); }
                        else { overflow.store(true,Ordering::Relaxed); }
                    }
                }
                if overflow.swap(false,Ordering::Relaxed) { refresh(&engine, &projects, None).await; }
            },
            _ = reconcile.tick() => refresh(&engine, &projects, None).await,
            event = receiver.recv() => {
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
                if overflow.swap(false,Ordering::Relaxed) { refresh(&engine,&projects,None).await; }
                else { refresh(&engine,&projects,Some(&paths)).await; }
            }
        }
    }
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
) {
    for (root, id) in projects {
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
        let result = tokio::task::spawn_blocking(move || {
            engine.refresh_project(&id, if full { None } else { Some(&targets) })
        })
        .await;
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
}
