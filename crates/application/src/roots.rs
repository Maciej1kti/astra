//! Owner-managed directory capabilities. Browsers receive access only below these roots.
use crate::{
    AppError,
    engine::{Engine, pretty},
    wire,
};
use project_store::{document::version, filesystem::Directory};
use serde_json::{Value, json};
use std::path::Path;
use uuid::Uuid;
impl Engine {
    fn root_records(&self) -> Result<(Vec<Value>, Option<String>), AppError> {
        match self.journal.directory.read("roots.json")? {
            None => Ok((vec![], None)),
            Some(bytes) => {
                let items: Vec<Value> =
                    serde_json::from_slice(&bytes).map_err(|_| AppError::State)?;
                Ok((items, Some(version(&bytes))))
            }
        }
    }
    pub fn roots(&self) -> Result<Value, AppError> {
        let (items, _) = self.root_records()?;
        Ok(json!({"items":items.iter().map(root_view).collect::<Vec<_>>()}))
    }
    pub fn add_root(&self, path: &str, label: &str) -> Result<Value, AppError> {
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let directory = Directory::open(Path::new(path))?;
        let identity = directory.identity()?;
        let (mut items, expected) = self.root_records()?;
        if items.len() >= 100 {
            return Err(AppError::reject(409, "ROOT_LIMIT_REACHED"));
        }
        if items
            .iter()
            .any(|item| item["display_path"] == path || item["identity"] == json!(identity))
        {
            return Err(AppError::reject(409, "ROOT_ALREADY_EXISTS"));
        }
        let mut value = json!({"id":Uuid::new_v4().to_string(),"label":label,"display_path":path});
        wire::validate("Root", &value)?;
        value["identity"] = json!(identity);
        items.push(value.clone());
        self.journal.directory.replace(
            "roots.json",
            &pretty(&json!(items)),
            expected.as_deref(),
        )?;
        Ok(root_view(&value))
    }
    pub fn remove_root(&self, id: &str) -> Result<Value, AppError> {
        let _gate = self.gate.write().map_err(|_| AppError::State)?;
        let (mut items, expected) = self.root_records()?;
        let old = items.len();
        items.retain(|item| item["id"] != id);
        if items.len() != old {
            self.journal.directory.replace(
                "roots.json",
                &pretty(&json!(items)),
                expected.as_deref(),
            )?;
        }
        Ok(json!({"removed":items.len()!=old}))
    }
    fn allowed_directory(&self, id: &str, relative: &str) -> Result<Directory, AppError> {
        let (items, _) = self.root_records()?;
        let root = items
            .iter()
            .find(|item| item["id"] == id)
            .ok_or_else(|| AppError::reject(404, "ROOT_NOT_FOUND"))?;
        let mut directory = Directory::open(Path::new(
            root["display_path"].as_str().ok_or(AppError::State)?,
        ))?;
        if json!(directory.identity()?) != root["identity"] {
            return Err(AppError::reject(409, "ROOT_CHANGED"));
        }
        if relative.len() > 4096 || relative.starts_with('/') || relative.contains('\\') {
            return Err(AppError::reject(400, "INVALID_RELATIVE_PATH"));
        }
        if !relative.is_empty() && relative != "." {
            for part in relative.split('/') {
                if part.is_empty() || matches!(part, "." | "..") {
                    return Err(AppError::reject(400, "INVALID_RELATIVE_PATH"));
                }
                directory = directory.child(part, false)?;
            }
        }
        Ok(directory)
    }
    pub fn browse_root(
        &self,
        id: &str,
        relative: &str,
        cursor: Option<&str>,
    ) -> Result<Value, AppError> {
        let directory = self.allowed_directory(id, relative)?;
        let workspace = self.workspace()?.0;
        let mut names = directory.names()?;
        names.sort();
        let mut items = Vec::new();
        let mut more = false;
        for name in names {
            if name.starts_with('.') || cursor.is_some_and(|cursor| name.as_str() <= cursor) {
                continue;
            }
            if let Ok(child) = directory.child(&name, false) {
                if items.len() == 200 {
                    more = true;
                    break;
                }
                let relative_path = if relative.is_empty() || relative == "." {
                    name.clone()
                } else {
                    format!("{relative}/{name}")
                };
                let registered = workspace["projects"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|p| p["path"].as_str() == child.path().to_str());
                items.push(
                    json!({"name":name,"relative_path":relative_path,"registered":registered}),
                );
            }
        }
        let next = if more {
            items.last().map(|i| i["name"].clone())
        } else {
            None
        };
        Ok(json!({"root_id":id,"relative_path":relative,"items":items,"next_cursor":next}))
    }
    pub fn browser_registration_plan(&self, input: &Value) -> Result<Value, AppError> {
        wire::validate("RegistrationPlanInput", input)?;
        let directory = self.allowed_directory(
            input["root_id"].as_str().unwrap(),
            input["relative_path"].as_str().unwrap(),
        )?;
        self.registration_plan(
            directory.path().to_str().ok_or(AppError::State)?,
            input["name"].as_str(),
            input["git_mode"] != "tracked",
        )
    }
}
fn root_view(value: &Value) -> Value {
    json!({"id":value["id"],"label":value["label"],"display_path":value["display_path"]})
}
