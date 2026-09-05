//! Wire models. Deserialize untrusted input through `validate_document`/`validate_workspace`.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub type Extensions = BTreeMap<String, Value>;

macro_rules! wire_enum {
    ($name:ident { $($variant:ident),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($variant),+ }
    };
}
wire_enum!(ProjectState {
    Active,
    Paused,
    Archived
});
wire_enum!(CardKind { Outcome, Decision });
wire_enum!(CardStatus {
    Planned,
    Active,
    Review,
    Done,
    Cancelled
});
wire_enum!(Priority {
    Low,
    Normal,
    High,
    Urgent
});
wire_enum!(MilestoneStatus {
    Planned,
    Active,
    Achieved,
    Cancelled
});
wire_enum!(UpdateKind {
    Result,
    Blocker,
    DecisionNeeded,
    Note,
    Correction,
    Resolution
});
wire_enum!(DueKind { Hard, Target });
wire_enum!(AuthorKind { Human, Agent });
wire_enum!(TargetKind {
    Project,
    Card,
    Milestone
});
wire_enum!(EvidenceKind { Url, Commit, Path });
wire_enum!(Locale { Pl, En });
wire_enum!(WeekStart { Monday, Sunday });
wire_enum!(View {
    Focus,
    Projects,
    Board,
    Calendar,
    Gantt,
    List,
    Updates
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Schedule {
    pub start: String,
    pub end: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Due {
    pub date: String,
    pub kind: DueKind,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Blocked {
    pub reason: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    #[serde(rename = "type")]
    pub kind: TargetKind,
    pub id: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Author {
    pub kind: AuthorKind,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    #[serde(rename = "type")]
    pub kind: EvidenceKind,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub state: ProjectState,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_on: Option<String>,
    #[serde(flatten)]
    pub extensions: Extensions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardMetadata {
    pub id: String,
    pub title: String,
    pub kind: CardKind,
    pub status: CardStatus,
    pub priority: Priority,
    pub position: String,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<Schedule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<Due>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked: Option<Blocked>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depends_on: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(flatten)]
    pub extensions: Extensions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MilestoneMetadata {
    pub id: String,
    pub title: String,
    pub status: MilestoneStatus,
    pub position: String,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<Due>,
    #[serde(flatten)]
    pub extensions: Extensions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateMetadata {
    pub id: String,
    pub kind: UpdateKind,
    pub target: Target,
    pub summary: String,
    pub author: Author,
    pub recorded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolves: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Vec<Evidence>>,
    #[serde(flatten)]
    pub extensions: Extensions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Document {
    Project {
        metadata: ProjectMetadata,
        body: String,
    },
    Card {
        metadata: CardMetadata,
        body: String,
    },
    Milestone {
        metadata: MilestoneMetadata,
        body: String,
    },
    Update {
        metadata: UpdateMetadata,
        body: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FocusRef {
    pub project_id: String,
    pub card_id: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectRegistration {
    pub project_id: String,
    pub path: String,
    pub added_at: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub week_start: Option<WeekStart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_view: Option<View>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    pub format_version: u32,
    pub instance_id: String,
    pub timezone: String,
    pub locale: Locale,
    pub projects: Vec<ProjectRegistration>,
    pub focus: Vec<FocusRef>,
    pub preferences: Preferences,
}
