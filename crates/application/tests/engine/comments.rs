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
            .join(format!("{id}.md")),
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
