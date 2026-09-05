use crate::{
    AppError, Reply,
    index::{Index, Query},
    instant,
    journal::Journal,
    now_millis, wire,
    workflow::{Plan, Step, Workflows},
    writer::Writer,
};
use project_domain::{validate_document, validate_workspace};
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::{Directory, ProjectStore},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex, RwLock},
};
use uuid::Uuid;

pub(crate) type StoreHandle = Arc<Mutex<ProjectStore>>;
pub struct Engine {
    pub journal: Journal,
    pub index: Index,
    pub gate: RwLock<()>,
    stores: Mutex<HashMap<String, StoreHandle>>,
    pub(crate) reconciled: Mutex<HashMap<String, std::time::Instant>>,
}
impl Engine {
    pub fn open(data: &Path) -> Result<Self, AppError> {
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
                let value = json!({"format_version":1,"instance_id":Uuid::new_v4().to_string(),"timezone":"Europe/Warsaw","locale":"en","projects":[],"focus":[],"preferences":{"week_start":"monday","default_view":"focus"}});
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
        let Ok((initial_workspace, _)) = engine.workspace() else {
            // Keep authenticated diagnostics available; never reconstruct a lost registry.
            return Ok(engine);
        };
        engine.journal.db()?.execute("INSERT INTO meta(key,value) VALUES('instance_id',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[initial_workspace["instance_id"].as_str().ok_or(AppError::State)?])?;
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
                let store = handle.lock().map_err(|_| AppError::State)?;
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
        let (workspace, _) = engine.workspace()?;
        engine.index.retain_registered(&workspace["projects"])?;
        for registration in workspace["projects"].as_array().ok_or(AppError::State)? {
            let id = registration["project_id"].as_str().ok_or(AppError::State)?;
            let path = registration["path"].as_str().ok_or(AppError::State)?;
            if let Ok(handle) = engine.store_path(path, false) {
                let mut store = handle.lock().map_err(|_| AppError::State)?;
                let _ = Writer {
                    journal: &engine.journal,
                }
                .recover(&mut store, id, now_millis());
                if engine.index.refresh(&store, id, now_millis()).is_err() {
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
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let handle = self.store(project)?;
        let store = handle.lock().map_err(|_| AppError::State)?;
        Ok(project_store::validation::report(&store.directory)?)
    }
    pub fn workspace(&self) -> Result<(Value, String), AppError> {
        let bytes = self
            .journal
            .directory
            .read("workspace.json")?
            .ok_or(AppError::State)?;
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| AppError::State)?;
        validate_workspace(value.clone()).map_err(|_| AppError::State)?;
        Ok((value, document::version(&bytes)))
    }
    pub(crate) fn release_store_path(&self, path: &str) -> Result<(), AppError> {
        self.stores
            .lock()
            .map_err(|_| AppError::State)?
            .remove(path);
        Ok(())
    }
    pub(crate) fn store_path(&self, path: &str, create: bool) -> Result<StoreHandle, AppError> {
        let mut stores = self.stores.lock().map_err(|_| AppError::State)?;
        if let Some(store) = stores.get(path) {
            return Ok(store.clone());
        }
        let store = Arc::new(Mutex::new(ProjectStore::open(Path::new(path), create)?));
        stores.insert(path.into(), store.clone());
        Ok(store)
    }
    pub(crate) fn store(&self, id: &str) -> Result<StoreHandle, AppError> {
        let (workspace, _) = self.workspace()?;
        let item = workspace["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["project_id"] == id)
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))?;
        self.store_path(item["path"].as_str().unwrap(), false)
    }
    pub fn resolve_path(&self, path: &str) -> Result<String, AppError> {
        let (workspace, _) = self.workspace()?;
        workspace["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["path"] == path)
            .and_then(|r| r["project_id"].as_str())
            .map(str::to_owned)
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))
    }
    pub fn registration_plan(
        &self,
        path: &str,
        name: Option<&str>,
        private: bool,
    ) -> Result<Value, AppError> {
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let root = Directory::open(Path::new(path))?;
        let now = now_millis();
        let (mut workspace, _) = self.workspace()?;
        let existing_project = match root.child(".project", false) {
            Ok(directory) => {
                let bytes = directory.read("project.md")?;
                if bytes.is_none() && directory.names()?.iter().any(|name| name != ".local") {
                    return Err(AppError::reject(409, "PROJECT_DOCUMENT_MISSING"));
                }
                bytes
            }
            Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        let (id, project_bytes) = if let Some(bytes) = existing_project {
            let parsed = document::parse(Kind::Project, None, &bytes)?;
            (
                parsed.value()["metadata"]["id"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
                bytes,
            )
        } else {
            let id = Uuid::new_v4().to_string();
            let name = name
                .or_else(|| Path::new(path).file_name().and_then(|s| s.to_str()))
                .unwrap_or("Project");
            let value = json!({"type":"project","metadata":{"schema_version":1,"id":id,"name":name,"state":"active","created_at":instant(now),"updated_at":instant(now)},"body":""});
            let parsed = validate_document(value)
                .map_err(|_| AppError::reject(422, "INVALID_PROJECT_NAME"))?;
            (id, document::serialize(&parsed)?)
        };
        let registrations = workspace["projects"].as_array_mut().unwrap();
        if let Some(existing) = registrations
            .iter()
            .find(|r| r["project_id"] == id || r["path"] == path)
        {
            if existing["project_id"] != id || existing["path"] != path {
                return Err(AppError::reject(409, "REGISTRATION_ID_PATH_CONFLICT"));
            }
        } else {
            registrations.push(json!({"project_id":id,"path":path,"added_at":instant(now)}));
        }
        validate_workspace(workspace.clone())
            .map_err(|_| AppError::reject(422, "WORKSPACE_LIMIT"))?;
        if root
            .names()?
            .iter()
            .any(|name| name.eq_ignore_ascii_case("agents.md") && name != "AGENTS.md")
        {
            return Err(AppError::reject(409, "AGENTS_CASE_CONFLICT"));
        }
        let block = include_str!("../../../templates/managed-agents-block.md");
        let agents = match root.read("AGENTS.md")? {
            Some(bytes) => {
                let text = std::str::from_utf8(&bytes)
                    .map_err(|_| AppError::reject(409, "AGENTS_INVALID_UTF8"))?;
                if text.contains("<!-- local-projects:begin") {
                    if !text.contains(block) {
                        return Err(AppError::reject(409, "MANAGED_BLOCK_CONFLICT"));
                    }
                    bytes
                } else {
                    let mut bytes = bytes;
                    bytes.extend_from_slice(b"\n\n");
                    bytes.extend_from_slice(block.as_bytes());
                    bytes
                }
            }
            None => block.as_bytes().to_vec(),
        };
        let mut steps = vec![Step::plan(
            &root,
            &[".project", "project.md"],
            project_bytes,
        )?];
        for (filename, template) in [
            (
                "README.md",
                include_str!("../../../templates/project-readme.md"),
            ),
            (
                ".gitignore",
                include_str!("../../../templates/project-gitignore.txt"),
            ),
        ] {
            let mut step =
                Step::plan(&root, &[".project", filename], template.as_bytes().to_vec())?;
            if let Some(before) = &step.before {
                step.after = before.clone();
            }
            steps.push(step);
        }
        steps.push(Step::plan(&root, &["AGENTS.md"], agents)?);
        if private {
            let mut ignore = root.read(".gitignore")?.unwrap_or_default();
            let text = std::str::from_utf8(&ignore)
                .map_err(|_| AppError::reject(409, "GITIGNORE_INVALID_UTF8"))?;
            if !text
                .lines()
                .any(|line| matches!(line.trim(), ".project/" | "/.project/"))
            {
                ignore.extend_from_slice(b"\n# Local Projects private planning data\n.project/\n");
            }
            steps.push(Step::plan(&root, &[".gitignore"], ignore)?);
        }
        steps.push(Step::plan(
            &self.journal.directory,
            &["workspace.json"],
            pretty(&workspace),
        )?);
        let plan_id = Uuid::new_v4().to_string();
        let changes=steps.iter().map(|step|json!({"path":format!("{}/{}",step.root,step.path.join("/")),"action":if step.before.as_deref()==Some(&step.after){"no_change"}else if step.before.is_none(){"create"}else{"append_managed_block"},"before_hash":step.before.as_ref().map(|bytes|document::version(bytes)),"description":"Prepare project planning data and preserve existing content"})).collect::<Vec<_>>();
        let view = json!({"plan_id":plan_id,"project_id":id,"expires_at":instant(now+300_000),"display_path":path,"changes":changes,"warnings":[]});
        wire::validate("RegistrationPlan", &view)?;
        (Workflows {
            journal: &self.journal,
        })
        .save(&Plan {
            approved_root: None,
            collection_guard: None,
            id: plan_id,
            kind: "registration".into(),
            project_id: id,
            expires_at: now + 300_000,
            steps,
            view: view.clone(),
        })?;
        Ok(view)
    }
    pub fn commit_registration(
        &self,
        plan_id: &str,
        request_id: &str,
        epoch: &str,
    ) -> Result<Reply, AppError> {
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let workflows = Workflows {
            journal: &self.journal,
        };
        let plan = workflows.plan(plan_id)?;
        if let Some(reply) = self
            .journal
            .admit(&plan.command(request_id, epoch), now_millis())?
        {
            return Ok(reply);
        }
        if self.journal.has_pending("workspace")? {
            return Err(AppError::reject(409, "WORKSPACE_RECOVERY_REQUIRED"));
        }
        if plan.kind != "registration" {
            return Err(AppError::reject(422, "PLAN_KIND_MISMATCH"));
        }
        if let Some(approval) = &plan.approved_root {
            let permitted = self
                .allowed_directory(
                    approval["root_id"].as_str().ok_or(AppError::State)?,
                    approval["relative_path"].as_str().ok_or(AppError::State)?,
                )
                .is_ok_and(|directory| {
                    directory
                        .identity()
                        .is_ok_and(|identity| json!(identity) == approval["identity"])
                });
            if !permitted {
                let command = plan.command(request_id, epoch);
                let reply = Reply::error(403, "REGISTRATION_AUTHORITY_REVOKED", request_id);
                return Ok(self
                    .journal
                    .record(&command, &reply, None, now_millis(), true)?
                    .unwrap_or(reply));
            }
        }
        let handle = self.store_path(
            plan.view["display_path"].as_str().ok_or(AppError::State)?,
            true,
        )?;
        let store = handle.lock().map_err(|_| AppError::State)?;
        let reply = workflows.commit(plan_id, request_id, epoch, now_millis())?;
        if let Some(job) = reply.body["job_id"].as_str()
            && workflows.job(job)?["state"] == "done"
            && self
                .index
                .refresh(&store, &plan.project_id, now_millis())
                .is_err()
        {
            let _ =
                self.index
                    .mark_unavailable(&plan.project_id, "PROJECTION_DEGRADED", now_millis());
        }
        Ok(reply)
    }
    pub fn get(&self, project_id: &str, kind: Kind, id: &str) -> Result<Value, AppError> {
        if kind == Kind::Project {
            self.reconcile_if_due(project_id)?;
        }
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let handle = self.store(project_id)?;
        let store = handle.lock().map_err(|_| AppError::State)?;
        let (mut value, version) = read(&store, kind, id)?;
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
            let mut checked = self.reconciled.lock().map_err(|_| AppError::State)?;
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
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let result = (|| {
            let handle = self.store(id)?;
            let store = handle.lock().map_err(|_| AppError::State)?;
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
                .map_err(|_| AppError::State)?
                .insert(id.into(), std::time::Instant::now());
        }
        result
    }

    pub fn refresh_all(&self) -> Result<(), AppError> {
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let (workspace, _) = self.workspace()?;
        for item in workspace["projects"].as_array().unwrap() {
            let id = item["project_id"].as_str().unwrap();
            if let Ok(handle) = self.store(id) {
                let store = handle.lock().map_err(|_| AppError::State)?;
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
pub fn pretty(value: &Value) -> Vec<u8> {
    let mut bytes = serde_json::to_vec_pretty(value).unwrap();
    bytes.push(b'\n');
    bytes
}
pub(crate) fn read(
    store: &ProjectStore,
    kind: Kind,
    id: &str,
) -> Result<(Value, String), AppError> {
    let (directory, name) = match store.location(kind, id, false) {
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::reject(404, "RESOURCE_NOT_FOUND"));
        }
        value => value?,
    };
    let bytes = directory
        .read(&name)?
        .ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
    let parsed = document::parse(kind, Some(id), &bytes)
        .map_err(|_| AppError::reject(409, "DOCUMENT_INVALID"))?;
    Ok((parsed.value(), parsed.version))
}
pub(crate) fn collection(
    store: &ProjectStore,
    kind: Kind,
) -> Result<Vec<(Value, String)>, AppError> {
    let directory = match store
        .directory
        .child(kind.directory().ok_or(AppError::State)?, false)
    {
        Ok(directory) => directory,
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(vec![]);
        }
        Err(error) => return Err(error.into()),
    };
    let mut values = Vec::new();
    for filename in directory.names()? {
        if let Some(id) = filename.strip_suffix(".md")
            && Uuid::parse_str(id).is_ok()
        {
            values.push(read(store, kind, id)?);
        }
    }
    Ok(values)
}
