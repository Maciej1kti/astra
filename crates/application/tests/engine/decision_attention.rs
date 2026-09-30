use super::*;
use std::collections::BTreeSet;

fn report_id(number: usize) -> String {
    Uuid::from_u128(0x00000000_0000_4000_8000_000000000000 + number as u128 + 1).to_string()
}

fn all_attention(
    engine: &Engine,
    project: Option<&str>,
    folder: Option<&str>,
    focus: bool,
    limit: u32,
    now: i64,
) -> Vec<Value> {
    let mut cursor = None;
    let mut items = Vec::new();
    let mut cursors = BTreeSet::new();
    loop {
        let page = engine
            .attention_mode(project, folder, cursor.as_deref(), limit, now, focus)
            .unwrap();
        wire::validate("AttentionPage", &page).unwrap();
        assert!(page["warnings"].as_array().unwrap().is_empty());
        items.extend(page["items"].as_array().unwrap().iter().cloned());
        let Some(next) = page["page"]["next_cursor"].as_str() else {
            assert_eq!(page["page"]["has_more"], false);
            break;
        };
        assert!(
            cursors.insert(next.to_owned()),
            "pagination did not advance"
        );
        cursor = Some(next.to_owned());
    }
    items
}

#[test]
fn decisions_keep_project_identity_targets_closure_scopes_receipts_and_pagination() {
    let env = Environment::new();
    let engine = env.engine();
    let mut projects = Vec::new();
    let mut sources = Vec::new();
    let mut expected = Vec::new();
    let mut receipts = Vec::new();
    for p in 0..4 {
        let path = env.root.join(format!("decisions-{p}"));
        fs::create_dir(&path).unwrap();
        let project = register(&engine, path.to_str().unwrap());
        let resource = engine.get(&project, Kind::Project, &project).unwrap();
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Project,
                id: Some(project.clone()),
                payload: json!({"set":{
                    "folder":if p == 3 {"Home"} else {"Work"},
                    "state":"active"
                }}),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.command_epoch().into(),
                expected: Some(resource["version"].as_str().unwrap().into()),
            })
            .unwrap();
        assert_eq!(reply.http_status, 200);
        let milestone = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Milestone,
                id: None,
                payload: json!({"title":"Decision target"}),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.command_epoch().into(),
                expected: None,
            })
            .unwrap();
        assert_eq!(milestone.http_status, 200);
        let milestone_target = json!({
            "type":"milestone", "id":milestone.body["result"]["resource"]["metadata"]["id"]
        });
        let directory = path.join(".project/updates");
        fs::create_dir_all(&directory).unwrap();
        for n in (0..140).chain(500..504) {
            // Source IDs repeat across projects; closure membership must not leak.
            let id = report_id(n);
            let kind = match n {
                0..128 => "decision_needed",
                500 | 503 => "resolution",
                501 | 502 => "correction",
                _ => "note",
            };
            let summary = format!("Decision history {p}/{n}");
            let target = if n % 7 == 0 {
                milestone_target.clone()
            } else {
                json!({"type":"project","id":project})
            };
            let mut metadata = json!({
                "id":id,"kind":kind,"summary":summary,"target":target,
                "author":{"kind":"human","label":"Owner"},
                "recorded_at":"2026-09-05T10:00:00Z"
            });
            if n == 500 {
                // A maximum-size edge array; a different project closes other IDs.
                metadata["resolves"] = json!(if p == 1 {
                    (20..120).map(report_id).collect::<Vec<_>>()
                } else {
                    (0..100).map(report_id).collect::<Vec<_>>()
                });
            } else if n == 501 {
                metadata["supersedes"] = json!(report_id(if p == 1 { 2 } else { 103 }));
            } else if n == 502 {
                // Correcting a resolution does not reopen its original decisions.
                metadata["supersedes"] = json!(report_id(500));
            } else if n == 503 {
                metadata["resolves"] = json!([report_id(if p == 1 { 20 } else { 0 })]);
            }
            let bytes = serde_json::to_vec(&json!({
                "type":"update","metadata":metadata,"body":"Current external history."
            }))
            .unwrap();
            let source = directory.join(format!("{id}.json"));
            fs::write(&source, &bytes).unwrap();
            let version = project_store::document::version(&bytes);
            sources.push((project.clone(), id.clone(), source, bytes, version));
            let read = n % 3 == 0;
            if p != 2 && read {
                receipts.push(json!({"project_id":project,"update_id":id,"read":true}));
            }
            let closed = if p == 1 {
                (20..120).contains(&n) || n == 2
            } else {
                n < 100 || n == 103
            };
            if p != 2
                && ((kind == "decision_needed" && !closed) || (kind != "decision_needed" && !read))
            {
                let reason = if kind == "decision_needed" {
                    "decision_needed"
                } else {
                    "unread_report"
                };
                expected.push(json!({
                    "id":format!("{project}:{id}:{reason}"),"project_id":project,
                    "report_id":id,"target":target,"label":summary,"reason":reason
                }));
            }
        }
        if p == 2 {
            let resource = engine.get(&project, Kind::Project, &project).unwrap();
            let reply = engine
                .mutate(Mutation {
                    project_id: project.clone(),
                    kind: Kind::Project,
                    id: Some(project.clone()),
                    payload: json!({"set":{"state":"archived"}}),
                    request_id: Uuid::now_v7().to_string(),
                    epoch: engine.command_epoch().into(),
                    expected: Some(resource["version"].as_str().unwrap().into()),
                })
                .unwrap();
            assert_eq!(reply.http_status, 200);
        }
        projects.push(project);
    }
    engine.refresh_all().unwrap();
    for items in receipts.chunks(100) {
        let reply = engine
            .receipts(
                &json!({"items":items}),
                &Uuid::now_v7().to_string(),
                engine.command_epoch(),
            )
            .unwrap();
        assert_eq!(reply.http_status, 200);
    }
    expected.sort_by_key(|item| {
        (
            item["reason"] != "decision_needed",
            item["project_id"].as_str().unwrap().to_owned(),
            item["report_id"].as_str().unwrap().to_owned(),
        )
    });
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-30T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    for focus in [false, true] {
        for (project, folder) in [
            (None, None),
            (Some(projects[0].as_str()), None),
            (Some(projects[1].as_str()), None),
            (Some(projects[2].as_str()), None),
            (None, Some("Work")),
            (None, Some("Home")),
            (Some(projects[0].as_str()), Some("Home")),
        ] {
            let scoped: Vec<_> = expected
                .iter()
                .filter(|item| {
                    (focus || item["reason"] == "decision_needed")
                        && project.is_none_or(|p| item["project_id"] == p)
                        && folder
                            .is_none_or(|f| (item["project_id"] == projects[3]) == (f == "Home"))
                })
                .cloned()
                .collect();
            for limit in [7, 200] {
                assert_eq!(
                    all_attention(&engine, project, folder, focus, limit, now),
                    scoped
                );
            }
        }
    }
    for (project, id, path, bytes, version) in &sources {
        assert_eq!(fs::read(path).unwrap(), *bytes);
        assert_eq!(
            engine.get(project, Kind::Update, id).unwrap()["version"],
            *version
        );
    }
    let before = engine
        .attention_mode(Some(&projects[0]), None, None, 7, now, true)
        .unwrap();
    let cursor = before["page"]["next_cursor"].as_str().unwrap();
    let reply = engine
        .mutate(Mutation {
            project_id: projects[0].clone(),
            kind: Kind::Update,
            id: None,
            payload: json!({
                "kind":"resolution","summary":"Resolve a current decision",
                "target":{"type":"project","id":projects[0]},
                "author":{"kind":"human","label":"Owner"},"resolves":[report_id(120)]
            }),
            request_id: Uuid::now_v7().to_string(),
            epoch: engine.command_epoch().into(),
            expected: None,
        })
        .unwrap();
    assert_eq!(reply.http_status, 200);
    match engine.attention_mode(Some(&projects[0]), None, Some(cursor), 7, now, true) {
        Err(project_application::AppError::Rejected(reply)) => {
            assert_eq!(reply.body["error"]["code"], "PAGE_STALE");
        }
        result => panic!("expected a stale page, got {result:?}"),
    }
    let actual = all_attention(&engine, Some(&projects[0]), None, true, 7, now);
    assert!(
        !actual
            .iter()
            .any(|item| item["report_id"] == report_id(120))
    );
    assert!(
        all_attention(&engine, Some(&projects[1]), None, true, 7, now)
            .iter()
            .any(|item| item["report_id"] == report_id(120))
    );
    drop(engine);
    let engine = env.engine();
    assert_eq!(
        all_attention(&engine, Some(&projects[0]), None, true, 7, now),
        actual
    );
}

