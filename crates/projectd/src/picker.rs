//! Explicit host-native folder selection. Selection prepares a plan, never writes project files.
use project_application::{AppError, users::Users, wire};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use uuid::Uuid;
#[cfg(target_os = "linux")]
mod portal;
#[derive(Default)]
pub(crate) struct Picker {
    jobs: Mutex<HashMap<String, Job>>,
}
struct Job {
    owner: String,
    input: Value,
    result: Value,
    created: Instant,
}
impl Picker {
    pub fn start(
        self: &Arc<Self>,
        users: Arc<Users>,
        user: &str,
        owner: &str,
        input: &Value,
    ) -> Result<Value, AppError> {
        self.start_with(users, user, owner, input, choose_folder)
    }
    fn start_with(
        self: &Arc<Self>,
        users: Arc<Users>,
        user: &str,
        owner: &str,
        input: &Value,
        choose: impl FnOnce() -> Result<Option<String>, &'static str> + Send + 'static,
    ) -> Result<Value, AppError> {
        wire::validate("NativeFolderInput", input)?;
        let id = input["selection_id"]
            .as_str()
            .ok_or(AppError::invariant("validated folder selection ID"))?
            .to_owned();
        let mut jobs = self
            .jobs
            .lock()
            .map_err(|_| AppError::LockPoisoned("native picker jobs"))?;
        jobs.retain(|_, job| job.created.elapsed() < Duration::from_secs(600));
        if let Some(job) = jobs.get(&id) {
            if job.owner != owner || job.input != *input {
                return Err(AppError::reject(409, "SELECTION_ID_REUSED"));
            }
            return Ok(job.result.clone());
        }
        if jobs.values().any(|job| job.result["state"] == "pending") {
            return Err(AppError::reject(409, "FOLDER_PICKER_BUSY"));
        }
        if jobs.len() >= 16 {
            return Err(AppError::reject(429, "FOLDER_PICKER_LIMIT"));
        }
        let result = json!({"selection_id":id,"state":"pending","plan":null,"error":null});
        jobs.insert(
            id.clone(),
            Job {
                owner: owner.into(),
                input: input.clone(),
                result: result.clone(),
                created: Instant::now(),
            },
        );
        drop(jobs);
        let picker = self.clone();
        let input = input.clone();
        let user = user.to_owned();
        let spawned = std::thread::Builder::new()
            .name("folder-picker".into())
            .spawn(move || {
                let outcome = match choose() {
                    Ok(Some(path)) => users
                        .registration_plan(
                            &user,
                            &path,
                            input["name"].as_str(),
                            input["git_mode"] != "tracked",
                        )
                        .map(Some),
                    Ok(None) => Ok(None),
                    Err(code) => Err(AppError::reject(503, code)),
                };
                let (state, plan, error) = match outcome {
                    Ok(Some(plan)) => ("selected", plan, Value::Null),
                    Ok(None) => ("cancelled", Value::Null, Value::Null),
                    Err(AppError::Rejected(reply)) => {
                        ("failed", Value::Null, reply.body["error"]["code"].clone())
                    }
                    Err(_) => ("failed", Value::Null, json!("FOLDER_UNAVAILABLE")),
                };
                if let Ok(mut jobs) = picker.jobs.lock()
                    && let Some(job) = jobs.get_mut(&id)
                {
                    job.result = json!({"selection_id":id,"state":state,"plan":plan,"error":error});
                }
            });
        if spawned.is_err() {
            self.jobs
                .lock()
                .map_err(|_| AppError::LockPoisoned("native picker jobs"))?
                .remove(
                    result["selection_id"]
                        .as_str()
                        .ok_or(AppError::invariant("folder selection result ID"))?,
                );
            return Err(AppError::reject(503, "FOLDER_PICKER_UNAVAILABLE"));
        }
        Ok(result)
    }
    pub fn get(&self, owner: &str, id: &str) -> Result<Value, AppError> {
        Uuid::parse_str(id).map_err(|_| AppError::reject(400, "INVALID_SELECTION_ID"))?;
        let jobs = self
            .jobs
            .lock()
            .map_err(|_| AppError::LockPoisoned("native picker jobs"))?;
        let job = jobs
            .get(id)
            .filter(|j| j.owner == owner && j.created.elapsed() < Duration::from_secs(600))
            .ok_or_else(|| AppError::reject(404, "SELECTION_NOT_FOUND"))?;
        Ok(job.result.clone())
    }
}
fn choose_folder() -> Result<Option<String>, &'static str> {
    #[cfg(target_os = "linux")]
    match portal::choose(Duration::from_secs(120)) {
        Err("NATIVE_FOLDER_PICKER_UNAVAILABLE") if Path::new("/usr/bin/zenity").is_file() => {}
        result => return result,
    }
    let mut command;
    if cfg!(target_os = "macos") {
        command = Command::new("/usr/bin/osascript");
        command.args(["-e", "try\nactivate\nreturn POSIX path of (choose folder with prompt \"Choose a project folder for Local Projects\")\non error number -128\nreturn \"\"\nend try"]);
    } else if Path::new("/usr/bin/zenity").is_file() {
        command = Command::new("/usr/bin/zenity");
        command.args([
            "--file-selection",
            "--directory",
            "--title=Choose a project folder for Local Projects",
        ]);
    } else {
        return Err("NATIVE_FOLDER_PICKER_UNAVAILABLE");
    }
    let mut child = command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| "NATIVE_FOLDER_PICKER_UNAVAILABLE")?;
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return if status.code() == Some(1) && !cfg!(target_os = "macos") {
                        Ok(None)
                    } else {
                        Err("NATIVE_FOLDER_PICKER_FAILED")
                    };
                }
                let mut bytes = Vec::new();
                child
                    .stdout
                    .take()
                    .ok_or("NATIVE_FOLDER_PICKER_FAILED")?
                    .take(4098)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "NATIVE_FOLDER_PICKER_FAILED")?;
                if bytes.len() > 4096 {
                    return Err("FOLDER_PATH_TOO_LONG");
                }
                let text = String::from_utf8(bytes).map_err(|_| "INVALID_FOLDER_PATH")?;
                let text = text.strip_suffix('\n').unwrap_or(&text);
                if text.is_empty() {
                    return Ok(None);
                }
                let path = Path::new(text)
                    .canonicalize()
                    .map_err(|_| "FOLDER_UNAVAILABLE")?;
                return path
                    .to_str()
                    .map(|p| Some(p.to_owned()))
                    .ok_or("INVALID_FOLDER_PATH");
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("NATIVE_FOLDER_PICKER_TIMEOUT");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use project_application::engine::Engine;
    fn wait(picker: &Picker, id: &str) -> Value {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let value = picker.get("owner", id).unwrap();
            if value["state"] != "pending" {
                wire::validate("NativeFolderSelection", &value).unwrap();
                return value;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    #[test]
    fn native_selection_is_session_bound_and_only_prepares_a_plan() {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let folder = root.child("Chosen repo", true).unwrap();
        let users = Arc::new(Users::open(Engine::open(state.path()).unwrap(), false).unwrap());
        let (profile, engine) = users.select(None).unwrap();
        let user = profile.id;
        let picker = Arc::new(Picker::default());
        let id = Uuid::new_v4().to_string();
        let input = json!({"selection_id":id,"git_mode":"private","name":"Chosen repo"});
        let path = folder.path().to_str().unwrap().to_owned();
        let pending = picker
            .start_with(users.clone(), &user, "owner", &input, move || {
                Ok(Some(path))
            })
            .unwrap();
        wire::validate("NativeFolderSelection", &pending).unwrap();
        let selected = wait(&picker, &id);
        assert_eq!(selected["state"], "selected");
        assert!(!folder.path().join(".project").exists());
        assert!(picker.get("other", &id).is_err());
        assert_eq!(
            picker
                .start_with(users.clone(), &user, "owner", &input, || panic!(
                    "replay cannot open another dialog"
                ))
                .unwrap(),
            selected
        );
        let reply = engine
            .commit_registration(
                selected["plan"]["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                engine.command_epoch(),
            )
            .unwrap();
        assert_eq!(reply.http_status, 202);
        assert!(folder.path().join(".project/project.json").is_file());
        let cancelled_id = Uuid::new_v4().to_string();
        picker
            .start_with(
                users.clone(),
                &user,
                "owner",
                &json!({"selection_id":cancelled_id,"git_mode":"private"}),
                || Ok(None),
            )
            .unwrap();
        assert_eq!(wait(&picker, &cancelled_id)["state"], "cancelled");
        let failed_id = Uuid::new_v4().to_string();
        picker
            .start_with(
                users,
                &user,
                "owner",
                &json!({"selection_id":failed_id,"git_mode":"private"}),
                || Err("NATIVE_FOLDER_PICKER_UNAVAILABLE"),
            )
            .unwrap();
        assert_eq!(wait(&picker, &failed_id)["state"], "failed");
    }
    #[test]
    fn native_selection_retains_profile_owner_and_prepares_shared_folder() {
        let temp = tempfile::tempdir().unwrap();
        let root = project_store::filesystem::Directory::open(&temp.path().canonicalize().unwrap())
            .unwrap();
        let state = root.child("state", true).unwrap();
        let folder = root.child("Registered", true).unwrap();
        let users = Arc::new(Users::open(Engine::open(state.path()).unwrap(), false).unwrap());
        let first = users.select(None).unwrap().0.id;
        let second = Uuid::new_v4().to_string();
        users
            .create(
                &json!({"id":second,"name":"Second"}),
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch(),
            )
            .unwrap();
        let plan = users
            .registration_plan(&first, folder.path().to_str().unwrap(), None, true)
            .unwrap();
        users
            .commit_registration(
                &first,
                plan["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                users.owner.command_epoch(),
            )
            .unwrap();
        let picker = Arc::new(Picker::default());
        let id = Uuid::new_v4().to_string();
        let owner = format!("{second}:same-session");
        let path = folder.path().to_str().unwrap().to_owned();
        let input = json!({"selection_id":id,"git_mode":"private"});
        picker
            .start_with(users.clone(), &second, &owner, &input, move || {
                Ok(Some(path))
            })
            .unwrap();
        assert!(picker.get(&format!("{first}:same-session"), &id).is_err());
        assert!(
            picker
                .start_with(
                    users,
                    &first,
                    &format!("{first}:same-session"),
                    &input,
                    || panic!("another profile cannot reuse this selection")
                )
                .is_err()
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let value = picker.get(&owner, &id).unwrap();
            if value["state"] != "pending" {
                assert_eq!(value["state"], "selected");
                assert_eq!(value["plan"]["project_id"], plan["project_id"]);
                break;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
