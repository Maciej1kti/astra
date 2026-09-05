//! Strict YAML event adapter; the YAML parser never expands anchors or aliases.
use crate::StoreError;
use project_domain::{Validated, models::Document, validate_document};
use saphyr_parser::{Event, Parser, ScalarStyle};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

pub const MAX_DOCUMENT: usize = 1024 * 1024;
pub const MAX_HEADER: usize = 64 * 1024;

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
    /// Comments and noncanonical transport encoding need an explicit normalization workflow.
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
    let first_end = text
        .find('\n')
        .ok_or(StoreError::Invalid("FRONT_MATTER_REQUIRED"))?;
    if text[..first_end].trim_end_matches('\r') != "---" {
        return Err(StoreError::Invalid("FRONT_MATTER_REQUIRED"));
    }
    let header_start = first_end + 1;
    let mut offset = header_start;
    let mut split = None;
    for line in text[header_start..].split_inclusive('\n') {
        if line.trim_end_matches('\n').trim_end_matches('\r') == "---" {
            split = Some((offset, offset + line.len()));
            break;
        }
        offset += line.len();
        if offset - header_start > MAX_HEADER {
            return Err(StoreError::Invalid("HEADER_LIMIT"));
        }
    }
    let (header_end, body_start) = split.ok_or(StoreError::Invalid("UNCLOSED_FRONT_MATTER"))?;
    let header = &text[header_start..header_end];
    if header.len() > MAX_HEADER {
        return Err(StoreError::Invalid("HEADER_LIMIT"));
    }
    let (metadata, comments) = parse_header(header)?;
    if let Some(id) = expected_id
        && metadata.get("id").and_then(Value::as_str) != Some(id)
    {
        return Err(StoreError::Invalid("FILENAME_ID_MISMATCH"));
    }
    let document = validate_document(
        json!({ "type": kind.as_str(), "metadata": metadata, "body": &text[body_start..] }),
    )?;
    Ok(ParsedDocument {
        document,
        version: version(bytes),
        normalization_required: bom || text[..body_start].contains('\r') || comments,
    })
}

enum Frame {
    Map(Map<String, Value>, Option<String>),
    Sequence(Vec<Value>),
}
fn add(value: Value, stack: &mut [Frame], root: &mut Option<Value>) -> Result<(), StoreError> {
    match stack.last_mut() {
        Some(Frame::Sequence(values)) => values.push(value),
        Some(Frame::Map(map, key)) => {
            if let Some(key) = key.take() {
                if map.insert(key, value).is_some() {
                    return Err(StoreError::Invalid("DUPLICATE_KEY"));
                }
            } else {
                let Value::String(name) = value else {
                    return Err(StoreError::Invalid("NON_STRING_KEY"));
                };
                if name == "<<" {
                    return Err(StoreError::Invalid("MERGE_KEY"));
                }
                *key = Some(name);
            }
        }
        None => {
            if root.replace(value).is_some() {
                return Err(StoreError::Invalid("MULTIPLE_ROOTS"));
            }
        }
    }
    Ok(())
}

fn parse_header(header: &str) -> Result<(Value, bool), StoreError> {
    for line in header.lines() {
        if line
            .chars()
            .take_while(|c| c.is_whitespace())
            .any(|c| c == '\t')
        {
            return Err(StoreError::Invalid("TAB_INDENT"));
        }
    }
    let mut parser = Parser::new_from_str(header);
    let mut stack = Vec::new();
    let mut root = None;
    let mut documents = 0;
    let mut nodes = 0;
    // Parser spans use character offsets. Only hashes outside scalar spans are comments.
    let mut scalar_coverage = vec![false; header.chars().count()];
    while let Some(event) = parser.next_event() {
        let (event, span) = event.map_err(|_| StoreError::Invalid("INVALID_YAML"))?;
        match event {
            Event::DocumentStart(_) => {
                documents += 1;
                if documents > 1 {
                    return Err(StoreError::Invalid("MULTIPLE_DOCUMENTS"));
                }
            }
            Event::Alias(_) => return Err(StoreError::Invalid("ALIAS_FORBIDDEN")),
            Event::MappingStart(anchor, ref tag) | Event::SequenceStart(anchor, ref tag) => {
                if anchor != 0 || tag.is_some() {
                    return Err(StoreError::Invalid("ANCHOR_OR_TAG_FORBIDDEN"));
                }
                if stack.len() >= 12 {
                    return Err(StoreError::Invalid("YAML_DEPTH_LIMIT"));
                }
                nodes += 1;
                if matches!(event, Event::MappingStart(..)) {
                    stack.push(Frame::Map(Map::new(), None));
                } else {
                    stack.push(Frame::Sequence(Vec::new()));
                }
            }
            Event::MappingEnd => {
                let Some(Frame::Map(map, None)) = stack.pop() else {
                    return Err(StoreError::Invalid("INVALID_MAPPING"));
                };
                add(Value::Object(map), &mut stack, &mut root)?;
            }
            Event::SequenceEnd => {
                let Some(Frame::Sequence(values)) = stack.pop() else {
                    return Err(StoreError::Invalid("INVALID_SEQUENCE"));
                };
                add(Value::Array(values), &mut stack, &mut root)?;
            }
            Event::Scalar(value, style, anchor, tag) => {
                if anchor != 0 || tag.is_some() {
                    return Err(StoreError::Invalid("ANCHOR_OR_TAG_FORBIDDEN"));
                }
                let end = span.end.index().min(scalar_coverage.len());
                let start = span.start.index().min(end);
                scalar_coverage[start..end].fill(true);
                nodes += 1;
                let value = if style == ScalarStyle::Plain {
                    match value.as_ref() {
                        "true" | "True" | "TRUE" => Value::Bool(true),
                        "false" | "False" | "FALSE" => Value::Bool(false),
                        "null" | "Null" | "NULL" | "~" | "" => Value::Null,
                        other => serde_json::from_str::<serde_json::Number>(other)
                            .map(Value::Number)
                            .unwrap_or_else(|_| Value::String(other.to_owned())),
                    }
                } else {
                    Value::String(value.into_owned())
                };
                add(value, &mut stack, &mut root)?;
            }
            _ => {}
        }
        if nodes > 10_000 {
            return Err(StoreError::Invalid("YAML_NODE_LIMIT"));
        }
    }
    let Some(Value::Object(map)) = root else {
        return Err(StoreError::Invalid("HEADER_MUST_BE_MAP"));
    };
    let comments = header
        .chars()
        .enumerate()
        .any(|(i, c)| c == '#' && !scalar_coverage[i]);
    Ok((Value::Object(map), comments))
}

/// Canonical YAML uses JSON quoting and JSON flow values (a YAML 1.2 subset).
/// No custom escaping/implicit date conversion; the body remains byte-identical.
pub fn serialize(document: &Validated<Document>) -> Result<Vec<u8>, StoreError> {
    let value = serde_json::to_value(document.get()).expect("wire document serializes");
    let mut out = String::from("---\n");
    for (key, value) in value["metadata"].as_object().expect("metadata map") {
        out.push_str(&serde_json::to_string(key).unwrap());
        out.push_str(": ");
        out.push_str(&serde_json::to_string(value).unwrap());
        out.push('\n');
    }
    if out.len() - 4 > MAX_HEADER {
        return Err(StoreError::Invalid("HEADER_LIMIT"));
    }
    out.push_str("---\n");
    out.push_str(value["body"].as_str().expect("body string"));
    if out.len() > MAX_DOCUMENT {
        return Err(StoreError::Invalid("DOCUMENT_LIMIT"));
    }
    Ok(out.into_bytes())
}
