use super::*;

#[test]
fn agent_context_is_project_scoped_and_counts_utf8_json_overhead() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = create(&engine, &project, "A bounded excerpt");
    let resource = &card.body["result"]["resource"];
    patch(
        &engine,
        &project,
        resource["metadata"]["id"].as_str().unwrap(),
        resource["version"].as_str().unwrap(),
        json!({"set":{"body":"🦀 Untrusted project data.\n".repeat(2000)}}),
    );
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let other_id = register(&engine, other.to_str().unwrap());
    create(&engine, &other_id, "Never export this project");
    for budget in [4096, 24576, 131072] {
        let context = engine.context(&project, budget).unwrap();
        wire::validate("Context", &context).unwrap();
        let bytes = serde_json::to_vec(&context).unwrap();
        assert!(bytes.len() <= budget);
        assert!(!String::from_utf8(bytes).unwrap().contains("Never export"));
        assert_eq!(context["truncated"], true);
    }
}

#[test]
fn agent_context_includes_card_acceptance_and_body_or_an_explicit_next_read() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Acceptance context");
    let id = created.body["result"]["id"].as_str().unwrap();
    let acceptance = json!([
        {"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","text":"Keep identity and completion","completed":false},
        {"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","text":"Keep item order","completed":true}
    ]);
    let updated = patch(
        &engine,
        &project,
        id,
        created.body["result"]["version"].as_str().unwrap(),
        json!({
            "set": {
                "body": "The owner can review every criterion.",
                "acceptance": acceptance,
            },
        }),
    );
    assert_eq!(updated.http_status, 200);
    let context = engine.context(&project, 4096).unwrap();
    wire::validate("Context", &context).unwrap();
    assert_eq!(context["cards"][0]["acceptance"], acceptance);
    assert_eq!(
        context["cards"][0]["excerpt"],
        "The owner can review every criterion."
    );
    assert!(context["cards"][0].get("review_on").is_none());
    assert_eq!(context["cards"][0]["truncated"], false);

    let large = "ą".repeat(4000);
    let large_acceptance = json!(
        (0..12)
            .map(|index| {
                json!({
                    "id": format!("{index:08x}-aaaa-4aaa-8aaa-{index:012x}"),
                    "text": "ą".repeat(250),
                    "completed": index % 2 == 0,
                })
            })
            .collect::<Vec<_>>()
    );
    let updated = patch(
        &engine,
        &project,
        id,
        updated.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"body":large,"acceptance":large_acceptance}}),
    );
    assert_eq!(updated.http_status, 200);
    let narrow = engine.context(&project, 4096).unwrap();
    wire::validate("Context", &narrow).unwrap();
    assert!(serde_json::to_vec(&narrow).unwrap().len() <= 4096);
    assert_eq!(narrow["truncated"], true);
    assert_eq!(narrow["omitted"]["cards"], 1);
    assert!(narrow["cards"].as_array().unwrap().is_empty());
    assert_eq!(narrow["next_reads"][0], json!({"type":"card","id":id}));
    let full = engine.context(&project, 24576).unwrap();
    wire::validate("Context", &full).unwrap();
    assert_eq!(full["cards"][0]["excerpt"], &large[..1024]);
    assert_eq!(full["cards"][0]["truncated"], true);
    assert!(full["cards"][0].get("review_on").is_none());
    assert_eq!(full["cards"][0]["acceptance"], large_acceptance);
    assert_eq!(full["omitted"]["cards"], 0);
}

