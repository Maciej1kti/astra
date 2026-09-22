//! Permanent removal of one registered project's `.project` tree.
//!
//! The command uses the normal command journal for identity and admission, but
//! keeps its operational manifest in the deletion intent's `before_bytes`.
//! That avoids making the source tree or disposable index part of recovery.
//! The bytes contain the bounded inventory, cursor, workspace precondition and
//! replacement.  A cursor update is durable before the next unlink.

use crate::{
    AppError, Reply,
    command_state::CommandState,
    engine::Engine,
    journal::{Command, Intent, Journal, Target},
    now_millis,
    source::pretty,
};
use project_domain::{models::Workspace, validate_workspace};
use project_store::{
    document::{self, Kind},
    filesystem::Directory,
    tree_removal::{self, Inventory, RemovalOutcome},
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

const DELETE_METHOD: &str = "DELETE_PROJECT";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProjectDeletePoint {
    Prepared,
    EntryRemoved(usize),
    CursorSaved(usize),
    WorkspaceWritten,
    Committed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeletionIntent {
    project_id: String,
    root_path: String,
    plan_version: String,
    workspace_before: Vec<u8>,
    workspace_after: Vec<u8>,
    inventory: Inventory,
    cursor: usize,
    result: Value,
}

fn manifest_bytes(intent: &DeletionIntent) -> Result<Vec<u8>, AppError> {
    let bytes = serde_json::to_vec(intent)
        .map_err(|source| AppError::stored("project deletion manifest", source))?;
    if bytes.len() > tree_removal::MAX_MANIFEST_BYTES {
        return Err(AppError::reject(422, "PROJECT_TREE_MANIFEST_LIMIT"));
    }
    Ok(bytes)
}

fn snapshot_version(workspace_version: &str, inventory: &Inventory) -> Result<String, AppError> {
    let bytes = serde_json::to_vec(&json!({
        "workspace_version": workspace_version,
        "inventory": inventory,
    }))
    .map_err(|source| AppError::stored("project deletion plan", source))?;
    Ok(document::version(&bytes))
}

fn path_text(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(str::to_owned)
        .ok_or(AppError::invariant("project deletion UTF-8 path"))
}

fn registration<'a>(
    workspace: &'a Workspace,
    project_id: &str,
) -> Result<&'a project_domain::models::ProjectRegistration, AppError> {
    workspace
        .projects
        .iter()
        .find(|registration| registration.project_id == project_id)
        .ok_or_else(|| AppError::reject(404, "PROJECT_NOT_REGISTERED"))
}

fn validate_project_source(root_path: &Path, id: &str) -> Result<(), AppError> {
    let project = Directory::open(root_path)
        .map_err(tree_error)?
        .child(".project", false)
        .map_err(tree_error)?;
    let bytes = project
        .read("project.md")
        .map_err(tree_error)?
        .ok_or_else(|| AppError::reject(409, "PROJECT_DOCUMENT_MISSING"))?;
    document::parse(Kind::Project, Some(id), &bytes)
        .map_err(|_| AppError::reject(409, "PROJECT_DOCUMENT_INVALID"))?;
    Ok(())
}

fn tree_error(error: project_store::StoreError) -> AppError {
    match error {
        project_store::StoreError::Invalid(code) => {
            AppError::reject(if code.ends_with("LIMIT") { 422 } else { 409 }, code)
        }
        project_store::StoreError::Io(error) if error.kind() == std::io::ErrorKind::NotFound => {
            AppError::reject(409, "PROJECT_TREE_CHANGED")
        }
        error => error.into(),
    }
}

fn workspace_bytes(engine: &Engine) -> Result<(Vec<u8>, Workspace, String), AppError> {
    let bytes = engine
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
    let version = document::version(&bytes);
    Ok((bytes, workspace, version))
}

