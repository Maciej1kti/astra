use super::*;

fn external_pins(env: &Environment, template: &Value, count: usize) {
    for _ in 0..count {
        let mut source = template.clone();
        source.as_object_mut().unwrap().remove("version");
        let id = Uuid::new_v4().to_string();
        source["metadata"]["id"] = json!(id);
        source["metadata"]["pinned"] = json!(true);
        fs::write(
            env.root.join(format!("project/.project/cards/{id}.json")),
            serde_json::to_vec(&source).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn focus_isolates_invalid_sources_retains_pins_and_recovers() {
    let env = Environment::new();
    let engine = env.engine();
    let good = register(&engine, &env.path());
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let bad = register(&engine, other.to_str().unwrap());
    let card = create(&engine, &good, "Healthy pin");
    let id = card.body["result"]["id"].as_str().unwrap();
    patch(
        &engine,
        &good,
        id,
        card.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    let broken = create(&engine, &bad, "Unrelated unpinned card");
    let path = other.join(format!(
        ".project/cards/{}.json",
        broken.body["result"]["id"].as_str().unwrap()
    ));
    let bytes = fs::read(&path).unwrap();
    fs::write(&path, b"{").unwrap();
    engine.refresh_project(&bad, None).unwrap();
    let read = engine
        .focus_resource()
        .expect("one invalid source must not block healthy pins");
    wire::validate("FocusResource", &read).unwrap();
    assert_eq!(read["items"][0]["card_id"], id);
    assert_eq!(read["complete"], false);
    assert!(!read["warnings"].as_array().unwrap().is_empty());
    fs::write(&path, bytes).unwrap();
    engine.refresh_project(&bad, None).unwrap();
    assert_eq!(engine.focus_resource().unwrap()["complete"], true);
    fs::rename(env.root.join("project"), env.root.join("moved")).unwrap();
    let _ = engine.refresh_project(&good, None);
    let read = engine.focus_resource().unwrap();
    wire::validate("FocusResource", &read).unwrap();
    assert_eq!(read["items"][0]["card_id"], id);
    assert_eq!(read["complete"], false);
}

#[test]
fn concurrent_pins_admit_only_the_last_slot_and_overflow_reads_allow_recovery() {
    let env = Environment::new();
    let engine = Arc::new(env.engine());
    let project = register(&engine, &env.path());
    let a = create(&engine, &project, "Candidate A");
    let other = env.root.join("other");
    fs::create_dir(&other).unwrap();
    let second = register(&engine, other.to_str().unwrap());
    let b = create(&engine, &second, "Candidate B");
    external_pins(&env, &a.body["result"]["resource"], 99);
    engine.refresh_project(&project, None).unwrap();
    let replies = std::thread::scope(|scope| {
        let handles = [(project.clone(), a.clone()), (second, b)]
            .into_iter()
            .map(|(project, card)| {
                let engine = engine.clone();
                scope.spawn(move || {
                    patch(
                        &engine,
                        &project,
                        card.body["result"]["id"].as_str().unwrap(),
                        card.body["result"]["version"].as_str().unwrap(),
                        json!({"set":{"pinned":true}}),
                    )
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(replies.iter().filter(|r| r.http_status == 200).count(), 1);
    assert_eq!(
        replies
            .iter()
            .filter(|r| r.body["error"]["code"] == "FOCUS_LIMIT")
            .count(),
        1
    );
    external_pins(&env, &a.body["result"]["resource"], 1);
    engine.refresh_project(&project, None).unwrap();
    let read = engine.focus_resource().unwrap();
    assert_eq!(read["items"].as_array().unwrap().len(), 100);
    assert_eq!(read["complete"], false);
    let pin = &read["items"][0];
    let project = pin["project_id"].as_str().unwrap();
    let id = pin["card_id"].as_str().unwrap();
    let source = engine.get(project, Kind::Card, id).unwrap();
    assert_eq!(
        patch(
            &engine,
            project,
            id,
            source["version"].as_str().unwrap(),
            json!({"set":{"pinned":false}})
        )
        .http_status,
        200
    );
    assert_eq!(engine.focus_resource().unwrap()["complete"], true);
}

#[test]
fn focus_and_attention_pages_survive_minutes_but_expire_on_actual_event_boundary() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-29T10:00:00+02:00")
        .unwrap()
        .timestamp_millis();
    for title in ["First", "Second", "Third"] {
        let card = create(&engine, &project, title);
        patch(
            &engine,
            &project,
            card.body["result"]["id"].as_str().unwrap(),
            card.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"schedule":{"start":"2026-09-29","end":"2026-09-29"}}}),
        );
    }
    for section in ["motion", "attention"] {
        let page = if section == "motion" {
            engine.focus_cards("motion", None, None, 1, now)
        } else {
            engine.attention(None, 1, now)
        }
        .unwrap();
        let cursor = page["page"]["next_cursor"].as_str().unwrap();
        let next = if section == "motion" {
            engine.focus_cards("motion", None, Some(cursor), 1, now + 60_000)
        } else {
            engine.attention(Some(cursor), 1, now + 60_000)
        };
        assert!(next.is_ok(), "unchanged minute: {next:?}");
    }
    for i in 0..3 {
        let card = create(&engine, &project, "Timed");
        patch(
            &engine,
            &project,
            card.body["result"]["id"].as_str().unwrap(),
            card.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"event":{"start":"2026-09-29T10:00","duration_minutes":i+2}}}),
        );
    }
    let page = engine.focus_cards("events", None, None, 1, now).unwrap();
    let cursor = page["page"]["next_cursor"].as_str().unwrap();
    assert!(
        engine
            .focus_cards("events", None, Some(cursor), 1, now + 60_000)
            .is_ok()
    );
    assert!(
        matches!(engine.focus_cards("events", None, Some(cursor), 1, now + 120_000), Err(project_application::AppError::Rejected(reply)) if reply.body["error"]["code"] == "PAGE_STALE")
    );
}
