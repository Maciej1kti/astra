//! Optional terminal presentation of the existing CLI response envelope.
use serde_json::{Map, Value};

/// Render familiar responses without losing retry identity or response metadata.
/// Unfamiliar data stays visible as JSON rather than being guessed or discarded.
pub fn render(envelope: &Value) -> String {
    let Some(fields) = envelope.as_object() else {
        return pretty(envelope);
    };
    let Some(ok) = fields.get("ok").and_then(Value::as_bool) else {
        return pretty(envelope);
    };
    let mut output = String::new();
    if !ok {
        render_error(&mut output, &envelope["error"]);
        if let Some(data) = fields.get("data") {
            field(&mut output, "data", data, "");
        }
    } else if let Some(data) = fields.get("data") {
        render_data(&mut output, data);
        if let Some(error) = fields.get("error") {
            field(&mut output, "error", error, "");
        }
    } else {
        output.push_str("Response received.\n");
    }
    // Null identity means this was a read; all present identifiers stay complete.
    for key in ["request_id", "command_epoch", "expected_version", "version"] {
        if let Some(value) = fields.get(key).filter(|value| !value.is_null()) {
            field(&mut output, key, value, "");
        }
    }
    object_fields(
        &mut output,
        fields,
        &[
            "api_version",
            "ok",
            "data",
            "error",
            "request_id",
            "command_epoch",
            "expected_version",
            "version",
        ],
        "",
    );
    output.trim_end_matches('\n').to_owned()
}

fn render_error(output: &mut String, error: &Value) {
    match (error["code"].as_str(), error["message"].as_str()) {
        (Some(code), Some(message)) => {
            output.push_str(&format!(
                "Error: {}: {}\n",
                terminal_text(code, false),
                terminal_text(message, false)
            ));
            if let Some(fields) = error.as_object() {
                object_fields(output, fields, &["code", "message"], "");
            }
        }
        _ => field(output, "error", error, ""),
    }
}

fn render_data(output: &mut String, data: &Value) {
    let Some(fields) = data.as_object() else {
        if let Some(items) = data.as_array() {
            render_items(output, items);
        } else {
            field(output, "data", data, "");
        }
        return;
    };
    if let Some(metadata) = fields.get("metadata").and_then(Value::as_object) {
        output.push_str("Resource");
        if let Some(kind) = fields.get("type").and_then(Value::as_str) {
            output.push_str(&format!(": {}", terminal_text(kind, false)));
        }
        output.push('\n');
        let skip = if fields.get("type").is_some_and(Value::is_string) {
            &["metadata", "body", "type"][..]
        } else {
            &["metadata", "body"][..]
        };
        object_fields(output, fields, skip, "");
        output.push_str("Metadata:\n");
        object_fields(output, metadata, &[], "  ");
        if let Some(body) = fields.get("body") {
            if let Some(body) = body.as_str() {
                output.push_str("Body:\n");
                output.push_str(&terminal_text(body, true));
                output.push('\n');
            } else {
                field(output, "body", body, "");
            }
        }
    } else if let Some(items) = fields.get("items").and_then(Value::as_array) {
        render_items(output, items);
        object_fields(output, fields, &["items"], "");
    } else if let Some((key, state)) = ["status", "state"].iter().find_map(|key| {
        fields
            .get(*key)
            .and_then(Value::as_str)
            .map(|state| (*key, state))
    }) {
        output.push_str(&format!("{}: {}\n", key, terminal_text(state, false)));
        object_fields(output, fields, &[key], "");
    } else {
        field(output, "data", data, "");
    }
}

fn render_items(output: &mut String, items: &[Value]) {
    output.push_str(&format!("Items: {}\n", items.len()));
    for (index, item) in items.iter().enumerate() {
        match item {
            Value::String(value) => {
                output.push_str(&format!("- {}\n", terminal_text(value, false)));
            }
            Value::Object(fields) => {
                let label = ["title", "name", "summary", "label"]
                    .iter()
                    .find_map(|key| {
                        fields
                            .get(*key)
                            .and_then(Value::as_str)
                            .map(|value| (*key, value))
                    });
                if let Some((key, value)) = label {
                    output.push_str(&format!("- {}\n", terminal_text(value, false)));
                    object_fields(output, fields, &[key], "  ");
                } else {
                    output.push_str(&format!("- Item {}\n", index + 1));
                    object_fields(output, fields, &[], "  ");
                }
            }
            _ => field(output, "-", item, ""),
        }
    }
}

fn object_fields(output: &mut String, fields: &Map<String, Value>, skip: &[&str], indent: &str) {
    for (key, value) in fields {
        if !skip.contains(&key.as_str()) {
            field(output, key, value, indent);
        }
    }
}

fn field(output: &mut String, name: &str, value: &Value, indent: &str) {
    output.push_str(indent);
    output.push_str(&terminal_text(name, false));
    output.push(':');
    match value {
        Value::String(value) => {
            output.push(' ');
            output.push_str(&terminal_text(value, false));
            output.push('\n');
        }
        Value::Object(_) | Value::Array(_) => {
            output.push('\n');
            for line in pretty(value).lines() {
                output.push_str(indent);
                output.push_str("  ");
                output.push_str(line);
                output.push('\n');
            }
        }
        _ => {
            output.push(' ');
            output.push_str(&value.to_string());
            output.push('\n');
        }
    }
}

