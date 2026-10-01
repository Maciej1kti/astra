use super::*;

#[test]
fn counter_totals_are_conditional_dated_and_preserved_across_restart() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Exercise");
    let original = &created.body["result"]["resource"];
    let id = original["metadata"]["id"].as_str().unwrap();
    let config =
        json!({"configure_counter":{"name":"Push-ups","unit":"reps","step":5,"archived":false}});
    let input = Mutation {
        project_id: project.clone(),
        kind: Kind::Card,
        id: Some(id.into()),
        payload: config,
        request_id: Uuid::now_v7().to_string(),
        epoch: engine.journal.epoch.clone(),
        expected: Some(original["version"].as_str().unwrap().into()),
    };
    let configured = engine.mutate(input.clone()).unwrap();
    assert_eq!(configured.http_status, 200, "{configured:?}");
    wire::validate("CommandResponse", &configured.body).unwrap();
    let counter = configured.body["result"]["resource"]["metadata"]["counters"][0].clone();
    let counter_id = counter["id"].as_str().unwrap();
    assert_eq!(counter["values"], json!({}));
    assert_eq!(
        engine.mutate(input.clone()).unwrap().body["result"],
        configured.body["result"]
    );
    let mut current = configured.body["result"]["resource"].clone();
    for (date, value) in [
        ("2026-09-26", 5),
        ("2026-09-26", 15),
        ("2026-09-27", 10),
        ("2026-09-27", 0),
    ] {
        let record = json!({"record_counter":{"id":counter_id,"date":date,"value":value}});
        let before = current["version"].as_str().unwrap().to_string();
        let write = Mutation {
            project_id: project.clone(),
            kind: Kind::Card,
            id: Some(id.into()),
            payload: record.clone(),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(before.clone()),
        };
        let reply = engine.mutate(write.clone()).unwrap();
        assert_eq!(reply.http_status, 200, "{reply:?}");
        wire::validate("CommandResponse", &reply.body).unwrap();
        assert_eq!(
            engine.mutate(write).unwrap().body["result"],
            reply.body["result"]
        );
        assert_eq!(
            patch(&engine, &project, id, &before, record).http_status,
            412
        );
        current = reply.body["result"]["resource"].clone();
    }
    let values = json!({"2026-09-26":15,"2026-09-27":0});
    assert_eq!(current["metadata"]["counters"][0]["values"], values);
    let version = current["version"].as_str().unwrap();
    for invalid in [
        json!({"record_counter":{"id":counter_id,"date":"2026-02-30","value":1}}),
        json!({"record_counter":{"id":counter_id,"date":"2026-09-27","value":-1}}),
        json!({"record_counter":{"id":counter_id,"date":"2026-09-27","value":1.5}}),
        json!({"record_counter":{"id":counter_id,"date":"2026-09-27","value":1000000001u64}}),
        json!({"record_counter":{"id":Uuid::new_v4().to_string(),"date":"2026-09-27","value":5}}),
        json!({"set":{"counters":[]}}),
        json!({"clear":["counters"]}),
        json!({"configure_counter":{"name":" ","unit":"reps","step":5,"archived":false}}),
        json!({"configure_counter":{"name":"Long unit","unit":"abcdef","step":5,"archived":false}}),
        json!({"configure_counter":{"name":"No step","unit":"reps","step":0,"archived":false}}),
        json!({"configure_counter":{"id":counter_id,"name":"Push-ups","unit":"km","step":5,"archived":false}}),
    ] {
        assert_eq!(
            patch(&engine, &project, id, version, invalid.clone()).http_status,
            422,
            "{invalid}"
        );
    }
    let history = engine.history(&project, Kind::Card, id, None, 20).unwrap();
    assert_eq!(history["items"][0]["can_undo"], false);
    assert_eq!(
        patch(
            &engine,
            &project,
            id,
            version,
            json!({"undo":{"history_entry_id":history["items"][0]["id"]}})
        )
        .http_status,
        409
    );
    let renamed = patch(
        &engine,
        &project,
        id,
        version,
        json!({"set":{"title":"Training","body":"Preserved"}}),
    );
    current = renamed.body["result"]["resource"].clone();
    assert_eq!(current["metadata"]["counters"][0]["values"], values);
    let archived = patch(
        &engine,
        &project,
        id,
        current["version"].as_str().unwrap(),
        json!({"configure_counter":{"id":counter_id,"name":"Push-ups","unit":"reps","step":2,"archived":true}}),
    );
    assert_eq!(archived.http_status, 200);
    current = archived.body["result"]["resource"].clone();
    assert_eq!(
        patch(
            &engine,
            &project,
            id,
            current["version"].as_str().unwrap(),
            json!({"record_counter":{"id":counter_id,"date":"2026-09-27","value":4}})
        )
        .http_status,
        422
    );
    let context = engine.context(&project, 4096).unwrap();
    wire::validate("Context", &context).unwrap();
    assert_eq!(
        context["cards"][0]["counters"],
        current["metadata"]["counters"]
    );
    let summary = engine
        .list(
            Some("card"),
            &Query {
                project: Some(project.clone()),
                ..Default::default()
            },
        )
        .unwrap();
    wire::validate("SummaryPage", &summary).unwrap();
    assert_eq!(summary["items"][0]["counter_count"], 0);
    assert!(summary["items"][0].get("counters").is_none());
    let bytes = fs::read(
        env.root
            .join("project/.project/cards")
            .join(format!("{id}.json")),
    )
    .unwrap();
    let source = project_store::document::parse(Kind::Card, Some(id), &bytes)
        .unwrap()
        .value();
    assert_eq!(source["metadata"]["counters"][0]["values"], values);
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine.mutate(input).unwrap().body["result"],
        configured.body["result"]
    );
    assert_eq!(
        engine.get(&project, Kind::Card, id).unwrap()["metadata"]["counters"],
        source["metadata"]["counters"]
    );
}

