use project_domain::{
    local_date,
    ordering::{Position, validate_dependencies},
    validate_document, validate_workspace,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::PathBuf};

fn read(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_slice(&std::fs::read(root.join(path)).unwrap()).unwrap()
}
fn card() -> Value {
    read("examples/card-22222222-2222-4222-8222-222222222222.json")
}

#[test]
fn examples_roundtrip_without_losing_optional_fields_or_body() {
    for file in [
        "project.json",
        "card-22222222-2222-4222-8222-222222222222.json",
        "card-33333333-3333-4333-8333-333333333333.json",
        "milestone.json",
        "update.json",
    ] {
        let input = read(&format!("examples/{file}"));
        let output = validate_document(input.clone()).unwrap();
        assert_eq!(serde_json::to_value(output.get()).unwrap(), input, "{file}");
    }
    let input = read("examples/workspace.json");
    assert_eq!(
        serde_json::to_value(validate_workspace(input.clone()).unwrap().get()).unwrap(),
        input
    );
}

#[test]
fn handoff_document_vectors() {
    for case in read("tests/vectors.json")["document_cases"]
        .as_array()
        .unwrap()
    {
        let mut value = read(case["base"].as_str().unwrap());
        for change in case["changes"].as_array().unwrap() {
            let path = change["path"].as_str().unwrap();
            let (parent, key) = path.rsplit_once('/').unwrap();
            let object = value.pointer_mut(parent).unwrap().as_object_mut().unwrap();
            match change["op"].as_str().unwrap() {
                "set" => {
                    object.insert(key.to_owned(), change["value"].clone());
                }
                "remove" => {
                    object.remove(key);
                }
                unknown => panic!("unsupported vector operation {unknown}"),
            }
        }
        let result = if value.get("type").is_some() {
            validate_document(value.clone()).map(|v| serde_json::to_value(v.get()).unwrap())
        } else {
            validate_workspace(value.clone()).map(|v| serde_json::to_value(v.get()).unwrap())
        };
        assert_eq!(
            result.is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}: {result:?}",
            case["id"]
        );
        if let Ok(output) = result {
            assert_eq!(output, value);
        }
    }
}

#[test]
fn handoff_calendar_vectors() {
    for case in read("tests/vectors.json")["date_cases"].as_array().unwrap() {
        let dates = local_date(case["start"].as_str().unwrap()).and_then(|start| {
            local_date(case["end"].as_str().unwrap()).map(|end| (end - start).num_days() + 1)
        });
        assert_eq!(
            dates.is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["id"]
        );
        if let Ok(days) = dates {
            assert_eq!(days, case["inclusive_days"].as_i64().unwrap());
        }
    }
    for invalid in ["2026-9-05", "２０２６-09-05", "2026-09-05Z", "2026-02-29"] {
        assert!(local_date(invalid).is_err());
    }
}

#[test]
fn handoff_graph_vectors_and_long_chain() {
    for case in read("tests/vectors.json")["graph_cases"]
        .as_array()
        .unwrap()
    {
        let graph = serde_json::from_value(case["graph"].clone()).unwrap();
        assert_eq!(
            validate_dependencies(&graph).is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["id"]
        );
    }
    let graph: BTreeMap<_, _> = (0..10_000)
        .map(|i| {
            (
                i.to_string(),
                if i == 0 {
                    vec![]
                } else {
                    vec![(i - 1).to_string()]
                },
            )
        })
        .collect();
    assert!(validate_dependencies(&graph).is_ok());
    assert!(
        validate_dependencies(&BTreeMap::from([
            ("a".into(), vec![]),
            ("b".into(), vec!["a".into(), "a".into()])
        ]))
        .is_err()
    );
}

#[test]
fn handoff_rank_vectors_and_exhaustion() {
    for case in read("tests/vectors.json")["rank_cases"].as_array().unwrap() {
        let bound = |key: &str| {
            let text = case[key].as_str().unwrap();
            if text == "00000000000000000000000000000000"
                || text == "ffffffffffffffffffffffffffffffff"
            {
                None
            } else {
                Some(Position::parse(text).unwrap())
            }
        };
        let midpoint = Position::between(bound("low"), bound("high"))
            .ok()
            .map(|p| p.to_string());
        assert_eq!(
            midpoint.as_deref(),
            case["midpoint"].as_str(),
            "{}",
            case["id"]
        );
    }
    for invalid in [
        "0",
        "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE",
        "00000000000000000000000000000000",
        "ffffffffffffffffffffffffffffffff",
    ] {
        assert!(Position::parse(invalid).is_err());
    }
    let rank = Position::between(None, None).unwrap();
    assert!(Position::between(Some(rank), Some(rank)).is_err());
}

#[test]
fn validation_enforces_bytes_depth_and_safe_extensions() {
    let mut value = card();
    value["body"] = json!("ą".repeat(491_521));
    assert!(
        validate_document(value).is_err(),
        "body limit is bytes, not characters"
    );
    let mut value = card();
    let mut nested = json!(0);
    for _ in 0..13 {
        nested = json!([nested]);
    }
    value["metadata"]["x-test"] = nested;
    assert!(validate_document(value).is_err());
    let mut value = card();
    value["metadata"]["x-test"] = json!({"constructor": {"prototype": true}});
    assert!(validate_document(value).is_err());
    let mut value = card();
    value["metadata"]["x-test"] = json!(vec![0; 10_001]);
    assert!(validate_document(value).is_err());
    let mut value = card();
    value["metadata"]["title"] = json!("bad\0title");
    assert!(validate_document(value).is_err());
}

#[test]
fn fractional_timestamps_compare_as_instants() {
    let mut value = card();
    value["metadata"]["created_at"] = json!("2026-09-05T10:00:00Z");
    value["metadata"]["updated_at"] = json!("2026-09-05T10:00:00.001Z");
    assert!(validate_document(value.clone()).is_ok());
    value["metadata"]["created_at"] = json!("2026-09-05T10:00:00.002Z");
    assert!(validate_document(value).is_err());
}
