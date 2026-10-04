use super::*;

fn configure(engine: &Engine, project: &str, card: &str, name: &str, archived: bool) -> String {
    let current = engine.get(project, Kind::Card, card).unwrap();
    let reply = patch(
        engine,
        project,
        card,
        current["version"].as_str().unwrap(),
        json!({"configure_counter":{"name":name,"unit":"reps","step":5,"archived":archived}}),
    );
    assert_eq!(reply.http_status, 200);
    reply.body["result"]["resource"]["metadata"]["counters"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .into()
}

fn record(engine: &Engine, project: &str, card: &str, counter: &str, date: &str, value: u32) {
    let current = engine.get(project, Kind::Card, card).unwrap();
    assert_eq!(
        patch(
            engine,
            project,
            card,
            current["version"].as_str().unwrap(),
            json!({"record_counter":{"id":counter,"date":date,"value":value}})
        )
        .http_status,
        200
    );
}

fn new_card(engine: &Engine, project: &str, title: &str) -> String {
    create(engine, project, title).body["result"]["id"]
        .as_str()
        .unwrap()
        .into()
}

fn set_card(engine: &Engine, project: &str, card: &str, fields: Value) {
    let current = engine.get(project, Kind::Card, card).unwrap();
    assert_eq!(
        patch(
            engine,
            project,
            card,
            current["version"].as_str().unwrap(),
            json!({"set":fields})
        )
        .http_status,
        200
    );
}

#[test]
fn counter_series_clips_sparse_dates_and_retains_empty_completed_and_archived_history() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = new_card(&engine, &project, "Training");
    let counter = configure(&engine, &project, &card, "Push-ups", false);
    let empty = configure(&engine, &project, &card, "Empty", false);
    configure(&engine, &project, &card, "Archived counter", true);
    for (date, value) in [
        ("2026-09-29", 5),
        ("2026-09-30", 0),
        ("2026-10-02", 20),
        ("2026-10-03", 30),
    ] {
        record(&engine, &project, &card, &counter, date, value);
    }
    let done = new_card(&engine, &project, "Completed");
    configure(&engine, &project, &done, "Saved history", false);
    set_card(&engine, &project, &done, json!({"status":"done"}));
    let archived_card = new_card(&engine, &project, "Archived card");
    configure(&engine, &project, &archived_card, "Saved history", false);
    set_card(&engine, &project, &archived_card, json!({"archived":true}));
    let other_path = env.root.join("other");
    fs::create_dir(&other_path).unwrap();
    let other = register(&engine, other_path.to_str().unwrap());
    let other_card = new_card(&engine, &other, "Archived project card");
    configure(&engine, &other, &other_card, "Saved history", false);
    let other_source = engine.get(&other, Kind::Project, &other).unwrap();
    let reply = engine
        .mutate(Mutation {
            project_id: other.clone(),
            kind: Kind::Project,
            id: Some(other.clone()),
            payload: json!({"set":{"state":"archived"}}),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.journal.epoch.clone(),
            expected: Some(other_source["version"].as_str().unwrap().into()),
        })
        .unwrap();
    assert_eq!(reply.http_status, 200);

    let source_path = env.root.join(format!("project/.project/cards/{card}.json"));
    let before = fs::read(&source_path).unwrap();
    let page = engine
        .counter_series(None, "2026-09-30", "2026-10-02", false, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &page).unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 3);
    let items = page["items"].as_array().unwrap();
    let row = items.iter().find(|item| item["id"] == counter).unwrap();
    assert_eq!(row["values"], json!({"2026-09-30":0,"2026-10-02":20}));
    assert_eq!(
        row["version"],
        engine.get(&project, Kind::Card, &card).unwrap()["version"]
    );
    assert_eq!(row["project_name"], "Test project");
    assert_eq!(row["card_title"], "Training");
    assert_eq!(row["unit"], "reps");
    assert_eq!(row["availability"], "ready");
    assert!(row.get("body").is_none());
    assert_eq!(
        items.iter().find(|item| item["id"] == empty).unwrap()["values"],
        json!({})
    );
    assert_eq!(fs::read(&source_path).unwrap(), before);
    let all = engine
        .counter_series(None, "2026-09-30", "2026-10-02", true, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &all).unwrap();
    assert_eq!(all["items"].as_array().unwrap().len(), 6);
    assert!(
        all["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["archived"] == true)
    );
    assert!(
        all["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["card_archived"] == true)
    );
    assert!(
        all["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["project_archived"] == true)
    );
    let scoped = engine
        .counter_series(Some(&project), "2026-09-30", "2026-10-02", true, None, 100)
        .unwrap();
    assert_eq!(scoped["items"].as_array().unwrap().len(), 5);
}

#[test]
fn counter_series_pages_bind_filters_and_scoped_revisions_with_date_and_limit_bounds() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = new_card(&engine, &project, "Training");
    for name in ["First", "Second", "Third"] {
        configure(&engine, &project, &card, name, false);
    }
    let page = engine
        .counter_series(Some(&project), "2026-09-30", "2026-10-02", false, None, 1)
        .unwrap();
    assert_eq!(page["items"][0]["name"], "First");
    let cursor = page["page"]["next_cursor"].as_str().unwrap();
    let next = engine
        .counter_series(
            Some(&project),
            "2026-09-30",
            "2026-10-02",
            false,
            Some(cursor),
            1,
        )
        .unwrap();
    assert_eq!(next["items"][0]["name"], "Second");
    for (scope, from, to, archived, limit) in [
        (Some(project.as_str()), "2026-10-01", "2026-10-02", false, 1),
        (Some(project.as_str()), "2026-09-30", "2026-10-01", false, 1),
        (Some(project.as_str()), "2026-09-30", "2026-10-02", true, 1),
        (Some(project.as_str()), "2026-09-30", "2026-10-02", false, 2),
        (None, "2026-09-30", "2026-10-02", false, 1),
    ] {
        assert!(
            matches!(engine.counter_series(scope, from, to, archived, Some(cursor), limit),
            Err(project_application::AppError::Rejected(reply)) if reply.http_status == 409 && reply.body["error"]["code"] == "PAGE_STALE")
        );
    }
    let other_path = env.root.join("other");
    fs::create_dir(&other_path).unwrap();
    let other = register(&engine, other_path.to_str().unwrap());
    // Registration invalidates workspace membership; take a new scoped cursor.
    let page = engine
        .counter_series(Some(&project), "2026-09-30", "2026-10-02", false, None, 1)
        .unwrap();
    let cursor = page["page"]["next_cursor"].as_str().unwrap();
    let global = engine
        .counter_series(None, "2026-09-30", "2026-10-02", false, None, 1)
        .unwrap();
    create(&engine, &other, "Unrelated write");
    assert!(
        engine
            .counter_series(
                Some(&project),
                "2026-09-30",
                "2026-10-02",
                false,
                Some(cursor),
                1
            )
            .is_ok()
    );
    assert!(
        engine
            .counter_series(
                None,
                "2026-09-30",
                "2026-10-02",
                false,
                global["page"]["next_cursor"].as_str(),
                1
            )
            .is_err()
    );
    record(
        &engine,
        &project,
        &card,
        page["items"][0]["id"].as_str().unwrap(),
        "2026-10-04",
        3,
    );
    assert!(
        engine
            .counter_series(
                Some(&project),
                "2026-09-30",
                "2026-10-02",
                false,
                Some(cursor),
                1
            )
            .is_err()
    );
    for (from, to, limit) in [
        ("2026-02-30", "2026-03-01", 1),
        ("2026-10-02", "2026-10-01", 1),
        ("2026-01-01", "2027-02-05", 1),
        ("2026-10-01", "2026-10-02", 0),
        ("2026-10-01", "2026-10-02", 101),
    ] {
        assert!(
            engine
                .counter_series(None, from, to, false, None, limit)
                .is_err()
        );
    }
    assert!(
        engine
            .counter_series(None, "2026-01-01", "2027-02-04", false, None, 100)
            .is_ok()
    );
    assert!(
        engine
            .counter_series(
                Some("not-a-project"),
                "2026-10-01",
                "2026-10-02",
                false,
                None,
                1
            )
            .is_err()
    );
    assert!(
        engine
            .counter_series(None, "2026-10-01", "2026-10-02", false, Some("broken"), 1)
            .is_err()
    );
}

#[test]
fn counter_series_omits_invalid_sources_and_marks_startup_projections_stale_without_writes() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let card = new_card(&engine, &project, "Training");
    configure(&engine, &project, &card, "Push-ups", false);
    drop(engine);
    let engine = Engine::open_for_service(&env.root.join("state")).unwrap();
    let pending = engine
        .counter_series(None, "2026-10-01", "2026-10-02", false, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &pending).unwrap();
    assert_eq!(pending["page"]["freshness"], "stale");
    assert_eq!(pending["items"][0]["availability"], "stale");
    engine.refresh_all().unwrap();
    let path = env.root.join(format!("project/.project/cards/{card}.json"));
    let valid_bytes = fs::read(&path).unwrap();
    fs::write(&path, b"broken source").unwrap();
    engine.refresh_all().unwrap();
    let invalid = engine
        .counter_series(None, "2026-10-01", "2026-10-02", false, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &invalid).unwrap();
    assert_eq!(invalid["items"], json!([]));
    assert_eq!(invalid["page"]["freshness"], "stale");
    assert_eq!(invalid["warnings"][0]["code"], "COUNTER_SOURCES_OMITTED");
    assert_eq!(fs::read(&path).unwrap(), b"broken source");
    fs::write(&path, valid_bytes).unwrap();
    let unknown = env
        .root
        .join(format!("project/.project/cards/{}.json", Uuid::new_v4()));
    fs::write(&unknown, b"never indexed broken source").unwrap();
    engine.refresh_all().unwrap();
    let partial = engine
        .counter_series(None, "2026-10-01", "2026-10-02", false, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &partial).unwrap();
    assert_eq!(partial["items"].as_array().unwrap().len(), 1);
    assert_eq!(partial["page"]["freshness"], "stale");
    assert_eq!(partial["warnings"][0]["code"], "COUNTER_SOURCES_OMITTED");
    assert_eq!(fs::read(unknown).unwrap(), b"never indexed broken source");
}