fn deletion_reply(request_id: &str, project_id: &str) -> Reply {
    Reply {
        http_status: 200,
        body: json!({
            "api_version": "1",
            "request_id": request_id,
            "status": "committed",
            "result": {"type": "project", "id": project_id, "deleted": true},
            "warnings": [],
            "replayed": false,
        }),
    }
}

fn uncertain(request_id: &str) -> Reply {
    Reply {
        http_status: 202,
        body: json!({"api_version":"1","request_id":request_id,"state":"prepared"}),
    }
}

fn review_error(error: &AppError) -> bool {
    matches!(
        error,
        AppError::Rejected(_)
            | AppError::Store(
                project_store::StoreError::Invalid(_) | project_store::StoreError::Conflict
            )
    )
}

fn mark_intent(engine: &Engine, command: &Command, state: CommandState) -> Result<(), AppError> {
    let db = engine.journal.db()?;
    Journal::set_command_state(&db, &command.epoch, &command.request_id, state)
}

fn save_cursor(
    engine: &Engine,
    command: &Command,
    intent: &DeletionIntent,
) -> Result<(), AppError> {
    let bytes = manifest_bytes(intent)?;
    let db = engine.journal.db()?;
    db.execute(
        "UPDATE write_intents SET before_bytes=?3,before_hash=?4 WHERE epoch=?1 AND request_id=?2 AND step=0",
        params![
            command.epoch,
            command.request_id,
            bytes,
            document::version(&bytes)
        ],
    )?;
    Ok(())
}

fn complete_intent(engine: &Engine, command: &Command) -> Result<(), AppError> {
    let mut db = engine.journal.db()?;
    let tx = db.transaction()?;
    Journal::set_command_state(
        &tx,
        &command.epoch,
        &command.request_id,
        CommandState::Committed,
    )?;
    tx.execute(
        "UPDATE write_intents SET resolved=1 WHERE epoch=?1 AND request_id=?2",
        params![command.epoch, command.request_id],
    )?;
    tx.commit()?;
    Ok(())
}

fn review_and_uncertain(
    engine: &Engine,
    command: &Command,
    error: &AppError,
) -> Result<Reply, AppError> {
    let state = if review_error(error) {
        CommandState::NeedsReview
    } else {
        CommandState::Blocked
    };
    if engine.journal.state(command)? != CommandState::Committed {
        mark_intent(engine, command, state)?;
    }
    crate::diagnostics::record_failure(
        "project_deletion",
        error,
        Some(&command.target.project_id),
        Some(&command.request_id),
    );
    Ok(uncertain(&command.request_id))
}

impl Engine {
    /// Pending tree removal owns the workspace precondition until resolved.
    pub(crate) fn ensure_no_project_deletion(&self) -> Result<(), AppError> {
        self.ensure_project_deletion_path(None)
    }

