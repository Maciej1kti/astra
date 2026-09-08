//! Validated source observations keep their byte version through application reads.
use crate::AppError;
use project_store::{
    StoreError,
    document::{self, Kind},
    filesystem::ProjectStore,
};
use uuid::Uuid;

#[derive(Debug)]
pub struct Versioned<T> {
    pub value: T,
    pub version: String,
}

pub fn pretty(value: &impl serde::Serialize) -> Vec<u8> {
    // A JSON value preserves canonical key ordering across typed and wire inputs.
    let value = serde_json::to_value(value).expect("serializable source value");
    let mut bytes = serde_json::to_vec_pretty(&value).expect("JSON serialization");
    bytes.push(b'\n');
    bytes
}
pub(crate) fn read(
    store: &ProjectStore,
    kind: Kind,
    id: &str,
) -> Result<document::ParsedDocument, AppError> {
    let (directory, name) = match store.location(kind, id, false) {
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::reject(404, "RESOURCE_NOT_FOUND"));
        }
        value => value?,
    };
    let bytes = directory
        .read(&name)?
        .ok_or_else(|| AppError::reject(404, "RESOURCE_NOT_FOUND"))?;
    let parsed = document::parse(kind, Some(id), &bytes)
        .map_err(|_| AppError::reject(409, "DOCUMENT_INVALID"))?;
    Ok(parsed)
}
pub(crate) fn collection(
    store: &ProjectStore,
    kind: Kind,
) -> Result<Vec<document::ParsedDocument>, AppError> {
    let directory = match store.directory.child(
        kind.directory()
            .ok_or(AppError::invariant("source collection kind"))?,
        false,
    ) {
        Ok(directory) => directory,
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(vec![]);
        }
        Err(error) => return Err(error.into()),
    };
    let mut values = Vec::new();
    for filename in directory.names()? {
        if let Some(id) = filename.strip_suffix(".md")
            && Uuid::parse_str(id).is_ok()
        {
            values.push(read(store, kind, id)?);
        }
    }
    Ok(values)
}
