//! Pin membership belongs to card source; workspace focus is only a local order.
use crate::{
    AppError,
    engine::Engine,
    index::{Indexed, ProjectionStatus},
    source::collection,
};
use project_domain::models::{Document, FocusRef, Workspace};
use project_store::document::Kind;
use rusqlite::params;
use serde_json::{Value, json};
use std::collections::HashMap;

const MAX_FOCUS: usize = 100;
const MAX_SCANNED_CARDS: usize = 50_000;

impl Engine {
    pub fn focus_resource(&self) -> Result<Value, AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let workspace = self.workspace()?;
        self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, None)?;
            let projects = serde_json::to_string(&workspace.value.projects).unwrap();
            let ordering = serde_json::to_string(&workspace.value.focus).unwrap();
            let mut statement = db.prepare(include_str!("focus-membership.sql"))?;
            let mut rows = statement
                .query_map(params![projects, ordering, (MAX_FOCUS + 1) as i64], |row| {
                    let reference = FocusRef {
                        project_id: row.get(0)?,
                        card_id: row.get(1)?,
                    };
                    let card = if let Some(version) = row.get::<_, Option<String>>(2)? {
                        Some(Indexed {
                            project_id: reference.project_id.clone(),
                            kind: "card".into(),
                            id: reference.card_id.clone(),
                            version,
                            metadata: serde_json::from_str(&row.get::<_, String>(3)?)
                                .map_err(|_| rusqlite::Error::InvalidQuery)?,
                            validity: row.get(4)?,
                        })
                    } else {
                        None
                    };
                    Ok((reference, card))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let overflow = rows.len() > MAX_FOCUS;
            rows.truncate(MAX_FOCUS);
            let (items, cards): (Vec<_>, Vec<_>) = rows.into_iter().unzip();
            let mut cards: Vec<_> = cards.into_iter().flatten().collect();
            projection.mark_rows(&mut cards);
            let issues: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM projection_issues)", [], |r| r.get(0))?;
            let complete = !overflow && !issues && projection.freshness != "stale";
            let mut warnings = projection.warnings;
            if issues { warnings.push(json!({"code":"FOCUS_INCOMPLETE","message":"Some project sources are unavailable or invalid. Retained pins may be stale; check host diagnostics."})); }
            if overflow { warnings.push(json!({"code":"FOCUS_LIMIT","message":"Showing the first 100 pins. Unpin cards to restore ordering; other cards remain accessible in List."})); }
            Ok(json!({"items":items,"cards":cards.iter().map(Indexed::summary).collect::<Vec<_>>(),"version":workspace.version,"complete":complete,
                "page":{"next_cursor":null,"snapshot_cursor":revision,"has_more":false,"freshness":if complete {"index_snapshot"} else {"stale"}},"warnings":warnings}))
        })
    }

    pub(crate) fn admit_pin(&self) -> Result<(), AppError> {
        let workspace = self.workspace()?.value;
        for project in &workspace.projects {
            // An unresolved write may already reserve a pin whose rename is not visible.
            if self.journal.has_pending(&project.project_id)? {
                return Err(AppError::reject(409, "WORKSPACE_RECOVERY_REQUIRED"));
            }
        }
        if self.source_focus(&workspace)?.len() >= MAX_FOCUS {
            return Err(AppError::reject(422, "FOCUS_LIMIT"));
        }
        Ok(())
    }

    pub(crate) fn source_focus(&self, workspace: &Workspace) -> Result<Vec<FocusRef>, AppError> {
        self.source_focus_in(workspace, None)
    }

    pub(crate) fn source_focus_in(
        &self,
        workspace: &Workspace,
        only_project: Option<&str>,
    ) -> Result<Vec<FocusRef>, AppError> {
        let mut pinned = Vec::new();
        let mut scanned = 0;
        for registration in &workspace.projects {
            if only_project.is_some_and(|id| id != registration.project_id) {
                continue;
            }
            let handle = self.store(&registration.project_id)?;
            let store = handle
                .lock()
                .map_err(|_| AppError::LockPoisoned("project store"))?;
            let mut cards = collection(&store, Kind::Card)?;
            scanned += cards.len();
            if scanned > MAX_SCANNED_CARDS {
                return Err(AppError::reject(422, "FOCUS_SOURCE_LIMIT"));
            }
            cards.retain(|card| matches!(card.document.get(), Document::Card { metadata, .. } if metadata.pinned == Some(true)));
            cards.sort_by(|a, b| {
                let a = a.document.get();
                let b = b.document.get();
                a.position()
                    .cmp(&b.position())
                    .then_with(|| a.id().cmp(b.id()))
            });
            for card in cards {
                if let Document::Card { metadata, .. } = card.document.get()
                    && metadata.pinned == Some(true)
                {
                    pinned.push(FocusRef {
                        project_id: registration.project_id.clone(),
                        card_id: metadata.id.clone(),
                    });
                    if pinned.len() > MAX_FOCUS {
                        return Err(AppError::reject(422, "FOCUS_LIMIT"));
                    }
                }
            }
        }
        let rank = workspace
            .focus
            .iter()
            .enumerate()
            .map(|(index, item)| ((item.project_id.as_str(), item.card_id.as_str()), index))
            .collect::<HashMap<_, _>>();
        pinned.sort_by_key(|item| {
            rank.get(&(item.project_id.as_str(), item.card_id.as_str()))
                .copied()
                .unwrap_or(usize::MAX)
        });
        Ok(pinned)
    }
}
