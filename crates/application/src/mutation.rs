use crate::{
    AppError, Reply,
    engine::Engine,
    instant,
    journal::{Command, Reference, Target},
    now_millis,
    source::{collection, read},
    wire,
    writer::Writer,
};
use project_domain::ordering::{Position, validate_dependencies};
use project_store::{document::Kind, filesystem::ProjectStore};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone)]
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
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
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
        let known_id = self.journal.command_target(&epoch, &request_id)?;
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
        let handle = match self.store(&project_id) {
            Ok(handle) => handle,
            Err(error) => return self.journal.reject_error(&command, error, now_millis()),
        };
        let mut store = handle
            .lock()
            .map_err(|_| AppError::LockPoisoned("project store"))?;
        let now = now_millis();
        let prepared = match prepare(&self.journal, &store, &command, create, now) {
            Ok(value) => value,
            Err(AppError::Rejected(reply)) => return reject(reply),
            Err(error) => return Err(error),
        };
        let mut reply = Writer {
            journal: &self.journal,
        }
        .execute(&mut store, &command, prepared.references, now, |_| {
            Ok(prepared.draft)
        })?;
        if reply.http_status == 200
            && reply.body["status"] == "committed"
            && self
                .index
                .refresh_targets(&store, &project_id, &[(kind, id.clone())], now)
                .is_err()
        {
            reply.body["warnings"].as_array_mut().unwrap().push(json!({"code":"PROJECTION_DEGRADED","message":"Source committed; the search index needs rebuilding."}));
            let _ = self
                .index
                .mark_unavailable(&project_id, "PROJECTION_DEGRADED", now);
            // The source is already committed. Failure to enrich the replay warning
            // must not turn this successful write into a rejected command.
            let _ = self.journal.update_result(&command, &reply);
        }
        Ok(reply)
    }
}
/// A patch remains JSON until defaults, placement and references are resolved.
/// Writer validates this complete candidate before serializing or preparing an intent.
struct PreparedMutation {
    draft: Value,
    references: Vec<Reference>,
}

fn prepare(
    journal: &crate::journal::Journal,
    store: &ProjectStore,
    command: &Command,
    create: bool,
    now: i64,
) -> Result<PreparedMutation, AppError> {
    let kind = command.target.kind;
    let id = &command.target.id;
    let project_id = &command.target.project_id;
    let payload = &command.payload;
    let project = read(store, Kind::Project, project_id)?;
    if kind != Kind::Project && project.document.get().status() == Some("archived") {
        return Err(AppError::reject(409, "PROJECT_ARCHIVED"));
    }
    let mut references = if kind == Kind::Project {
        vec![]
    } else {
        vec![Reference {
            kind: Kind::Project,
            id: project_id.clone(),
            version: Some(project.version),
        }]
    };
    let previous = if create {
        None
    } else {
        let source = read(store, kind, id)?;
        if command.expected.as_deref() != Some(&source.version) {
            return Err(AppError::reject(412, "VERSION_CONFLICT"));
        }
        Some(source)
    };
    let mut next = match &previous {
        None => create_document(command, now),
        Some(previous) => patch_document(journal, command, previous)?,
    };
    let reorders = matches!(kind, Kind::Card | Kind::Milestone)
        && (create
            || payload.get("placement").is_some()
            || previous.as_ref().is_some_and(|old| {
                old.document.get().status() != next["metadata"]["status"].as_str()
            }));
    let validates_dependencies = kind == Kind::Card
        && (create || payload["set"].get("depends_on").is_some() || payload.get("undo").is_some());
    // Ordering and graph validation share the same source observations. The
    // writer still verifies every distinct reference immediately before prepare.
    let siblings = if reorders || validates_dependencies {
        collection(store, kind)?
    } else {
        Vec::new()
    };
    if reorders {
        let placement = resolve_placement(kind, id, payload, &next, &siblings)?;
        next["metadata"]["position"] = json!(placement.position.to_string());
        references.extend(placement.references);
    }
    if let Some(milestone) = next["metadata"]["milestone_id"].as_str() {
        let version = read(store, Kind::Milestone, milestone)?.version;
        references.push(Reference {
            kind: Kind::Milestone,
            id: milestone.into(),
            version: Some(version),
        });
    }
    if validates_dependencies {
        let mut graph = BTreeMap::new();
        for source in &siblings {
            let document = source.document.get();
            let card = document.id();
            graph.insert(card.to_owned(), document.dependencies().to_vec());
            if card != id {
                references.push(Reference {
                    kind: Kind::Card,
                    id: card.into(),
                    version: Some(source.version.clone()),
                });
            }
        }
        graph.insert(id.clone(), dependencies(&next["metadata"]));
        validate_dependencies(&graph).map_err(|_| AppError::reject(422, "DEPENDENCY_INVALID"))?;
    }
    if kind == Kind::Update {
        references.extend(report_references(store, &next)?);
    }
    Ok(PreparedMutation {
        draft: next,
        references,
    })
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

fn create_document(command: &Command, now: i64) -> Value {
    let kind = command.target.kind;
    let id = &command.target.id;
    let payload = &command.payload;

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
}

fn patch_document(
    journal: &crate::journal::Journal,
    command: &Command,
    previous: &project_store::document::ParsedDocument,
) -> Result<Value, AppError> {
    let payload = &command.payload;
    let mut next = previous.value();

    if let Some(undo) = payload.get("undo") {
        let current = &previous.version;
        next = crate::history::undo_document(
            journal,
            command,
            undo["history_entry_id"]
                .as_str()
                .ok_or(AppError::invariant("validated undo history entry ID"))?,
            current,
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
    Ok(next)
}

fn report_references(store: &ProjectStore, next: &Value) -> Result<Vec<Reference>, AppError> {
    let mut references = Vec::new();

    let target = &next["metadata"]["target"];
    let target_kind: Kind = serde_json::from_value(target["type"].clone())
        .map_err(|_| AppError::reject(422, "INVALID_TARGET"))?;
    let target_id = target["id"].as_str().unwrap();
    let version = read(store, target_kind, target_id)?.version;
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
        let version = read(store, Kind::Update, id)?.version;
        references.push(Reference {
            kind: Kind::Update,
            id: id.into(),
            version: Some(version),
        });
    }

    Ok(references)
}

struct Placement {
    position: Position,
    references: Vec<Reference>,
}

fn resolve_placement(
    kind: Kind,
    id: &str,
    payload: &Value,
    next: &Value,
    siblings: &[project_store::document::ParsedDocument],
) -> Result<Placement, AppError> {
    let mut ordered = siblings
        .iter()
        .filter(|source| {
            let document = source.document.get();
            document.id() != id
                && (kind != Kind::Card || document.status() == next["metadata"]["status"].as_str())
        })
        .collect::<Vec<_>>();
    ordered.sort_by(|a, b| {
        let a = a.document.get();
        let b = b.document.get();
        a.position().cmp(&b.position()).then(a.id().cmp(b.id()))
    });
    let ids = ordered
        .iter()
        .map(|source| source.document.get().id())
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
        Position::parse(
            ordered[slot]
                .document
                .get()
                .position()
                .ok_or_else(|| AppError::invariant("ordered document position"))?,
        )
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
    let position = Position::between(low, high)
        .map_err(|_| AppError::reject(409, "ORDER_REBALANCE_REQUIRED"))?;
    let references = ordered
        .iter()
        .map(|source| Reference {
            kind,
            id: source.document.get().id().into(),
            version: Some(source.version.clone()),
        })
        .collect();

    Ok(Placement {
        position,
        references,
    })
}