#[test]
fn counter_source_rejects_duplicate_ids_invalid_days_and_retains_metadata_bounds() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Bounded counters");
    let original = &created.body["result"]["resource"];
    let id = original["metadata"]["id"].as_str().unwrap();
    let counter = json!({"id":Uuid::new_v4().to_string(),"name":"Push-ups","unit":"reps","step":5,"archived":false,"values":{}});
    let mut source = json!({"type":"card","metadata":original["metadata"],"body":""});
    source["metadata"]["counters"] = json!([counter.clone(), counter.clone()]);
    assert!(project_domain::validate_document(source.clone()).is_err());
    source["metadata"]["counters"] = json!([counter.clone()]);
    source["metadata"]["counters"][0]["values"] = json!({"2026-02-30":1});
    assert!(project_domain::validate_document(source.clone()).is_err());
    source["metadata"]["counters"][0]["values"] = json!({});
    for offset in 0..3000 {
        let date =
            chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap() + chrono::TimeDelta::days(offset);
        source["metadata"]["counters"][0]["values"][date.to_string()] = json!(1000000000);
    }
    assert!(
        project_store::document::parse(Kind::Card, Some(id), &serde_json::to_vec(&source).unwrap())
            .is_err()
    );
}

#[test]
fn focus_counter_preview_is_a_conditional_observation_without_history_reads() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Pinned exercise");
    let id = created.body["result"]["id"].as_str().unwrap();
    let pinned = patch(
        &engine,
        &project,
        id,
        created.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"pinned":true}}),
    );
    let configured = patch(
        &engine,
        &project,
        id,
        pinned.body["result"]["version"].as_str().unwrap(),
        json!({"configure_counter":{"name":"Push-ups","unit":"reps","step":5,"archived":false}}),
    );
    let counter_id = configured.body["result"]["resource"]["metadata"]["counters"][0]["id"]
        .as_str()
        .unwrap();
    let focus = engine.focus_resource().unwrap();
    wire::validate("FocusResource", &focus).unwrap();
    let summary = &focus["cards"][0];
    let preview = &summary["daily_counters"][0];
    assert_eq!(preview["value"], 0);
    assert_eq!(preview["id"], counter_id);
    assert!(summary.get("counters").is_none());
    assert!(summary.get("body").is_none());
    let payload = json!({"record_counter":{"id":counter_id,"date":preview["date"],"value":15}});
    let saved = patch(
        &engine,
        &project,
        id,
        summary["version"].as_str().unwrap(),
        payload.clone(),
    );
    assert_eq!(saved.http_status, 200);
    assert_eq!(
        patch(
            &engine,
            &project,
            id,
            summary["version"].as_str().unwrap(),
            payload
        )
        .http_status,
        412
    );
    let refreshed = engine.focus_resource().unwrap();
    wire::validate("FocusResource", &refreshed).unwrap();
    assert_eq!(refreshed["cards"][0]["daily_counters"][0]["value"], 15);
    assert_eq!(
        refreshed["cards"][0]["version"],
        saved.body["result"]["version"]
    );
    let hidden = patch(
        &engine,
        &project,
        id,
        saved.body["result"]["version"].as_str().unwrap(),
        json!({"configure_counter":{"id":counter_id,"name":"Push-ups","unit":"reps","step":5,"archived":true}}),
    );
    assert_eq!(hidden.http_status, 200);
    assert_eq!(
        engine.focus_resource().unwrap()["cards"][0]["daily_counters"],
        json!([])
    );
}

