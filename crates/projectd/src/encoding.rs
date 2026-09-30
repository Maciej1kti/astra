use axum::http::HeaderMap;

pub(super) fn quality(headers: &HeaderMap, encoding: &str) -> Option<f32> {
    headers
        .get_all("accept-encoding")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .filter_map(|value| {
            let mut parts = value.split(';');
            if !parts.next()?.trim().eq_ignore_ascii_case(encoding) {
                return None;
            }
            let mut quality = 1.0;
            for parameter in parts {
                let (key, value) = parameter.trim().split_once('=')?;
                if !key.eq_ignore_ascii_case("q") {
                    return None;
                }
                quality = value.trim().parse::<f32>().ok()?;
                if !(0.0..=1.0).contains(&quality) {
                    return None;
                }
            }
            Some(quality)
        })
        .reduce(f32::max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn encoding_quality_respects_explicit_veto_and_multiple_headers() {
        let mut headers = HeaderMap::new();
        headers.append("accept-encoding", HeaderValue::from_static("br, *;q=0.5"));
        headers.append("accept-encoding", HeaderValue::from_static("gzip;q=0"));
        assert_eq!(quality(&headers, "gzip"), Some(0.0));
        assert_eq!(quality(&headers, "*"), Some(0.5));
    }
}
