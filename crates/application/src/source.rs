//! Validated source observations keep their byte version through application reads.
use crate::AppError;
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::ProjectStore,
};
use std::sync::Mutex;
use uuid::Uuid;

// At most one collection can add read workers. Contention stays sequential,
// without another queue or a blocking lock in the application lock order.
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
            .map(|id| parse_read(kind, id, directory.read(id)?))
            .collect::<Result<Vec<_>, AppError>>()
    };
    let workers = if ids.len() < 256 {
        1
    } else {
        std::thread::available_parallelism().map_or(1, |count| count.get().min(4))
    };
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
        drop(capacity);
    }
}
