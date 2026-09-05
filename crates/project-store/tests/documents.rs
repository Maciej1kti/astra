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
fn metadata_edits_preserve_body_and_extensions_byte_for_byte() {
    let mut input = card();
    let body = "\r\n# Body\r\n\r\nEmoji 🦀 and UTF-8 ąę\n---\n\ttrailing  \n\n";
    input["body"] = json!(body);
    input["metadata"]["x-nested"] = json!({"array": [null, true, 1.25, "# hash"]});
    let bytes = document::serialize(&validate_document(input.clone()).unwrap()).unwrap();
    let parsed = document::parse(
        Kind::Card,
        Some(input["metadata"]["id"].as_str().unwrap()),
        &bytes,
    )
    .unwrap();
    assert!(!parsed.normalization_required);
    let mut edited = parsed.editable().unwrap();
    edited["metadata"]["status"] = json!("review");
    let encoded = document::serialize(&validate_document(edited).unwrap()).unwrap();
    let decoded = document::parse(Kind::Card, None, &encoded).unwrap().value();
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
fn comments_and_encoding_require_explicit_normalization() {
    let original = String::from_utf8(bytes()).unwrap();
    for prefix in ["# keep this comment\n", "# żółć 🦀\n"] {
        let input = original.replacen("---\n", &format!("---\n{prefix}"), 1);
        let parsed = document::parse(Kind::Card, None, input.as_bytes()).unwrap();
        assert!(parsed.normalization_required);
        assert!(matches!(
            parsed.editable(),
            Err(StoreError::NormalizationRequired)
        ));
    }
    let inline = original.replace("\"archived\": false", "\"archived\": false # preserve me");
    assert!(
        document::parse(Kind::Card, None, inline.as_bytes())
            .unwrap()
            .normalization_required
    );
    for input in [
        format!("\u{feff}{original}"),
        original.replace('\n', "\r\n"),
    ] {
        assert!(
            document::parse(Kind::Card, None, input.as_bytes())
                .unwrap()
                .normalization_required
        );
    }
}

#[test]
fn hashes_inside_scalars_are_content_including_unicode_and_blocks() {
    let original = String::from_utf8(bytes()).unwrap();
    for title in [
        "'żółć # 🦀'",
        "\"🦀 # title\"",
        "text#hash",
        "|\n  🦀 # this is content\n  second line",
    ] {
        let original_title = format!(
            "\"title\": {}",
            serde_json::to_string(&card()["metadata"]["title"]).unwrap()
        );
        let input = original.replace(&original_title, &format!("\"title\": {title}"));
        let parsed = document::parse(Kind::Card, None, input.as_bytes()).unwrap();
        assert!(!parsed.normalization_required, "{title}");
    }
}

#[test]
fn rejects_yaml_abuse_and_invalid_source_identity() {
    let original = String::from_utf8(bytes()).unwrap();
    for extra in [
        "archived: true\n",
        "x-a: &anchor [1, 2]\n",
        "x-a: !!str value\n",
        "x-a: !custom value\n",
        "<<: {x-a: 1}\n",
        "x-a:\n\tvalue: true\n",
        "x-a: [\n",
    ] {
        let input = original.replacen("---\n", &format!("---\n{extra}"), 1);
        assert!(
            document::parse(Kind::Card, None, input.as_bytes()).is_err(),
            "{extra}"
        );
    }
    assert!(
        document::parse(
            Kind::Card,
            Some("33333333-3333-4333-8333-333333333333"),
            &bytes()
        )
        .is_err()
    );
    assert!(document::parse(Kind::Card, None, &[0xff]).is_err());
    let mut input = bytes();
    input.push(0);
    assert!(document::parse(Kind::Card, None, &input).is_err());
    let input = original.replacen(
        "---\n",
        &format!("---\nx-big: '{}'\n", "a".repeat(65536)),
        1,
    );
    assert!(document::parse(Kind::Card, None, input.as_bytes()).is_err());
    let input = original.replacen(
        "---\n",
        &format!("---\nx-deep: {}0{}\n", "[".repeat(15), "]".repeat(15)),
        1,
    );
    assert!(document::parse(Kind::Card, None, input.as_bytes()).is_err());
}
