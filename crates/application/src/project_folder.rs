//! New project folders. The browser names a project; the server derives the
//! folder name, creates it in the profile's default approved root and plans
//! its registration. The browser never supplies a path.
use crate::{AppError, engine::Engine, users::Users};
use project_store::filesystem::Directory;
use serde_json::{Value, json};

/// Suffixes tried after the plain name: `name-2` … `name-50`.
const LAST_SUFFIX: u32 = 50;
const NAME_LIMIT: usize = 50;

/// A folder name for a project name: lowercase ASCII letters, digits and single
/// hyphens. It is also a valid repository name.
pub fn folder_name(project: &str) -> String {
    let mut name = String::new();
    for character in project.chars().flat_map(char::to_lowercase) {
        let folded = match character {
            'ą' => 'a',
            'ć' => 'c',
            'ę' => 'e',
            'ł' => 'l',
            'ń' => 'n',
            'ó' => 'o',
            'ś' => 's',
            'ź' | 'ż' => 'z',
            other => other,
        };
        if folded.is_ascii_alphanumeric() {
            name.push(folded);
        } else if !name.is_empty() && !name.ends_with('-') {
            name.push('-');
        }
        if name.len() == NAME_LIMIT {
            break;
        }
    }
    let name = name.trim_end_matches('-');
    if name.is_empty() {
        "projekt".into()
    } else {
        name.into()
    }
}

impl Engine {
    /// The approved root new project folders are created in: the profile's
    /// preference, or the only approved root when none is selected.
    pub fn project_root(&self) -> Result<(String, Directory), AppError> {
        let roots = self.roots()?;
        let roots = roots["items"]
            .as_array()
            .ok_or(AppError::invariant("approved root list"))?;
        let id = match self.workspace()?.value.preferences.project_root_id {
            Some(id) => {
                if !roots.iter().any(|root| root["id"] == id.as_str()) {
                    return Err(AppError::reject(409, "PROJECT_ROOT_NOT_FOUND"));
                }
                id
            }
            None => match roots.as_slice() {
                [only] => only["id"]
                    .as_str()
                    .ok_or(AppError::invariant("approved root ID"))?
                    .to_owned(),
                _ => return Err(AppError::reject(409, "PROJECT_ROOT_NOT_SET")),
            },
        };
        let directory = self.allowed_directory(&id, "")?;
        Ok((id, directory))
    }

    /// Create one empty folder in an existing directory below an approved
    /// root. Nothing is registered.
    pub fn create_directory(&self, root_id: &str, input: &Value) -> Result<Value, AppError> {
        crate::wire::validate("DirectoryInput", input)?;
        let (Some(relative), Some(name)) =
            (input["relative_path"].as_str(), input["name"].as_str())
        else {
            return Err(AppError::invariant("validated directory input"));
        };
        let name = name.trim_end();
        if name.is_empty() {
            return Err(AppError::reject(422, "VALIDATION_FAILED"));
        }
        let parent = self.allowed_directory(root_id, relative)?;
        parent.verify()?;
        match std::fs::create_dir(parent.path().join(name)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Err(AppError::reject(409, "DIRECTORY_EXISTS"));
            }
            Err(error) => return Err(project_store::StoreError::Io(error).into()),
        }
        parent.sync()?;
        let relative_path = if relative.is_empty() || relative == "." {
            name.to_owned()
        } else {
            format!("{relative}/{name}")
        };
        // Reopening through the root proves the new entry is a plain directory there.
        self.allowed_directory(root_id, &relative_path)?;
        Ok(json!({"name": name, "relative_path": relative_path, "registered": false}))
    }
}

impl Users {
    /// Create a folder for a new project and plan its registration with
    /// tracked planning data. `destination` is an existing directory below an
    /// approved root; without it the profile's default root is used. `taken`
    /// reports names that are unavailable elsewhere, such as an existing
    /// remote repository.
    pub fn create_project_folder(
        &self,
        user: &str,
        name: &str,
        destination: Option<(&str, &str)>,
        taken: &dyn Fn(&str) -> bool,
    ) -> Result<(String, Value), AppError> {
        let name = name.trim();
        let engine = self.select(Some(user))?.1;
        let (root_id, root, parent) = match destination {
            Some((root_id, relative)) => (
                root_id.to_owned(),
                engine.allowed_directory(root_id, relative)?,
                relative.trim_matches('/').to_owned(),
            ),
            None => {
                let (root_id, root) = engine.project_root()?;
                (root_id, root, String::new())
            }
        };
        let base = folder_name(name);
        for suffix in 1..=LAST_SUFFIX {
            let folder = if suffix == 1 {
                base.clone()
            } else {
                format!("{base}-{suffix}")
            };
            if taken(&folder) {
                continue;
            }
            // Creation is the availability check: it fails for any existing
            // entry, and on a case-insensitive volume for another spelling.
            let path = root.path().join(&folder);
            root.verify()?;
            match std::fs::create_dir(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(project_store::StoreError::Io(error).into()),
            }
            root.sync()?;
            let plan = self.browser_registration_plan(
                user,
                &json!({
                    "root_id": root_id,
                    "relative_path": if parent.is_empty() || parent == "." {
                        folder.clone()
                    } else {
                        format!("{parent}/{folder}")
                    },
                    "name": name,
                    "git_mode": "tracked",
                }),
            );
            return match plan {
                Ok(plan) => Ok((folder, plan)),
                Err(error) => {
                    // Only the empty folder made above can be removed this way.
                    let _ = std::fs::remove_dir(&path);
                    Err(error)
                }
            };
        }
        Err(AppError::reject(409, "PROJECT_FOLDER_NAME_EXHAUSTED"))
    }
}

#[cfg(test)]
mod tests {
    use super::folder_name;

    #[test]
    fn folder_names_are_lowercase_ascii_with_single_hyphens() {
        for (project, folder) in [
            ("Astra", "astra"),
            ("Żółta Łódź  Gęślą", "zolta-lodz-gesla"),
            ("  Remont: kuchnia / 2026 ", "remont-kuchnia-2026"),
            ("a_b.c", "a-b-c"),
            ("---", "projekt"),
            ("日本", "projekt"),
            ("../../etc", "etc"),
        ] {
            assert_eq!(folder_name(project), folder, "{project}");
        }
        let long = folder_name(&"ab ".repeat(40));
        assert!(long.len() <= 50 && !long.ends_with('-'), "{long}");
    }
}