#[test]
fn missing_and_null_closure_edges_cannot_hide_unrelated_decisions() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let mut decisions = Vec::new();
    let mut sources = Vec::new();
    let mut create_report = |kind: &str, fields: Value| {
        let mut payload = json!({
            "kind":kind,"summary":format!("Closure edge {kind}"),
            "target":{"type":"project","id":project},
            "author":{"kind":"human","label":"Owner"}
        });
        payload
            .as_object_mut()
            .unwrap()
            .extend(fields.as_object().unwrap().clone());
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Update,
                id: None,
                payload,
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.command_epoch().into(),
                expected: None,
            })
            .unwrap();
        assert_eq!(reply.http_status, 200);
        let resource = &reply.body["result"]["resource"];
        let id = resource["metadata"]["id"].as_str().unwrap().to_owned();
        let path = env.root.join(format!("project/.project/updates/{id}.json"));
        sources.push((path.clone(), fs::read(path).unwrap()));
        (id, resource["metadata"].clone())
    };
    for _ in 0..3 {
        decisions.push(create_report("decision_needed", json!({})).0);
    }
    let (first, mut first_metadata) =
        create_report("resolution", json!({"resolves":[decisions[0]]}));
    let (second, second_metadata) = create_report("resolution", json!({"resolves":[decisions[1]]}));
    let (correction, correction_metadata) =
        create_report("correction", json!({"supersedes":decisions[2]}));
    let now = now_millis();
    assert!(all_attention(&engine, Some(&project), None, false, 200, now).is_empty());
    first_metadata["resolves"] = json!([null, decisions[0]]);
    for explicit_null in [false, true] {
        let mut second_metadata = second_metadata.clone();
        let mut correction_metadata = correction_metadata.clone();
        if explicit_null {
            second_metadata["resolves"] = Value::Null;
            correction_metadata["supersedes"] = Value::Null;
        } else {
            second_metadata.as_object_mut().unwrap().remove("resolves");
            correction_metadata
                .as_object_mut()
                .unwrap()
                .remove("supersedes");
        }
        // Private disposable-projection fixture, not an admitted source write.
        // Legacy/incomplete observations must preserve SQL's nonmatching NULL edges.
        engine.index.with_snapshot(|db, _| {
            for (id, metadata) in [
                (&first, &first_metadata),
                (&second, &second_metadata),
                (&correction, &correction_metadata),
            ] {
                db.execute(
                    "UPDATE documents SET metadata_json=?3,validity='stale' WHERE project_id=?1 AND entity_id=?2 AND entity_type='update'",
                    rusqlite::params![project,id,serde_json::to_string(metadata).unwrap()],
                )?;
            }
            Ok(())
        }).unwrap();
        let rows = all_attention(&engine, Some(&project), None, false, 200, now);
        let actual: BTreeSet<_> = rows
            .iter()
            .map(|item| item["report_id"].as_str().unwrap())
            .collect();
        assert_eq!(
            actual,
            BTreeSet::from([decisions[1].as_str(), decisions[2].as_str()])
        );
    }
    for (path, bytes) in sources {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}