    pub(crate) fn ensure_project_deletion_path(&self, path: Option<&str>) -> Result<(), AppError> {
        let pending: bool = self.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM commands c JOIN intent_context i USING(epoch,request_id)
             JOIN write_intents w USING(epoch,request_id)
             WHERE c.state IN ('prepared','blocked','needs_review') AND w.resolved=0
               AND json_extract(i.command_json,'$.method')=?1
               AND (?2 IS NULL OR w.approved_root=?2))",
            params![DELETE_METHOD, path],
            |row| row.get(0),
        )?;
        if pending {
            Err(AppError::reject(409, "PROJECT_DELETION_PENDING"))
        } else {
            Ok(())
        }
    }

    fn validate_deletion_scope(
        &self,
        workspace: &Workspace,
        root: &Path,
        id: &str,
    ) -> Result<(), AppError> {
        let deleted = root.join(".project");
        if self.journal.directory.path().starts_with(&deleted) {
            return Err(AppError::reject(409, "PROJECT_CONTAINS_SERVER_STATE"));
        }
        if workspace.projects.iter().any(|project| {
            project.project_id != id && Path::new(&project.path).starts_with(&deleted)
        }) {
            return Err(AppError::reject(409, "PROJECT_CONTAINS_REGISTERED_PROJECT"));
        }
        validate_project_source(root, id)
    }
    /// Read a bounded snapshot without opening `ProjectStore` (which would
    /// create operational state in `.local`).
    pub fn project_deletion_plan(&self, project_id: &str) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        self.ensure_no_project_deletion()?;
        let (_, workspace, workspace_version) = workspace_bytes(self)?;
        let registration = registration(&workspace, project_id)?;
        let root_path = Path::new(&registration.path);
        self.validate_deletion_scope(&workspace, root_path, project_id)?;
        let inventory = tree_removal::inventory(root_path).map_err(tree_error)?;
        let version = snapshot_version(&workspace_version, &inventory)?;
        Ok(json!({
            "project_id": project_id,
            "display_path": root_path.join(".project").to_str().ok_or(AppError::invariant("project deletion display path"))?,
            "version": version,
            "file_count": inventory.file_count,
            "total_bytes": inventory.total_bytes,
        }))
    }

    /// Admit and permanently remove one project's `.project` tree.  The
    /// admission check is intentionally before registration, source and plan
    /// reads so a retry can replay after physical deletion.
    pub fn delete_project(
        &self,
        project_id: &str,
        payload: Value,
        request_id: &str,
        epoch: &str,
        expected: Option<String>,
    ) -> Result<Reply, AppError> {
        self.delete_project_with(project_id, payload, request_id, epoch, expected, |_| Ok(()))
    }

    pub(crate) fn delete_project_with(
        &self,
        project_id: &str,
        payload: Value,
        request_id: &str,
        epoch: &str,
        expected: Option<String>,
        mut checkpoint: impl FnMut(ProjectDeletePoint) -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let command = Command {
            request_id: request_id.into(),
            epoch: epoch.into(),
            method: DELETE_METHOD.into(),
            target: Target {
                project_id: project_id.into(),
                kind: Kind::Project,
                id: project_id.into(),
            },
            expected,
            payload,
        };
        let now = now_millis();
        if let Some(reply) = self.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |reply: Reply| -> Result<Reply, AppError> {
            Ok(self
                .journal
                .record(&command, &reply, None, now, true)?
                .unwrap_or(reply))
        };
        if command.payload != json!({}) {
            return reject(Reply::error(422, "VALIDATION_FAILED", request_id));
        }
        let expected = match command.expected.as_deref() {
            Some(expected) => expected,
            None => return reject(Reply::error(428, "PRECONDITION_REQUIRED", request_id)),
        };
        if self.journal.has_pending("workspace")? || self.journal.has_pending(project_id)? {
            return reject(Reply::error(409, "RECOVERY_REQUIRED", request_id));
        }
        if let Err(error) = self.ensure_no_project_deletion() {
            return self.journal.reject_error(&command, error, now);
        }
        let workflows_pending: bool = self.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM workflow_jobs WHERE state!='done')",
            [],
            |row| row.get(0),
        )?;
        if workflows_pending {
            return reject(Reply::error(
                409,
                "REGISTRATION_RECOVERY_REQUIRED",
                request_id,
            ));
        }
        let (workspace_before, mut workspace, workspace_version) = workspace_bytes(self)?;
        let root_path = match registration(&workspace, project_id) {
            Ok(value) => PathBuf::from(&value.path),
            Err(error) => return self.journal.reject_error(&command, error, now),
        };
        if let Err(error) = self.validate_deletion_scope(&workspace, &root_path, project_id) {
            return self.journal.reject_error(&command, error, now);
        }
        let inventory = match tree_removal::inventory(&root_path) {
            Ok(inventory) => inventory,
            Err(error) => return self.journal.reject_error(&command, tree_error(error), now),
        };
        let plan_version = snapshot_version(&workspace_version, &inventory)?;
        if expected != plan_version {
            return reject(Reply::error(412, "VERSION_CONFLICT", request_id));
        }
        // The exclusive gate drained ordinary readers/writers. Release our
        // cached lease before acquiring the same inode without creating files.
        self.release_store_path(
            root_path
                .to_str()
                .ok_or(AppError::invariant("project path"))?,
        )?;
        let lease = match tree_removal::deletion_lease(&root_path, &inventory, 0) {
            Ok(Some(lease)) => lease,
            Ok(None) => {
                return reject(Reply::error(409, "PROJECT_WRITER_LOCK_MISSING", request_id));
            }
            Err(error) => return self.journal.reject_error(&command, tree_error(error), now),
        };
        match tree_removal::inventory(&root_path) {
            Ok(current) if current == inventory => {}
            Ok(_) => return reject(Reply::error(412, "VERSION_CONFLICT", request_id)),
            Err(error) => return self.journal.reject_error(&command, tree_error(error), now),
        }
        if workspace_bytes(self)?.0 != workspace_before {
            return reject(Reply::error(412, "VERSION_CONFLICT", request_id));
        }
        workspace
            .projects
            .retain(|item| item.project_id != project_id);
        workspace.focus.retain(|item| item.project_id != project_id);
        validate_workspace(json!(workspace))
            .map_err(|_| AppError::reject(422, "WORKSPACE_LIMIT"))?;
        let workspace_after = pretty(&workspace);
        let mut reply = deletion_reply(request_id, project_id);
        let intent = DeletionIntent {
            project_id: project_id.into(),
            root_path: path_text(&root_path)?,
            plan_version,
            workspace_before,
            workspace_after,
            inventory,
            cursor: 0,
            result: reply.body.clone(),
        };
        let before = manifest_bytes(&intent)?;
        let journal_intent = Intent {
            command: command.clone(),
            before: Some(before),
            after: None,
            references: Vec::new(),
            source_root: path_text(&root_path)?,
        };
        if let Some(existing) =
            self.journal
                .record(&command, &reply, Some(&journal_intent), now, false)?
        {
            return Ok(existing);
        }
        let mut intent = intent;
        if let Err(error) = checkpoint(ProjectDeletePoint::Prepared) {
            return review_and_uncertain(self, &command, &error);
        }
        if let Err(error) = tree_removal::validate_remaining(&root_path, &intent.inventory, 0) {
            return review_and_uncertain(self, &command, &error.into());
        }
        for cursor in 0..intent.inventory.entries.len() {
            intent.cursor = cursor;
            match tree_removal::remove_step(Path::new(&intent.root_path), &intent.inventory, cursor)
            {
                Ok(RemovalOutcome::Removed | RemovalOutcome::AlreadyAbsent) => {
                    if let Err(error) = checkpoint(ProjectDeletePoint::EntryRemoved(cursor)) {
                        return review_and_uncertain(self, &command, &error);
                    }
                    intent.cursor = cursor + 1;
                    if let Err(error) = save_cursor(self, &command, &intent) {
                        return review_and_uncertain(self, &command, &error);
                    }
                    if let Err(error) = checkpoint(ProjectDeletePoint::CursorSaved(cursor)) {
                        return review_and_uncertain(self, &command, &error);
                    }
                }
                Err(error) => return review_and_uncertain(self, &command, &error.into()),
            }
        }
        if let Err(error) = finish_workspace_and_command(self, &command, &intent, &mut checkpoint) {
            return review_and_uncertain(self, &command, &error);
        }
        drop(lease);
        if let Err(error) = self.index.forget_project(project_id, now) {
            crate::diagnostics::record_failure(
                "project_deletion_projection",
                &error,
                Some(project_id),
                Some(request_id),
            );
            reply.body["warnings"] = json!([{"code":"PROJECTION_DEGRADED","message":"Project deleted; the search index is being repaired."}]);
            let _ = self.journal.update_result(&command, &reply);
        }
        if let Err(error) = self.repair_completed_projection(project_id, request_id) {
            crate::diagnostics::record_failure(
                "project_deletion_projection_schedule",
                &error,
                Some(project_id),
                Some(request_id),
            );
        }
        Ok(reply)
    }

    /// Resume project deletion intents before startup opens project stores.
    pub(crate) fn recover_project_deletions(&self) -> Result<(), AppError> {
        let _gate = self
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let rows = {
            let db = self.journal.db()?;
            let mut statement = db.prepare(
                "SELECT i.command_json,w.before_bytes,c.state
                 FROM commands c
                 JOIN write_intents w USING(epoch,request_id)
                 JOIN intent_context i USING(epoch,request_id)
                 WHERE w.intent_kind='delete' AND w.resolved=0
                   AND c.target_kind='project'
                   AND json_extract(i.command_json,'$.method')=?1
                 ORDER BY c.received_at,w.step",
            )?;
            statement
                .query_map([DELETE_METHOD], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Vec<u8>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        for (command_json, bytes, state) in rows {
            let command: Command = serde_json::from_str(&command_json)
                .map_err(|source| AppError::stored("project deletion command", source))?;
            if state == CommandState::NeedsReview.as_str() {
                continue;
            }
            let mut intent: DeletionIntent = serde_json::from_slice(&bytes)
                .map_err(|source| AppError::stored("project deletion manifest", source))?;
            if let Err(error) = self.recover_project_deletion(&command, &mut intent) {
                let _ = review_and_uncertain(self, &command, &error)?;
            }
        }
        Ok(())
    }

    fn recover_project_deletion(
        &self,
        command: &Command,
        intent: &mut DeletionIntent,
    ) -> Result<(), AppError> {
        let (actual, _, _) = workspace_bytes(self)?;
        if actual != intent.workspace_before && actual != intent.workspace_after {
            return Err(AppError::reject(409, "WORKSPACE_SOURCE_CHANGED"));
        }
        if intent.project_id != command.target.project_id
            || command.expected.as_deref() != Some(&intent.plan_version)
            || snapshot_version(
                &document::version(&intent.workspace_before),
                &intent.inventory,
            )? != intent.plan_version
        {
            return Err(AppError::invariant("project deletion manifest identity"));
        }
        tree_removal::validate_remaining(
            Path::new(&intent.root_path),
            &intent.inventory,
            intent.cursor,
        )?;
        self.release_store_path(&intent.root_path)?;
        let _lease = tree_removal::deletion_lease(
            Path::new(&intent.root_path),
            &intent.inventory,
            intent.cursor,
        )?;
        while intent.cursor < intent.inventory.entries.len() {
            match tree_removal::remove_step(
                Path::new(&intent.root_path),
                &intent.inventory,
                intent.cursor,
            )? {
                RemovalOutcome::Removed | RemovalOutcome::AlreadyAbsent => {
                    intent.cursor += 1;
                    save_cursor(self, command, intent)?;
                }
            }
        }
        finish_workspace_and_command(self, command, intent, &mut |_| Ok(()))?;
        Ok(())
    }
}

fn finish_workspace_and_command(
    engine: &Engine,
    command: &Command,
    intent: &DeletionIntent,
    checkpoint: &mut impl FnMut(ProjectDeletePoint) -> Result<(), AppError>,
) -> Result<(), AppError> {
    tree_removal::validate_remaining(
        Path::new(&intent.root_path),
        &intent.inventory,
        intent.cursor,
    )?;
    let actual = engine
        .journal
        .directory
        .read("workspace.json")?
        .ok_or(AppError::Unavailable("workspace.json"))?;
    let before_version = document::version(&intent.workspace_before);
    if actual == intent.workspace_before {
        engine.journal.directory.replace(
            "workspace.json",
            &intent.workspace_after,
            Some(&before_version),
        )?;
    } else if actual != intent.workspace_after {
        return Err(AppError::reject(409, "WORKSPACE_SOURCE_CHANGED"));
    } else {
        engine.journal.directory.resync("workspace.json")?;
    }
    checkpoint(ProjectDeletePoint::WorkspaceWritten)?;
    complete_intent(engine, command)?;
    checkpoint(ProjectDeletePoint::Committed)
}
