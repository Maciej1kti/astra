use crate::AppError;
use serde::{Deserialize, Serialize};

/// Persisted spellings are part of replay compatibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkflowKind {
    Registration,
    Normalize,
    Rebalance,
    Unregister,
    Relocate,
    IndexRebuild,
}

impl WorkflowKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Registration => "registration",
            Self::Normalize => "normalize",
            Self::Rebalance => "rebalance",
            Self::Unregister => "unregister",
            Self::Relocate => "relocate",
            Self::IndexRebuild => "index_rebuild",
        }
    }
    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "registration" => Ok(Self::Registration),
            "normalize" => Ok(Self::Normalize),
            "rebalance" => Ok(Self::Rebalance),
            "unregister" => Ok(Self::Unregister),
            "relocate" => Ok(Self::Relocate),
            "index_rebuild" => Ok(Self::IndexRebuild),
            _ => Err(AppError::invariant("stored workflow kind")),
        }
    }
}
