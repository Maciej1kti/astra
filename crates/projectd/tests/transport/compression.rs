use super::*;
use flate2::read::GzDecoder;
use std::io::Read;

#[tokio::test]
async fn summary_reads_negotiate_gzip_without_compressing_source_or_credentials() {
    let app = Running::new().await;
    let (project, epoch) = deletion::register(&app).await;
    let mut source = String::new();
    for index in 0..12 {
        let response = app
            .local("POST", &format!("/api/v1/projects/{project}/cards"))
            .header("accept-encoding", "gzip")
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", &epoch)
            .json(&json!({
                "title": format!("{index}: {}", "Compression transport ".repeat(8)),
                "body": "The source remains current. ".repeat(100),
                "schedule": {"start":"2026-09-01", "end":"2026-09-30"}
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(
            !response.headers().contains_key("content-encoding"),
            "commands stay identity"
        );
        let value: Value = response.json().await.unwrap();
        project_application::wire::validate("CommandResponse", &value).unwrap();
        source = format!(
            "/api/v1/projects/{project}/cards/{}",
            value["result"]["resource"]["metadata"]["id"]
                .as_str()
                .unwrap()
        );
        let pin = app
            .local("PATCH", &source)
            .header("accept-encoding", "gzip")
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", &epoch)
            .header(
                "if-match",
                format!("\"{}\"", value["result"]["version"].as_str().unwrap()),
            )
            .json(&json!({"set":{"pinned":true}}))
            .send()
            .await
            .unwrap();
        assert_eq!(pin.status(), 200);
        assert!(!pin.headers().contains_key("content-encoding"));
        let pin: Value = pin.json().await.unwrap();
        let configured = app.local("PATCH", &source)
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", &epoch)
            .header("if-match", format!("\"{}\"", pin["result"]["version"].as_str().unwrap()))
            .json(&json!({"configure_counter":{"name":"Training","unit":"reps","step":5,"archived":false}}))
            .send().await.unwrap();
        assert_eq!(configured.status(), 200);
    }
    let (cookie, _) = deletion::browser_session(&app).await;
    for (path, schema, field) in [
        (
            format!("/api/v1/projects/{project}/cards"),
            "SummaryPage",
            "items",
        ),
        (
            format!("/api/v1/views/list?type=card&project_id={project}"),
            "SummaryPage",
            "items",
        ),
        (
            format!(
                "/api/v1/views/calendar?project_id={project}&from=2026-09-01&to=2026-09-30&limit=1000"
            ),
            "CalendarPage",
            "items",
        ),
        ("/api/v1/workspace/focus".into(), "FocusResource", "cards"),
        (
            format!(
                "/api/v1/views/counters?project_id={project}&from=2026-09-01&to=2026-09-30&limit=100"
            ),
            "CounterSeriesPage",
            "items",
        ),
    ] {
        let unauthorized = app
            .browser("GET", &path)
            .header("accept-encoding", "gzip")
            .send()
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), 401);
        assert!(!unauthorized.headers().contains_key("content-encoding"));
        let identity = app.local("GET", &path).send().await.unwrap();
        assert!(!identity.headers().contains_key("content-encoding"));
        assert_eq!(identity.headers()["vary"], "Accept-Encoding");
        let identity: Value = identity.json().await.unwrap();
        let compressed = app
            .browser("GET", &path)
            .header("cookie", &cookie)
            .header("accept-encoding", "gzip")
            .send()
            .await
            .unwrap();
        assert_eq!(compressed.status(), 200, "{path}");
        assert_eq!(compressed.headers()["cache-control"], "no-store");
        assert_eq!(compressed.headers()["content-type"], "application/json");
        assert_eq!(compressed.headers()["vary"], "Accept-Encoding");
        assert_eq!(compressed.headers()["content-encoding"], "gzip");
        assert!(!compressed.headers().contains_key("etag"));
        let length = compressed.headers()["content-length"]
            .to_str()
            .unwrap()
            .parse::<usize>()
            .unwrap();
        let bytes = compressed.bytes().await.unwrap();
        assert_eq!(bytes.len(), length);
        let mut decoded = vec![];
        GzDecoder::new(bytes.as_ref())
            .read_to_end(&mut decoded)
            .unwrap();
        assert!(bytes.len() < decoded.len());
        let value: Value = serde_json::from_slice(&decoded).unwrap();
        project_application::wire::validate(schema, &value).unwrap();
        assert_eq!(
            value[field], identity[field],
            "summaries and source versions remain equal"
        );
        let veto = app
            .local("GET", &path)
            .header("accept-encoding", "gzip;q=0, *;q=1")
            .send()
            .await
            .unwrap();
        assert_eq!(veto.status(), 200);
        assert!(!veto.headers().contains_key("content-encoding"));
        let rejected = app
            .local("GET", &path)
            .header("accept-encoding", "br, identity;q=0")
            .send()
            .await
            .unwrap();
        assert_eq!(rejected.status(), 406);
        assert_eq!(rejected.headers()["cache-control"], "no-store");
        let error: Value = rejected.json().await.unwrap();
        project_application::wire::validate("Error", &error).unwrap();
        assert_eq!(error["error"]["code"], "ENCODING_NOT_ACCEPTABLE");
    }
    let identity = app.local("GET", &source).send().await.unwrap();
    let etag = identity.headers()["etag"].clone();
    let identity = identity.bytes().await.unwrap();
    let current = app
        .browser("GET", &source)
        .header("cookie", &cookie)
        .header("accept-encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(current.headers()["etag"], etag);
    assert!(!current.headers().contains_key("content-encoding"));
    assert_eq!(current.bytes().await.unwrap(), identity);
    let bootstrap = app
        .browser("GET", "/api/v1/bootstrap")
        .header("cookie", &cookie)
        .header("accept-encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(bootstrap.status(), 200);
    assert!(!bootstrap.headers().contains_key("content-encoding"));
    let bootstrap: Value = bootstrap.json().await.unwrap();
    project_application::wire::validate("Bootstrap", &bootstrap).unwrap();
    assert!(bootstrap["csrf_token"].is_string());
}
