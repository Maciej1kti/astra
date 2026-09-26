use project_domain::validate_document;
use project_store::{
    StoreError,
    document::{self, Kind},
};
use serde_json::{Value, json};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn card() -> Value {
    serde_json::from_slice(
        &std::fs::read(root().join("examples/card-22222222-2222-4222-8222-222222222222.json"))
            .unwrap(),
    )
    .unwrap()
}
fn milestone() -> Value {
    serde_json::from_slice(&std::fs::read(root().join("examples/milestone.json")).unwrap()).unwrap()
}
fn bytes() -> Vec<u8> {
    document::serialize(&validate_document(card()).unwrap()).unwrap()
}

#[test]
fn all_handoff_parser_vectors() {
    let vectors: Value =
        serde_json::from_slice(&std::fs::read(root().join("tests/vectors.json")).unwrap()).unwrap();
    for case in vectors["parser_cases"].as_array().unwrap() {
        let kind: Kind = serde_json::from_value(case["type"].clone()).unwrap();
        let input = std::fs::read(root().join(case["path"].as_str().unwrap())).unwrap();
        assert_eq!(
            document::parse(kind, None, &input).is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["id"]
        );
    }
}

#[test]
fn metadata_edits_preserve_body_and_milestone_extensions_byte_for_byte() {
    let mut input = milestone();
    let body = "\r\n# Body\r\n\r\nEmoji 🦀 and UTF-8 ąę\n---\n\ttrailing  \n\n";
    input["body"] = json!(body);
    input["metadata"]["x-nested"] = json!({"array": [null, true, 1.25, "# hash"]});
    let bytes = document::serialize(&validate_document(input.clone()).unwrap()).unwrap();
    let parsed = document::parse(
        Kind::Milestone,
        Some(input["metadata"]["id"].as_str().unwrap()),
        &bytes,
    )
    .unwrap();
    assert!(!parsed.normalization_required);
    let mut edited = parsed.editable().unwrap();
    edited["metadata"]["status"] = json!("achieved");
    let encoded = document::serialize(&validate_document(edited).unwrap()).unwrap();
    let decoded = document::parse(Kind::Milestone, None, &encoded)
        .unwrap()
        .value();
    assert_eq!(
        decoded["body"].as_str().unwrap().as_bytes(),
        body.as_bytes()
    );
    assert_eq!(
        decoded["metadata"]["x-nested"],
        input["metadata"]["x-nested"]
    );
    assert_ne!(document::version(&bytes), document::version(&encoded));
}

#[test]
fn transport_encoding_requires_explicit_normalization() {
    let original = String::from_utf8(bytes()).unwrap();
    for input in [
        format!("\u{feff}{original}"),
        original.replace('\n', "\r\n"),
    ] {
        let parsed = document::parse(Kind::Card, None, input.as_bytes()).unwrap();
        assert!(parsed.normalization_required);
        assert!(matches!(
            parsed.editable(),
            Err(StoreError::NormalizationRequired)
        ));
    }
}

#[test]
fn rejects_duplicate_keys_at_every_level_and_invalid_json() {
    let original = String::from_utf8(bytes()).unwrap();
    for input in [
        original.replacen("{", "{\"type\":\"card\",", 1),
        original.replacen(
            "\"metadata\": {",
            "\"metadata\": {\"title\":\"duplicate\",",
            1,
        ),
        original.replacen("\"archived\": false", "\"archived\": false // comment", 1),
        format!("{original} {{}}"),
        original[..original.len() - 2].to_owned(),
        "---\n{}\n---\nLegacy Markdown".into(),
    ] {
        assert!(
            document::parse(Kind::Card, None, input.as_bytes()).is_err(),
            "{input}"
        );
    }
    assert!(document::parse(Kind::Milestone, None, &bytes()).is_err());
    assert!(
        document::parse(
            Kind::Card,
            Some("33333333-3333-4333-8333-333333333333"),
            &bytes()
        )
        .is_err()
    );
    assert!(document::parse(Kind::Card, None, &[0xff]).is_err());
    assert!(document::parse(Kind::Card, None, b"{\"body\":\"\0\"}").is_err());
    let input = original.replace("\"title\":", "\"title\": null, \"tit\\u006ce\":");
    assert!(document::parse(Kind::Card, None, input.as_bytes()).is_err());
}

#[test]
fn comments_markdown_and_extensions_roundtrip_as_json_values() {
    let expected: Value =
        serde_json::from_slice(&std::fs::read(root().join("examples/card-comments.json")).unwrap())
            .unwrap();
    let encoded = document::serialize(&validate_document(expected.clone()).unwrap()).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&encoded).unwrap(), expected);
    let parsed = document::parse(Kind::Card, None, &encoded).unwrap();
    assert_eq!(parsed.value(), expected);
    assert!(!parsed.normalization_required);
    for title in [
        "# heading",
        "żółć # 🦀",
        "---\nbody delimiter",
        "quoted \"text\"",
    ] {
        let mut value = card();
        value["metadata"]["title"] = json!(title);
        let encoded = document::serialize(&validate_document(value.clone()).unwrap()).unwrap();
        assert_eq!(
            document::parse(Kind::Card, None, &encoded).unwrap().value(),
            value
        );
    }
}

#[test]
fn json_structure_metadata_and_document_limits_are_enforced() {
    let original = String::from_utf8(bytes()).unwrap();
    let large = original.replacen(
        "\"metadata\": {",
        &format!("\"metadata\": {{\"extra\":\"{}\",", "a".repeat(65536)),
        1,
    );
    assert!(matches!(
        document::parse(Kind::Card, None, large.as_bytes()),
        Err(StoreError::Invalid("METADATA_LIMIT"))
    ));
    let deep = original.replacen(
        "\"metadata\": {",
        &format!(
            "\"metadata\": {{\"extra\":{}0{},",
            "[".repeat(15),
            "]".repeat(15)
        ),
        1,
    );
    assert!(matches!(
        document::parse(Kind::Card, None, deep.as_bytes()),
        Err(StoreError::Invalid("INVALID_JSON"))
    ));
    let many = format!("[{}]", "0,".repeat(10_001) + "0");
    assert!(matches!(
        document::parse(Kind::Card, None, many.as_bytes()),
        Err(StoreError::Invalid("INVALID_JSON"))
    ));
    assert!(document::parse(Kind::Card, None, &vec![b' '; document::MAX_DOCUMENT + 1]).is_err());
}

#[test]
fn card_sources_reject_retired_fields() {
    for (field, value) in [
        ("due", json!({"date":"2026-09-10"})),
        ("review_on", json!("2026-09-10")),
        (
            "milestone_id",
            json!("44444444-4444-4444-8444-444444444444"),
        ),
        ("blocked", json!({"reason":"Waiting"})),
        ("depends_on", json!([])),
    ] {
        let mut input = card();
        input["metadata"][field] = value;
        assert!(document::parse(Kind::Card, None, &serde_json::to_vec(&input).unwrap()).is_err());
    }
}
