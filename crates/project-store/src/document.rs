//! Bounded JSON source documents with duplicate-key rejection.
use crate::StoreError;
use project_domain::{Validated, models::Document, validate_document};
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fmt;

pub const MAX_DOCUMENT: usize = 1024 * 1024;
pub const MAX_METADATA: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Project,
    Card,
    Milestone,
    Update,
}
impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Card => "card",
            Self::Milestone => "milestone",
            Self::Update => "update",
        }
    }
    pub fn directory(self) -> Option<&'static str> {
        match self {
            Self::Project => None,
            Self::Card => Some("cards"),
            Self::Milestone => Some("milestones"),
            Self::Update => Some("updates"),
        }
    }
}

#[derive(Debug)]
pub struct ParsedDocument {
    pub document: Validated<Document>,
    pub version: String,
    /// Noncanonical transport encoding need an explicit normalization workflow.
    pub normalization_required: bool,
}
impl ParsedDocument {
    pub fn editable(&self) -> Result<Value, StoreError> {
        if self.normalization_required {
            return Err(StoreError::NormalizationRequired);
        }
        Ok(self.value())
    }
    pub fn value(&self) -> Value {
        serde_json::to_value(self.document.get()).expect("wire document serializes")
    }
}

pub fn version(bytes: &[u8]) -> String {
    let hash: String = Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("r1.{hash}")
}

pub fn parse(
    kind: Kind,
    expected_id: Option<&str>,
    bytes: &[u8],
) -> Result<ParsedDocument, StoreError> {
    if bytes.len() > MAX_DOCUMENT || bytes.contains(&0) {
        return Err(StoreError::Invalid("DOCUMENT_LIMIT_OR_NUL"));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| StoreError::Invalid("INVALID_UTF8"))?;
    let bom = text.starts_with('\u{feff}');
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let mut nodes = 0;
    let value = BoundedValue {
        depth: 0,
        nodes: &mut nodes,
    }
    .deserialize(&mut deserializer)
    .map_err(|_| StoreError::Invalid("INVALID_JSON"))?;
    deserializer
        .end()
        .map_err(|_| StoreError::Invalid("INVALID_JSON"))?;
    if value["type"].as_str() != Some(kind.as_str()) {
        return Err(StoreError::Invalid("DOCUMENT_TYPE_MISMATCH"));
    }
    if let Some(id) = expected_id
        && value["metadata"]["id"].as_str() != Some(id)
    {
        return Err(StoreError::Invalid("FILENAME_ID_MISMATCH"));
    }
    check_metadata(&value)?;
    let document = validate_document(value)?;
    Ok(ParsedDocument {
        document,
        version: version(bytes),
        normalization_required: bom || text.contains('\r'),
    })
}

fn check_metadata(value: &Value) -> Result<(), StoreError> {
    // Keep the existing metadata budget; changing the transport does not lift bounds.
    if serde_json::to_vec_pretty(&value["metadata"])
        .expect("JSON value")
        .len()
        > MAX_METADATA
    {
        return Err(StoreError::Invalid("METADATA_LIMIT"));
    }
    Ok(())
}

struct BoundedValue<'a> {
    depth: usize,
    nodes: &'a mut usize,
}
impl<'de> DeserializeSeed<'de> for BoundedValue<'_> {
    type Value = Value;
    fn deserialize<D: de::Deserializer<'de>>(self, deserializer: D) -> Result<Value, D::Error> {
        *self.nodes += 1;
        if self.depth > 12 || *self.nodes > 10_000 {
            return Err(de::Error::custom("JSON structure limit"));
        }
        deserializer.deserialize_any(self)
    }
}
impl<'de> Visitor<'de> for BoundedValue<'_> {
    type Value = Value;
    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a bounded JSON value with unique object keys")
    }
    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Value, E> {
        Ok(Value::Bool(value))
    }
    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Value, E> {
        Ok(value.into())
    }
    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Value, E> {
        Ok(value.into())
    }
    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Value, E> {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .ok_or_else(|| de::Error::custom("nonfinite number"))
    }
    fn visit_str<E: de::Error>(self, value: &str) -> Result<Value, E> {
        Ok(Value::String(value.to_owned()))
    }
    fn visit_string<E: de::Error>(self, value: String) -> Result<Value, E> {
        Ok(Value::String(value))
    }
    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = seq.next_element_seed(BoundedValue {
            depth: self.depth + 1,
            nodes: self.nodes,
        })? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let mut values = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            *self.nodes += 1;
            if *self.nodes > 10_000 || values.contains_key(&key) {
                return Err(de::Error::custom("duplicate key or JSON node limit"));
            }
            let value = map.next_value_seed(BoundedValue {
                depth: self.depth + 1,
                nodes: self.nodes,
            })?;
            values.insert(key, value);
        }
        Ok(Value::Object(values))
    }
}

/// Canonical source JSON uses sorted keys, two-space indentation and a final LF.
/// Markdown remains a string value, preserved exactly through unrelated edits.
pub fn serialize(document: &Validated<Document>) -> Result<Vec<u8>, StoreError> {
    let value = serde_json::to_value(document.get()).expect("wire document serializes");
    check_metadata(&value)?;
    let mut bytes = serde_json::to_vec_pretty(&value).expect("JSON serialization");
    bytes.push(b'\n');
    if bytes.len() > MAX_DOCUMENT {
        return Err(StoreError::Invalid("DOCUMENT_LIMIT"));
    }
    Ok(bytes)
}
