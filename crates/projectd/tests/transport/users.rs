use super::*;

async fn get(app: &Running, path: &str, user: Option<&str>) -> Value {
    let mut request = app.local("GET", path);
    if let Some(user) = user {
        request = request.header("x-astra-user", user);
    }
    let response = request.send().await.unwrap();
    assert_eq!(response.status(), 200);
    response.json().await.unwrap()
}
async fn create(app: &Running) -> (String, Value) {
    let boot = get(app, "/api/v1/bootstrap", None).await;
    let id = Uuid::new_v4().to_string();
    let response = app
        .local("POST", "/api/v1/users")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", boot["command_epoch"].as_str().unwrap())
        .json(&json!({"id":id,"name":"Second user"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    let reply: Value = response.json().await.unwrap();
    project_application::wire::validate("CommandResponse", &reply).unwrap();
    assert_eq!(reply["result"]["resource"]["id"], id);
    (id, boot)
}
async fn register(app: &Running, user: &str, epoch: &str) -> Value {
    let plan = app
        .local("POST", "/local/v1/registration-plans")
        .header("x-astra-user", user)
        .json(&json!({"absolute_path":app.project,"name":"Scoped project"}))
        .send()
        .await
        .unwrap();
    assert_eq!(plan.status(), 200);
    let plan: Value = plan.json().await.unwrap();
    let committed = app
        .local("POST", "/api/v1/registrations")
        .header("x-astra-user", user)
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", epoch)
        .json(&json!({"plan_id":plan["plan_id"]}))
        .send()
        .await
        .unwrap();
    assert!(committed.status().is_success());
    plan
}
async fn paired_cookie(app: &Running) -> String {
    let response = app
        .browser("POST", "/api/v1/auth/pairings")
        .header("origin", "https://projects.test")
        .json(&json!({"device_label":"Users regression"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let pending_cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let pairing: Value = response.json().await.unwrap();
    let approved = app
        .local(
            "POST",
            &format!(
                "/local/v1/pairings/{}/approve",
                pairing["id"].as_str().unwrap()
            ),
        )
        .json(&json!({"challenge":pairing["challenge"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(approved.status(), 200);
    let claimed = app
        .browser("POST", "/api/v1/auth/pairings/claim")
        .header("origin", "https://projects.test")
        .header("cookie", &pending_cookie)
        .header(
            "x-csrf-token",
            pairing["pending_csrf_token"].as_str().unwrap(),
        )
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(claimed.status(), 200);
    claimed.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn selected_users_scope_content_and_keep_authentication_central() {
    let app = Running::new().await;
    let (user, owner) = create(&app).await;
    let owner_id = owner["user"]["id"].as_str().unwrap();
    let selected = get(&app, "/api/v1/bootstrap", Some(&user)).await;
    project_application::wire::validate("Bootstrap", &selected).unwrap();
    assert_eq!(selected["user"]["id"], user);
    assert_eq!(owner["user"]["is_default"], true);
    assert_ne!(selected["command_epoch"], owner["command_epoch"]);
    let profiles = get(&app, "/api/v1/users", Some(&user)).await;
    assert_eq!(profiles["current_user_id"], user);
    assert_eq!(profiles["command_epoch"], owner["command_epoch"]);
    assert_eq!(profiles["items"].as_array().unwrap().len(), 2);
    let plan = register(&app, &user, selected["command_epoch"].as_str().unwrap()).await;
    assert_eq!(
        get(&app, "/api/v1/projects", None).await["items"],
        json!([])
    );
    assert_eq!(
        get(&app, "/api/v1/projects", Some(&user)).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        get(&app, "/api/v1/search?q=Scoped", None).await["items"],
        json!([])
    );
    assert_eq!(
        get(&app, "/api/v1/search?q=Scoped", Some(&user)).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        app.local(
            "GET",
            &format!("/api/v1/projects/{}", plan["project_id"].as_str().unwrap())
        )
        .send()
        .await
        .unwrap()
        .status(),
        404
    );
    let shared = app
        .local("POST", "/local/v1/registration-plans")
        .header("x-astra-user", owner_id)
        .json(&json!({"absolute_path":app.project}))
        .send()
        .await
        .unwrap();
    assert_eq!(shared.status(), 200);
    assert_eq!(
        shared.json::<Value>().await.unwrap()["project_id"],
        plan["project_id"]
    );
    let cookie = paired_cookie(&app).await;
    let browser = app
        .browser("GET", "/api/v1/bootstrap")
        .header("cookie", &cookie)
        .header("x-astra-user", &user)
        .send()
        .await
        .unwrap();
    assert_eq!(browser.status(), 200);
    let browser: Value = browser.json().await.unwrap();
    assert_eq!(browser["user"]["id"], user);
    let sessions = app
        .browser("GET", "/api/v1/auth/sessions")
        .header("cookie", &cookie)
        .header("x-astra-user", &user)
        .send()
        .await
        .unwrap();
    assert_eq!(sessions.status(), 200);
    assert_eq!(
        sessions.json::<Value>().await.unwrap()["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let logout = app
        .browser("POST", "/api/v1/auth/logout")
        .header("cookie", &cookie)
        .header("origin", "https://projects.test")
        .header("x-astra-user", &user)
        .header("x-csrf-token", browser["csrf_token"].as_str().unwrap())
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(logout.status(), 204);
    assert_eq!(
        app.browser("GET", "/api/v1/bootstrap")
            .header("cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
}

#[tokio::test]
async fn profile_selectors_reject_invalid_duplicate_and_unknown_values() {
    let app = Running::new().await;
    let (user, _) = create(&app).await;
    for (value, status) in [
        ("", 400),
        ("../state", 400),
        (&Uuid::new_v4().to_string(), 404),
    ] {
        assert_eq!(
            app.local("GET", "/api/v1/bootstrap")
                .header("x-astra-user", value)
                .send()
                .await
                .unwrap()
                .status(),
            status
        );
    }
    assert_eq!(
        app.local("GET", "/api/v1/bootstrap")
            .header("x-astra-user", &user)
            .header("x-astra-user", &user)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    for path in [
        format!("/api/v1/events?user_id={user}&user_id={user}"),
        "/api/v1/events?user_id=bad".into(),
    ] {
        assert_eq!(app.local("GET", &path).send().await.unwrap().status(), 400);
    }
    assert_eq!(
        app.local("GET", &format!("/api/v1/events?user_id={user}"))
            .header("x-astra-user", Uuid::new_v4().to_string())
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
}

#[tokio::test]
async fn user_event_streams_replay_only_selected_sources_and_use_shared_session_revocation() {
    let app = Running::new().await;
    let (user, owner) = create(&app).await;
    let selected = get(&app, "/api/v1/bootstrap", Some(&user)).await;
    let cookie = paired_cookie(&app).await;
    let mut stream = app
        .browser(
            "GET",
            &format!(
                "/api/v1/events?user_id={user}&cursor={}",
                selected["snapshot_cursor"].as_str().unwrap()
            ),
        )
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(stream.status(), 200);
    assert!(String::from_utf8_lossy(&stream.chunk().await.unwrap().unwrap()).contains("connected"));
    let plan = register(&app, &user, selected["command_epoch"].as_str().unwrap()).await;
    let event = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        let mut text = String::new();
        while !text.contains(plan["project_id"].as_str().unwrap()) {
            text.push_str(&String::from_utf8_lossy(
                &stream.chunk().await.unwrap().unwrap(),
            ));
        }
        text
    })
    .await
    .unwrap();
    assert!(event.contains(plan["project_id"].as_str().unwrap()));
    let mut owner_stream = app
        .local(
            "GET",
            &format!(
                "/api/v1/events?cursor={}",
                owner["snapshot_cursor"].as_str().unwrap()
            ),
        )
        .send()
        .await
        .unwrap();
    let connected = owner_stream.chunk().await.unwrap().unwrap();
    assert!(!String::from_utf8_lossy(&connected).contains(plan["project_id"].as_str().unwrap()));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), owner_stream.chunk())
            .await
            .is_err()
    );
    let sessions = get(&app, "/api/v1/auth/sessions", Some(&user)).await;
    let session = sessions["items"][0]["id"].as_str().unwrap();
    assert_eq!(
        app.local("DELETE", &format!("/api/v1/auth/sessions/{session}"))
            .header("x-astra-user", &user)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while stream.chunk().await.unwrap().is_some() {}
    })
    .await
    .unwrap();
}