fn pretty(value: &Value) -> String {
    // Serializing a Value cannot fail for unsupported map keys or non-finite numbers.
    let json = serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
    terminal_text(&json, true)
}

fn terminal_text(value: &str, multiline: bool) -> String {
    let mut text = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '\n' if multiline => text.push('\n'),
            '\n' => text.push_str("\\n"),
            '\r' => text.push_str("\\r"),
            '\t' => text.push_str("\\t"),
            character
                if character.is_control()
                    || matches!(character, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}') =>
            {
                text.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => text.push(character),
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::render;
    use serde_json::json;

    #[test]
    fn read_pages_keep_complete_versions_cursors_and_degraded_metadata() {
        let version = "r1.0123456789abcdef0123456789abcdef0123456789abcdef";
        let output = render(&json!({
            "ok": true,
            "data": {
                "items": [{"id":"card-id", "project_id":"project-id", "type":"card",
                    "title":"Ship the release", "status":"active", "version":version}],
                "page":{"next_cursor":"opaque+cursor/==", "freshness":"degraded", "total":51},
                "warnings":[{"code":"PROJECT_UNAVAILABLE", "message":"One project was skipped"}],
                "new_metadata":{"complete":false}
            },
            "request_id":null,
            "command_epoch":null
        }));
        for expected in [
            "Items: 1",
            "Ship the release",
            "card-id",
            "project-id",
            version,
            "opaque+cursor/==",
            "degraded",
            "51",
            "PROJECT_UNAVAILABLE",
            "One project was skipped",
            "new_metadata",
            "false",
        ] {
            assert!(output.contains(expected), "Missing {expected}: {output}");
        }
        assert!(!output.contains("request_id: null"));
    }

    #[test]
    fn errors_and_uncertain_results_keep_retry_identity_and_expected_version() {
        let output = render(&json!({
            "ok":false,
            "error":{"code":"RESULT_UNCERTAIN", "message":"The reply was lost.",
                "details":{"expected_version":"r1.original", "method":"PATCH", "path":"/api/v1/cards/card-id"}},
            "request_id":"019913e8-8000-7000-8000-000000000001",
            "command_epoch":"11111111-1111-4111-8111-111111111111",
            "http_status":502
        }));
        assert!(output.starts_with("Error: RESULT_UNCERTAIN: The reply was lost."));
        for expected in [
            "019913e8-8000-7000-8000-000000000001",
            "11111111-1111-4111-8111-111111111111",
            "r1.original",
            "PATCH",
            "/api/v1/cards/card-id",
            "502",
        ] {
            assert!(output.contains(expected), "Missing {expected}: {output}");
        }
    }

    #[test]
    fn resources_preserve_body_lines_and_escape_terminal_control_sequences() {
        let output = render(&json!({
            "ok":true,
            "data":{"type":"card", "version":"r1.source",
                "metadata":{"id":"card-id", "title":"Title\u{001b}[2J\nforged row\u{202e}"},
                "body":"First line\nSecond line\tindented\r\u{001b}]52;c;payload\u{0007}\u{009b}31m"}
        }));
        assert!(output.contains("version: r1.source"));
        assert!(output.contains("Title\\u001b[2J\\nforged row\\u202e"));
        assert!(output.contains("Body:\nFirst line\nSecond line\\tindented\\r"));
        assert!(output.contains("\\u001b]52;c;payload\\u0007\\u009b31m"));
        assert!(
            !output
                .chars()
                .any(|character| character.is_control() && character != '\n')
        );
    }

    #[test]
    fn accepted_and_committed_commands_do_not_hide_job_or_result_details() {
        for data in [
            json!({"status":"running", "job_id":"job-id", "warnings":[]}),
            json!({"status":"committed", "result":{"type":"card", "id":"card-id", "version":"r1.saved"},
                "warnings":[{"code":"INDEX_STALE"}]}),
        ] {
            let output = render(
                &json!({"ok":true,"data":data,"request_id":"request-id","command_epoch":"epoch"}),
            );
            assert!(output.contains(data["status"].as_str().unwrap()));
            assert!(output.contains("request_id: request-id"));
            assert!(output.contains("command_epoch: epoch"));
            if data["status"] == "running" {
                assert!(output.contains("job_id: job-id"));
            } else {
                assert!(output.contains("r1.saved"));
                assert!(output.contains("INDEX_STALE"));
            }
        }
    }

    #[test]
    fn unfamiliar_shapes_remain_readable_json_including_unknown_fields() {
        let data = json!({"new_feature":{"nested":[1,{"value":"keep me\u{202e}"}]}});
        let raw = render(&data);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&raw).unwrap(),
            data
        );
        let output = render(&json!({"ok":true,"data":data}));
        assert!(output.contains("new_feature"));
        assert!(output.contains("keep me"));
        let output = render(&json!({"ok":true,"data":{"items":[],"page":{"next_cursor":null}}}));
        assert!(output.contains("Items: 0"));
        assert!(output.contains("\"next_cursor\": null"));
    }
}
