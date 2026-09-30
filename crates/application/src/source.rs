//! Validated source observations keep their byte version through application reads.
use crate::AppError;
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{CollectionReader, ProjectStore},
};
use std::sync::{Mutex, mpsc};
use uuid::Uuid;

// At most one collection can add read workers. Contention stays sequential,
// without queuing worker admission or blocking within application locks.
static PARALLEL_SOURCE_READ: Mutex<()> = Mutex::new(());

#[derive(Debug)]
pub struct Versioned<T> {
    pub value: T,
    pub version: String,
}

pub fn pretty(value: &impl serde::Serialize) -> Vec<u8> {
    // A JSON value preserves canonical key ordering across typed and wire inputs.
    let value = serde_json::to_value(value).expect("serializable source value");
    let mut bytes = serde_json::to_vec_pretty(&value).expect("JSON serialization");
    bytes.push(b'\n');
    bytes
}
pub(crate) fn read(
    store: &ProjectStore,
    kind: Kind,
    id: &str,
) -> Result<document::ParsedDocument, AppError> {
    let (directory, name) = match store.location(kind, id, false) {
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::reject(404, "RESOURCE_NOT_FOUND"));
        }
        value => value?,
    };
    parse_read(kind, id, directory.read(&name)?)
}
fn parse_read(
    kind: Kind,
    id: &str,
    bytes: Option<Vec<u8>>,
) -> Result<document::ParsedDocument, AppError> {
    let bytes = bytes.ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
    let parsed = document::parse(kind, Some(id), &bytes)
        .map_err(|_| AppError::reject(409, "DOCUMENT_INVALID"))?;
    Ok(parsed)
}
pub(crate) fn read_collection(
    reader: &CollectionReader<'_>,
    kind: Kind,
    id: &str,
) -> Result<document::ParsedDocument, AppError> {
    parse_read(kind, id, reader.read(id)?)
}

fn source_read_workers(count: usize, threshold: usize) -> usize {
    if count < threshold {
        1
    } else {
        std::thread::available_parallelism().map_or(1, |count| count.get().min(4))
    }
}

