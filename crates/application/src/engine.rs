use crate::{
    AppError,
    index::{Index, Query},
    journal::Journal,
    now_millis,
    source::{Versioned, pretty, read},
    workflow::Workflows,
    writer::Writer,
};
use project_domain::{models::Workspace, validate_workspace};
use project_store::{
    document::{self, Kind},
    filesystem::ProjectStore,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex, RwLock},
};
use uuid::Uuid;

pub(crate) type StoreHandle = Arc<Mutex<ProjectStore>>;
/// Lock order: workspace gate, store registry, project store, journal, index.
/// Release journal transactions before publishing index notifications. Never
/// acquire the workspace gate again from a method that already holds it.
pub struct Engine {
    pub(crate) journal: Journal,
    pub(crate) index: Index,
    pub(crate) gate: RwLock<()>,
    stores: Mutex<HashMap<String, StoreHandle>>,
    pub(crate) reconciled: Mutex<HashMap<String, std::time::Instant>>,
}
impl Engine {
    pub fn open(data: &Path) -> Result<Self, AppError> {
        Self::open_with_reconciliation(data, true)
    }
    /// Recover durable commands before admission; the service reconciles marked
    /// stale projections after listeners start, using its bounded background worker.
    pub fn open_for_service(data: &Path) -> Result<Self, AppError> {
        Self::open_with_reconciliation(data, false)
    }
    pub fn startup_projects(&self) -> Result<Vec<String>, AppError> {
        self.index.pending_projects()
    }
    fn open_with_reconciliation(data: &Path, eager: bool) -> Result<Self, AppError> {
        let journal = Journal::open(data)?;
        if journal
            .directory
            .read("workspace.json")
            .is_ok_and(|value| value.is_none())
        {
            let initialized: bool = journal.db()?.query_row(
                "SELECT EXISTS(SELECT 1 FROM meta WHERE key='workspace_initialized')",
                [],
                |r| r.get(0),
            )?;
            if !initialized {
                let value = json!({
                    "format_version": 1,
                    "instance_id": Uuid::new_v4().to_string(),
                    "timezone": "Europe/Warsaw",
                    "locale": "en",
                    "projects": [],
                    "focus": [],
                    "preferences": {
                        "week_start": "monday",
                        "default_view": "focus",
                    },
                });
                validate_workspace(value.clone()).map_err(|_| AppError::State)?;
                journal
                    .directory
                    .replace("workspace.json", &pretty(&value), None)?;
            }
        }
        journal.db()?.execute(
            "INSERT OR IGNORE INTO meta(key,value) VALUES('workspace_initialized','1')",
            [],
        )?;
        let engine = Self {
            journal,
            index: Index::open(data)?,
            gate: RwLock::new(()),
            stores: Mutex::new(HashMap::new()),
            reconciled: Mutex::new(HashMap::new()),
        };
        let Ok(Versioned {
            value: initial_workspace,
            ..
        }) = engine.workspace()
        else {
            // Keep authenticated diagnostics available; never reconstruct a lost registry.
            return Ok(engine);
        };
        engine.journal.db()?.execute(
            "INSERT INTO meta(key,
    value)
VALUES ('instance_id',
    ?1)
ON CONFLICT (key) DO UPDATE
SET value=excluded.value",
            [&initial_workspace.instance_id],
        )?;
        engine.recover_workspace()?;
        for (job, plan) in (Workflows {
            journal: &engine.journal,
        })
        .pending()?
        {
            if plan.kind == "unregister" {
                let _ = (Workflows {
                    journal: &engine.journal,
                })
                .resume(&job);
                continue;
            }
            let path = plan.view["display_path"].as_str().ok_or(AppError::State)?;
            if let Ok(handle) = engine.store_path(path, true) {
                let store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                let _ = (Workflows {
                    journal: &engine.journal,
                })
                .resume_with_completion(
                    &job,
                    |_| Ok(()),
                    || {
                        if plan.kind == "index_rebuild" {
                            engine
                                .index
                                .refresh(&store, &plan.project_id, now_millis())?;
                        }
                        Ok(())
                    },
                );
            }
        }
        let crate::Versioned {
            value: workspace,
            version: _,
        } = engine.workspace()?;
        engine.index.retain_registered(&workspace.projects)?;
        if !eager {
            engine.index.begin_reconciliation(&workspace.projects)?;
        }
        for registration in &workspace.projects {
            let id = &registration.project_id;
            let path = &registration.path;
            if let Ok(handle) = engine.store_path(path, false) {
                let mut store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                let _ = Writer {
                    journal: &engine.journal,
                }
                .recover(&mut store, id, now_millis());
                if eager && engine.index.refresh(&store, id, now_millis()).is_err() {
                    let _ = engine
                        .index
                        .mark_unavailable(id, "PROJECT_UNAVAILABLE", now_millis());
                }
            } else {
                let _ = engine
                    .index
                    .mark_unavailable(id, "PROJECT_UNAVAILABLE", now_millis());
            }
        }
        Ok(engine)
    }
    pub fn validate_sources(&self, project: &str) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let handle = self.store(project)?;
        let store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
        Ok(project_store::validation::report(&store.directory)?)
    }
    pub fn workspace(&self) -> Result<Versioned<Workspace>, AppError> {
        let bytes = self
            .journal
            .directory
            .read("workspace.json")?
            .ok_or(AppError::Unavailable("workspace.json"))?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|source| AppError::stored("workspace.json", source))?;
        let workspace = validate_workspace(value)
            .map_err(|source| AppError::SourceValidation {
                context: "workspace.json",
                source,
            })?
            .into_inner();
        Ok(Versioned {
            value: workspace,
            version: document::version(&bytes),
        })
    }
    pub(crate) fn release_store_path(&self, path: &str) -> Result<(), AppError> {
        self.stores
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store registry"))?
            .remove(path);
        Ok(())
    }
    pub(crate) fn store_path(&self, path: &str, create: bool) -> Result<StoreHandle, AppError> {
        let mut stores = self
            .stores
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store registry"))?;
        if let Some(store) = stores.get(path) {
            return Ok(store.clone());
        }
        let store = Arc::new(Mutex::new(ProjectStore::open(Path::new(path), create)?));
        stores.insert(path.into(), store.clone());
        Ok(store)
    }
    pub(crate) fn store(&self, id: &str) -> Result<StoreHandle, AppError> {
        let crate::Versioned {
            value: workspace,
            version: _,
        } = self.workspace()?;
        let item = workspace
            .projects
            .iter()
            .find(|r| r.project_id == id)
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))?;
        self.store_path(&item.path, false)
    }
    pub fn resolve_path(&self, path: &str) -> Result<String, AppError> {
        let crate::Versioned {
            value: workspace,
            version: _,
        } = self.workspace()?;
        workspace
            .projects
            .iter()
            .find(|r| r.path == path)
            .map(|r| r.project_id.clone())
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))
    }

    pub fn get(&self, project_id: &str, kind: Kind, id: &str) -> Result<Value, AppError> {
        if kind == Kind::Project {
            self.reconcile_if_due(project_id)?;
        }
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let handle = self.store(project_id)?;
        let store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
        let source = read(&store, kind, id)?;
        let mut value = source.value();
        let version = source.version;
        value["version"] = json!(version);
        if kind == Kind::Update {
            value["read"] = json!(self.receipt(project_id, id)?);
        }
        Ok(value)
    }
    pub fn list(&self, kind: Option<&str>, query: &Query) -> Result<Value, AppError> {
        let mut page = self.index.summary_page(kind, query)?;
        for item in page["items"].as_array_mut().ok_or(AppError::State)? {
            if item["type"] == "update" {
                item["read"] = json!(self.receipt(
                    item["project_id"].as_str().unwrap(),
                    item["id"].as_str().unwrap()
                )?);
            }
        }
        Ok(page)
    }
    fn reconcile_if_due(&self, id: &str) -> Result<(), AppError> {
        let _ = self.store(id)?;
        {
            let mut checked = self
                .reconciled
                .lock()
                .map_err(|_| AppError::LockPoisoned("reconciliation schedule"))?;
            if checked
                .get(id)
                .is_some_and(|time| time.elapsed() < std::time::Duration::from_secs(30))
            {
                return Ok(());
            }
            // Reserve before scanning so concurrent foreground reads do not stampede.
            checked.insert(id.into(), std::time::Instant::now());
        }
        self.refresh_project(id, None)
    }
    pub fn refresh_project(
        &self,
        id: &str,
        targets: Option<&[(Kind, String)]>,
    ) -> Result<(), AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let result = (|| {
            let handle = self.store(id)?;
            let store = handle
                .lock()
                .map_err(|_| AppError::LockPoisoned("project store"))?;
            if let Some(targets) = targets {
                self.index
                    .refresh_targets(&store, id, targets, now_millis())
            } else {
                self.index.refresh(&store, id, now_millis())
            }
        })();
        if result.is_err() {
            self.index
                .mark_unavailable(id, "PROJECT_UNAVAILABLE", now_millis())?;
        } else if targets.is_none() {
            self.reconciled
                .lock()
                .map_err(|_| AppError::LockPoisoned("reconciliation schedule"))?
                .insert(id.into(), std::time::Instant::now());
        }
        result
    }

    pub fn refresh_all(&self) -> Result<(), AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let crate::Versioned {
            value: workspace,
            version: _,
        } = self.workspace()?;
        for item in &workspace.projects {
            let id = &item.project_id;
            if let Ok(handle) = self.store(id) {
                let store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                if self.index.refresh(&store, id, now_millis()).is_err() {
                    let _ = self
                        .index
                        .mark_unavailable(id, "PROJECT_UNAVAILABLE", now_millis());
                }
            } else {
                let _ = self
                    .index
                    .mark_unavailable(id, "PROJECT_UNAVAILABLE", now_millis());
            }
        }
        Ok(())
    }
}