#[test]
fn decision_prefix_keeps_higher_and_lower_priority_items_at_page_boundaries() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let now = chrono::DateTime::parse_from_rfc3339("2026-09-30T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let mut expected = Vec::new();
    for (title, status, schedule, reason, weight) in [
        (
            "Earlier plan",
            "active",
            json!({"start":"2026-09-20","end":"2026-09-20"}),
            "overdue",
            0,
        ),
        (
            "Upcoming plan",
            "planned",
            json!({"start":"2026-10-02","end":"2026-10-02"}),
            "due_soon",
            3,
        ),
        ("Review item", "review", Value::Null, "review", 4),
    ] {
        let created = create(&engine, &project, title);
        let resource = &created.body["result"]["resource"];
        let id = resource["metadata"]["id"].as_str().unwrap();
        let mut fields = json!({"status":status});
        if !schedule.is_null() {
            fields["schedule"] = schedule.clone();
        }
        assert_eq!(
            patch(
                &engine,
                &project,
                id,
                resource["version"].as_str().unwrap(),
                json!({"set":fields})
            )
            .http_status,
            200
        );
        let mut item = json!({
            "id":format!("{project}:{id}:{reason}"),"project_id":project,
            "target":{"type":"card","id":id},"reason":reason,"label":title
        });
        if !schedule.is_null() {
            item["date"] = schedule["end"].clone();
        }
        expected.push((weight, item));
    }
    for n in 0..24 {
        let kind = if n < 14 { "decision_needed" } else { "note" };
        let reason = if n < 14 {
            "decision_needed"
        } else {
            "unread_report"
        };
        let summary = format!("Priority boundary {n}");
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Update,
                id: None,
                payload: json!({
                    "kind":kind,"summary":summary,"target":{"type":"project","id":project},
                    "author":{"kind":"human","label":"Owner"}
                }),
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.command_epoch().into(),
                expected: None,
            })
            .unwrap();
        assert_eq!(reply.http_status, 200);
        let id = reply.body["result"]["resource"]["metadata"]["id"]
            .as_str()
            .unwrap();
        expected.push((if n<14 {1} else {2},json!({
            "id":format!("{project}:{id}:{reason}"),"project_id":project,
            "target":{"type":"project","id":project},"report_id":id,"reason":reason,"label":summary
        })));
    }
    expected.sort_by_key(|(weight, item)| {
        (
            *weight,
            item["date"].as_str().map(str::to_owned),
            item["id"].as_str().unwrap().to_owned(),
        )
    });
    for focus in [false, true] {
        let scoped: Vec<_> = expected
            .iter()
            .filter(|(_, item)| {
                if focus {
                    item["reason"] != "due_soon"
                } else {
                    item["reason"] != "unread_report"
                }
            })
            .map(|(_, item)| item.clone())
            .collect();
        for limit in [1, 5, 7, 200] {
            assert_eq!(
                all_attention(&engine, Some(&project), None, focus, limit, now),
                scoped
            );
        }
    }
}
