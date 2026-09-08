//! Named requests and one bounded response path for preliminary and final calls.
use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};
use std::fmt;
use uuid::Uuid;
mod response;
use response::Expected;

pub type Error = Box<dyn std::error::Error>;
const RESPONSE_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Operation {
    Read,
    Action,
    Command,
    Workflow,
    Maintenance,
    CommandStatus,
}

impl Operation {
    fn expected(self) -> Expected {
        match self {
            Self::Read | Self::Action => Expected::Json,
            Self::Command => Expected::Command,
            Self::Workflow | Self::Maintenance => Expected::Workflow,
            Self::CommandStatus => Expected::CommandStatus,
        }
    }
    fn has_identity(self) -> bool {
        !matches!(self, Self::Read | Self::Action)
    }
    fn uncertain_error(self, status: u16) -> bool {
        // A server failure may happen after a durable write. A failed status
        // lookup likewise cannot establish what happened to the original command.
        self.has_identity()
            && ((500..600).contains(&status)
                || (self == Self::CommandStatus && !(200..300).contains(&status)))
    }
}

struct Identity {
    request_id: String,
    epoch: String,
}

pub struct Request {
    method: String,
    path: String,
    payload: Option<Value>,
    version: Option<String>,
    request_id: Option<String>,
    epoch: Option<String>,
    operation: Operation,
}

impl Request {
    pub fn local(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        Self::action(method, path, payload)
    }
    /// A non-journaled operation, such as session revocation or plan preparation.
    pub fn action(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        Self {
            method: method.into(),
            path: path.into(),
            payload,
            version: None,
            request_id: None,
            epoch: None,
            operation: Operation::Action,
        }
    }
    pub fn read(path: impl Into<String>) -> Self {
        Self::query("GET", path, None)
    }
    /// A query may carry a body without acquiring a durable command identity.
    pub fn query(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        let mut request = Self::action(method, path, payload);
        request.operation = Operation::Read;
        request
    }
    /// A source/workspace mutation confirms with CommandResponse or unresolved status.
    pub fn command(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        let mut request = Self::action(method, path, payload);
        request.operation = Operation::Command;
        request
    }
    /// A durable workflow confirms acceptance as a job, never an ordinary source reply.
    pub fn workflow(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        let mut request = Self::action(method, path, payload);
        request.operation = Operation::Workflow;
        request
    }
    pub fn command_status(id: String, epoch: String) -> Self {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("epoch", &epoch)
            .finish();
        let mut request = Self::read(format!("/api/v1/commands/{id}?{query}"));
        request.operation = Operation::CommandStatus;
        request.request_id = Some(id);
        request.epoch = Some(epoch);
        request
    }
    /// Escape hatch for API requests. Named callers select semantics explicitly.
    pub fn api(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        let path = path.into();
        let route = path.split('?').next().unwrap_or(&path);
        let parts: Vec<_> = route.trim_start_matches('/').split('/').collect();
        match (method, parts.as_slice()) {
            ("GET", _) | ("POST", ["api", "v1", "workspace", "tags", "preview"]) => {
                Self::query(method, path, payload)
            }
            ("POST", ["api", "v1", "registrations"]) => Self::workflow(method, path, payload),
            (_, ["api", "v1", "auth", ..])
            | (
                "POST",
                [
                    "api",
                    "v1",
                    "registration-plans" | "native-folder-selections",
                ],
            ) => Self::action(method, path, payload),
            _ => Self::command(method, path, payload),
        }
    }
    pub fn maintenance(plan: String) -> Self {
        let mut request = Self::local(
            "POST",
            "/local/v1/maintenance/jobs",
            Some(json!({"plan_id":plan})),
        );
        request.operation = Operation::Maintenance;
        request
    }
    pub fn version(mut self, version: Option<String>) -> Self {
        self.version = version;
        self
    }
    pub fn retry(mut self, request_id: Option<String>, epoch: Option<String>) -> Self {
        self.request_id = request_id;
        self.epoch = epoch;
        self
    }
}

pub struct Outcome {
    pub code: i32,
    pub output: Value,
}

#[derive(Debug)]
pub struct Failure {
    pub code: i32,
    pub output: Value,
}
impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            self.output["error"]["message"]
                .as_str()
                .unwrap_or("Invalid server response")
        )
    }
}
impl std::error::Error for Failure {}

impl Outcome {
    fn uncertain_response(status: u16, body: Value, identity: Option<&Identity>) -> Self {
        let mut outcome = Self::failed(
            "RESULT_UNCERTAIN",
            9,
            "The response does not establish the original command's outcome. Check its status before retrying.",
            identity,
        );
        outcome.output["http_status"] = json!(status);
        outcome.output["error"]["details"] = json!({"server_error":body["error"]});
        outcome
    }
    fn response(status: u16, body: Value, identity: Option<&Identity>) -> Self {
        let request_id = identity.map(|value| value.request_id.as_str()).or_else(|| {
            body.get("request_id")
                .or_else(|| body["error"].get("request_id"))
                .and_then(Value::as_str)
        });
        let ok = (200..300).contains(&status);
        let mut output = json!({"api_version":"1","ok":ok,"request_id":request_id,"command_epoch":identity.map(|value| value.epoch.as_str()),"http_status":status});
        output[if ok { "data" } else { "error" }] = if ok {
            body.clone()
        } else {
            body["error"].clone()
        };
        Self {
            code: super::exit_code(status, &body),
            output,
        }
    }
    fn failed(
        code: &str,
        exit: i32,
        error: impl fmt::Display,
        identity: Option<&Identity>,
    ) -> Self {
        Self {
            code: exit,
            output: json!({
                "api_version": "1",
                "ok": false,
                "error": {
                    "code": code,
                    "message": error.to_string(),
                },
                "request_id": identity.map(|value| value.request_id.as_str()),
                "command_epoch": identity.map(|value| value.epoch.as_str()),
            }),
        }
    }
}

