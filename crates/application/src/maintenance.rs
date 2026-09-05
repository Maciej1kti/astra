//! Explicit local maintenance plans reuse durable, conditional workflow steps.
use crate::{
    AppError, Reply,
    engine::{Engine, collection, pretty, read},
    instant, now_millis,
    workflow::{Plan, Step, Workflows},
};
use project_domain::validate_document;
use project_store::{
    document::{self, Kind},
    filesystem::Directory,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum Maintenance {
    Normalize {
        project_id: String,
        kind: Kind,
        id: String,
        expected_version: String,
    },
    Rebalance {
        project_id: String,
        kind: Kind,
        expected_projection_revision: String,
    },
    Unregister {
        project_id: String,
        expected_workspace_version: String,
    },
    Relocate {
        project_id: String,
        new_absolute_path: String,
        expected_workspace_version: String,
    },
    IndexRebuild {
        project_id: String,
    },
}
impl Engine {
    pub fn maintenance_plan(&self, input: &Value) -> Result<Value, AppError> {
        let request: Maintenance = serde_json::from_value(input.clone())
            .map_err(|_| AppError::reject(422, "INVALID_MAINTENANCE_INPUT"))?;
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let (mut workspace, workspace_version) = self.workspace()?;
        let project = match &request {
            Maintenance::Normalize { project_id, .. }
            | Maintenance::Rebalance { project_id, .. }
            | Maintenance::Unregister { project_id, .. }
            | Maintenance::Relocate { project_id, .. }
            | Maintenance::IndexRebuild { project_id } => project_id.clone(),
        };
        let registration = workspace["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["project_id"] == project)
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))?;
        let mut path = registration["path"]
            .as_str()
            .ok_or(AppError::State)?
            .to_owned();
        if self.journal.has_pending(&project)? || self.journal.has_pending("workspace")? {
            return Err(AppError::reject(409, "RECOVERY_REQUIRED"));
        }
        let old_path = path.clone();
        let mut steps = Vec::new();
        let mut warnings = Vec::new();
        let kind = match request {
            Maintenance::Normalize {
                kind,
                id,
                expected_version,
                ..
            } => {
                let handle = self.store(&project)?;
                let store = handle.lock().map_err(|_| AppError::State)?;
                let (directory, name) = store.location(kind, &id, false)?;
                let before = directory
                    .read(&name)?
                    .ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
                if document::version(&before) != expected_version {
                    return Err(AppError::reject(412, "VERSION_CONFLICT"));
                }
                let parsed = document::parse(kind, Some(&id), &before)?;
                let validated = validate_document(parsed.value())
                    .map_err(|_| AppError::reject(422, "DOCUMENT_INVALID"))?;
                steps.push(Step::plan(
                    &directory,
                    &[&name],
                    document::serialize(&validated)?,
                )?);
                warnings.push(json!({"code":"NORMALIZATION","message":"Canonical formatting replaces YAML comments and whitespace. Original bytes are retained in this plan."}));
                "normalize"
            }
            Maintenance::Rebalance {
                kind,
                expected_projection_revision,
                ..
            } => {
                if !matches!(kind, Kind::Card | Kind::Milestone) {
                    return Err(AppError::reject(422, "INVALID_COLLECTION"));
                }
                if self.index.cursor()? != expected_projection_revision {
                    return Err(AppError::reject(409, "PAGE_STALE"));
                }
                let handle = self.store(&project)?;
                let store = handle.lock().map_err(|_| AppError::State)?;
                let mut values = collection(&store, kind)?;
                values.sort_by(|a, b| {
                    a.0["metadata"]["status"]
                        .as_str()
                        .cmp(&b.0["metadata"]["status"].as_str())
                        .then(
                            a.0["metadata"]["position"]
                                .as_str()
                                .cmp(&b.0["metadata"]["position"].as_str()),
                        )
                        .then(
                            a.0["metadata"]["id"]
                                .as_str()
                                .cmp(&b.0["metadata"]["id"].as_str()),
                        )
                });
                let spacing = u128::MAX / (values.len() as u128 + 1);
                for (n, (mut value, _)) in values.into_iter().enumerate() {
                    let id = value["metadata"]["id"].as_str().unwrap().to_owned();
                    let (directory, name) = store.location(kind, &id, false)?;
                    let before = directory.read(&name)?.ok_or(AppError::State)?;
                    if document::parse(kind, Some(&id), &before)?.normalization_required {
                        return Err(AppError::reject(409, "NORMALIZATION_REQUIRED"));
                    }
                    value["metadata"]["position"] =
                        json!(format!("{:032x}", spacing * (n as u128 + 1)));
                    let validated = validate_document(value).map_err(|_| AppError::State)?;
                    steps.push(Step::plan(
                        &directory,
                        &[&name],
                        document::serialize(&validated)?,
                    )?);
                }
                "rebalance"
            }
            Maintenance::Unregister {
                expected_workspace_version,
                ..
            } => {
                if workspace_version != expected_workspace_version {
                    return Err(AppError::reject(412, "VERSION_CONFLICT"));
                }
                workspace["projects"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|p| p["project_id"] != project);
                workspace["focus"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|p| p["project_id"] != project);
                steps.push(Step::plan(
                    &self.journal.directory,
                    &["workspace.json"],
                    pretty(&workspace),
                )?);
                warnings.push(json!({"code":"FILES_RETAINED","message":"Unregistering leaves project files and its AGENTS instructions on disk."}));
                "unregister"
            }
            Maintenance::Relocate {
                new_absolute_path,
                expected_workspace_version,
                ..
            } => {
                if workspace_version != expected_workspace_version {
                    return Err(AppError::reject(412, "VERSION_CONFLICT"));
                }
                if workspace["projects"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|p| p["path"] == new_absolute_path)
                {
                    return Err(AppError::reject(409, "PATH_ALREADY_REGISTERED"));
                }
                self.release_store_path(&path)?;
                let handle = self.store_path(&new_absolute_path, false)?;
                let store = handle.lock().map_err(|_| AppError::State)?;
                read(&store, Kind::Project, &project)?;
                let directory = Directory::open(Path::new(&new_absolute_path))?;
                let (source, name) = store.location(Kind::Project, &project, false)?;
                let bytes = source.read(&name)?.ok_or(AppError::State)?;
                steps.push(Step::plan(&directory, &[".project", "project.md"], bytes)?);
                workspace["projects"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .find(|p| p["project_id"] == project)
                    .unwrap()["path"] = json!(new_absolute_path);
                steps.push(Step::plan(
                    &self.journal.directory,
                    &["workspace.json"],
                    pretty(&workspace),
                )?);
                path = new_absolute_path;
                "relocate"
            }
            Maintenance::IndexRebuild { .. } => "index_rebuild",
        };
        if steps
            .iter()
            .map(|step| step.after.len() + step.before.as_ref().map_or(0, Vec::len))
            .sum::<usize>()
            > 32 * 1024 * 1024
        {
            return Err(AppError::reject(422, "MAINTENANCE_PLAN_TOO_LARGE"));
        }
        let id = Uuid::new_v4().to_string();
        let expires = now_millis() + 300_000;
        let view = json!({"plan_id":id,"kind":kind,"project_id":project,"display_path":path,"previous_path":old_path,"steps":steps.iter().map(|step|json!({"path":step.path.join("/"),"before_hash":step.before.as_ref().map(|bytes|document::version(bytes)),"after_hash":document::version(&step.after),"before_preview":if kind=="normalize"{step.before.as_ref().map(|b|String::from_utf8_lossy(b).into_owned())}else{None},"after_preview":if kind=="normalize"{Some(String::from_utf8_lossy(&step.after).into_owned())}else{None}})).collect::<Vec<_>>(),"warnings":warnings,"expires_at":instant(expires)});
        (Workflows {
            journal: &self.journal,
        })
        .save(&Plan {
            id,
            kind: kind.into(),
            project_id: project,
            expires_at: expires,
            steps,
            view: view.clone(),
            approved_root: None,
        })?;
        Ok(view)
    }
    pub fn commit_maintenance(
        &self,
        plan_id: &str,
        request: &str,
        epoch: &str,
    ) -> Result<Reply, AppError> {
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let workflows = Workflows {
            journal: &self.journal,
        };
        let plan = workflows.plan(plan_id)?;
        if ![
            "normalize",
            "rebalance",
            "unregister",
            "relocate",
            "index_rebuild",
        ]
        .contains(&plan.kind.as_str())
        {
            return Err(AppError::reject(422, "PLAN_KIND_MISMATCH"));
        }
        if let Some(reply) = self
            .journal
            .admit(&plan.command(request, epoch), now_millis())?
        {
            return Ok(reply);
        }
        if self.journal.has_pending("workspace")? {
            return Err(AppError::reject(409, "WORKSPACE_RECOVERY_REQUIRED"));
        }
        let handle = if plan.kind == "unregister" {
            None
        } else {
            Some(self.store_path(
                plan.view["display_path"].as_str().ok_or(AppError::State)?,
                false,
            )?)
        };
        let store = handle
            .as_ref()
            .map(|handle| handle.lock().map_err(|_| AppError::State))
            .transpose()?;
        let reply = workflows.commit(plan_id, request, epoch, now_millis())?;
        if let Some(job) = reply.body["job_id"].as_str()
            && workflows.job(job)?["state"] == "done"
        {
            if plan.kind == "unregister" {
                self.index.forget_project(&plan.project_id, now_millis())?;
            } else if let Some(store) = &store {
                self.index.refresh(store, &plan.project_id, now_millis())?;
            }
            self.index.invalidate_workspace(now_millis())?;
            if matches!(plan.kind.as_str(), "unregister" | "relocate") {
                self.release_store_path(
                    plan.view["previous_path"].as_str().ok_or(AppError::State)?,
                )?;
            }
        }
        Ok(reply)
    }
}