#[test]
fn agent_context_keeps_current_sources_and_unavailable_collection_next_reads() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Current structured source");
    let card = &created.body["result"]["resource"];
    let id = card["metadata"]["id"].as_str().unwrap();
    let mut source = card.clone();
    source.as_object_mut().unwrap().remove("version");
    source["body"] = json!("ą🦀 \"quoted\" \\path\n".repeat(100));
    source["metadata"]["comments"] = json!([{
        "id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "author":{"kind":"agent","label":"Context fixture"},
        "recorded_at":"2026-10-01T10:00:00Z", "body":"ą🦀\n\t\"quoted\""
    }]);
    source["metadata"]["counters"] = json!([{
        "id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "name":"Count", "unit":"reps",
        "step":1, "archived":false, "values":{"2026-10-01":1_000_000_000}
    }]);
    project_domain::validate_document(source.clone()).unwrap();
    let bytes = serde_json::to_vec(&source).unwrap();
    fs::write(
        env.root.join(format!("project/.project/cards/{id}.json")),
        &bytes,
    )
    .unwrap();
    let mut resources = Vec::new();
    for (kind, payload) in [
        (
            Kind::Milestone,
            json!({"title":"Current milestone","body":"Milestone context.","due":{"date":"2026-10-02"}}),
        ),
        (Kind::Milestone, json!({"title":"Unavailable milestone"})),
        (
            Kind::Update,
            json!({"kind":"result","summary":"Current result","target":{"type":"project","id":project},"author":{"kind":"agent","label":"Context fixture"},"body":"ą🦀 \"quoted\" \\path\n".repeat(100)}),
        ),
    ] {
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind,
                id: None,
                payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: None,
            })
            .unwrap();
        assert_eq!(reply.http_status, 200, "{kind:?}: {reply:?}");
        resources.push(reply.body["result"]["resource"].clone());
    }
    let unavailable = resources[1]["metadata"]["id"].as_str().unwrap();
    fs::write(
        env.root
            .join(format!("project/.project/milestones/{unavailable}.json")),
        b"invalid",
    )
    .unwrap();
    for budget in [4096, 24576, 131072] {
        let out = engine.context(&project, budget).unwrap();
        wire::validate("Context", &out).unwrap();
        assert!(serde_json::to_vec(&out).unwrap().len() <= budget);
        assert_eq!(out["warnings"][0]["code"], "SOURCE_UNAVAILABLE");
        assert!(
            out["next_reads"]
                .as_array()
                .unwrap()
                .contains(&json!({"type":"milestone","id":unavailable}))
        );
        if budget >= 24576 {
            assert_eq!(
                out["cards"][0]["version"],
                project_store::document::version(&bytes)
            );
            assert_eq!(out["cards"][0]["comments"], source["metadata"]["comments"]);
            assert_eq!(out["cards"][0]["counters"], source["metadata"]["counters"]);
            for (field, resource, max) in [
                ("milestones", &resources[0], 1024),
                ("updates", &resources[2], 512),
            ] {
                assert_eq!(out[field][0]["version"], resource["version"]);
                let body = resource["body"].as_str().unwrap();
                let mut end = body.len().min(max);
                while !body.is_char_boundary(end) {
                    end -= 1;
                }
                assert_eq!(out[field][0]["excerpt"], &body[..end]);
            }
            assert_eq!(out["omitted"]["milestones"], 1);
            assert_eq!(out["included"]["cards"], 1);
            assert_eq!(out["included"]["milestones"], 1);
            assert_eq!(out["included"]["updates"], 1);
            assert_eq!(out["truncated"], true);
        }
    }
}

#[test]
fn agent_context_reopens_collections_and_keeps_current_file_guards() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    create(&engine, &project, "An independent card");
    let mut reports = Vec::new();
    for summary in ["First report", "Second report"] {
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Update,
                id: None,
                payload: json!({
                    "kind":"result", "summary":summary,
                    "target":{"type":"project","id":project},
                    "author":{"kind":"agent","label":"Context fixture"}
                }),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: None,
            })
            .unwrap();
        assert_eq!(reply.http_status, 200);
        reports.push(reply.body["result"]["resource"].clone());
    }
    let directory = env.root.join("project/.project/updates");
    let previous = env.root.join("previous-updates");
    fs::rename(&directory, &previous).unwrap();
    let missing = engine.context(&project, 24576).unwrap();
    assert_eq!(missing["included"]["cards"], 1);
    assert_eq!(missing["omitted"]["updates"], 2);
    assert_eq!(missing["warnings"].as_array().unwrap().len(), 2);
    for report in &reports {
        assert!(
            missing["next_reads"]
                .as_array()
                .unwrap()
                .contains(&json!({"type":"update","id":report["metadata"]["id"]}))
        );
    }

    // A new request must observe the replacement collection and its new bytes.
    fs::create_dir(&directory).unwrap();
    for report in &mut reports {
        report.as_object_mut().unwrap().remove("version");
        report["body"] = json!("Current replacement bytes: ą🦀");
        project_domain::validate_document(report.clone()).unwrap();
        fs::write(
            directory.join(format!(
                "{}.json",
                report["metadata"]["id"].as_str().unwrap()
            )),
            serde_json::to_vec(report).unwrap(),
        )
        .unwrap();
    }
    let current = engine.context(&project, 24576).unwrap();
    assert_eq!(current["included"]["updates"], 2);
    assert!(current["warnings"].as_array().unwrap().is_empty());
    for report in &reports {
        let entry = current["updates"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["id"] == report["metadata"]["id"])
            .unwrap();
        assert_eq!(entry["excerpt"], report["body"]);
        assert_eq!(
            entry["version"],
            project_store::document::version(&serde_json::to_vec(report).unwrap())
        );
    }

    // Retaining a collection descriptor must not admit linked source files.
    let id = reports[0]["metadata"]["id"].as_str().unwrap();
    let path = directory.join(format!("{id}.json"));
    fs::remove_file(&path).unwrap();
    std::os::unix::fs::symlink(previous.join(format!("{id}.json")), &path).unwrap();
    let linked = engine.context(&project, 24576).unwrap();
    assert_eq!(linked["included"]["updates"], 1);
    assert_eq!(linked["warnings"][0]["code"], "SOURCE_UNAVAILABLE");
    assert!(
        linked["next_reads"]
            .as_array()
            .unwrap()
            .contains(&json!({"type":"update","id":id}))
    );
    fs::remove_file(&path).unwrap();
    fs::hard_link(previous.join(format!("{id}.json")), &path).unwrap();
    let linked = engine.context(&project, 24576).unwrap();
    assert_eq!(linked["included"]["updates"], 1);
    assert_eq!(linked["warnings"][0]["code"], "SOURCE_UNAVAILABLE");
    assert!(
        linked["next_reads"]
            .as_array()
            .unwrap()
            .contains(&json!({"type":"update","id":id}))
    );
}
