//! Shared domain boundary, without HTTP, filesystem access or command execution.
pub mod models;
pub mod ordering;

use chrono::{DateTime, NaiveDate};
use models::{Document, Workspace};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::sync::LazyLock;

pub const MAX_BODY_BYTES: usize = 960 * 1024;
const SCHEMA: &str = include_str!("../../../contracts/domain.schema.json");
static VALIDATOR: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
    jsonschema::draft202012::options()
        .should_validate_formats(true)
        .build(&serde_json::from_str(SCHEMA).expect("embedded schema JSON"))
        .expect("embedded schema compiles")
});

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("schema violation at {0}")]
    Schema(String),
    #[error("invalid document: {0}")]
    Invalid(&'static str),
}

/// Only this module can construct a validated value. Cross-document references
/// still require an application-level project snapshot under the writer lock.
#[derive(Debug, Clone)]
pub struct Validated<T>(T);
impl<T> Validated<T> {
    pub fn get(&self) -> &T {
        &self.0
    }
    pub fn into_inner(self) -> T {
        self.0
    }
}

pub fn validate_document(value: Value) -> Result<Validated<Document>, DomainError> {
    decode(value)
}
pub fn validate_workspace(value: Value) -> Result<Validated<Workspace>, DomainError> {
    decode(value)
}

fn decode<T: DeserializeOwned>(value: Value) -> Result<Validated<T>, DomainError> {
    check_tree(&value, 0, &mut 0)?;
    VALIDATOR
        .validate(&value)
        .map_err(|e| DomainError::Schema(e.instance_path().to_string()))?;
    if let Some(body) = value.get("body").and_then(Value::as_str)
        && (body.len() > MAX_BODY_BYTES || body.contains('\0'))
    {
        return Err(DomainError::Invalid("body byte limit or NUL"));
    }
    if let Some(m) = value.get("metadata") {
        if let Some(schedule) = m.get("schedule") {
            let start = local_date(schedule["start"].as_str().unwrap())?;
            let end = local_date(schedule["end"].as_str().unwrap())?;
            if start > end {
                return Err(DomainError::Invalid("schedule.start > schedule.end"));
            }
        }
        if let (Some(created), Some(updated)) = (m.get("created_at"), m.get("updated_at")) {
            let instant = |v: &Value| {
                DateTime::parse_from_rfc3339(v.as_str().unwrap())
                    .map_err(|_| DomainError::Invalid("invalid instant"))
            };
            if instant(created)? > instant(updated)? {
                return Err(DomainError::Invalid("updated_at before created_at"));
            }
        }
        for field in ["depends_on", "resolves"] {
            if m.get(field)
                .and_then(Value::as_array)
                .is_some_and(|ids| ids.contains(&m["id"]))
            {
                return Err(DomainError::Invalid("self reference"));
            }
        }
        if m.get("supersedes").is_some_and(|id| id == &m["id"]) {
            return Err(DomainError::Invalid("self correction"));
        }
    }
    serde_json::from_value(value)
        .map(Validated)
        .map_err(|_| DomainError::Invalid("unexpected document kind or wire model"))
}

fn check_tree(value: &Value, depth: usize, nodes: &mut usize) -> Result<(), DomainError> {
    *nodes += 1;
    if depth > 12 || *nodes > 10_000 {
        return Err(DomainError::Invalid("structure limit"));
    }
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if matches!(key.as_str(), "__proto__" | "prototype" | "constructor")
                    || key.contains('\0')
                {
                    return Err(DomainError::Invalid("unsafe object key"));
                }
                check_tree(child, depth + 1, nodes)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                check_tree(child, depth + 1, nodes)?;
            }
        }
        Value::String(text) if text.contains('\0') => return Err(DomainError::Invalid("NUL")),
        _ => {}
    }
    Ok(())
}

/// A day remains a calendar date, independent of local timezone or DST.
pub fn local_date(text: &str) -> Result<NaiveDate, DomainError> {
    let bytes = text.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return Err(DomainError::Invalid("invalid local date syntax"));
    }
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .map_err(|_| DomainError::Invalid("invalid calendar date"))
}

/// Planning inconsistencies are advisory; schedules never silently move deadlines.
pub fn date_warnings(metadata: &Value) -> Vec<Value> {
    let mut warnings = Vec::new();
    if let (Some(end), Some(due)) = (
        metadata["schedule"]["end"].as_str(),
        metadata["due"]["date"].as_str(),
    ) && end > due
    {
        warnings.push(serde_json::json!({"code":"SCHEDULE_AFTER_DUE","message":"The planned work ends after its due date."}));
    }
    warnings
}
