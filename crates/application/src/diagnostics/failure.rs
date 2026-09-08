//! Operational stderr events deliberately exclude error Display/source text.
use crate::AppError;
use project_store::StoreError;
use serde_json::{Value, json};
use std::io::Write;

/// Reporting is best effort and cannot replace an operation's durable outcome.
pub fn record_failure(
    stage: &'static str,
    error: &AppError,
    project_id: Option<&str>,
    request_id: Option<&str>,
) {
    emit(event(stage, classification(error), project_id, request_id));
}

/// A failed blocking worker is distinct from the application's returned error.
pub fn record_worker_failure(
    stage: &'static str,
    error: &tokio::task::JoinError,
    project_id: Option<&str>,
) {
    let category = if error.is_cancelled() {
        "worker_cancelled"
    } else {
        "worker_panicked"
    };
    emit(event(
        stage,
        json!({"category": category}),
        project_id,
        None,
    ));
}

fn emit(event: Value) {
    // A closed stderr must not panic after an acknowledged commit.
    let _ = writeln!(std::io::stderr().lock(), "{event}");
}

fn event(stage: &str, failure: Value, project_id: Option<&str>, request_id: Option<&str>) -> Value {
    let stage = if stage.len() <= 64
        && !stage.is_empty()
        && stage
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
    {
        stage
    } else {
        "unspecified"
    };
    let mut event = json!({"event":"operation_failed", "stage":stage, "failure":failure});
    if let Some(id) = project_id.filter(|id| canonical_uuid(id, 4)) {
        event["project_id"] = json!(id);
    }
    if let Some(id) = request_id.filter(|id| crate::valid_request_id(id)) {
        event["request_id"] = json!(id);
    }
    event
}

fn canonical_uuid(value: &str, version: usize) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| {
        id.get_version_num() == version
            && id.get_variant() == uuid::Variant::RFC4122
            && id.to_string() == value
    })
}

fn classification(error: &AppError) -> Value {
    let category = match error {
        AppError::Rejected(_) => "rejected",
        AppError::Store(StoreError::Io(error)) => {
            // ErrorKind names are library constants; an OS error's message may contain paths.
            return json!({"category":"io", "io_kind":format!("{:?}", error.kind())});
        }
        AppError::Store(StoreError::Invalid(_)) => "invalid_store",
        AppError::Store(StoreError::NormalizationRequired) => "normalization_required",
        AppError::Store(StoreError::Conflict) => "conflict",
        AppError::Store(StoreError::Domain(_)) | AppError::SourceValidation { .. } => {
            "source_validation"
        }
        AppError::Database(rusqlite::Error::SqliteFailure(error, _)) => {
            return json!({"category":"database", "sqlite_code":error.extended_code});
        }
        AppError::Database(_) => "database",
        AppError::LockPoisoned(_) => "lock_poisoned",
        AppError::StoredData { .. } => "stored_data",
        AppError::Unavailable(_) => "unavailable",
        AppError::Invariant(_) => "invariant",
    };
    json!({"category":category})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn controlled_failures_keep_safe_categories_without_error_text() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("secret-project-name-and-token");
        let io = std::fs::read(missing).unwrap_err();
        let sqlite = rusqlite::Connection::open_in_memory()
            .unwrap()
            .execute("SELECT * FROM secret_document_body", [])
            .unwrap_err();
        let errors = [
            (AppError::Store(StoreError::Io(io)), "io"),
            (AppError::Database(sqlite), "database"),
            (
                AppError::stored("secret-context", std::io::Error::other("secret-token")),
                "stored_data",
            ),
            (AppError::reject(422, "secret-rejection"), "rejected"),
            (
                AppError::Store(StoreError::Invalid("secret-path")),
                "invalid_store",
            ),
        ];
        let project = uuid::Uuid::new_v4().to_string();
        let request = uuid::Uuid::now_v7().to_string();
        for (error, category) in errors {
            let value = event(
                "source_recovery",
                classification(&error),
                Some(&project),
                Some(&request),
            );
            assert_eq!(value["failure"]["category"], category);
            assert_eq!(value["project_id"], project);
            assert_eq!(value["request_id"], request);
            assert!(!value.to_string().contains("secret"));
            assert!(value.to_string().len() < 350);
            if category == "io" {
                assert_eq!(value["failure"]["io_kind"], "NotFound");
            }
            if category == "database" {
                assert!(value["failure"]["sqlite_code"].is_i64());
            }
        }
    }

    #[test]
    fn malformed_identifiers_and_stages_are_omitted_or_bounded() {
        let project = uuid::Uuid::new_v4().to_string();
        let request = uuid::Uuid::now_v7().to_string();
        for (project, request) in [
            ("secret-path", "secret-token"),
            (request.as_str(), project.as_str()),
        ] {
            let value = event(
                "secret\nforged_log",
                json!({"category":"io"}),
                Some(project),
                Some(request),
            );
            assert_eq!(value["stage"], "unspecified");
            assert!(value.get("project_id").is_none());
            assert!(value.get("request_id").is_none());
            assert!(!value.to_string().contains("secret"));
        }
    }
}