/// Consume independent source observations in input order, with bounded results.
/// The caller retains its application locks; workers only invoke its guarded read.
pub(crate) fn visit_ordered<T: Send>(
    ids: &[&str],
    read: impl Fn(&str) -> T + Sync,
    mut visit: impl FnMut(&str, T) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let workers = source_read_workers(ids.len(), 64);
    if workers == 1 {
        return ids.iter().try_for_each(|id| visit(id, read(id)));
    }
    let Ok(_capacity) = PARALLEL_SOURCE_READ.try_lock() else {
        return ids.iter().try_for_each(|id| visit(id, read(id)));
    };
    std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(workers);
        let mut receivers = Vec::with_capacity(workers);
        for worker in 0..workers {
            let (sender, receiver) = mpsc::sync_channel(1);
            let read = &read;
            let partition = &ids[worker..];
            match std::thread::Builder::new()
                .name("astra-source-read".into())
                .spawn_scoped(scope, move || {
                    for id in partition.iter().step_by(workers) {
                        if sender.send(read(id)).is_err() {
                            break;
                        }
                    }
                }) {
                Ok(handle) => {
                    handles.push(handle);
                    receivers.push(Some(receiver));
                }
                // A failed start retains the same read on the caller thread.
                Err(_) => receivers.push(None),
            }
        }
        let mut result = Ok(());
        for (index, id) in ids.iter().enumerate() {
            let observed = match &receivers[index % workers] {
                Some(receiver) => match receiver.recv() {
                    Ok(observed) => observed,
                    Err(_) => {
                        result = Err(AppError::invariant("source read worker"));
                        break;
                    }
                },
                None => read(id),
            };
            if let Err(error) = visit(id, observed) {
                result = Err(error);
                break;
            }
        }
        // Stop blocked producers before joining, including an early visitor
        // failure. Each worker holds at most a queued result and a current one.
        drop(receivers);
        for handle in handles {
            if handle.join().is_err() && result.is_ok() {
                result = Err(AppError::invariant("source read worker"));
            }
        }
        result
    })
}
pub(crate) fn collection(
    store: &ProjectStore,
    kind: Kind,
) -> Result<Vec<document::ParsedDocument>, AppError> {
    if kind.directory().is_none() {
        return Err(AppError::invariant("source collection kind"));
    }
    let directory = match store.collection_reader(kind) {
        Ok(directory) => directory,
        Err(StoreError::MissingCollection) => return Ok(vec![]),
        Err(error) => return Err(error.into()),
    };
    let names = directory.names()?;
    let ids: Vec<_> = names
        .iter()
        .filter_map(|filename| filename.strip_suffix(".json"))
        .filter(|id| Uuid::parse_str(id).is_ok())
        .collect();
    let read = |ids: &[&str]| {
        ids.iter()
            .map(|id| read_collection(&directory, kind, id))
            .collect::<Result<Vec<_>, AppError>>()
    };
    let workers = source_read_workers(ids.len(), 256);
    if workers == 1 {
        return read(&ids);
    }
    let Ok(_capacity) = PARALLEL_SOURCE_READ.try_lock() else {
        return read(&ids);
    };
    std::thread::scope(|scope| {
        let batches: Vec<_> = ids
            .chunks(ids.len().div_ceil(workers))
            .map(|ids| {
                std::thread::Builder::new()
                    .name("astra-source-read".into())
                    .spawn_scoped(scope, || read(ids))
                    // Resource pressure falls back to the same guarded reads.
                    .map_err(|_| read(ids))
            })
            .collect();
        // Join every worker before returning. Sorted batch order retains the
        // first source error and never publishes a partially validated result.
        let joined: Vec<_> = batches
            .into_iter()
            .map(|batch| match batch {
                Ok(worker) => worker
                    .join()
                    .unwrap_or_else(|_| Err(AppError::invariant("source read worker"))),
                Err(result) => result,
            })
            .collect();
        Ok(joined
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{fs, os::unix::fs::symlink};

    struct Observed {
        index: usize,
        active: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    }
    impl Drop for Observed {
        fn drop(&mut self) {
            self.active
                .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        }
    }

    #[test]
    fn ordered_visits_bound_results_and_preserve_input_order() {
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let ids: Vec<_> = (0..128).map(|index| index.to_string()).collect();
        let names: Vec<_> = ids.iter().map(String::as_str).collect();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = AtomicUsize::new(0);
        let mut visited = Vec::new();
        visit_ordered(
            &names,
            |id| {
                let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(count, Ordering::SeqCst);
                Observed {
                    index: id.parse().unwrap(),
                    active: active.clone(),
                }
            },
            |id, observed| {
                assert_eq!(observed.index, id.parse::<usize>().unwrap());
                visited.push(observed.index);
                std::thread::sleep(std::time::Duration::from_micros(100));
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(visited, (0..128).collect::<Vec<_>>());
        assert_eq!(active.load(Ordering::SeqCst), 0);
        // Four workers: one queued and one current result each, plus consumer.
        assert!(peak.load(Ordering::SeqCst) <= 9);
    }

    #[test]
    fn ordered_visit_failure_joins_producers_and_releases_pending_results() {
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let ids: Vec<_> = (0..128).map(|index| index.to_string()).collect();
        let names: Vec<_> = ids.iter().map(String::as_str).collect();
        let active = Arc::new(AtomicUsize::new(0));
        let mut visited = Vec::new();
        let result = visit_ordered(
            &names,
            |id| {
                active.fetch_add(1, Ordering::SeqCst);
                Observed {
                    index: id.parse().unwrap(),
                    active: active.clone(),
                }
            },
            |_, observed| {
                visited.push(observed.index);
                if observed.index == 9 {
                    return Err(AppError::reject(409, "TEST_SOURCE_VISITOR"));
                }
                Ok(())
            },
        );
        let Err(AppError::Rejected(reply)) = result else {
            panic!("The visitor failure must survive producer cleanup");
        };
        assert_eq!(reply.http_status, 409);
        assert_eq!(reply.body["error"]["code"], "TEST_SOURCE_VISITOR");
        assert_eq!(visited, (0..10).collect::<Vec<_>>());
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn ordered_worker_panic_closes_the_stream_and_joins_other_producers() {
        use std::sync::{
            Arc,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        };
        let ids: Vec<_> = (0..128).map(|index| index.to_string()).collect();
        let names: Vec<_> = ids.iter().map(String::as_str).collect();
        let active = Arc::new(AtomicUsize::new(0));
        let failed = AtomicBool::new(false);
        let caller = std::thread::current().id();
        let result = visit_ordered(
            &names,
            |id| {
                if id == "7" && std::thread::current().id() != caller {
                    failed.store(true, Ordering::SeqCst);
                    panic!("Synthetic source worker failure");
                }
                active.fetch_add(1, Ordering::SeqCst);
                Observed {
                    index: id.parse().unwrap(),
                    active: active.clone(),
                }
            },
            |_, _| Ok(()),
        );
        if failed.load(Ordering::SeqCst) {
            assert!(matches!(
                result,
                Err(AppError::Invariant("source read worker"))
            ));
        } else {
            // Capacity contention and single-CPU hosts use the guarded caller.
            assert!(result.is_ok());
        }
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    fn fixture() -> (tempfile::TempDir, ProjectStore, Vec<String>) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let store = ProjectStore::open(&root, true).unwrap();
        let directory = store.directory.child("cards", true).unwrap();
        let ids: Vec<_> = (0..512)
            .map(|index| format!("00000000-0000-4000-8000-{index:012x}"))
            .collect();
        for (index, id) in ids.iter().enumerate() {
            let value = json!({
                "type": "card",
                "metadata": {
                    "id": id, "title": format!("Source fixture {index}"),
                    "status": "planned", "priority": "normal",
                    "position": format!("{:032x}", index + 1), "archived": false,
                    "created_at": "2026-09-05T10:00:00Z",
                    "updated_at": "2026-09-05T10:00:00Z"
                },
                "body": "Synthetic source body."
            });
            project_domain::validate_document(value.clone()).expect("Valid source fixture");
            // Disposable external source fixtures exercise ordinary validation.
            fs::write(directory.path().join(format!("{id}.json")), pretty(&value)).unwrap();
        }
        (temp, store, ids)
    }

    #[test]
    fn large_collection_retains_sorted_current_bytes_and_versions() {
        let (_temp, store, ids) = fixture();
        let first = collection(&store, Kind::Card).unwrap();
        assert_eq!(first.len(), ids.len());
        for (id, parsed) in ids.iter().zip(&first) {
            let observed = read(&store, Kind::Card, id).unwrap();
            assert_eq!(parsed.value(), observed.value());
            assert_eq!(parsed.version, observed.version);
        }
        let mut value = first[256].value();
        value["body"] = json!("Current external source body.");
        let bytes = pretty(&value);
        let (directory, name) = store.location(Kind::Card, &ids[256], false).unwrap();
        fs::write(directory.path().join(name), &bytes).unwrap();
        let current = collection(&store, Kind::Card).unwrap();
        assert_eq!(current[256].version, document::version(&bytes));
        assert_eq!(current[256].value(), value);
        assert_ne!(current[256].version, first[256].version);
        for index in [0, 255, 257, 511] {
            assert_eq!(current[index].version, first[index].version);
        }
    }

    #[test]
    fn large_collection_retains_first_error_and_rejects_unsafe_sources() {
        let (_temp, store, ids) = fixture();
        let cards = store.directory.child("cards", false).unwrap();
        let later = cards.path().join(format!("{}.json", ids[256]));
        fs::remove_file(&later).unwrap();
        symlink(cards.path().join(format!("{}.json", ids[511])), &later).unwrap();
        let first = cards.path().join(format!("{}.json", ids[0]));
        fs::write(&first, b"invalid").unwrap();
        let AppError::Rejected(reply) = collection(&store, Kind::Card).unwrap_err() else {
            panic!("The first sorted source must retain its validation error");
        };
        assert_eq!(reply.http_status, 409);
        assert_eq!(reply.body["error"]["code"], "DOCUMENT_INVALID");
        fs::remove_file(first).unwrap();
        assert!(matches!(
            collection(&store, Kind::Card),
            Err(AppError::Store(_))
        ));
    }

    #[test]
    fn contended_worker_capacity_uses_the_same_sequential_source_reads() {
        let (_temp, store, ids) = fixture();
        let capacity = PARALLEL_SOURCE_READ.lock().unwrap();
        let observed = collection(&store, Kind::Card).unwrap();
        assert_eq!(observed.len(), ids.len());
        for (id, parsed) in ids.iter().zip(&observed) {
            assert_eq!(parsed.value()["metadata"]["id"], *id);
        }
        let reader = store.collection_reader(Kind::Card).unwrap();
        let names: Vec<_> = ids.iter().map(String::as_str).collect();
        let mut visited = 0;
        visit_ordered(
            &names,
            |id| read_collection(&reader, Kind::Card, id),
            |id, parsed| {
                let parsed = parsed?;
                assert_eq!(parsed.value()["metadata"]["id"], id);
                assert_eq!(parsed.version, observed[visited].version);
                visited += 1;
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(visited, ids.len());
        drop(capacity);
    }
}