#[test]
fn counter_series_maximum_page_and_date_count_fit_the_serialized_response_cap() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = project_domain::local_date("2026-01-01").unwrap();
    let values: serde_json::Map<String, Value> = (0..400)
        .map(|index| {
            (
                (first + chrono::Days::new(index)).to_string(),
                json!(1_000_000_000u32),
            )
        })
        .collect();
    for _ in 0..101 {
        let card = new_card(&engine, &project, &"🧮".repeat(240));
        let path = env.root.join(format!("project/.project/cards/{card}.json"));
        let mut source: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        source["metadata"]["counters"] = json!([{
            "id":Uuid::new_v4().to_string(),"name":"🧮".repeat(80),"unit":"🧮".repeat(5),
            "step":1_000_000_000u32,"archived":false,"values":values,
        }]);
        project_domain::validate_document(source.clone()).unwrap();
        fs::write(path, serde_json::to_vec_pretty(&source).unwrap()).unwrap();
    }
    engine.refresh_all().unwrap();
    let result = engine
        .counter_series(Some(&project), "2026-01-01", "2027-02-04", false, None, 100)
        .unwrap();
    wire::validate("CounterSeriesPage", &result).unwrap();
    assert_eq!(result["items"].as_array().unwrap().len(), 100);
    assert_eq!(result["items"][0]["values"].as_object().unwrap().len(), 400);
    assert!(serde_json::to_vec(&result).unwrap().len() < 2 * 1024 * 1024);
    assert_eq!(result["page"]["has_more"], true);
    let next = engine
        .counter_series(
            Some(&project),
            "2026-01-01",
            "2027-02-04",
            false,
            result["page"]["next_cursor"].as_str(),
            100,
        )
        .unwrap();
    assert_eq!(next["items"].as_array().unwrap().len(), 1);
    assert_eq!(next["page"]["has_more"], false);
}

#[test]
fn chart_can_be_saved_as_the_conditional_workspace_default() {
    let env = Environment::new();
    let engine = env.engine();
    let version = engine.workspace().unwrap().version;
    let reply = engine
        .mutate_workspace(
            "preferences",
            &json!({"preferences":{"default_view":"chart"}}),
            &Uuid::now_v7().to_string(),
            &engine.journal.epoch,
            Some(&version),
        )
        .unwrap();
    assert_eq!(reply.http_status, 200);
    wire::validate("CommandResponse", &reply.body).unwrap();
    assert_eq!(
        json!(engine.workspace().unwrap().value)["preferences"]["default_view"],
        "chart"
    );
    drop(engine);
    assert_eq!(
        json!(env.engine().workspace().unwrap().value)["preferences"]["default_view"],
        "chart"
    );
}
