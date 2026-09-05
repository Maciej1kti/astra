//! Read-only source validation. It never creates directories or acquires a writer lease.
use crate::{
    StoreError,
    document::{self, Kind},
    filesystem::Directory,
};
use serde_json::{Value, json};

pub fn report(directory: &Directory) -> Result<Value, StoreError> {
    let mut checked = 0usize;
    let mut invalid = 0usize;
    let mut normalization = 0usize;
    let mut issues = Vec::new();
    let mut inspect = |dir: &Directory, name: &str, kind: Kind, id: Option<&str>, path: String| {
        checked += 1;
        let result = dir.read(name).and_then(|bytes| {
            document::parse(
                kind,
                id,
                &bytes.ok_or(StoreError::Invalid("SOURCE_MISSING"))?,
            )
        });
        let code = match result {
            Ok(parsed) if parsed.normalization_required => {
                normalization += 1;
                Some("NORMALIZATION_REQUIRED")
            }
            Ok(_) => None,
            Err(StoreError::Invalid(code)) => {
                invalid += 1;
                Some(code)
            }
            Err(StoreError::Io(_)) => {
                invalid += 1;
                Some("SOURCE_UNAVAILABLE")
            }
            Err(_) => {
                invalid += 1;
                Some("DOCUMENT_INVALID")
            }
        };
        if let Some(code) = code
            && issues.len() < 200
        {
            issues.push(json!({"path":path,"code":code}));
        }
    };
    inspect(
        directory,
        "project.md",
        Kind::Project,
        None,
        "project.md".into(),
    );
    for kind in [Kind::Card, Kind::Milestone, Kind::Update] {
        let name = kind.directory().unwrap();
        let collection = match directory.child(name, false) {
            Ok(value) => value,
            Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        for filename in collection.names()? {
            let Some(id) = filename.strip_suffix(".md") else {
                continue;
            };
            inspect(
                &collection,
                &filename,
                kind,
                Some(id),
                format!("{name}/{filename}"),
            );
        }
    }
    Ok(
        json!({"scope":"source_documents","checked":checked,"invalid":invalid,"normalization_required":normalization,"issues_truncated":invalid+normalization>issues.len(),"issues":issues,"valid":invalid==0 && normalization==0}),
    )
}
