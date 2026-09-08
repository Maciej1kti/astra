//! Validate confirmation envelopes before a client can report a durable outcome.
//! Resource contents remain server-validated; this boundary checks the protocol's
//! confirmation fields, reply kind, HTTP status and original command identity.
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Expected {
    Json,
    Command,
    Workflow,
    CommandStatus,
}

pub(super) fn validate(
    status: u16,
    body: &Value,
    expected: Expected,
    request_id: Option<&str>,
) -> Result<(), &'static str> {
    if !(200..300).contains(&status) {
        return if error(body, request_id) {
            Ok(())
        } else {
            Err("Invalid server error response or command identity")
        };
    }
    let valid = match expected {
        Expected::Json => true,
        Expected::Command => match status {
            200 | 201 => committed(body, request_id),
            202 => unresolved(body, request_id),
            _ => false,
        },
        Expected::Workflow => {
            status == 202 && (accepted(body, request_id) || unresolved(body, request_id))
        }
        Expected::CommandStatus => status == 200 && command_status(body, request_id),
    };
    if valid {
        Ok(())
    } else {
        Err("Invalid command response. Check the original command before retrying.")
    }
}

fn object(value: &Value, fields: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|value| value.keys().all(|key| fields.contains(&key.as_str())))
}

fn text(value: &Value, max: usize) -> bool {
    value.as_str().is_some_and(|value| {
        let length = value.chars().count();
        (1..=max).contains(&length)
    })
}

fn uuid(value: &Value, version: usize) -> bool {
    value.as_str().is_some_and(|value| {
        Uuid::parse_str(value).is_ok_and(|id| {
            id.get_version_num() == version
                && id.get_variant() == uuid::Variant::RFC4122
                && id.to_string() == value
        })
    })
}

fn identity(value: &Value, request_id: Option<&str>) -> bool {
    value["api_version"] == "1"
        && uuid(&value["request_id"], 7)
        && request_id.is_none_or(|id| value["request_id"] == id)
}

fn error(value: &Value, request_id: Option<&str>) -> bool {
    let detail = &value["error"];
    object(value, &["api_version", "error"])
        && value["api_version"] == "1"
        && object(detail, &["code", "message", "request_id", "details"])
        && text(&detail["code"], 80)
        && text(&detail["message"], 2000)
        && detail
            .get("request_id")
            .is_none_or(|value| uuid(value, 7) && request_id.is_none_or(|id| value == id))
        && detail.get("details").is_none_or(Value::is_object)
}

fn version(value: &Value) -> bool {
    value.as_str().is_some_and(|value| {
        value.strip_prefix("r1.").is_some_and(|hash| {
            hash.len() == 64
                && hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
    })
}

fn resource_result(value: &Value) -> bool {
    object(value, &["type", "id", "version", "resource", "job_id"])
        && matches!(
            value["type"].as_str(),
            Some(
                "project"
                    | "card"
                    | "milestone"
                    | "update"
                    | "focus"
                    | "preferences"
                    | "tags"
                    | "registration"
                    | "receipt"
                    | "normalization"
                    | "job"
            )
        )
        && value.get("id").is_none_or(|value| uuid(value, 4))
        && value.get("job_id").is_none_or(|value| uuid(value, 4))
        && value.get("version").is_none_or(version)
        && value.get("resource").is_none_or(|resource| {
            object(resource, &["type", "metadata", "body", "version"])
                && matches!(
                    resource["type"].as_str(),
                    Some("project" | "card" | "milestone" | "update")
                )
                && resource["metadata"].is_object()
                && resource["body"].is_string()
                && version(&resource["version"])
        })
}

fn warning(value: &Value) -> bool {
    object(value, &["code", "message", "field"])
        && text(&value["code"], 80)
        && text(&value["message"], 1000)
        && value.get("field").is_none_or(|value| text(value, 120))
}

fn committed(value: &Value, request_id: Option<&str>) -> bool {
    object(
        value,
        &[
            "api_version",
            "request_id",
            "status",
            "result",
            "warnings",
            "replayed",
        ],
    ) && identity(value, request_id)
        && matches!(value["status"].as_str(), Some("committed" | "noop"))
        && resource_result(&value["result"])
        && value["warnings"]
            .as_array()
            .is_some_and(|values| values.len() <= 100 && values.iter().all(warning))
        && value["replayed"].is_boolean()
}

fn accepted(value: &Value, request_id: Option<&str>) -> bool {
    object(value, &["api_version", "request_id", "status", "job_id"])
        && identity(value, request_id)
        && value["status"] == "running"
        && uuid(&value["job_id"], 4)
}

fn unresolved(value: &Value, request_id: Option<&str>) -> bool {
    command_status(value, request_id)
        && matches!(
            value["state"].as_str(),
            Some("prepared" | "blocked" | "needs_review")
        )
}

fn command_status(value: &Value, request_id: Option<&str>) -> bool {
    object(
        value,
        &["api_version", "request_id", "state", "result", "error"],
    ) && identity(value, request_id)
        && matches!(
            value["state"].as_str(),
            Some("prepared" | "committed" | "rejected" | "needs_review" | "blocked")
        )
        // PREPARED records can include the intended result before the source is
        // written. Only the outer state establishes the command's actual outcome.
        && value
            .get("result")
            .is_none_or(|result| committed(result, value["request_id"].as_str()))
        && value.get("error").is_none_or(|result| {
            value["state"] == "rejected" && error(result, value["request_id"].as_str())
        })
}
