use crate::AppError;
use serde::{Deserialize, Serialize};

/// Persisted spellings are part of replay compatibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CommandState {
    Prepared,
    Committed,
    Rejected,
    NeedsReview,
    Blocked,
}

impl CommandState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Prepared => "prepared",
            Self::Committed => "committed",
            Self::Rejected => "rejected",
            Self::NeedsReview => "needs_review",
            Self::Blocked => "blocked",
        }
    }
    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "prepared" => Ok(Self::Prepared),
            "committed" => Ok(Self::Committed),
            "rejected" => Ok(Self::Rejected),
            "needs_review" => Ok(Self::NeedsReview),
            "blocked" => Ok(Self::Blocked),
            _ => Err(AppError::invariant("stored command state")),
        }
    }
}
