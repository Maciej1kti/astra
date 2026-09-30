//! Immutable frontend files with build-time compression; API bodies never enter this path.
use super::encoding::quality;
use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

struct Asset {
    path: &'static str,
    mime: &'static str,
    identity: &'static [u8],
    gzip: Option<&'static [u8]>,
}
include!(concat!(env!("OUT_DIR"), "/assets.rs"));

fn hashed(path: &str) -> bool {
    let Some(stem) = path
        .strip_prefix("/assets/")
        .and_then(|path| path.rsplit_once('.').map(|(stem, _)| stem))
    else {
        return false;
    };
    let bytes = stem.as_bytes();
    bytes.len() > 9
        && bytes[bytes.len() - 9] == b'-'
        && bytes[bytes.len() - 8..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

pub(super) fn serve(path: &str, headers: &HeaderMap, head: bool) -> Response {
    let path = if path == "/" { "/index.html" } else { path };
    let Some(asset) = ASSETS.iter().find(|asset| asset.path == path) else {
        return super::response(project_application::Reply::error(404, "NOT_FOUND", ""));
    };
    let wildcard = quality(headers, "*");
    let gzip_quality = quality(headers, "gzip").or(wildcard).unwrap_or(0.0);
    let identity_quality =
        quality(headers, "identity").unwrap_or(if wildcard == Some(0.0) { 0.0 } else { 1.0 });
    let compressed = asset
        .gzip
        .filter(|_| gzip_quality > 0.0 && gzip_quality >= identity_quality);
    if compressed.is_none() && identity_quality == 0.0 {
        return StatusCode::NOT_ACCEPTABLE.into_response();
    }
    let bytes = compressed.unwrap_or(asset.identity);
    let mut response = (
        [("content-type", asset.mime)],
        if head { &[][..] } else { bytes },
    )
        .into_response();
    let headers = response.headers_mut();
    headers.insert(
        "cache-control",
        HeaderValue::from_static(if hashed(path) {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        }),
    );
    headers.insert("content-length", HeaderValue::from(bytes.len()));
    if asset.gzip.is_some() {
        headers.insert("vary", HeaderValue::from_static("Accept-Encoding"));
    }
    if compressed.is_some() {
        headers.insert("content-encoding", HeaderValue::from_static("gzip"));
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hashed_asset_names_are_distinct_from_entry_documents() {
        assert!(hashed("/assets/index-Abcd_1-2.js"));
        assert!(!hashed("/index.html"));
        assert!(!hashed("/assets/index.js"));
    }
}
