//! Workspace vocabulary augments literal card labels; it never replaces their
//! meaning or authority. Preview reads source versions and performs no writes.
use crate::{AppError, engine::Engine, source::read, wire};
use project_store::{StoreError, document::Kind};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

const MAX_SCANNED_CARDS: usize = 50_000;
const MAX_CATALOG_NAMES: usize = 10_000;
const MAX_PREVIEW_CHANGES: usize = 500;
const MAX_ISSUES: usize = 500;

#[derive(Default)]
struct Issues {
    items: Vec<Value>,
    omitted: usize,
}
impl Issues {
    fn add(&mut self, project: Option<&str>, card: Option<&str>, message: &str) {
        if self.items.len() >= MAX_ISSUES {
            self.omitted += 1;
            return;
        }
        let mut issue = json!({"message":message});
        if let Some(project) = project {
            issue["project_id"] = json!(project);
        }
        if let Some(card) = card {
            issue["card_id"] = json!(card);
        }
        self.items.push(issue);
    }
    fn finish(mut self) -> Vec<Value> {
        if self.omitted > 0 {
            self.items.push(json!({"message":format!("{} additional source issues were omitted from this response.", self.omitted)}));
        }
        self.items
    }
}

#[derive(Default)]
struct TagUsage {
    managed: bool,
    usage: usize,
    projects: BTreeMap<String, (String, usize)>,
}

struct SourceCard<'a> {
    project_id: &'a str,
    project_name: &'a str,
    project_archived: bool,
    card_id: &'a str,
    title: &'a str,
    version: &'a str,
    labels: Vec<String>,
}

impl Engine {
    /// Lightweight suggestions use explicitly indexed observations, never rename authority.
    pub fn tag_suggestions(&self) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let crate::Versioned {
            value: workspace,
            version: _,
        } = self.workspace()?;
        self.index.with_snapshot(|db, revision| {
            let projection = crate::index::ProjectionStatus::read(db, None)?;
            let mut names: BTreeSet<String> = workspace.tags.iter().flatten()
                .cloned().collect();
            let mut statement = db.prepare("SELECT DISTINCT label.value
FROM documents d,
    json_each(d.metadata_json,
    '$.labels') label
WHERE d.entity_type='card'
AND label.type='text'
ORDER BY label.value
LIMIT 10001")?;
            names.extend(statement.query_map([], |row| row.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?);
            let limited = names.len() > MAX_CATALOG_NAMES;
            let unhealthy: bool = db.query_row("SELECT EXISTS(SELECT 1
FROM projection_issues)
OR EXISTS(SELECT 1
FROM documents
WHERE validity!='valid')", [], |row|row.get(0))?;
            let complete = !limited && !unhealthy && projection.freshness == "index_snapshot";
            let mut warnings = projection.warnings;
            if limited { warnings.push(json!({"code":"TAG_SUGGESTION_LIMIT","message":"Only the first 10,000 indexed tag names are shown."})); }
            if unhealthy { warnings.push(json!({"code":"TAG_SUGGESTIONS_STALE","message":"Some tag names come from unavailable or invalid project sources."})); }
            Ok(json!({
                "names": names.into_iter().take(MAX_CATALOG_NAMES).collect::<Vec<_>>(),
                "complete": complete,
                "freshness": if complete {"index_snapshot"} else {"stale"},
                "snapshot_cursor": revision,
                "warnings": warnings,
            }))
        })
    }

    /// Counts validated source cards, including archived cards and projects.
    /// The version belongs to workspace.json, not to the observed usage counts.
    pub fn tag_catalog(&self) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let crate::Versioned {
            value: workspace,
            version,
        } = self.workspace()?;
        let mut tags = BTreeMap::<String, TagUsage>::new();
        for name in workspace.tags.iter().flatten() {
            tags.entry(name.clone()).or_default().managed = true;
        }
        let mut catalog_limited = false;
        let mut issues = self.scan_tag_cards(&workspace, |card| {
            for label in card.labels {
                if !tags.contains_key(&label) && tags.len() >= MAX_CATALOG_NAMES {
                    catalog_limited = true;
                    continue;
                }
                let tag = tags.entry(label).or_default();
                tag.usage += 1;
                tag.projects
                    .entry(card.project_id.to_owned())
                    .or_insert_with(|| (card.project_name.to_owned(), 0))
                    .1 += 1;
            }
        })?;
        if catalog_limited {
            issues.add(None, None, "The catalog reached its limit of 10,000 distinct tag names; additional names are not shown.");
        }
        let issues = issues.finish();
        let tags = tags
            .into_iter()
            .map(|(name, tag)| {
                let projects = tag.projects.into_iter().map(|(project_id, (project_name, count))| {
                json!({"project_id":project_id,"project_name":project_name,"count":count})
            }).collect::<Vec<_>>();
                json!({"name":name,"managed":tag.managed,"usage":tag.usage,"projects":projects})
            })
            .collect::<Vec<_>>();
        Ok(json!({"version":version,"tags":tags,"complete":issues.is_empty(),"issues":issues}))
    }

