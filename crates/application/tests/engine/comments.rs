use super::*;

#[test]
fn comments_are_source_owned_conditional_replayable_and_preserved() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Discuss this card");
    let original = &created.body["result"]["resource"];
    let id = original["metadata"]["id"].as_str().unwrap();
    let version = original["version"].as_str().unwrap();
    let payload = json!({"append_comment":{"body":"**CommentNeedle**\n\nHuman detail: żółć.","author":{"kind":"human","label":"Owner"}}});
    let input = Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: Some(id.into()),
        payload: payload.clone(),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: Some(version.into()),
    };
    let first = engine.mutate(input.clone()).unwrap();
    assert_eq!(first.http_status, 200, "{first:?}");
    wire::validate("CommandResponse", &first.body).unwrap();
    let resource = &first.body["result"]["resource"];
    let comments = &resource["metadata"]["comments"];
    assert_eq!(comments.as_array().unwrap().len(), 1);
    assert_eq!(comments[0]["body"], payload["append_comment"]["body"]);
    assert_eq!(resource["body"], original["body"]);
    assert_eq!(
        engine.mutate(input.clone()).unwrap().body["result"],
        first.body["result"]
    );
    assert_eq!(
        patch(&engine, &project, id, version, payload).http_status,
        412
    );
    let history = engine.history(&project, Kind::Card, id, None, 20).unwrap();
    assert_eq!(history["items"][0]["can_undo"], false);
    let current = resource["version"].as_str().unwrap();
    let undone = patch(
        &engine,
        &project,
        id,
        current,
        json!({"undo":{"history_entry_id":history["items"][0]["id"]}}),
    );
    assert_eq!(undone.http_status, 409);
    for invalid in [
        json!({"set":{"comments":[]}}),
        json!({"clear":["comments"]}),
        json!({"append_comment":{"body":"   ","author":{"kind":"human","label":"Owner"}}}),
        json!({"append_comment":{"body":"Text","author":{"kind":"agent","label":" "}}}),
    ] {
        assert_eq!(
            patch(&engine, &project, id, current, invalid).http_status,
            422
        );
    }
    let renamed = patch(
        &engine,
        &project,
        id,
        current,
        json!({"set":{"title":"Renamed","body":"Description stays separate"}}),
    );
    assert_eq!(
        renamed.body["result"]["resource"]["metadata"]["comments"],
        *comments
    );
    let bot = patch(
        &engine,
        &project,
        id,
        renamed.body["result"]["resource"]["version"]
            .as_str()
            .unwrap(),
        json!({"append_comment":{"body":"Bot reply","author":{"kind":"agent","label":"Codex"}}}),
    );
    assert_eq!(bot.http_status, 200, "{bot:?}");
    let bytes = fs::read(
        env.root
            .join("project/.project/cards")
            .join(format!("{id}.json")),
    )
    .unwrap();
    let source = project_store::document::parse(Kind::Card, Some(id), &bytes)
        .unwrap()
        .value();
    assert_eq!(source["metadata"]["comments"].as_array().unwrap().len(), 2);
    assert_eq!(source["body"], "Description stays separate");
    let summary = Indexed {
        project_id: project.clone(),
        kind: "card".into(),
        id: id.into(),
        version: bot.body["result"]["resource"]["version"]
            .as_str()
            .unwrap()
            .into(),
        metadata: source["metadata"].clone(),
        validity: "valid".into(),
    }
    .summary();
    wire::validate("Summary", &summary).unwrap();
    assert_eq!(summary["comment_count"], 2);
    assert!(summary.get("comments").is_none());
    for term in ["CommentNeedle", "Codex"] {
        let page = engine
            .list(
                Some("card"),
                &Query {
                    project: Some(project.clone()),
                    search: Some(term.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        wire::validate("SummaryPage", &page).unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 1);
        assert_eq!(page["items"][0]["comment_count"], 2);
    }
    let context = engine.context(&project, 4096).unwrap();
    wire::validate("Context", &context).unwrap();
    assert_eq!(
        context["cards"][0]["comments"],
        source["metadata"]["comments"]
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["comments"],
        source["metadata"]["comments"]
    );
    assert_eq!(
        engine.mutate(input).unwrap().body["result"],
        first.body["result"]
    );
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["comments"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

fn project_patch(engine: &Engine, project: &str, expected: &str, payload: Value) -> Reply {
    engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Project,
            id: Some(project.into()),
            payload,
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(expected.into()),
        })
        .unwrap()
}

#[test]
fn project_comments_are_source_owned_conditional_replayable_and_preserved() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let original = engine.get(&project, Kind::Project, &project).unwrap();
    assert!(original["metadata"].get("comments").is_none());
    let version = original["version"].as_str().unwrap();
    let payload = json!({"append_comment":{"body":"**GoalNeedle**\n\nHuman detail: żółć.","author":{"kind":"human","label":"Owner"}}});
    let input = Mutation {
        project_id: project.clone(),
        kind: Kind::Project,
        id: Some(project.clone()),
        payload: payload.clone(),
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: Some(version.into()),
    };
    let first = engine.mutate(input.clone()).unwrap();
    assert_eq!(first.http_status, 200, "{first:?}");
    wire::validate("CommandResponse", &first.body).unwrap();
    let resource = &first.body["result"]["resource"];
    let comments = &resource["metadata"]["comments"];
    assert_eq!(comments.as_array().unwrap().len(), 1);
    assert_eq!(comments[0]["body"], payload["append_comment"]["body"]);
    assert_eq!(comments[0]["author"], payload["append_comment"]["author"]);
    assert_eq!(resource["body"], original["body"]);
    assert_eq!(resource["metadata"]["name"], original["metadata"]["name"]);
    // The same request ID replays the original result instead of appending twice.
    assert_eq!(
        engine.mutate(input.clone()).unwrap().body["result"],
        first.body["result"]
    );
    // A new request with the stale version conflicts; nothing is refetched or forced.
    assert_eq!(
        project_patch(&engine, &project, version, payload).http_status,
        412
    );
    let current = resource["version"].as_str().unwrap();
    for invalid in [
        json!({"set":{"comments":[]}}),
        json!({"clear":["comments"]}),
        json!({"append_comment":{"body":"   ","author":{"kind":"human","label":"Owner"}}}),
        json!({"append_comment":{"body":"","author":{"kind":"human","label":"Owner"}}}),
        json!({"append_comment":{"body":"Text","author":{"kind":"agent","label":" "}}}),
        json!({"append_comment":{"body":"é".repeat(4001),"author":{"kind":"human","label":"Owner"}}}),
        json!({"append_comment":{"body":"Text","author":{"kind":"human","label":"Owner"}},"set":{"name":"Combined"}}),
        json!({"append_comment":{"body":"Text","author":{"kind":"human","label":"Owner"}},"clear":["folder"]}),
        json!({"append_comment":{"body":"Text","author":{"kind":"human","label":"Owner"}},"undo":{"history_entry_id":"33333333-3333-4333-8333-333333333333"}}),
    ] {
        assert_eq!(
            project_patch(&engine, &project, current, invalid).http_status,
            422
        );
    }
    // The limit counts Unicode characters, not bytes.
    let boundary = project_patch(
        &engine,
        &project,
        current,
        json!({"append_comment":{"body":"é".repeat(4000),"author":{"kind":"human","label":"Owner"}}}),
    );
    assert_eq!(boundary.http_status, 200, "{boundary:?}");
    let renamed = project_patch(
        &engine,
        &project,
        boundary.body["result"]["resource"]["version"]
            .as_str()
            .unwrap(),
        json!({"set":{"name":"Renamed goal","body":"Description stays separate"}}),
    );
    assert_eq!(renamed.http_status, 200, "{renamed:?}");
    let renamed_comments = &renamed.body["result"]["resource"]["metadata"]["comments"];
    assert_eq!(renamed_comments.as_array().unwrap().len(), 2);
    assert_eq!(renamed_comments[0], comments[0]);
    let cleared = project_patch(
        &engine,
        &project,
        renamed.body["result"]["resource"]["version"]
            .as_str()
            .unwrap(),
        json!({"set":{"folder":"Work"}}),
    );
    assert_eq!(
        cleared.body["result"]["resource"]["metadata"]["comments"],
        *renamed_comments
    );
    let cleared = project_patch(
        &engine,
        &project,
        cleared.body["result"]["resource"]["version"]
            .as_str()
            .unwrap(),
        json!({"clear":["folder"]}),
    );
    assert_eq!(
        cleared.body["result"]["resource"]["metadata"]["comments"],
        *renamed_comments
    );
    let bot = project_patch(
        &engine,
        &project,
        cleared.body["result"]["resource"]["version"]
            .as_str()
            .unwrap(),
        json!({"append_comment":{"body":"Bot reply","author":{"kind":"agent","label":"Codex"}}}),
    );
    assert_eq!(bot.http_status, 200, "{bot:?}");
    let bytes = fs::read(env.root.join("project/.project/project.json")).unwrap();
    let source = project_store::document::parse(Kind::Project, Some(&project), &bytes)
        .unwrap()
        .value();
    assert_eq!(source["metadata"]["comments"].as_array().unwrap().len(), 3);
    assert_eq!(source["body"], "Description stays separate");
    assert_eq!(source["metadata"]["name"], "Renamed goal");
    let summary = Indexed {
        project_id: project.clone(),
        kind: "project".into(),
        id: project.clone(),
        version: bot.body["result"]["resource"]["version"]
            .as_str()
            .unwrap()
            .into(),
        metadata: source["metadata"].clone(),
        validity: "valid".into(),
    }
    .summary();
    wire::validate("Summary", &summary).unwrap();
    assert_eq!(summary["comment_count"], 3);
    assert!(summary.get("comments").is_none());
    for term in ["GoalNeedle", "Codex"] {
        let page = engine
            .list(
                Some("project"),
                &Query {
                    search: Some(term.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        wire::validate("SummaryPage", &page).unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 1, "{term}");
        assert_eq!(page["items"][0]["comment_count"], 3);
    }
    let listed = engine.list(Some("project"), &Query::default()).unwrap();
    assert_eq!(listed["items"][0]["comment_count"], 3);
    let context = engine.context(&project, 131072).unwrap();
    wire::validate("Context", &context).unwrap();
    assert_eq!(
        context["project"]["comments"],
        source["metadata"]["comments"]
    );
    assert_eq!(context["project"]["truncated"], false);
    // A long history never crowds out the reply or fails the budget: past a
    // quarter of it the comments become an explicit next read.
    for budget in [4096, 24576] {
        let narrow = engine.context(&project, budget).unwrap();
        wire::validate("Context", &narrow).unwrap();
        assert!(serde_json::to_vec(&narrow).unwrap().len() <= budget);
        assert!(narrow["project"].get("comments").is_none());
        assert_eq!(narrow["project"]["truncated"], true);
        assert_eq!(narrow["truncated"], true);
        assert_eq!(
            narrow["next_reads"][0],
            json!({"type":"project","id":project})
        );
    }
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine.get(&project, Kind::Project, &project).unwrap()["metadata"]["comments"],
        source["metadata"]["comments"]
    );
    assert_eq!(
        engine.mutate(input).unwrap().body["result"],
        first.body["result"]
    );
}

#[test]
fn project_undo_cannot_add_remove_or_rewrite_comments() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let version = engine.get(&project, Kind::Project, &project).unwrap()["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let commented = project_patch(
        &engine,
        &project,
        &version,
        json!({"append_comment":{"body":"Keep me","author":{"kind":"human","label":"Owner"}}}),
    );
    assert_eq!(commented.http_status, 200, "{commented:?}");
    let current = commented.body["result"]["resource"]["version"]
        .as_str()
        .unwrap();
    let history = engine
        .history(&project, Kind::Project, &project, None, 20)
        .unwrap();
    assert_eq!(history["items"][0]["can_undo"], false);
    let undone = project_patch(
        &engine,
        &project,
        current,
        json!({"undo":{"history_entry_id":history["items"][0]["id"]}}),
    );
    assert_eq!(undone.http_status, 409, "{undone:?}");
    assert_eq!(undone.body["error"]["code"], "UNDO_COMMENT_NOT_SUPPORTED");
    let after = engine.get(&project, Kind::Project, &project).unwrap();
    assert_eq!(after["version"], current);
    assert_eq!(after["metadata"]["comments"].as_array().unwrap().len(), 1);
}
