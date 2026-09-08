//! Registration plans retain source bytes and commit through recoverable workflows.
use crate::workflow_kind::WorkflowKind;
use crate::{
    AppError, Reply,
    engine::Engine,
    instant, now_millis,
    source::pretty,
    wire,
    workflow::{Plan, PlanLocation, Step, Workflows},
};
use project_domain::{models::ProjectRegistration, validate_document, validate_workspace};
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::Directory,
};
use serde_json::{Value, json};
use std::path::Path;
use uuid::Uuid;

impl Engine {
    pub fn registration_plan(
        &self,
        path: &str,
        name: Option<&str>,
        private: bool,
    ) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let root = Directory::open(Path::new(path))?;
        let now = now_millis();
        let crate::Versioned {
            value: mut workspace,
            version: _,
        } = self.workspace()?;
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
            (parsed.document.get().id().to_owned(), bytes)
        } else {
            let id = Uuid::new_v4().to_string();
            let name = name
                .or_else(|| Path::new(path).file_name().and_then(|s| s.to_str()))
                .unwrap_or("Project");
            let value = json!({
                "type": "project",
                "metadata": {
                    "schema_version": 1,
                    "id": id,
                    "name": name,
                    "state": "active",
                    "created_at": instant(now),
                    "updated_at": instant(now),
                },
                "body": "",
            });
            let parsed = validate_document(value)
                .map_err(|_| AppError::reject(422, "INVALID_PROJECT_NAME"))?;
            (id, document::serialize(&parsed)?)
        };
        let registrations = &mut workspace.projects;
        if let Some(existing) = registrations
            .iter()
            .find(|r| r.project_id == id || r.path == path)
        {
            if existing.project_id != id || existing.path != path {
                return Err(AppError::reject(409, "REGISTRATION_ID_PATH_CONFLICT"));
            }
        } else {
            registrations.push(ProjectRegistration {
                project_id: id.clone(),
                path: path.into(),
                added_at: instant(now),
            });
        }
        validate_workspace(json!(workspace))
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
        let changes=steps.iter().map(|step|json!({
            "path": format!("{}/{}",step.root,step.path.join("/")),
            "action": if step.before.as_deref()==Some(&step.after){"no_change"}else if step.before.is_none(){"create"}else{"append_managed_block"},
            "before_hash": step.before.as_ref().map(|bytes|document::version(bytes)),
            "description": "Prepare project planning data and preserve existing content",
        })).collect::<Vec<_>>();
        let presentation = json!({
            "plan_id": plan_id,
            "project_id": id,
            "expires_at": instant(now+300_000),
            "changes": changes,
            "warnings": [],
        });
        let plan = Plan {
            approved_root: None,
            collection_guard: None,
            id: plan_id,
            kind: WorkflowKind::Registration,
            project_id: id,
            expires_at: now + 300_000,
            steps,
            location: PlanLocation::registration(path, presentation)?,
        };
        let view = plan.presentation()?;
        wire::validate("RegistrationPlan", &view)?;
        (Workflows {
            journal: &self.journal,
        })
        .save(&plan)?;
        Ok(view)
    }
    pub fn commit_registration(
        &self,
        plan_id: &str,
        request_id: &str,
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
        if let Some(reply) = self
            .journal
            .admit(&plan.command(request_id, epoch), now_millis())?
        {
            return Ok(reply);
        }
        if self.journal.has_pending("workspace")? {
            return Err(AppError::reject(409, "WORKSPACE_RECOVERY_REQUIRED"));
        }
        if plan.kind != WorkflowKind::Registration {
            return Err(AppError::reject(422, "PLAN_KIND_MISMATCH"));
        }
        if let Some(approval) = &plan.approved_root {
            let permitted = self
                .allowed_directory(&approval.root_id, &approval.relative_path)
                .is_ok_and(|directory| {
                    directory
                        .identity()
                        .is_ok_and(|identity| identity == approval.identity)
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
        let handle = self.store_path(plan.location.destination.as_str(), true)?;
        let store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
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
}