async fn decode(mut response: reqwest::Response) -> Result<Value, Error> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > RESPONSE_LIMIT {
            return Err("Server response exceeds 16 MiB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok(body)
}

/// Preliminary reads retain server error codes/details and use the final-call limit.
pub async fn checked(builder: RequestBuilder) -> Result<Value, Error> {
    let response = builder.send().await?;
    let status = response.status().as_u16();
    let decoded = decode(response).await.and_then(|body| {
        response::validate(status, &body, Expected::Json, None)?;
        Ok(body)
    });
    let body = match decoded {
        Ok(body) => body,
        Err(error) => {
            let mut result = Outcome::failed("INVALID_RESPONSE", 8, error, None);
            result.output["http_status"] = json!(status);
            return Err(Box::new(Failure {
                code: result.code,
                output: result.output,
            }));
        }
    };
    if !(200..300).contains(&status) {
        let result = Outcome::response(status, body, None);
        return Err(Box::new(Failure {
            code: result.code,
            output: result.output,
        }));
    }
    Ok(body)
}

async fn identity(
    client: &Client,
    request_id: Option<String>,
    epoch: Option<String>,
) -> Result<Identity, Error> {
    match (request_id, epoch) {
        (Some(request_id), Some(epoch)) => Ok(Identity { request_id, epoch }),
        (None, None) => {
            let hello = checked(client.get("http://localhost/local/v1/hello")).await?;
            let millis = chrono::DateTime::parse_from_rfc3339(
                hello["server_time"].as_str().ok_or("Invalid server time")?,
            )?
            .timestamp_millis();
            if !(0..(1i64 << 48)).contains(&millis) {
                return Err("Invalid server time".into());
            }
            let mut bytes = Uuid::now_v7().into_bytes();
            bytes[..6].copy_from_slice(&(millis as u64).to_be_bytes()[2..]);
            Ok(Identity {
                request_id: Uuid::from_bytes(bytes).to_string(),
                epoch: hello["command_epoch"]
                    .as_str()
                    .ok_or("Invalid hello")?
                    .into(),
            })
        }
        _ => Err("Retry requires both --request-id and --epoch".into()),
    }
}

pub async fn execute(client: &Client, mut request: Request) -> Result<Outcome, Error> {
    let uncertain = request.operation.has_identity();
    let identity = if uncertain {
        Some(identity(client, request.request_id, request.epoch).await?)
    } else {
        None
    };
    let mut builder = client.request(
        request.method.parse()?,
        format!("http://localhost{}", request.path),
    );
    if request.operation == Operation::Maintenance {
        let identity = identity.as_ref().ok_or("Missing maintenance identity")?;
        let payload = request.payload.as_mut().ok_or("Missing maintenance plan")?;
        payload["request_id"] = json!(identity.request_id);
        payload["command_epoch"] = json!(identity.epoch);
        eprintln!("{}", payload);
    } else if matches!(request.operation, Operation::Command | Operation::Workflow) {
        let identity = identity.as_ref().ok_or("Missing command identity")?;
        eprintln!(
            "{}",
            json!({"request_id":identity.request_id,"command_epoch":identity.epoch,"method":request.method,"path":request.path})
        );
        builder = builder
            .header("x-request-id", &identity.request_id)
            .header("x-command-epoch", &identity.epoch);
    }
    if let Some(payload) = request.payload {
        builder = builder.json(&payload);
    }
    if let Some(version) = request.version {
        builder = builder.header("if-match", format!("\"{version}\""));
    }
    let response = match builder.send().await {
        Ok(response) => response,
        Err(error) => {
            return Ok(Outcome::failed(
                if uncertain {
                    "RESULT_UNCERTAIN"
                } else {
                    "TRANSPORT_UNAVAILABLE"
                },
                if uncertain { 9 } else { 3 },
                error,
                identity.as_ref(),
            ));
        }
    };
    let status = response.status().as_u16();
    let decoded = decode(response).await.and_then(|body| {
        response::validate(
            status,
            &body,
            request.operation.expected(),
            identity.as_ref().map(|value| value.request_id.as_str()),
        )?;
        Ok(body)
    });
    match decoded {
        Ok(body) if request.operation.uncertain_error(status) => {
            Ok(Outcome::uncertain_response(status, body, identity.as_ref()))
        }
        Ok(body) => Ok(Outcome::response(status, body, identity.as_ref())),
        Err(error) => {
            let mut result = Outcome::failed(
                if uncertain {
                    "RESULT_UNCERTAIN"
                } else {
                    "INVALID_RESPONSE"
                },
                if uncertain { 9 } else { 8 },
                error,
                identity.as_ref(),
            );
            result.output["http_status"] = json!(status);
            Ok(result)
        }
    }
}
