//! One host's writer leases and workspace coordination, shared by its profiles.
use crate::{AppError, engine::StoreHandle, journal::JournalReader};
use project_domain::{models::Workspace, validate_workspace};
use project_store::filesystem::ProjectStore;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock, Weak},
};

#[derive(Default)]
pub(crate) struct SharedHost {
    pub gate: Arc<RwLock<()>>,
    stores: Mutex<HashMap<PathBuf, Weak<Mutex<ProjectStore>>>>,
    readers: Mutex<Vec<Weak<JournalReader>>>,
}
impl SharedHost {
    pub fn attach(&self, reader: &Arc<JournalReader>) -> Result<(), AppError> {
        let mut readers = self
            .readers
            .lock()
            .map_err(|_| AppError::LockPoisoned("host journal readers"))?;
        readers.retain(|reader| reader.strong_count() > 0);
        readers.push(Arc::downgrade(reader));
        Ok(())
    }
    pub fn readers(&self) -> Result<Vec<Arc<JournalReader>>, AppError> {
        Ok(self
            .readers
            .lock()
            .map_err(|_| AppError::LockPoisoned("host journal readers"))?
            .iter()
            .filter_map(Weak::upgrade)
            .collect())
    }
    pub fn store(&self, path: &Path, create: bool) -> Result<StoreHandle, AppError> {
        let mut stores = self
            .stores
            .lock()
            .map_err(|_| AppError::LockPoisoned("host project leases"))?;
        if let Some(store) = stores.get(path).and_then(Weak::upgrade) {
            return Ok(store);
        }
        let store = Arc::new(Mutex::new(ProjectStore::open(path, create)?));
        stores.insert(path.to_owned(), Arc::downgrade(&store));
        Ok(store)
    }
    pub fn other_workspaces(&self, own: &Arc<JournalReader>) -> Result<Vec<Workspace>, AppError> {
        self.readers()?
            .into_iter()
            .filter(|reader| !Arc::ptr_eq(reader, own))
            .map(|reader| {
                reader.verify()?;
                let bytes = reader
                    .directory
                    .read("workspace.json")?
                    .ok_or(AppError::Unavailable("peer workspace"))?;
                let value = serde_json::from_slice(&bytes)
                    .map_err(|error| AppError::stored("peer workspace", error))?;
                validate_workspace(value)
                    .map(|workspace| workspace.into_inner())
                    .map_err(|source| AppError::SourceValidation {
                        context: "peer workspace",
                        source,
                    })
            })
            .collect()
    }
}
