use super::*;

fn assert_receipt_snapshot_released(engine: &Engine) {
    engine
        .index
        .with_snapshot(|db, _| {
            let error = db
                .prepare("SELECT astra_report_is_read('project','report')")
                .expect_err("receipt predicate must not outlive its request");
            assert!(error.to_string().contains("no such function"), "{error}");
            Ok(())
        })
        .unwrap();
}

#[test]
fn receipt_snapshots_are_current_scoped_and_released_after_reads_and_errors() {
    let env = Environment::new();
    let engine = env.engine();
    let mut projects = Vec::new();
    let ids = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    let mut sources = Vec::new();
    for n in 0..2 {
        let path = env.root.join(format!("receipt-{n}"));
        fs::create_dir(&path).unwrap();
        let project = register(&engine, path.to_str().unwrap());
        for id in &ids {
            let reply = engine
                .mutate(Mutation {
                    project_id: project.clone(),
                    kind: Kind::Update,
                    id: None,
                    payload: json!({
                        "id":id,"kind":"note","summary":"Shared report ID",
                        "target":{"type":"project","id":project},
                        "author":{"kind":"human","label":"Owner"}
                    }),
                    request_id: Uuid::now_v7().to_string(),
                    epoch: engine.command_epoch().into(),
                    expected: None,
                })
                .unwrap();
            assert_eq!(reply.http_status, 200, "{}", reply.body);
            let resource = engine.get(&project, Kind::Update, id).unwrap();
            let file = path.join(format!(".project/updates/{id}.json"));
            sources.push((
                project.clone(),
                id.clone(),
                fs::read(&file).unwrap(),
                file,
                resource["version"].clone(),
            ));
        }
        projects.push(project);
    }
    let mark = |read| {
        let reply = engine
            .receipts(
                &json!({"items":[{"project_id":projects[0],"update_id":ids[0],"read":read}]}),
                &Uuid::now_v7().to_string(),
                engine.command_epoch(),
            )
            .unwrap();
        assert_eq!(reply.http_status, 200, "{}", reply.body);
    };
    mark(true);
    let now = now_millis();
    let page = engine
        .attention_mode(None, None, None, 1, now, true)
        .unwrap();
    let cursor = page["page"]["next_cursor"].as_str().unwrap().to_owned();
    assert_receipt_snapshot_released(&engine);
    assert!(matches!(
        engine.attention_mode(None,None,Some("invalid"),1,now,true),
        Err(project_application::AppError::Rejected(reply)) if reply.http_status == 400
    ));
    assert_receipt_snapshot_released(&engine);

    // An invalid retained projection can fail after the receipt predicate runs.
    engine.index.with_snapshot(|db,_| {
        db.execute("UPDATE documents SET metadata_json=json_set(metadata_json,'$.target','invalid JSON') WHERE project_id=?1 AND entity_type='update' AND entity_id=?2",rusqlite::params![projects[0],ids[1]])?;
        Ok(())
    }).unwrap();
    assert!(matches!(
        engine.attention_mode(Some(&projects[0]), None, None, 200, now, true),
        Err(project_application::AppError::Invariant(
            "indexed update target"
        ))
    ));
    assert_receipt_snapshot_released(&engine);
    engine.index.with_snapshot(|db,_| {
        db.execute("UPDATE documents SET metadata_json=json_set(metadata_json,'$.target',json(?3)) WHERE project_id=?1 AND entity_type='update' AND entity_id=?2",rusqlite::params![projects[0],ids[1],json!({"type":"project","id":projects[0]}).to_string()])?;
        Ok(())
    }).unwrap();

    std::thread::scope(|scope| {
        for n in 0..4 {
            let engine = &engine;
            let projects = &projects;
            let ids = &ids;
            scope.spawn(move || {
                for _ in 0..8 {
                    let focus = n % 2 == 0;
                    let project = &projects[n / 2];
                    let page = engine
                        .attention_mode(Some(project), None, None, 200, now, focus)
                        .unwrap();
                    wire::validate("AttentionPage", &page).unwrap();
                    let mut expected: Vec<_> = ids
                        .iter()
                        .filter(|id| focus && !(project == &projects[0] && *id == &ids[0]))
                        .map(|id| format!("{project}:{id}:unread_report"))
                        .collect();
                    expected.sort();
                    let actual: Vec<_> = page["items"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|item| item["id"].as_str().unwrap().to_owned())
                        .collect();
                    assert_eq!(actual, expected);
                    assert_receipt_snapshot_released(engine);
                }
            });
        }
    });
    mark(false);
    assert!(matches!(
        engine.attention_mode(None,None,Some(&cursor),1,now,true),
        Err(project_application::AppError::Rejected(reply)) if reply.http_status == 409
    ));
    assert_receipt_snapshot_released(&engine);
    let fresh = engine.mutate(Mutation {
        project_id: projects[0].clone(), kind: Kind::Update, id: None,
        payload: json!({"kind":"result","summary":"Fresh unread report", "target":{"type":"project","id":projects[0]},"author":{"kind":"human","label":"Owner"}}),
        request_id: Uuid::now_v7().to_string(), epoch: engine.command_epoch().into(), expected: None,
    }).unwrap();
    assert_eq!(fresh.http_status, 200, "{}", fresh.body);
    let resource = &fresh.body["result"]["resource"];
    let id = resource["metadata"]["id"].as_str().unwrap().to_owned();
    let path = env
        .root
        .join(format!("receipt-0/.project/updates/{id}.json"));
    sources.push((
        projects[0].clone(),
        id.clone(),
        fs::read(&path).unwrap(),
        path,
        resource["version"].clone(),
    ));
    let page = engine
        .attention_mode(None, None, None, 200, now, true)
        .unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 5);
    assert!(
        page["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["report_id"] == id)
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        engine
            .attention_mode(None, None, None, 200, now, true)
            .unwrap()["items"],
        page["items"]
    );
    assert_receipt_snapshot_released(&engine);
    for (project, id, bytes, path, version) in sources {
        assert_eq!(fs::read(path).unwrap(), bytes);
        assert_eq!(
            engine.get(&project, Kind::Update, &id).unwrap()["version"],
            version
        );
    }
}
