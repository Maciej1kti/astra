pub mod auth;
mod command_state;
mod context;
mod diagnostics;
pub use diagnostics::{record_failure, record_worker_failure};
pub mod engine;
mod git;
mod history;
mod maintenance;
mod mutation;
mod receipts;
mod retention;
mod roots;
mod tags;
mod views;
mod workflow_kind;
mod workspace;
pub use index::Query;
pub use mutation::Mutation;
mod index;
mod journal;
pub mod wire;
mod workflow;
mod writer;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("request rejected")]
    Rejected(Reply),
    #[error("{0}")]
    Store(#[from] project_store::StoreError),
    #[error("state database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("lock poisoned: {0}")]
    LockPoisoned(&'static str),
    #[error("stored data invalid ({context}): {source}")]
    StoredData {
        context: &'static str,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("source validation failed ({context}): {source}")]
    SourceValidation {
        context: &'static str,
        source: project_domain::DomainError,
    },
    #[error("required operational source is unavailable: {0}")]
    Unavailable(&'static str),
    #[error("application invariant failed: {0}")]
    Invariant(&'static str),
}
impl AppError {
    pub fn stored(
        context: &'static str,
        source: impl Into<Box<dyn std::error::Error + Send + Sync>>,
    ) -> Self {
        Self::StoredData {
            context,
            source: source.into(),
        }
    }
    pub fn invariant(context: &'static str) -> Self {
        Self::Invariant(context)
    }

    pub fn reject(status: u16, code: &str) -> Self {
        Self::Rejected(Reply::error(status, code, ""))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reply {
    pub http_status: u16,
    pub body: Value,
}
impl Reply {
    pub fn error(status: u16, code: &str, request_id: &str) -> Self {
        let mut reply = Self {
            http_status: status,
            body: json!({"api_version": "1", "error": {"code": code, "message": code, "request_id": request_id}}),
        };
        if !valid_request_id(request_id) {
            reply.body["error"]
                .as_object_mut()
                .unwrap()
                .remove("request_id");
        }
        reply
    }
    pub fn replay(mut self) -> Self {
        if self.body.get("replayed").is_some() {
            self.body["replayed"] = json!(true);
        }
        self
    }
}

pub fn valid_request_id(text: &str) -> bool {
    uuid::Uuid::parse_str(text).is_ok_and(|id| {
        id.get_version_num() == 7
            && id.get_variant() == uuid::Variant::RFC4122
            && id.to_string() == text
    })
}

pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock before Unix epoch")
        .as_millis() as i64
}
pub fn instant(millis: i64) -> String {
    chrono::DateTime::from_timestamp_millis(millis)
        .expect("bounded timestamp")
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

mod registration;
mod service;
mod source;
pub use source::Versioned;

// White-box durability fixtures stay within the crate, without production accessors.
#[cfg(test)]
extern crate self as project_application;
#[cfg(test)]
#[path = "../tests/auth.rs"]
mod auth_tests;
#[cfg(test)]
#[path = "../tests/durability.rs"]
mod durability_tests;
#[cfg(test)]
#[path = "../tests/engine.rs"]
mod engine_tests;
#[cfg(test)]
#[path = "../tests/tag_management.rs"]
mod tag_management_tests;
#[cfg(test)]
#[path = "../tests/workflow.rs"]
mod workflow_tests;
