pub mod journal;
pub mod writer;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Store(#[from] project_store::StoreError),
    #[error("state database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("invalid operational state")]
    State,
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
