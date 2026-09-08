//! Explicit local maintenance plans reuse durable, conditional workflow steps.
use crate::workflow_kind::WorkflowKind;
use crate::{
    AppError, Reply,
    engine::Engine,
    instant, now_millis,
    source::{collection, pretty, read},
    workflow::{Plan, PlanLocation, Step, Workflows},
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
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let crate::Versioned {
            value: mut workspace,
            version: workspace_version,
        } = self.workspace()?;
        let project = match &request {
            Maintenance::Normalize { project_id, .. }
            | Maintenance::Rebalance { project_id, .. }
            | Maintenance::Unregister { project_id, .. }
            | Maintenance::Relocate { project_id, .. }
            | Maintenance::IndexRebuild { project_id } => project_id.clone(),
        };
        let registration = workspace
            .projects
            .iter()
            .find(|p| p.project_id == project)
            .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))?;
        let mut path = registration.path.clone();
        if self.journal.has_pending(&project)? || self.journal.has_pending("workspace")? {
            return Err(AppError::reject(409, "RECOVERY_REQUIRED"));
        }
        let old_path = path.clone();
        let mut steps = Vec::new();
        let mut collection_guard = None;
        let mut warnings = Vec::new();
        let kind = match request {
            Maintenance::Normalize {
                kind,
                id,
                expected_version,
                ..
            } => {
                let handle = self.store(&project)?;
                let store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                let (directory, name) = store.location(kind, &id, false)?;
                let before = directory
                    .read(&name)?
                    .ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
                if document::version(&before) != expected_version {
                    return Err(AppError::reject(412, "VERSION_CONFLICT"));
                }
                let parsed = document::parse(kind, Some(&id), &before)?;
                let validated = parsed.document;
                steps.push(Step::plan(
                    &directory,
                    &[&name],
                    document::serialize(&validated)?,
                )?);
                warnings.push(json!({
                    "code": "NORMALIZATION",
                    "message": "Canonical formatting replaces YAML comments and whitespace. Original bytes are retained in this plan.",
                }));
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
                let store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                let directory = store.directory.child(
                    kind.directory()
                        .ok_or(AppError::invariant("rebalanced collection kind"))?,
                    false,
                )?;
                let mut names = directory.names()?;
                names.retain(|name| name.ends_with(".md"));
                names.sort();
                collection_guard = Some((
                    directory
                        .path()
                        .to_str()
                        .ok_or(AppError::invariant("rebalanced collection UTF-8 path"))?
                        .to_owned(),
                    names,
                ));
                let mut values = collection(&store, kind)?;
                values.sort_by(|a, b| {
                    let a = a.document.get();
                    let b = b.document.get();
                    a.status()
                        .cmp(&b.status())
                        .then(a.position().cmp(&b.position()))
                        .then(a.id().cmp(b.id()))
                });
                let spacing = u128::MAX / (values.len() as u128 + 1);
                for (n, source) in values.into_iter().enumerate() {
                    let id = source.document.get().id().to_owned();
                    let mut value = source.value();
                    let (directory, name) = store.location(kind, &id, false)?;
                    let before = directory
                        .read(&name)?
                        .ok_or(AppError::Unavailable("rebalance source"))?;
                    if document::parse(kind, Some(&id), &before)?.normalization_required {
                        return Err(AppError::reject(409, "NORMALIZATION_REQUIRED"));
                    }
                    value["metadata"]["position"] =
                        json!(format!("{:032x}", spacing * (n as u128 + 1)));
                    let validated =
                        validate_document(value).map_err(|source| AppError::SourceValidation {
                            context: "rebalance candidate",
                            source,
                        })?;
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
                workspace.projects.retain(|p| p.project_id != project);
                workspace.focus.retain(|p| p.project_id != project);
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
                if workspace
                    .projects
                    .iter()
                    .any(|p| p.path == new_absolute_path)
                {
                    return Err(AppError::reject(409, "PATH_ALREADY_REGISTERED"));
                }
                self.release_store_path(&path)?;
                let handle = self.store_path(&new_absolute_path, false)?;
                let store = handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))?;
                read(&store, Kind::Project, &project)?;
                let directory = Directory::open(Path::new(&new_absolute_path))?;
                let (source, name) = store.location(Kind::Project, &project, false)?;
                let bytes = source
                    .read(&name)?
                    .ok_or(AppError::Unavailable("relocation project source"))?;
                steps.push(Step::plan(&directory, &[".project", "project.md"], bytes)?);
                workspace
                    .projects
                    .iter_mut()
                    .find(|p| p.project_id == project)
                    .unwrap()
                    .path = new_absolute_path.clone();
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
        let presentation = json!({
            "plan_id": id,
            "kind": kind,
            "project_id": project,
            "steps": steps.iter().map(|step| step_preview(step, kind == "normalize")).collect::<Vec<_>>(),
            "warnings": warnings,
            "expires_at": instant(expires),
        });
        let plan = Plan {
            id,
            kind: WorkflowKind::parse(kind)?,
            project_id: project,
            expires_at: expires,
            steps,
            location: PlanLocation::maintenance(&path, &old_path, presentation)?,
            approved_root: None,
            collection_guard,
        };
        let view = plan.presentation()?;
        (Workflows {
            journal: &self.journal,
        })
        .save(&plan)?;
        Ok(view)
    }
    pub fn commit_maintenance(
        &self,
        plan_id: &str,
        request: &str,
        epoch: &str,
    ) -> Result<Reply, AppError> {
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let workflows = Workflows {
            journal: &self.journal,
        };
        let plan = workflows.plan(plan_id)?;
        if plan.kind == WorkflowKind::Registration {
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
        let handle = if plan.kind == WorkflowKind::Unregister {
            None
        } else {
            Some(self.store_path(plan.location.destination.as_str(), false)?)
        };
        let store = handle
            .as_ref()
            .map(|handle| {
                handle
                    .lock()
                    .map_err(|_| AppError::LockPoisoned("project store"))
            })
            .transpose()?;
        let reply = workflows.commit_with_completion(
            plan_id,
            request,
            epoch,
            now_millis(),
            |_| Ok(()),
            || {
                if plan.kind == WorkflowKind::IndexRebuild {
                    self.index.refresh(
                        store
                            .as_ref()
                            .ok_or(AppError::invariant("index rebuild project store"))?,
                        &plan.project_id,
                        now_millis(),
                    )?;
                }
                Ok(())
            },
        )?;
        drop(store);
        drop(handle);
        if let Some(job) = reply.body["job_id"].as_str() {
            match workflows.job(job) {
                Ok(job) if job["state"] == "done" => {
                    // The journal already owns the outcome. Cleanup and disposable
                    // projection failures must not replace its durable Accepted reply.
                    if matches!(plan.kind, WorkflowKind::Unregister | WorkflowKind::Relocate)
                        && let Err(error) = plan
                            .location
                            .previous_path()
                            .and_then(|path| self.release_store_path(path))
                    {
                        crate::diagnostics::record_failure(
                            "maintenance_store_release",
                            &error,
                            Some(&plan.project_id),
                            Some(request),
                        );
                    }
                    if let Err(error) = self.repair_completed_projection(&plan.project_id, request)
                    {
                        crate::diagnostics::record_failure(
                            "maintenance_projection_schedule",
                            &error,
                            Some(&plan.project_id),
                            Some(request),
                        );
                    }
                }
                Err(error) => crate::diagnostics::record_failure(
                    "maintenance_completion_lookup",
                    &error,
                    Some(&plan.project_id),
                    Some(request),
                ),
                Ok(_) => {}
            }
        }
        Ok(reply)
    }
}

fn step_preview(step: &Step, include_preview: bool) -> Value {
    let before_hash = step.before.as_ref().map(|bytes| document::version(bytes));
    let before_preview = if include_preview {
        step.before
            .as_ref()
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
    } else {
        None
    };
    let after_preview = include_preview.then(|| String::from_utf8_lossy(&step.after).into_owned());
    json!({
        "path": step.path.join("/"), "before_hash": before_hash,
        "after_hash": document::version(&step.after),
        "before_preview": before_preview, "after_preview": after_preview,
    })
}
