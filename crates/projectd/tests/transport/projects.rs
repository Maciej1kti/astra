use super::*;
use std::collections::{BTreeMap, BTreeSet};

async fn read_projects(app: &Running, cookie: &str, query: &str) -> Value {
    let response = app
        .browser("GET", &format!("/api/v1/projects{query}"))
        .header("cookie", cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let page: Value = response.json().await.unwrap();
    project_application::wire::validate("SummaryPage", &page).unwrap();
    page
}

fn ids(page: &Value) -> BTreeSet<String> {
    page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap().to_owned())
        .collect()
}

#[tokio::test]
async fn project_lists_split_archived_sources_and_bind_cursors_to_archive_scope() {
    let app = Running::new().await;
    let (active, epoch) = deletion::register(&app).await;
    let mut ordinary = BTreeSet::from([active]);
    let mut archived = BTreeMap::new();
    for (name, state) in [
        ("Paused project", "paused"),
        ("Archived first", "archived"),
        ("Archived second", "archived"),
    ] {
        let path = app._temp.path().join(name);
        std::fs::create_dir(&path).unwrap();
        let path = path.canonicalize().unwrap();
        let response = app
            .local("POST", "/local/v1/registration-plans")
            .json(&json!({"absolute_path":path,"name":name,"git_mode":"private"}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let plan: Value = response.json().await.unwrap();
        let registration = app
            .local("POST", "/api/v1/registrations")
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", &epoch)
            .json(&json!({"plan_id":plan["plan_id"]}))
            .send()
            .await
            .unwrap();
        assert_eq!(registration.status(), 202);
        let project = plan["project_id"].as_str().unwrap();
        let source_path = format!("/api/v1/projects/{project}");
        let source: Value = app
            .local("GET", &source_path)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let changed = app
            .local("PATCH", &source_path)
            .header("x-request-id", Uuid::now_v7().to_string())
            .header("x-command-epoch", &epoch)
            .header(
                "if-match",
                format!("\"{}\"", source["version"].as_str().unwrap()),
            )
            .json(&json!({"set":{"state":state}}))
            .send()
            .await
            .unwrap();
        assert_eq!(changed.status(), 200);
        let changed: Value = changed.json().await.unwrap();
        project_application::wire::validate("CommandResponse", &changed).unwrap();
        if state == "archived" {
            archived.insert(
                project.to_owned(),
                changed["result"]["version"].as_str().unwrap().to_owned(),
            );
        } else {
            ordinary.insert(project.to_owned());
        }
    }
    let (cookie, _) = deletion::browser_session(&app).await;
    let default = read_projects(&app, &cookie, "?limit=10").await;
    assert_eq!(ids(&default), ordinary);
    assert!(
        default["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| { matches!(item["status"].as_str(), Some("active" | "paused")) })
    );
    assert_eq!(
        ids(&read_projects(&app, &cookie, "?archived=false&limit=10").await),
        ordinary
    );

    let first = read_projects(&app, &cookie, "?archived=true&limit=1").await;
    assert_eq!(first["items"].as_array().unwrap().len(), 1);
    assert_eq!(first["page"]["has_more"], true);
    let cursor = first["page"]["next_cursor"].as_str().unwrap();
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("archived", "true")
        .append_pair("limit", "1")
        .append_pair("cursor", cursor)
        .finish();
    let second = read_projects(&app, &cookie, &format!("?{query}")).await;
    assert_eq!(second["items"].as_array().unwrap().len(), 1);
    assert_eq!(second["page"]["has_more"], false);
    let returned = ids(&first)
        .union(&ids(&second))
        .cloned()
        .collect::<BTreeSet<_>>();
    assert_eq!(returned, archived.keys().cloned().collect());
    for page in [&first, &second] {
        let item = &page["items"][0];
        assert_eq!(item["status"], "archived");
        assert_eq!(
            item["version"].as_str().unwrap(),
            archived[item["id"].as_str().unwrap()]
        );
    }
    let changed_scope = query.replacen("archived=true", "archived=false", 1);
    let rejected = app
        .browser("GET", &format!("/api/v1/projects?{changed_scope}"))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(rejected.status(), 409);
    let rejected: Value = rejected.json().await.unwrap();
    assert_eq!(rejected["error"]["code"], "CURSOR_STALE");
    project_application::wire::validate("Error", &rejected).unwrap();
    let invalid = app
        .browser("GET", "/api/v1/projects?archived=all")
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    assert_eq!(
        invalid.json::<Value>().await.unwrap()["error"]["code"],
        "INVALID_QUERY"
    );
}
