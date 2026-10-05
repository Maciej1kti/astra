//! Trusted profiles reuse the complete application boundary for separate workspaces.
use crate::{
    AppError, Reply,
    command_state::CommandState,
    engine::Engine,
    journal::{Command, CommandRecord, Journal, Target},
    now_millis,
};
use project_store::{document::Kind, filesystem::Directory};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, RwLock},
};

const MAX_USERS: usize = 32;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// The owner retains existing state and authentication. Each additional profile
/// has its own ordinary engine; selector IDs are organization, not credentials.
pub struct Users {
    pub owner: Arc<Engine>,
    default: UserProfile,
    engines: RwLock<BTreeMap<String, (UserProfile, Arc<Engine>)>>,
    registrations: Mutex<()>,
}

fn valid_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|id_value| {
        id_value.get_version_num() == 4
            && id_value.get_variant() == uuid::Variant::RFC4122
            && id_value.to_string() == id
    })
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name == name.trim()
        && name.chars().count() <= 120
        && !name.chars().any(char::is_control)
}
fn profile(id: String, name: String) -> Result<UserProfile, AppError> {
    if !valid_id(&id) || !valid_name(&name) {
        return Err(AppError::invariant("stored user profile"));
    }
    Ok(UserProfile {
        id,
        name,
        is_default: false,
    })
}
fn directory(owner: &Engine, user: &UserProfile, creating: bool) -> Result<Directory, AppError> {
    let users = owner.journal.directory.child("users", creating)?;
    let directory = users.child(&user.id, creating)?;
    directory.require_private()?;
    if !creating
        && (!directory.exists_regular("state.sqlite")?
            || !directory.exists_regular("workspace.json")?)
    {
        return Err(AppError::Unavailable("registered user state"));
    }
    Ok(directory)
}
fn complete_creation(
    owner: &Engine,
    user: &UserProfile,
    epoch: &str,
    request: &str,
) -> Result<(), AppError> {
    let mut db = owner.journal.db()?;
    let tx = db.transaction()?;
    tx.execute(
        "INSERT INTO user_profiles(id,name) VALUES(?1,?2)",
        params![user.id, user.name],
    )?;
    Journal::set_command_state(&tx, epoch, request, CommandState::Committed)?;
    tx.execute("DELETE FROM user_creation_intents WHERE id=?1", [&user.id])?;
    tx.commit()?;
    Ok(())
}

