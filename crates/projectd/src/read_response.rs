//! Negotiated compression for authenticated summary reads, without source ETags.
use super::encoding::quality;
use axum::{
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
};
use flate2::{Compression, write::GzEncoder};
use project_application::{AppError, Reply};
use serde_json::Value;
use std::io::Write;

const MIN_GZIP_BYTES: usize = 1024;
const MAX_GZIP_BYTES: usize = 4 * 1024 * 1024;

pub(super) fn eligible(method: &str, parts: &[&str]) -> bool {
    method == "GET"
        && matches!(
            parts,
            [
                "api",
                "v1",
                "views",
                "list" | "board" | "gantt" | "calendar" | "folders" | "focus-cards" | "attention"
            ] | ["api", "v1", "projects"]
                | ["api", "v1", "workspace", "focus"]
                | [
                    "api",
                    "v1",
                    "projects",
                    _,
                    "cards" | "milestones" | "updates"
                ]
        )
}

pub(super) fn json(value: &Value, headers: &HeaderMap) -> Result<Response, AppError> {
    let wildcard = quality(headers, "*");
    let gzip_quality = quality(headers, "gzip").or(wildcard).unwrap_or(0.0);
    let identity_quality =
        quality(headers, "identity").unwrap_or(if wildcard == Some(0.0) { 0.0 } else { 1.0 });
    let mut bytes = serde_json::to_vec(value)
        .map_err(|_| AppError::invariant("read response serialization"))?;
    // This runs inside the existing admitted blocking worker, after authentication
    // and after the engine has released its query locks. Never compress a stream.
    let mut compressed = false;
    if gzip_quality > 0.0
        && gzip_quality >= identity_quality
        && bytes.len() <= MAX_GZIP_BYTES
        && (bytes.len() >= MIN_GZIP_BYTES || identity_quality == 0.0)
    {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder
            .write_all(&bytes)
            .map_err(|_| AppError::Unavailable("read response compression"))?;
        let encoded = encoder
            .finish()
            .map_err(|_| AppError::Unavailable("read response compression"))?;
        if encoded.len() < bytes.len() || identity_quality == 0.0 {
            bytes = encoded;
            compressed = true;
        }
    }
    let mut response = if !compressed && identity_quality == 0.0 {
        super::response(Reply::error(406, "ENCODING_NOT_ACCEPTABLE", ""))
    } else {
        let length = bytes.len();
        let mut response = ([("content-type", "application/json")], bytes).into_response();
        response
            .headers_mut()
            .insert("content-length", HeaderValue::from(length));
        if compressed {
            response
                .headers_mut()
                .insert("content-encoding", HeaderValue::from_static("gzip"));
        }
        response
    };
    response
        .headers_mut()
        .insert("vary", HeaderValue::from_static("Accept-Encoding"));
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use flate2::read::GzDecoder;
    use serde_json::json;
    use std::io::Read;

    async fn body(response: Response) -> Vec<u8> {
        to_bytes(response.into_body(), 6 * 1024 * 1024)
            .await
            .unwrap()
            .to_vec()
    }

    fn headers(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("accept-encoding", value.parse().unwrap());
        headers
    }

    #[test]
    fn compression_requires_an_explicit_summary_read() {
        for path in [
            "api/v1/bootstrap",
            "api/v1/auth/pairings",
            "api/v1/events",
            "api/v1/commands/request",
            "api/v1/diagnostics",
            "local/v1/hello",
            "api/v1/projects/project",
            "api/v1/projects/project/cards/card",
            "api/v1/workspace/preferences",
            "api/v1/views/future-credentials",
        ] {
            assert!(
                !eligible("GET", &path.split('/').collect::<Vec<_>>()),
                "{path}"
            );
        }
        for method in ["HEAD", "POST", "PUT", "PATCH", "DELETE"] {
            assert!(!eligible(method, &["api", "v1", "workspace", "focus"]));
        }
    }

    #[tokio::test]
    async fn negotiated_json_preserves_bytes_and_versions() {
        let value = json!({"title":"Zażółć".repeat(500),"version":"r1.source-version"});
        let identity = serde_json::to_vec(&value).unwrap();
        for (accept, compressed) in [
            ("", false),
            ("gzip", true),
            ("br, gzip;q=0, *;q=1", false),
            ("gzip;q=0.5, identity;q=1", false),
            ("gzip;q=0.5, identity;q=0.25", true),
            ("*;q=1, identity;q=0", true),
        ] {
            let response = json(&value, &headers(accept)).unwrap();
            assert_eq!(response.status(), 200);
            assert_eq!(response.headers()["vary"], "Accept-Encoding");
            assert_eq!(response.headers()["content-type"], "application/json");
            assert!(!response.headers().contains_key("etag"));
            assert_eq!(
                response.headers().contains_key("content-encoding"),
                compressed
            );
            let length = response.headers()["content-length"]
                .to_str()
                .unwrap()
                .parse::<usize>()
                .unwrap();
            let bytes = body(response).await;
            assert_eq!(bytes.len(), length);
            let decoded = if compressed {
                let mut decoded = vec![];
                GzDecoder::new(bytes.as_slice())
                    .read_to_end(&mut decoded)
                    .unwrap();
                decoded
            } else {
                bytes
            };
            assert_eq!(decoded, identity, "{accept}");
        }
    }

    #[tokio::test]
    async fn compression_bounds_keep_tiny_and_oversize_reads_usable() {
        let tiny = json!({"items":[]});
        assert!(
            !json(&tiny, &headers("gzip"))
                .unwrap()
                .headers()
                .contains_key("content-encoding")
        );
        assert!(
            json(&tiny, &headers("gzip, identity;q=0"))
                .unwrap()
                .headers()
                .contains_key("content-encoding")
        );
        let large = json!({"title":"a".repeat(MAX_GZIP_BYTES)});
        let response = json(&large, &headers("gzip")).unwrap();
        assert_eq!(response.status(), 200);
        assert!(!response.headers().contains_key("content-encoding"));
        assert_eq!(body(response).await, serde_json::to_vec(&large).unwrap());
        for accept in ["gzip, identity;q=0", "br, identity;q=0", "*;q=0"] {
            let response = json(&large, &headers(accept)).unwrap();
            assert_eq!(response.status(), 406);
            assert_eq!(response.headers()["vary"], "Accept-Encoding");
            let error: Value = serde_json::from_slice(&body(response).await).unwrap();
            project_application::wire::validate("Error", &error).unwrap();
            assert_eq!(error["error"]["code"], "ENCODING_NOT_ACCEPTABLE");
        }
    }
}
