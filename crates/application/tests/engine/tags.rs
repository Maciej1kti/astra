use super::*;

#[test]
fn project_tags_come_from_card_sources_and_one_job_renames_only_that_project() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let first = create(&engine, &project, "First");
    let second = create(&engine, &project, "Second");
    for (created, labels) in [(&first, json!(["Old"])), (&second, json!(["Old", "New"]))] {
        let result = patch(
            &engine,
            &project,
            created.body["result"]["id"].as_str().unwrap(),
            created.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"labels":labels}}),
        );
        assert_eq!(result.http_status, 200);
    }
    let other_path = env.root.join("other-project");
    fs::create_dir(&other_path).unwrap();
    let other = register(&engine, other_path.to_str().unwrap());
    let other_card = create(&engine, &other, "Other project");
    assert_eq!(
        patch(
            &engine,
            &other,
            other_card.body["result"]["id"].as_str().unwrap(),
            other_card.body["result"]["version"].as_str().unwrap(),
            json!({"set":{"labels":["Old"]}}),
        )
        .http_status,
        200
    );
    let catalog = engine.project_tag_catalog(&project).unwrap();
    wire::validate("TagCatalog", &catalog).unwrap();
    assert_eq!(catalog["tags"].as_array().unwrap().len(), 2);
    assert_eq!(catalog["complete"], true);
    let plan = engine
        .project_tag_rename_plan(&project, &json!({"source":"Old","target":"New"}))
        .unwrap();
    wire::validate("ProjectTagRenamePlan", &plan).unwrap();
    assert_eq!(plan["changes"].as_array().unwrap().len(), 2);
    assert!(plan.get("display_path").is_none());
    let request = Uuid::now_v7().to_string();
    let reply = engine
        .commit_project_tag_rename(
            &project,
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.http_status, 202);
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(reply.body["job_id"].as_str().unwrap())
    .unwrap();
    assert_eq!(job["state"], "done");
    let catalog = engine.project_tag_catalog(&project).unwrap();
    assert_eq!(catalog["tags"].as_array().unwrap().len(), 1);
    assert_eq!(catalog["tags"][0]["name"], "New");
    assert_eq!(catalog["tags"][0]["usage"], 2);
    assert_eq!(
        engine.project_tag_catalog(&other).unwrap()["tags"][0]["name"],
        "Old"
    );
    let replay = engine
        .commit_project_tag_rename(
            &project,
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(replay.body, reply.body);
}

#[test]
fn tag_rename_stops_on_external_card_change() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let created = create(&engine, &project, "Tagged");
    let id = created.body["result"]["id"].as_str().unwrap();
    let tagged = patch(
        &engine,
        &project,
        id,
        created.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"labels":["Old"]}}),
    );
    let plan = engine
        .project_tag_rename_plan(&project, &json!({"source":"Old","target":"New"}))
        .unwrap();
    let changed = patch(
        &engine,
        &project,
        id,
        tagged.body["result"]["version"].as_str().unwrap(),
        json!({"set":{"title":"Changed elsewhere"}}),
    );
    assert_eq!(changed.http_status, 200);
    let outcome = engine.commit_project_tag_rename(
        &project,
        plan["plan_id"].as_str().unwrap(),
        &Uuid::now_v7().to_string(),
        &engine.journal.epoch,
    );
    if let Ok(reply) = outcome {
        if let Some(id) = reply.body["job_id"].as_str() {
            let job = (Workflows {
                journal: &engine.journal,
            })
            .job(id)
            .unwrap();
            assert_ne!(job["state"], "done");
        } else {
            assert_eq!(reply.http_status, 409, "{reply:?}");
        }
    }
    let catalog = engine.project_tag_catalog(&project).unwrap();
    assert_eq!(catalog["tags"][0]["name"], "Old");
}
