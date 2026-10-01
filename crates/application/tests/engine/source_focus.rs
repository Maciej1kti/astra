use super::*;
use crate::AppError;

fn external_cards(path: &std::path::Path, count: usize, pins: usize) -> Vec<String> {
    let cards = path.join(".project/cards");
    fs::create_dir_all(&cards).unwrap();
    (0..count)
        .map(|index| {
            let id = format!("00000000-0000-4000-8000-{index:012x}");
            let value = json!({
                "type": "card",
                "metadata": {
                    "id": id, "title": format!("External card {index}"),
                    "status": "planned", "priority": "normal",
                    "position": format!("{:032x}", count - index),
                    "archived": index == 0, "pinned": index < pins,
                    "created_at": "2026-10-01T10:00:00Z",
                    "updated_at": "2026-10-01T10:00:00Z"
                },
                "body": "External source body."
            });
            project_domain::validate_document(value.clone()).unwrap();
            fs::write(
                cards.join(format!("{id}.json")),
                serde_json::to_vec(&value).unwrap(),
            )
            .unwrap();
            id
        })
        .collect()
}

fn references(
    project: &str,
    ids: &[String],
    order: &[usize],
) -> Vec<project_domain::models::FocusRef> {
    order
        .iter()
        .map(|index| project_domain::models::FocusRef {
            project_id: project.into(),
            card_id: ids[*index].clone(),
        })
        .collect()
}

#[test]
fn source_focus_preserves_scope_archived_pins_order_and_external_membership() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let other_project = register(&engine, other.to_str().unwrap());
    let ids = external_cards(&env.root.join("project"), 128, 4);
    let other_ids = external_cards(&other, 2, 1);
    let mut workspace = engine.workspace().unwrap().value;
    workspace.focus = references(&other_project, &other_ids, &[0]);
    workspace.focus.extend(references(&project, &ids, &[1, 6]));
    let mut expected = references(&other_project, &other_ids, &[0]);
    expected.extend(references(&project, &ids, &[1, 3, 2, 0]));
    assert_eq!(engine.source_focus(&workspace).unwrap(), expected);
    assert_eq!(
        engine.source_focus_in(&workspace, Some(&project)).unwrap(),
        references(&project, &ids, &[1, 3, 2, 0])
    );

    for (index, pinned) in [(3, false), (5, true)] {
        let path = env
            .root
            .join(format!("project/.project/cards/{}.json", ids[index]));
        let mut value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        value["metadata"]["pinned"] = json!(pinned);
        value["metadata"]["position"] = json!(format!("{:032x}", 1));
        fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
    }
    fs::write(
        other.join(format!(".project/cards/{}.json", other_ids[1])),
        b"invalid",
    )
    .unwrap();
    assert_eq!(
        engine.source_focus_in(&workspace, Some(&project)).unwrap(),
        references(&project, &ids, &[1, 5, 2, 0])
    );
    let AppError::Rejected(reply) = engine.source_focus(&workspace).unwrap_err() else {
        panic!("An unfiltered invalid source must still reject pin discovery");
    };
    assert_eq!(reply.body["error"]["code"], "DOCUMENT_INVALID");
}

#[test]
fn source_focus_validates_later_sources_before_reporting_pin_overflow() {
    use std::os::unix::fs::symlink;
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let ids = external_cards(&env.root.join("project"), 128, 101);
    let workspace = engine.workspace().unwrap().value;
    let first = env
        .root
        .join(format!("project/.project/cards/{}.json", ids[0]));
    let last = env
        .root
        .join(format!("project/.project/cards/{}.json", ids[127]));
    let saved_first = fs::read(&first).unwrap();
    let saved_last = fs::read(&last).unwrap();
    fs::write(&first, b"invalid").unwrap();
    fs::remove_file(&last).unwrap();
    symlink(&first, &last).unwrap();
    let AppError::Rejected(reply) = engine.source_focus(&workspace).unwrap_err() else {
        panic!("The first invalid source precedes unsafe neighbors and pin overflow");
    };
    assert_eq!(reply.body["error"]["code"], "DOCUMENT_INVALID");
    fs::write(&first, saved_first).unwrap();
    assert!(matches!(
        engine.source_focus(&workspace),
        Err(AppError::Store(_))
    ));
    fs::remove_file(&last).unwrap();
    fs::write(&last, saved_last).unwrap();
    let AppError::Rejected(reply) = engine.source_focus(&workspace).unwrap_err() else {
        panic!("A fully valid collection with 101 pins must retain its bound");
    };
    assert_eq!(reply.body["error"]["code"], "FOCUS_LIMIT");
    assert!(engine.source_focus_in(&workspace, Some(&project)).is_err());
}

#[test]
fn source_focus_distinguishes_a_missing_collection_from_a_replaced_lease() {
    let env = Environment::new();
    let engine = env.engine();
    register(&engine, &env.path());
    let workspace = engine.workspace().unwrap().value;
    let source = env.root.join("project/.project");
    let cards = source.join("cards");
    if cards.exists() {
        fs::remove_dir_all(cards).unwrap();
    }
    assert!(engine.source_focus(&workspace).unwrap().is_empty());
    let lease = source.join(".local/writer.lock");
    fs::rename(&lease, source.join(".local/retired.lock")).unwrap();
    fs::write(lease, b"").unwrap();
    assert!(matches!(
        engine.source_focus(&workspace),
        Err(AppError::Store(project_store::StoreError::Invalid(
            "LEASE_REPLACED"
        )))
    ));
}

#[test]
fn source_focus_retains_real_source_and_pin_bounds_and_error_precedence() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let ids = external_cards(&env.root.join("project"), 50_001, 101);
    let workspace = engine.workspace().unwrap().value;
    let reject = || {
        let AppError::Rejected(reply) = engine.source_focus(&workspace).unwrap_err() else {
            panic!("The current source collection must retain its rejection");
        };
        reply.body["error"]["code"].as_str().unwrap().to_owned()
    };
    assert_eq!(reject(), "FOCUS_SOURCE_LIMIT");
    let last = env
        .root
        .join(format!("project/.project/cards/{}.json", ids[50_000]));
    fs::write(&last, b"invalid").unwrap();
    assert_eq!(reject(), "DOCUMENT_INVALID");
    fs::remove_file(last).unwrap();
    assert_eq!(reject(), "FOCUS_LIMIT");
    let overflow = env
        .root
        .join(format!("project/.project/cards/{}.json", ids[100]));
    let mut value: Value = serde_json::from_slice(&fs::read(&overflow).unwrap()).unwrap();
    value["metadata"]["pinned"] = json!(false);
    fs::write(overflow, serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(
        engine.source_focus_in(&workspace, Some(&project)).unwrap(),
        references(&project, &ids, &(0..100).rev().collect::<Vec<_>>())
    );
}
