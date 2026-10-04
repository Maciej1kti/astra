//! Conditional profile names and command outcomes commit in one SQLite transaction.
use super::*;
use crate::source::pretty;
use project_store::document::version;

impl Users {
    /// Hash only the registry, independent of the caller and workspace epochs.
    pub(super) fn registry_version(
        engines: &BTreeMap<String, (UserProfile, Arc<Engine>)>,
    ) -> String {
        let profiles: Vec<_> = engines.values().map(|(profile, _)| profile).collect();
        version(&pretty(&profiles))
    }

    pub fn rename(
        &self,
        id: &str,
        payload: &Value,
        request: &str,
        epoch: &str,
        expected: Option<&str>,
    ) -> Result<Reply, AppError> {
        self.rename_with(id, payload, request, epoch, expected, |_| Ok(()))
    }

    fn rename_with(
        &self,
        id: &str,
        payload: &Value,
        request: &str,
        epoch: &str,
        expected: Option<&str>,
        mut checkpoint: impl FnMut(&str) -> Result<(), AppError>,
    ) -> Result<Reply, AppError> {
        let mut engines = self
            .engines
            .write()
            .map_err(|_| AppError::LockPoisoned("user engines"))?;
        let _gate = self
            .owner
            .gate
            .write()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let command = Command {
            request_id: request.into(),
            epoch: epoch.into(),
            method: "PATCH:users".into(),
            target: Target {
                project_id: "users".into(),
                kind: Kind::Project,
                id: id.into(),
            },
            expected: expected.map(str::to_owned),
            payload: payload.clone(),
        };
        let now = now_millis();
        if let Some(reply) = self.owner.journal.admit(&command, now)? {
            return Ok(reply);
        }
        let reject = |status, code| {
            self.owner
                .journal
                .reject_error(&command, AppError::reject(status, code), now)
        };
        if expected.is_none() {
            return reject(428, "PRECONDITION_REQUIRED");
        }
        if !valid_id(id) {
            return reject(400, "INVALID_USER");
        }
        if payload.as_object().is_none_or(|fields| fields.len() != 1)
            || !payload["name"].as_str().is_some_and(valid_name)
        {
            return reject(422, "VALIDATION_FAILED");
        }
        let Some((current, _)) = engines.get(id) else {
            return reject(404, "USER_NOT_FOUND");
        };
        if expected != Some(Self::registry_version(&engines).as_str()) {
            return reject(412, "VERSION_CONFLICT");
        }
        let name = payload["name"].as_str().unwrap();
        let changed = current.name != name;
        let mut renamed = engines.clone();
        let profile = &mut renamed.get_mut(id).unwrap().0;
        profile.name = name.into();
        let profile = profile.clone();
        let registry_version = Self::registry_version(&renamed);
        let reply = Reply {
            http_status: 200,
            body: json!({
                "api_version":"1", "request_id":request,
                "status":if changed { "committed" } else { "noop" },
                "result":{"type":"user", "id":id, "version":registry_version,
                    "resource":profile},
                "warnings":[], "replayed":false,
            }),
        };
        {
            let mut db = self.owner.journal.db()?;
            let tx = db.transaction()?;
            if changed {
                if profile.is_default {
                    tx.execute(
                        "INSERT INTO meta(key,value) VALUES('default_user_name',?1)
                         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        [name],
                    )?;
                } else if tx.execute(
                    "UPDATE user_profiles SET name=?1 WHERE id=?2",
                    params![name, id],
                )? != 1
                {
                    return Err(AppError::invariant("renamed user registry row"));
                }
            }
            Journal::insert_command(
                &tx,
                CommandRecord {
                    command: &command,
                    state: CommandState::Committed,
                    target_kind: "user",
                    reply: &reply,
                    received_at: now,
                },
            )?;
            checkpoint("before_commit")?;
            tx.commit()?;
        }
        *engines = renamed;
        checkpoint("committed")?;
        Ok(reply)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn setup() -> (tempfile::TempDir, Users) {
        let temporary = tempfile::tempdir().unwrap();
        let root = Directory::open(&temporary.path().canonicalize().unwrap()).unwrap();
        let state = root.child("state", true).unwrap();
        let users = Users::open(Engine::open(state.path()).unwrap(), false).unwrap();
        (temporary, users)
    }

    fn version(users: &Users) -> String {
        Users::registry_version(&users.engines.read().unwrap())
    }

    #[test]
    fn rename_requires_observed_registry_and_keeps_retries_immutable() {
        let (_temporary, users) = setup();
        let (owner, _) = users.select(None).unwrap();
        let original = version(&users);
        let request = Uuid::now_v7().to_string();
        let payload = json!({"name":"Maciek"});
        let reply = users
            .rename(
                &owner.id,
                &payload,
                &request,
                users.owner.command_epoch(),
                Some(&original),
            )
            .unwrap();
        assert_eq!(reply.http_status, 200);
        assert_eq!(reply.body["result"]["resource"]["name"], "Maciek");
        assert_eq!(users.select(None).unwrap().0.name, "Maciek");
        assert_ne!(version(&users), original);
        assert_eq!(reply.body["result"]["version"], version(&users));
        let replay = users
            .rename(
                &owner.id,
                &payload,
                &request,
                users.owner.command_epoch(),
                Some(&original),
            )
            .unwrap();
        assert_eq!(replay.body["replayed"], true);
        assert_eq!(reply.body["result"], replay.body["result"]);
        let changed = users
            .rename(
                &owner.id,
                &json!({"name":"Other"}),
                &request,
                users.owner.command_epoch(),
                Some(&original),
            )
            .unwrap();
        assert_eq!(changed.body["error"]["code"], "IDEMPOTENCY_KEY_REUSED");
        let stale = users
            .rename(
                &owner.id,
                &json!({"name":"Stale"}),
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch(),
                Some(&original),
            )
            .unwrap();
        assert_eq!(stale.http_status, 412);
        assert_eq!(users.select(None).unwrap().0.name, "Maciek");
        let absent = users
            .rename(
                &owner.id,
                &payload,
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch(),
                None,
            )
            .unwrap();
        assert_eq!(absent.http_status, 428);
    }

    #[test]
    fn registry_version_includes_other_profiles_and_names_survive_restart() {
        let (temporary, users) = setup();
        let (owner, _) = users.select(None).unwrap();
        let owner_epoch = users.owner.command_epoch().to_owned();
        let original = version(&users);
        let second = Uuid::new_v4().to_string();
        users
            .create(
                &json!({"id":second,"name":"Second"}),
                &Uuid::now_v7().to_string(),
                &owner_epoch,
            )
            .unwrap();
        assert_ne!(version(&users), original);
        for (id, name) in [(&owner.id, "Maciek"), (&second, "Tomek")] {
            let reply = users
                .rename(
                    id,
                    &json!({"name":name}),
                    &Uuid::now_v7().to_string(),
                    &owner_epoch,
                    Some(&version(&users)),
                )
                .unwrap();
            assert_eq!(reply.http_status, 200);
        }
        let renamed = version(&users);
        assert_eq!(users.list(&owner.id).unwrap()["version"], renamed);
        assert_eq!(users.list(&second).unwrap()["version"], renamed);
        drop(users);
        let users = Users::open(
            Engine::open_for_service(&temporary.path().canonicalize().unwrap().join("state"))
                .unwrap(),
            false,
        )
        .unwrap();
        assert_eq!(users.select(None).unwrap().0.name, "Maciek");
        assert_eq!(users.select(Some(&second)).unwrap().0.name, "Tomek");
        assert_eq!(users.list(&owner.id).unwrap()["items"][0]["name"], "Maciek");
        assert_eq!(version(&users), renamed);
        assert_eq!(users.owner.command_epoch(), owner_epoch);
    }

    #[test]
    fn equal_name_is_noop_and_invalid_names_preserve_registry() {
        let (_temporary, users) = setup();
        let id = users.select(None).unwrap().0.id;
        let original = version(&users);
        for payload in [
            json!({"name":""}),
            json!({"name":" Space"}),
            json!({"name":"Bad\nname"}),
            json!({"name":"x".repeat(121)}),
            json!({"name":"Fine","extra":true}),
        ] {
            let reply = users
                .rename(
                    &id,
                    &payload,
                    &Uuid::now_v7().to_string(),
                    users.owner.command_epoch(),
                    Some(&original),
                )
                .unwrap();
            assert_eq!(reply.http_status, 422);
            assert_eq!(version(&users), original);
        }
        let reply = users
            .rename(
                &id,
                &json!({"name":"Owner"}),
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch(),
                Some(&original),
            )
            .unwrap();
        assert_eq!(reply.body["status"], "noop");
        assert_eq!(version(&users), original);
    }

    #[test]
    fn profile_rename_fault_child() {
        let Ok(data) = std::env::var("ASTRA_RENAME_FAULT_DATA") else {
            return;
        };
        let point = std::env::var("ASTRA_RENAME_FAULT_POINT").unwrap();
        let request = std::env::var("ASTRA_RENAME_FAULT_REQUEST").unwrap();
        let users = Users::open(
            Engine::open_for_service(std::path::Path::new(&data)).unwrap(),
            false,
        )
        .unwrap();
        let id = users.select(None).unwrap().0.id;
        users
            .rename_with(
                &id,
                &json!({"name":"Maciek"}),
                &request,
                users.owner.command_epoch(),
                Some(&version(&users)),
                |current| {
                    if current == point {
                        std::process::exit(91);
                    }
                    Ok(())
                },
            )
            .unwrap();
        panic!("fault point was not reached");
    }

    #[test]
    fn rename_and_command_outcome_are_atomic_across_process_exit() {
        for point in ["before_commit", "committed"] {
            let (temporary, users) = setup();
            let id = users.select(None).unwrap().0.id;
            let epoch = users.owner.command_epoch().to_owned();
            let original = version(&users);
            drop(users);
            let data = temporary.path().canonicalize().unwrap().join("state");
            let request = Uuid::now_v7().to_string();
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "users::rename::tests::profile_rename_fault_child",
                    "--nocapture",
                ])
                .env("ASTRA_RENAME_FAULT_DATA", &data)
                .env("ASTRA_RENAME_FAULT_POINT", point)
                .env("ASTRA_RENAME_FAULT_REQUEST", &request)
                .output()
                .unwrap();
            assert_eq!(
                output.status.code(),
                Some(91),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            let users = Users::open(Engine::open_for_service(&data).unwrap(), false).unwrap();
            assert_eq!(
                users.select(None).unwrap().0.name,
                if point == "committed" {
                    "Maciek"
                } else {
                    "Owner"
                }
            );
            let reply = users
                .rename(
                    &id,
                    &json!({"name":"Maciek"}),
                    &request,
                    &epoch,
                    Some(&original),
                )
                .unwrap();
            assert_eq!(reply.http_status, 200);
            assert_eq!(reply.body["replayed"], point == "committed");
            assert_eq!(users.select(None).unwrap().0.name, "Maciek");
        }
    }
}
