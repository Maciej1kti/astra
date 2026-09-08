//! Named requests and one bounded response path for preliminary and final calls.
use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};
use std::fmt;
use uuid::Uuid;

pub type Error = Box<dyn std::error::Error>;
const RESPONSE_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Operation {
    Read,
    Local,
    Command,
    Maintenance,
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
        Self {
            method: method.into(),
            path: path.into(),
            payload,
            version: None,
            request_id: None,
            epoch: None,
            operation: Operation::Local,
        }
    }
    pub fn read(path: impl Into<String>) -> Self {
        let mut request = Self::local("GET", path, None);
        request.operation = Operation::Read;
        request
    }
    pub fn api(method: &str, path: impl Into<String>, payload: Option<Value>) -> Self {
        let mut request = Self::local(method, path, payload);
        // Preview is a body-bearing query, with no mutation admission or retry ID.
        request.operation = if method == "GET"
            || (method == "POST" && request.path == "/api/v1/workspace/tags/preview")
        {
            Operation::Read
        } else {
            Operation::Command
        };
        request
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
    fn response(status: u16, body: Value, identity: &Value) -> Self {
        let request_id = body
            .get("request_id")
            .or_else(|| body["error"].get("request_id"))
            .unwrap_or(&identity["request_id"]);
        let ok = (200..300).contains(&status);
        let mut output = json!({"api_version":"1","ok":ok,"request_id":request_id,"command_epoch":identity["command_epoch"],"http_status":status});
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
    fn failed(code: &str, exit: i32, error: impl fmt::Display, identity: &Value) -> Self {
        Self {
            code: exit,
            output: json!({
                "api_version": "1",
                "ok": false,
                "error": {
                    "code": code,
                    "message": error.to_string(),
                },
                "request_id": identity["request_id"],
                "command_epoch": identity["command_epoch"],
            }),
        }
    }
}

async fn decode(mut response: reqwest::Response) -> Result<Value, Error> {
    let successful = response.status().is_success();
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
    if !successful && (!body["error"]["code"].is_string() || !body["error"]["message"].is_string())
    {
        return Err("Server error response is missing its code or message".into());
    }
    Ok(body)
}

/// Preliminary reads retain server error codes/details and use the final-call limit.
pub async fn checked(builder: RequestBuilder) -> Result<Value, Error> {
    let response = builder.send().await?;
    let status = response.status().as_u16();
    let body = match decode(response).await {
        Ok(body) => body,
        Err(error) => {
            let mut result = Outcome::failed("INVALID_RESPONSE", 8, error, &Value::Null);
            result.output["http_status"] = json!(status);
            return Err(Box::new(Failure {
                code: result.code,
                output: result.output,
            }));
        }
    };
    if !(200..300).contains(&status) {
        let result = Outcome::response(status, body, &Value::Null);
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
) -> Result<Value, Error> {
    match (request_id, epoch) {
        (Some(request_id), Some(epoch)) => {
            Ok(json!({"request_id":request_id,"command_epoch":epoch}))
        }
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
            Ok(
                json!({"request_id":Uuid::from_bytes(bytes).to_string(),"command_epoch":hello["command_epoch"].as_str().ok_or("Invalid hello")?}),
            )
        }
        _ => Err("Retry requires both --request-id and --epoch".into()),
    }
}

pub async fn execute(client: &Client, mut request: Request) -> Result<Outcome, Error> {
    let uncertain = matches!(
        request.operation,
        Operation::Command | Operation::Maintenance
    );
    let identity = if uncertain {
        identity(client, request.request_id, request.epoch).await?
    } else {
        Value::Null
    };
    let mut builder = client.request(
        request.method.parse()?,
        format!("http://localhost{}", request.path),
    );
    if request.operation == Operation::Maintenance {
        let payload = request.payload.as_mut().ok_or("Missing maintenance plan")?;
        payload["request_id"] = identity["request_id"].clone();
        payload["command_epoch"] = identity["command_epoch"].clone();
        eprintln!("{}", payload);
    } else if request.operation == Operation::Command {
        eprintln!(
            "{}",
            json!({"request_id":identity["request_id"],"command_epoch":identity["command_epoch"],"method":request.method,"path":request.path})
        );
        builder = builder
            .header("x-request-id", identity["request_id"].as_str().unwrap())
            .header(
                "x-command-epoch",
                identity["command_epoch"].as_str().unwrap(),
            );
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
                &identity,
            ));
        }
    };
    let status = response.status().as_u16();
    match decode(response).await {
        Ok(body) => Ok(Outcome::response(status, body, &identity)),
        Err(error) => {
            let mut result = Outcome::failed(
                if uncertain {
                    "RESULT_UNCERTAIN"
                } else {
                    "INVALID_RESPONSE"
                },
                if uncertain { 9 } else { 8 },
                error,
                &identity,
            );
            result.output["http_status"] = json!(status);
            Ok(result)
        }
    }
}
