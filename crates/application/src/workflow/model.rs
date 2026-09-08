//! Saved workflow inputs retain their existing JSON names. Presentation fields
//! are private data alongside, never the source of execution or recovery paths.
use crate::{AppError, workflow_kind::WorkflowKind};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value, json};
use std::path::Path;

use super::Step;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub kind: WorkflowKind,
    pub project_id: String,
    pub expires_at: i64,
    pub steps: Vec<Step>,
    // `view` is an established saved-plan field, not a runtime API to presentation JSON.
    #[serde(rename = "view")]
    pub location: PlanLocation,
    #[serde(default)]
    pub approved_root: Option<ApprovedRoot>,
    #[serde(default)]
    pub collection_guard: Option<(String, Vec<String>)>,
}

impl Plan {
    pub fn presentation(&self) -> Result<Value, AppError> {
        serde_json::to_value(&self.location)
            .map_err(|source| AppError::stored("workflow plan presentation", source))
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlanLocation {
    #[serde(rename = "display_path")]
    pub destination: OperationalPath,
    #[serde(
        default,
        rename = "previous_path",
        skip_serializing_if = "Option::is_none"
    )]
    pub previous: Option<OperationalPath>,
    #[serde(flatten)]
    presentation: Map<String, Value>,
}

impl Serialize for PlanLocation {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // Keep the original Value/map key order as well as the saved field names.
        let mut fields = self.presentation.clone();
        fields.insert("display_path".into(), json!(self.destination));
        if let Some(previous) = &self.previous {
            fields.insert("previous_path".into(), json!(previous));
        }
        fields.serialize(serializer)
    }
}

impl PlanLocation {
    pub fn registration(destination: &str, presentation: Value) -> Result<Self, AppError> {
        Self::new(destination, None, presentation)
    }

    pub fn maintenance(
        destination: &str,
        previous: &str,
        presentation: Value,
    ) -> Result<Self, AppError> {
        Self::new(destination, Some(previous), presentation)
    }

    fn new(
        destination: &str,
        previous: Option<&str>,
        presentation: Value,
    ) -> Result<Self, AppError> {
        let presentation = presentation
            .as_object()
            .filter(|fields| {
                !fields.contains_key("display_path") && !fields.contains_key("previous_path")
            })
            .ok_or(AppError::invariant(
                "workflow presentation cannot define operational paths",
            ))?
            .clone();
        Ok(Self {
            destination: OperationalPath::new(destination)
                .map_err(|_| AppError::invariant("workflow destination path"))?,
            previous: previous
                .map(OperationalPath::new)
                .transpose()
                .map_err(|_| AppError::invariant("workflow previous path"))?,
            presentation,
        })
    }

    pub fn previous_path(&self) -> Result<&str, AppError> {
        self.previous
            .as_ref()
            .map(OperationalPath::as_str)
            .ok_or(AppError::invariant("maintenance previous path"))
    }
}

/// An exact UTF-8 absolute path. No canonicalization changes saved path spelling.
#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct OperationalPath(String);

impl OperationalPath {
    fn new(value: &str) -> Result<Self, &'static str> {
        if !Path::new(value).is_absolute() || value.contains('\0') {
            return Err("workflow operational path must be an absolute UTF-8 path");
        }
        Ok(Self(value.into()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for OperationalPath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::new(&String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApprovedRoot {
    pub root_id: String,
    pub relative_path: String,
    pub identity: (u64, u64),
    #[serde(flatten)]
    extensions: Map<String, Value>,
}

impl Serialize for ApprovedRoot {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut fields = self.extensions.clone();
        fields.insert("root_id".into(), json!(self.root_id));
        fields.insert("relative_path".into(), json!(self.relative_path));
        fields.insert("identity".into(), json!(self.identity));
        fields.serialize(serializer)
    }
}

impl ApprovedRoot {
    pub fn new(root_id: String, relative_path: String, identity: (u64, u64)) -> Self {
        Self {
            root_id,
            relative_path,
            identity,
            extensions: Map::new(),
        }
    }
}
