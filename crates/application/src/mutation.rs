use crate::{
    AppError, Reply,
    engine::{Engine, collection, read},
    instant,
    journal::{Command, Reference, Target},
    now_millis, wire,
    writer::Writer,
};
use project_domain::ordering::{Position, validate_dependencies};
use project_store::{document::Kind, filesystem::ProjectStore};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

pub struct Mutation {
    pub project_id: String,
    pub kind: Kind,
    pub id: Option<String>,
    pub payload: Value,
    pub request_id: String,
    pub epoch: String,
    pub expected: Option<String>,
}
impl Engine {
    pub fn mutate(&self, input: Mutation) -> Result<Reply, AppError> {
        let _gate = self.gate.read().map_err(|_| AppError::State)?;
        let Mutation {
            project_id,
            kind,
            id,
            payload,
            request_id,
            epoch,
            expected,
        } = input;
        let create = id.is_none();
        let definition = match (kind, create) {
            (Kind::Card, true) => "CardCreate",
            (Kind::Card, false) => "CardPatch",
            (Kind::Milestone, true) => "MilestoneCreate",
            (Kind::Milestone, false) => "MilestonePatch",
            (Kind::Update, true) => "UpdateCreate",
            (Kind::Project, false) => "ProjectPatch",
            _ => return Err(AppError::reject(405, "METHOD_NOT_ALLOWED")),
        };
        let known_id: Option<String> = self
            .journal
            .db()?
            .query_row(
                "SELECT target_id FROM commands WHERE epoch=?1 AND request_id=?2",
                params![epoch, request_id],
                |r| r.get(0),
            )
            .optional()?;
        let id = id
            .or_else(|| payload["id"].as_str().map(str::to_owned))
            .or(known_id)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let command = Command {
            request_id: request_id.clone(),
            epoch: epoch.clone(),
            method: if create { "POST" } else { "PATCH" }.into(),
            target: Target {
                project_id: project_id.clone(),
                kind,
                id: id.clone(),
            },
            expected,
            payload: payload.clone(),
        };
        if let Some(reply) = self.journal.admit(&command, now_millis())? {
            return Ok(reply);
        }
        let reject = |mut reply: Reply| -> Result<Reply, AppError> {
            reply.body["error"]["request_id"] = json!(request_id);
            Ok(self
                .journal
                .record(&command, &reply, None, now_millis(), true)?
                .unwrap_or(reply))
        };
        if !create && command.expected.is_none() {
            return reject(Reply::error(428, "PRECONDITION_REQUIRED", &request_id));
        }
        match wire::validate(definition, &payload) {
            Ok(()) => {}
            Err(AppError::Rejected(reply)) => return reject(reply),
            Err(error) => return Err(error),
        }
        let handle = self.store(&project_id)?;
        let mut store = handle.lock().map_err(|_| AppError::State)?;
        let now = now_millis();
        let (next, references) = match prepare(&self.journal, &store, &command, create, now) {
            Ok(value) => value,
            Err(AppError::Rejected(reply)) => return reject(reply),
            Err(error) => return Err(error),
        };
        let mut reply = Writer {
            journal: &self.journal,
        }
        .execute(&mut store, &command, references, now, |_| Ok(next))?;
        if reply.http_status == 200
            && reply.body["status"] == "committed"
            && self.index.refresh(&store, &project_id, now).is_err()
        {
            reply.body["warnings"].as_array_mut().unwrap().push(json!({"code":"PROJECTION_DEGRADED","message":"Source committed; the search index needs rebuilding."}));
            let _ = self
                .index
                .mark_unavailable(&project_id, "PROJECTION_DEGRADED", now);
            if let Ok(db) = self.journal.db() {
                let _ = db.execute(
                    "UPDATE commands SET result_json=?3 WHERE epoch=?1 AND request_id=?2",
                    params![epoch, request_id, serde_json::to_string(&reply).unwrap()],
                );
            }
        }
        Ok(reply)
    }
}
fn prepare(
    journal: &crate::journal::Journal,
    store: &ProjectStore,
    command: &Command,
    create: bool,
    now: i64,
) -> Result<(Value, Vec<Reference>), AppError> {
    let kind = command.target.kind;
    let id = &command.target.id;
    let project_id = &command.target.project_id;
    let payload = &command.payload;
    let (project, project_version) = read(store, Kind::Project, project_id)?;
    if kind != Kind::Project && project["metadata"]["state"] == "archived" {
        return Err(AppError::reject(409, "PROJECT_ARCHIVED"));
    }
    let mut references = if kind == Kind::Project {
        vec![]
    } else {
        vec![Reference {
            kind: Kind::Project,
            id: project_id.clone(),
            version: Some(project_version),
        }]
    };
    let previous = if create {
        None
    } else {
        Some(read(store, kind, id)?.0)
    };
    let mut next = if create {
        let mut metadata = payload.clone();
        let body = metadata
            .as_object_mut()
            .unwrap()
            .remove("body")
            .unwrap_or(json!(""));
        metadata["id"] = json!(id);
        if kind == Kind::Update {
            metadata["recorded_at"] = json!(instant(now));
        } else {
            metadata["created_at"] = json!(instant(now));
            metadata["updated_at"] = json!(instant(now));
            metadata
                .as_object_mut()
                .unwrap()
                .entry("status")
                .or_insert(json!("planned"));
            metadata
                .as_object_mut()
                .unwrap()
                .entry("archived")
                .or_insert(json!(false));
            if kind == Kind::Card {
                metadata
                    .as_object_mut()
                    .unwrap()
                    .entry("kind")
                    .or_insert(json!("outcome"));
                metadata
                    .as_object_mut()
                    .unwrap()
                    .entry("priority")
                    .or_insert(json!("normal"));
            }
        }
        json!({"type":kind.as_str(),"metadata":metadata,"body":body})
    } else {
        let mut next = previous.clone().unwrap();
        if let Some(undo) = payload.get("undo") {
            let (_, current) = read(store, kind, id)?;
            next = crate::history::undo_document(
                journal,
                command,
                undo["history_entry_id"].as_str().ok_or(AppError::State)?,
                &current,
            )?;
        }
        if let Some(set) = payload["set"].as_object() {
            for (key, value) in set {
                if key == "body" {
                    next["body"] = value.clone();
                } else {
                    next["metadata"][key] = value.clone();
                }
            }
        }
        if let Some(clear) = payload["clear"].as_array() {
            for key in clear {
                let key = key.as_str().unwrap();
                if payload["set"].get(key).is_some() {
                    return Err(AppError::reject(422, "SET_CLEAR_OVERLAP"));
                }
                next["metadata"].as_object_mut().unwrap().remove(key);
            }
        }
        next
    };
    let reorders = matches!(kind, Kind::Card | Kind::Milestone)
        && (create
            || payload.get("placement").is_some()
            || previous
                .as_ref()
                .is_some_and(|old| old["metadata"]["status"] != next["metadata"]["status"]));
    if reorders {
        let mut ordered = collection(store, kind)?
            .into_iter()
            .filter(|(value, _)| {
                value["metadata"]["id"] != *id
                    && (kind != Kind::Card
                        || value["metadata"]["status"] == next["metadata"]["status"])
            })
            .collect::<Vec<_>>();
        ordered.sort_by(|a, b| {
            a.0["metadata"]["position"]
                .as_str()
                .cmp(&b.0["metadata"]["position"].as_str())
                .then(
                    a.0["metadata"]["id"]
                        .as_str()
                        .cmp(&b.0["metadata"]["id"].as_str()),
                )
        });
        let ids = ordered
            .iter()
            .map(|(value, _)| value["metadata"]["id"].as_str().unwrap())
            .collect::<Vec<_>>();
        let slot = if let Some(placement) = payload.get("placement") {
            let after = placement["after_id"].as_str();
            let before = placement["before_id"].as_str();
            let slot = match after {
                None => 0,
                Some(id) => ids
                    .iter()
                    .position(|item| *item == id)
                    .map(|p| p + 1)
                    .ok_or_else(|| AppError::reject(409, "ORDER_CHANGED"))?,
            };
            if ids.get(slot).copied() != before {
                return Err(AppError::reject(409, "ORDER_CHANGED"));
            }
            slot
        } else {
            ordered.len()
        };
        let position = |slot: usize| -> Result<Position, AppError> {
            Position::parse(ordered[slot].0["metadata"]["position"].as_str().unwrap())
                .map_err(|_| AppError::reject(409, "ORDER_REBALANCE_REQUIRED"))
        };
        let low = if slot == 0 {
            None
        } else {
            Some(position(slot - 1)?)
        };
        let high = if slot == ordered.len() {
            None
        } else {
            Some(position(slot)?)
        };
        next["metadata"]["position"] = json!(
            Position::between(low, high)
                .map_err(|_| AppError::reject(409, "ORDER_REBALANCE_REQUIRED"))?
                .to_string()
        );
        references.extend(ordered.iter().map(|(value, version)| Reference {
            kind,
            id: value["metadata"]["id"].as_str().unwrap().into(),
            version: Some(version.clone()),
        }));
    }
    if let Some(milestone) = next["metadata"]["milestone_id"].as_str() {
        let (_, version) = read(store, Kind::Milestone, milestone)?;
        references.push(Reference {
            kind: Kind::Milestone,
            id: milestone.into(),
            version: Some(version),
        });
    }
    if kind == Kind::Card
        && (create || payload["set"].get("depends_on").is_some() || payload.get("undo").is_some())
    {
        let cards = collection(store, Kind::Card)?;
        let mut graph = BTreeMap::new();
        for (value, version) in &cards {
            let card = value["metadata"]["id"].as_str().unwrap();
            graph.insert(card.to_owned(), dependencies(&value["metadata"]));
            if card != id {
                references.push(Reference {
                    kind: Kind::Card,
                    id: card.into(),
                    version: Some(version.clone()),
                });
            }
        }
        graph.insert(id.clone(), dependencies(&next["metadata"]));
        validate_dependencies(&graph).map_err(|_| AppError::reject(422, "DEPENDENCY_INVALID"))?;
    }
    if kind == Kind::Update {
        let target = &next["metadata"]["target"];
        let target_kind: Kind = serde_json::from_value(target["type"].clone())
            .map_err(|_| AppError::reject(422, "INVALID_TARGET"))?;
        let target_id = target["id"].as_str().unwrap();
        let (_, version) = read(store, target_kind, target_id)?;
        references.push(Reference {
            kind: target_kind,
            id: target_id.into(),
            version: Some(version),
        });
        let mut updates = next["metadata"]["resolves"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if let Some(id) = next["metadata"].get("supersedes") {
            updates.push(id.clone());
        }
        for update in updates {
            let id = update.as_str().unwrap();
            let (_, version) = read(store, Kind::Update, id)?;
            references.push(Reference {
                kind: Kind::Update,
                id: id.into(),
                version: Some(version),
            });
        }
    }
    Ok((next, references))
}
fn dependencies(metadata: &Value) -> Vec<String> {
    metadata["depends_on"]
        .as_array()
        .map(|v| {
            v.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}