#[test]
fn daily_focus_sections_include_conditional_counter_previews() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let now = chrono::DateTime::parse_from_rfc3339("2026-10-01T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    for (section, fields) in [
        (
            "motion",
            json!({"schedule":{"start":"2026-10-01","end":"2026-10-02"}}),
        ),
        (
            "events",
            json!({"event":{"start":"2026-10-01T23:59","duration_minutes":60}}),
        ),
    ] {
        let created = create(&engine, &project, section);
        let id = created.body["result"]["id"].as_str().unwrap();
        let scheduled = patch(
            &engine,
            &project,
            id,
            created.body["result"]["version"].as_str().unwrap(),
            json!({"set":fields}),
        );
        let configured = patch(
            &engine,
            &project,
            id,
            scheduled.body["result"]["version"].as_str().unwrap(),
            json!({"configure_counter":{"name":"Steps","unit":"reps","step":5,"archived":false}}),
        );
        let counter_id = configured.body["result"]["resource"]["metadata"]["counters"][0]["id"]
            .as_str()
            .unwrap();
        let hidden = patch(
            &engine,
            &project,
            id,
            configured.body["result"]["version"].as_str().unwrap(),
            json!({"configure_counter":{"name":"Hidden","unit":"reps","step":1,"archived":true}}),
        );
        let page = engine.focus_cards(section, None, None, 1, now).unwrap();
        wire::validate("SummaryPage", &page).unwrap();
        let summary = &page["items"][0];
        assert_eq!(summary["version"], hidden.body["result"]["version"]);
        assert_eq!(
            summary["daily_counters"],
            json!([{
                "id":counter_id,"name":"Steps","unit":"reps","step":5,"date":"2026-10-01","value":0
            }])
        );
        assert!(summary.get("counters").is_none());
        assert!(summary.get("body").is_none());
        let payload = json!({"record_counter":{"id":counter_id,"date":"2026-10-01","value":15}});
        let saved = patch(
            &engine,
            &project,
            id,
            summary["version"].as_str().unwrap(),
            payload.clone(),
        );
        assert_eq!(saved.http_status, 200);
        assert_eq!(
            patch(
                &engine,
                &project,
                id,
                summary["version"].as_str().unwrap(),
                payload
            )
            .http_status,
            412
        );
        let refreshed = engine.focus_cards(section, None, None, 1, now).unwrap();
        assert_eq!(refreshed["items"][0]["daily_counters"][0]["value"], 15);
        assert_eq!(
            refreshed["items"][0]["version"],
            saved.body["result"]["version"]
        );
        if section == "motion" {
            let tomorrow = engine
                .focus_cards(section, None, None, 1, now + 86_400_000)
                .unwrap();
            assert_eq!(
                tomorrow["items"][0]["daily_counters"][0]["date"],
                "2026-10-02"
            );
            assert_eq!(tomorrow["items"][0]["daily_counters"][0]["value"], 0);
        }
    }
}