impl Users {
    /// Recover creation before admission. Published profiles must retain their
    /// existing state; only an explicit pending creation may initialize files.
    pub fn open(mut owner: Engine, after_restore: bool) -> Result<Self, AppError> {
        let id: String = owner.journal.db()?.query_row(
            "SELECT value FROM meta WHERE key='instance_id'",
            [],
            |row| row.get(0),
        )?;
        if !valid_id(&id) {
            return Err(AppError::invariant("default user identity"));
        }
        use rusqlite::OptionalExtension;
        let name: String = owner
            .journal
            .db()?
            .query_row(
                "SELECT value FROM meta WHERE key='default_user_name'",
                [],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(|| "Owner".into());
        if !valid_name(&name) {
            return Err(AppError::invariant("default user name"));
        }
        let default = UserProfile {
            id,
            name,
            is_default: true,
        };
        let mut engines = BTreeMap::new();
        let ready = {
            let db = owner.journal.db()?;
            let mut statement = db.prepare("SELECT id,name FROM user_profiles ORDER BY id")?;
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        let pending = {
            let db = owner.journal.db()?;
            let mut statement = db.prepare(
                "SELECT id,name,epoch,request_id FROM user_creation_intents ORDER BY id",
            )?;
            statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        if ready.len() + pending.len() >= MAX_USERS {
            return Err(AppError::invariant("stored user limit"));
        }
        for (id, name) in ready {
            let user = profile(id, name)?;
            if user.id == default.id {
                return Err(AppError::invariant("duplicate default user"));
            }
            let directory = directory(&owner, &user, false)?;
            let engine = Engine::open_user(directory.path(), &user.id, owner.shared.clone())?;
            engines.insert(user.id.clone(), (user, engine));
        }
        for (id, name, epoch, request) in pending {
            let user = profile(id, name)?;
            if user.id == default.id || engines.contains_key(&user.id) {
                return Err(AppError::invariant("duplicate pending user"));
            }
            let directory = directory(&owner, &user, true)?;
            let engine = Engine::open_user(directory.path(), &user.id, owner.shared.clone())?;
            complete_creation(&owner, &user, &epoch, &request)?;
            engines.insert(user.id.clone(), (user, engine));
        }
        if after_restore {
            for (_, engine) in engines.values_mut() {
                engine.rotate_after_restore(now_millis())?;
            }
            owner.rotate_after_restore(now_millis())?;
        }
        let owner = Arc::new(owner);
        let mut engines: BTreeMap<_, _> = engines
            .into_iter()
            .map(|(id, (profile, engine))| (id, (profile, Arc::new(engine))))
            .collect();
        engines.insert(default.id.clone(), (default.clone(), owner.clone()));
        Ok(Self {
            owner,
            default,
            engines: RwLock::new(engines),
            registrations: Mutex::new(()),
        })
    }
    fn ensure_registration_available(&self, user: &str, path: &str) -> Result<(), AppError> {
        let candidate = std::path::Path::new(path);
        for (id, engine) in self.engines()? {
            if id != user
                && engine.workspace()?.value.projects.iter().any(|project| {
                    let registered = std::path::Path::new(&project.path);
                    candidate.starts_with(registered.join(".project"))
                        || registered.starts_with(candidate.join(".project"))
                })
            {
                return Err(AppError::reject(409, "PROJECT_IN_USE"));
            }
        }
        Ok(())
    }
    pub fn registration_plan(
        &self,
        user: &str,
        path: &str,
        name: Option<&str>,
        private: bool,
    ) -> Result<Value, AppError> {
        let _registration = self
            .registrations
            .lock()
            .map_err(|_| AppError::LockPoisoned("user registrations"))?;
        self.ensure_registration_available(user, path)?;
        self.select(Some(user))?
            .1
            .registration_plan(path, name, private)
    }
    pub fn browser_registration_plan(
        &self,
        user: &str,
        payload: &Value,
    ) -> Result<Value, AppError> {
        let _registration = self
            .registrations
            .lock()
            .map_err(|_| AppError::LockPoisoned("user registrations"))?;
        let engine = self.select(Some(user))?.1;
        crate::wire::validate("RegistrationPlanInput", payload)?;
        let directory = engine.allowed_directory(
            payload["root_id"]
                .as_str()
                .ok_or(AppError::invariant("validated registration root ID"))?,
            payload["relative_path"]
                .as_str()
                .ok_or(AppError::invariant("validated registration relative path"))?,
        )?;
        self.ensure_registration_available(
            user,
            directory
                .path()
                .to_str()
                .ok_or(AppError::invariant("registration path"))?,
        )?;
        engine.browser_registration_plan(payload)
    }
    pub fn commit_registration(
        &self,
        user: &str,
        plan_id: &str,
        request: &str,
        epoch: &str,
    ) -> Result<Reply, AppError> {
        let _registration = self
            .registrations
            .lock()
            .map_err(|_| AppError::LockPoisoned("user registrations"))?;
        let engine = self.select(Some(user))?.1;
        let plan = crate::workflow::Workflows {
            journal: &engine.journal,
        }
        .plan(plan_id)?;
        let command = plan.command(request, epoch);
        let now = now_millis();
        if let Some(reply) = engine.journal.admit(&command, now)? {
            return Ok(reply);
        }
        if let Err(error) =
            self.ensure_registration_available(user, plan.location.destination.as_str())
        {
            return engine.journal.reject_error(&command, error, now);
        }
        engine.commit_registration(plan_id, request, epoch)
    }
    pub fn maintenance_plan(&self, user: &str, payload: &Value) -> Result<Value, AppError> {
        let _registration = self
            .registrations
            .lock()
            .map_err(|_| AppError::LockPoisoned("user registrations"))?;
        let request: crate::maintenance::Maintenance = serde_json::from_value(payload.clone())
            .map_err(|_| AppError::reject(422, "INVALID_MAINTENANCE_INPUT"))?;
        if let crate::maintenance::Maintenance::Relocate {
            new_absolute_path, ..
        } = request
        {
            self.ensure_registration_available(user, &new_absolute_path)?;
        }
        self.select(Some(user))?.1.maintenance_plan(payload)
    }
    pub fn commit_maintenance(
        &self,
        user: &str,
        plan_id: &str,
        request: &str,
        epoch: &str,
    ) -> Result<Reply, AppError> {
        let _registration = self
            .registrations
            .lock()
            .map_err(|_| AppError::LockPoisoned("user registrations"))?;
        let engine = self.select(Some(user))?.1;
        let plan = crate::workflow::Workflows {
            journal: &engine.journal,
        }
        .plan(plan_id)?;
        let command = plan.command(request, epoch);
        let now = now_millis();
        if let Some(reply) = engine.journal.admit(&command, now)? {
            return Ok(reply);
        }
        if plan.kind == crate::workflow_kind::WorkflowKind::Relocate
            && let Err(error) =
                self.ensure_registration_available(user, plan.location.destination.as_str())
        {
            return engine.journal.reject_error(&command, error, now);
        }
        engine.commit_maintenance(plan_id, request, epoch)
    }
    pub fn select(&self, id: Option<&str>) -> Result<(UserProfile, Arc<Engine>), AppError> {
        let id = id.unwrap_or(&self.default.id);
        if !valid_id(id) {
            return Err(AppError::reject(400, "INVALID_USER"));
        }
        self.engines
            .read()
            .map_err(|_| AppError::LockPoisoned("user engines"))?
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::reject(404, "USER_NOT_FOUND"))
    }
    pub fn engines(&self) -> Result<Vec<(String, Arc<Engine>)>, AppError> {
        Ok(self
            .engines
            .read()
            .map_err(|_| AppError::LockPoisoned("user engines"))?
            .iter()
            .map(|(id, (_, engine))| (id.clone(), engine.clone()))
            .collect())
    }
    pub fn list(&self, current: &str) -> Result<Value, AppError> {
        let engines = self
            .engines
            .read()
            .map_err(|_| AppError::LockPoisoned("user engines"))?;
        let mut items = vec![
            engines
                .get(&self.default.id)
                .ok_or(AppError::invariant("default user profile"))?
                .0
                .clone(),
        ];
        items.extend(
            engines
                .values()
                .filter(|(profile, _)| !profile.is_default)
                .map(|(profile, _)| profile.clone()),
        );
        Ok(
            json!({"items":items,"current_user_id":current,"command_epoch":self.owner.command_epoch(),"version":Self::registry_version(&engines)}),
        )
    }
    pub fn create(&self, payload: &Value, request: &str, epoch: &str) -> Result<Reply, AppError> {
        self.create_with(payload, request, epoch, |_| Ok(()))
    }
    fn create_with(
        &self,
        payload: &Value,
        request: &str,
        epoch: &str,
        mut checkpoint: impl FnMut(&str) -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        // The registry serializes profile creation. Child initialization owns
        // the shared workspace gate itself; do not hold it across engine open.
        let mut engines = self
            .engines
            .write()
            .map_err(|_| AppError::LockPoisoned("user engines"))?;
        let command = Command {
            request_id: request.into(),
            epoch: epoch.into(),
            method: "POST:users".into(),
            target: Target {
                project_id: "users".into(),
                kind: Kind::Project,
                id: payload["id"].as_str().unwrap_or("").into(),
            },
            expected: None,
            payload: payload.clone(),
        };
        let now = now_millis();
        if let Some(reply) = self.owner.journal.admit(&command, now)? {
            if reply.http_status != 202 {
                return Ok(reply);
            }
            // A transient initialization failure can be resumed with the exact
            // original command; admission has already checked its digest.
            let pending = {
                let db = self.owner.journal.db()?;
                use rusqlite::OptionalExtension;
                db.query_row(
                    "SELECT id,name FROM user_creation_intents WHERE epoch=?1 AND request_id=?2",
                    [epoch, request],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
            };
            if let Some((id, name)) = pending {
                let user = profile(id, name)?;
                let directory = directory(&self.owner, &user, true)?;
                let engine =
                    Engine::open_user(directory.path(), &user.id, self.owner.shared.clone())?;
                complete_creation(&self.owner, &user, epoch, request)?;
                engines.insert(user.id.clone(), (user, Arc::new(engine)));
                return self
                    .owner
                    .journal
                    .admit(&command, now)?
                    .ok_or(AppError::invariant("completed user command"));
            }
            return Ok(reply);
        }
        let reject = |status, code| {
            self.owner
                .journal
                .reject_error(&command, AppError::reject(status, code), now)
        };
        if payload.as_object().is_none_or(|fields| fields.len() != 2)
            || !payload["id"].as_str().is_some_and(valid_id)
            || !payload["name"].as_str().is_some_and(valid_name)
        {
            return reject(422, "VALIDATION_FAILED");
        }
        let user = profile(
            payload["id"]
                .as_str()
                .ok_or(AppError::invariant("validated user ID"))?
                .into(),
            payload["name"]
                .as_str()
                .ok_or(AppError::invariant("validated user name"))?
                .into(),
        )?;
        let existing: bool = self.owner.journal.db()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM user_creation_intents WHERE id=?1)",
            [&user.id],
            |row| row.get(0),
        )?;
        if engines.contains_key(&user.id) || existing {
            return reject(409, "USER_ALREADY_EXISTS");
        }
        let pending: u32 = self.owner.journal.db()?.query_row(
            "SELECT count(*) FROM user_creation_intents",
            [],
            |row| row.get(0),
        )?;
        if engines.len() + pending as usize >= MAX_USERS {
            return reject(409, "USER_LIMIT_REACHED");
        }
        let reply = Reply {
            http_status: 201,
            body: json!({"api_version":"1","request_id":request,"status":"committed","result":{"type":"user","id":user.id,"resource":user},"warnings":[],"replayed":false}),
        };
        {
            let mut db = self.owner.journal.db()?;
            if let Some(reply) = Journal::known(&db, &command)? {
                return Ok(reply);
            }
            let tx = db.transaction()?;
            Journal::insert_command(
                &tx,
                CommandRecord {
                    command: &command,
                    state: CommandState::Prepared,
                    target_kind: "user",
                    reply: &reply,
                    received_at: now,
                },
            )?;
            tx.execute(
                "INSERT INTO user_creation_intents(id,name,epoch,request_id) VALUES(?1,?2,?3,?4)",
                params![user.id, user.name, epoch, request],
            )?;
            tx.commit()?;
        }
        checkpoint("prepared")?;
        let directory = directory(&self.owner, &user, true)?;
        let engine = Engine::open_user(directory.path(), &user.id, self.owner.shared.clone())?;
        checkpoint("initialized")?;
        complete_creation(&self.owner, &user, epoch, request)?;
        engines.insert(user.id.clone(), (user, Arc::new(engine)));
        checkpoint("committed")?;
        Ok(reply)
    }
}

mod rename;
#[cfg(test)]
mod tests;
