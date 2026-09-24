//! Pin membership belongs to card source; workspace focus is only a local order.
use crate::{AppError, engine::Engine, source::collection};
use project_domain::models::{Document, FocusRef, Workspace};
use project_store::document::Kind;
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
        let items = self.source_focus(&workspace.value)?;
        Ok(json!({"items":items,"version":workspace.version}))
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
