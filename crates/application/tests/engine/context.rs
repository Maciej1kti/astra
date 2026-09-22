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
                "review_on": "2026-09-08",
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
    assert_eq!(context["cards"][0]["review_on"], "2026-09-08");
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
    assert_eq!(full["cards"][0]["review_on"], "2026-09-08");
    assert_eq!(full["cards"][0]["acceptance"], large_acceptance);
    assert_eq!(full["omitted"]["cards"], 0);
}
