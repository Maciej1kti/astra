use super::*;

/// Create a card and apply `set` to it, returning its ID and latest version.
fn card_with(engine: &Engine, project: &str, title: &str, set: Value) -> (String, String) {
    let created = create(engine, project, title);
    let id = created.body["result"]["id"].as_str().unwrap().to_owned();
    let version = created.body["result"]["version"].as_str().unwrap();
    let patched = patch(engine, project, &id, version, json!({ "set": set }));
    assert_eq!(patched.http_status, 200, "{patched:?}");
    let version = patched.body["result"]["version"].as_str().unwrap().into();
    (id, version)
}
fn milestone_due(engine: &Engine, project: &str, date: &str) {
    let reply = engine
        .mutate(Mutation {
            project_id: project.into(),
            kind: Kind::Milestone,
            id: None,
            payload: json!({"title":"Gate","due":{"date":date}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200, "{reply:?}");
}
fn projects(engine: &Engine, archived: bool) -> Value {
    let page = engine
        .list(
            Some("project"),
            &Query {
                archived: Some(archived),
                ..Default::default()
            },
        )
        .unwrap();
    wire::validate("SummaryPage", &page).unwrap();
    page
}
fn item<'a>(page: &'a Value, project: &str) -> &'a Value {
    page["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == project)
        .unwrap_or_else(|| panic!("project {project} missing from {page}"))
}
fn span(page: &Value, project: &str) -> Option<Value> {
    item(page, project).get("span").cloned()
}

#[test]
fn project_span_is_the_extent_of_dated_cards_and_is_read_only() {
    let env = Environment::new();
    let engine = env.engine();
    let dated = register(&engine, &env.path());
    let events = env.root.join("events");
    fs::create_dir(&events).unwrap();
    let events = register(&engine, events.to_str().unwrap());
    let empty = env.root.join("empty");
    fs::create_dir(&empty).unwrap();
    let empty = register(&engine, empty.to_str().unwrap());

    // Undated cards and milestones alone leave the span absent.
    create(&engine, &dated, "Undated");
    milestone_due(&engine, &dated, "2027-01-01");
    let page = projects(&engine, false);
    assert_eq!(page["items"].as_array().unwrap().len(), 3);
    for project in [&dated, &events, &empty] {
        assert_eq!(span(&page, project), None);
    }

    // Schedule only, then event only, in the same one-page read.
    let (schedule, schedule_version) = card_with(
        &engine,
        &dated,
        "Schedule",
        json!({"schedule":{"start":"2026-10-03","end":"2026-10-07"}}),
    );
    card_with(
        &engine,
        &events,
        "Event",
        json!({"event":{"start":"2026-10-05T23:30","duration_minutes":60}}),
    );
    let page = projects(&engine, false);
    assert_eq!(
        span(&page, &dated),
        Some(json!({"start":"2026-10-03","end":"2026-10-07"}))
    );
    // The last covered minute is 00:29 the next day, so the end crosses midnight.
    assert_eq!(
        span(&page, &events),
        Some(json!({"start":"2026-10-05","end":"2026-10-06"}))
    );
    assert_eq!(span(&page, &empty), None);

    // Mixed cards: earliest start and latest end over schedules and events,
    // whatever the card status.
    card_with(
        &engine,
        &dated,
        "Early event",
        json!({"event":{"start":"2026-10-01T10:00","duration_minutes":30}}),
    );
    card_with(
        &engine,
        &dated,
        "Late event",
        json!({"event":{"start":"2026-10-20T23:30","duration_minutes":60}}),
    );
    card_with(
        &engine,
        &dated,
        "Finished",
        json!({"status":"done","schedule":{"start":"2026-10-09","end":"2026-10-12"}}),
    );
    let page = projects(&engine, false);
    let extent = json!({"start":"2026-10-01","end":"2026-10-21"});
    assert_eq!(span(&page, &dated), Some(extent.clone()));

    // An archived card and a milestone never widen it.
    let (archived, archived_version) = card_with(
        &engine,
        &dated,
        "Archived",
        json!({"schedule":{"start":"2026-01-01","end":"2026-12-31"}}),
    );
    let archived_reply = patch(
        &engine,
        &dated,
        &archived,
        &archived_version,
        json!({"set":{"archived":true}}),
    );
    assert_eq!(archived_reply.http_status, 200, "{archived_reply:?}");
    milestone_due(&engine, &dated, "2028-01-01");
    let page = projects(&engine, false);
    assert_eq!(span(&page, &dated), Some(extent.clone()));

    // The same read returns the stored project version: the span is a projection.
    let source = engine.get(&dated, Kind::Project, &dated).unwrap();
    assert_eq!(item(&page, &dated)["version"], source["version"]);
    assert!(source["metadata"].get("span").is_none());
    let bytes = fs::read(env.root.join("project/.project/project.json")).unwrap();
    assert!(!String::from_utf8(bytes).unwrap().contains("span"));

    // Search results that return a project carry the same derived field.
    let found = engine
        .list(
            None,
            &Query {
                search: Some("Test".into()),
                ..Default::default()
            },
        )
        .unwrap();
    wire::validate("SummaryPage", &found).unwrap();
    assert_eq!(span(&found, &dated), Some(extent.clone()));
    // Cards never carry it.
    let cards = engine
        .list(
            Some("card"),
            &Query {
                project: Some(dated.clone()),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(
        cards["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|card| card.get("span").is_none())
    );

    // A fresh read sees a card date edit, and so does the snapshot it names.
    let before = page["page"]["snapshot_cursor"].clone();
    let widened = patch(
        &engine,
        &dated,
        &schedule,
        &schedule_version,
        json!({"set":{"schedule":{"start":"2026-09-15","end":"2026-11-02"}}}),
    );
    assert_eq!(widened.http_status, 200, "{widened:?}");
    let page = projects(&engine, false);
    assert_ne!(page["page"]["snapshot_cursor"], before);
    assert_eq!(
        span(&page, &dated),
        Some(json!({"start":"2026-09-15","end":"2026-11-02"}))
    );
    assert_eq!(item(&page, &dated)["version"], source["version"]);
    // Clearing the only schedule falls back to the remaining cards.
    let cleared = patch(
        &engine,
        &dated,
        &schedule,
        widened.body["result"]["version"].as_str().unwrap(),
        json!({"clear":["schedule"]}),
    );
    assert_eq!(cleared.http_status, 200, "{cleared:?}");
    assert_eq!(
        span(&projects(&engine, false), &dated),
        Some(json!({"start":"2026-10-01","end":"2026-10-21"}))
    );

    // Archived projects page carries it as well, and no write accepts it.
    let source = engine.get(&events, Kind::Project, &events).unwrap();
    let rejected = |payload: Value, version: &str| {
        engine
            .mutate(Mutation {
                project_id: events.clone(),
                kind: Kind::Project,
                id: Some(events.clone()),
                payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: Some(version.into()),
            })
            .unwrap()
    };
    let version = source["version"].as_str().unwrap();
    for payload in [
        json!({"set":{"span":{"start":"2026-01-01","end":"2026-01-02"}}}),
        json!({"clear":["span"]}),
        json!({"span":{"start":"2026-01-01","end":"2026-01-02"}}),
    ] {
        assert_eq!(rejected(payload, version).http_status, 422);
    }
    let archived_project = rejected(json!({"set":{"state":"archived"}}), version);
    assert_eq!(archived_project.http_status, 200, "{archived_project:?}");
    let active = projects(&engine, false);
    assert!(
        active["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["id"] != events)
    );
    let archived_page = projects(&engine, true);
    assert_eq!(archived_page["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        span(&archived_page, &events),
        Some(json!({"start":"2026-10-05","end":"2026-10-06"}))
    );
}

#[test]
fn project_span_is_not_accepted_in_a_source_file() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let mut source = engine.get(&project, Kind::Project, &project).unwrap();
    source.as_object_mut().unwrap().remove("version");
    source["metadata"]["span"] = json!({"start":"2026-10-01","end":"2026-10-02"});
    assert!(project_domain::validate_document(source).is_err());
}