    /// Returns reviewed replacements for ordinary versioned CardPatch commands.
    /// There is no implicit apply, cross-project transaction, or migration.
    pub fn tag_preview(&self, payload: &Value) -> Result<Value, AppError> {
        wire::validate("TagPreviewRequest", payload)?;
        let source = payload["source"].as_str().ok_or(AppError::State)?;
        let target = payload["target"].as_str().ok_or(AppError::State)?;
        if source == target {
            return Err(AppError::reject(422, "TAG_NAMES_IDENTICAL"));
        }
        if target.contains('\0') {
            return Err(AppError::reject(422, "TAG_NAME_INVALID"));
        }
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let crate::Versioned {
            value: workspace,
            version,
        } = self.workspace()?;
        let mut target_known = workspace.tags.iter().flatten().any(|name| name == target);
        let mut changes = Vec::new();
        let mut limited = false;
        let mut archived_projects = BTreeSet::new();
        let mut issues = self.scan_tag_cards(&workspace, |card| {
            let target_exists = card.labels.iter().any(|name| name == target);
            target_known |= target_exists;
            if !card.labels.iter().any(|name| name == source) {
                return;
            }
            if card.project_archived {
                archived_projects.insert(card.project_id.to_owned());
            }
            if changes.len() >= MAX_PREVIEW_CHANGES {
                limited = true;
                return;
            }
            let labels = card
                .labels
                .into_iter()
                .filter_map(|name| {
                    if name != source {
                        Some(name)
                    } else if target_exists {
                        None
                    } else {
                        Some(target.to_owned())
                    }
                })
                .collect::<Vec<_>>();
            changes.push(json!({
                "project_id": card.project_id,
                "project_name": card.project_name,
                "card_id": card.card_id,
                "title": card.title,
                "version": card.version,
                "labels": labels,
            }));
        })?;
        if !target_known && (target.trim() != target || target.trim().is_empty()) {
            return Err(AppError::reject(422, "TAG_NAME_WHITESPACE"));
        }
        if limited {
            issues.add(None, None, "This preview includes at most 500 affected cards. After applying this reviewed batch, create another preview for the remaining cards.");
        }
        for project in archived_projects {
            issues.add(Some(&project), None, "This project is archived. Its cards are included, but restore the project before applying their tag changes.");
        }
        let issues = issues.finish();
        Ok(json!({
            "version": version,
            "source": source,
            "target": target,
            "complete": issues.is_empty(),
            "issues": issues,
            "changes": changes,
        }))
    }

    /// Caller holds the workspace gate. Each project lock protects its own read,
    /// and every observed card carries a version for subsequent mutation checks.
    fn scan_tag_cards(
        &self,
        workspace: &project_domain::models::Workspace,
        mut visit: impl FnMut(SourceCard<'_>),
    ) -> Result<Issues, AppError> {
        let mut issues = Issues::default();
        let mut scanned = 0;
        let mut projects = workspace.projects.iter().collect::<Vec<_>>();
        projects.sort_by_key(|project| project.project_id.as_str());
        for registration in projects {
            let project_id = registration.project_id.as_str();
            let handle = match self.store(project_id) {
                Ok(handle) => handle,
                Err(_) => {
                    issues.add(
                        Some(project_id),
                        None,
                        "This project is unavailable; its tag usage could not be read.",
                    );
                    continue;
                }
            };
            let store = handle
                .lock()
                .map_err(|_| AppError::LockPoisoned("project store"))?;
            let project = match read(&store, Kind::Project, project_id) {
                Ok(project) => project,
                Err(_) => {
                    issues.add(Some(project_id), None, "This project's source is invalid or unavailable; its tag usage could not be read.");
                    continue;
                }
            };
            let project_domain::models::Document::Project { metadata, .. } = project.document.get()
            else {
                return Err(AppError::invariant("project source kind"));
            };
            let project_name = metadata.name.as_str();
            let project_archived = metadata.state == project_domain::models::ProjectState::Archived;
            let directory = match store.directory.child("cards", false) {
                Ok(directory) => directory,
                Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    continue;
                }
                Err(_) => {
                    issues.add(Some(project_id), None, "This project's card folder is unavailable; its tag usage could not be read.");
                    continue;
                }
            };
            let names = match directory.names() {
                Ok(names) => names,
                Err(_) => {
                    issues.add(
                        Some(project_id),
                        None,
                        "This project's card folder could not be listed within the source limits.",
                    );
                    continue;
                }
            };
            for filename in names {
                let Some(card_id) = filename.strip_suffix(".md") else {
                    continue;
                };
                if scanned >= MAX_SCANNED_CARDS {
                    issues.add(None, None, "The source scan reached its limit of 50,000 card files; tag usage and previews are incomplete.");
                    return Ok(issues);
                }
                scanned += 1;
                if !Uuid::parse_str(card_id).is_ok_and(|id| {
                    id.get_version_num() == 4
                        && id.get_variant() == uuid::Variant::RFC4122
                        && id.to_string() == card_id
                }) {
                    issues.add(
                        Some(project_id),
                        None,
                        "A card file has an invalid identifier; its tag usage could not be read.",
                    );
                    continue;
                }
                let card = match read(&store, Kind::Card, card_id) {
                    Ok(card) => card,
                    Err(_) => {
                        issues.add(
                            Some(project_id),
                            Some(card_id),
                            "This card is invalid or unavailable; its tag usage could not be read.",
                        );
                        continue;
                    }
                };
                let project_domain::models::Document::Card { metadata, .. } = card.document.get()
                else {
                    return Err(AppError::invariant("card source kind"));
                };
                visit(SourceCard {
                    project_id,
                    project_name,
                    project_archived,
                    card_id,
                    title: &metadata.title,
                    version: &card.version,
                    labels: metadata.labels.clone().unwrap_or_default(),
                });
            }
        }
        Ok(issues)
    }
}
