use super::*;

#[test]
fn report_target_pagination_is_bounded_amid_more_than_twenty_thousand_unrelated_reports() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = Directory::open(&temporary.path().canonicalize().unwrap())
        .unwrap()
        .child("index", true)
        .unwrap();
    let index = Index::open(directory.path()).unwrap();
    let project = Uuid::new_v4().to_string();
    let card = Uuid::new_v4().to_string();
    let other = Uuid::new_v4().to_string();
    let mut expected = BTreeSet::new();
    {
        let mut db = index.connection.lock().unwrap();
        let tx = db.transaction().unwrap();
        {
            let mut insert = tx
                .prepare(
                    "INSERT INTO documents(project_id,
    entity_id,
    entity_type,
    relative_path,
    source_hash,
    title,
    body,
    search_text,
    metadata_json,
    observed_at,
    validity)
VALUES (?1,
    ?2,
    'update',
    '',
    'r1.hash',
    'Report',
    'Detail body',
    '',
    ?3,
    '',
    'valid')",
                )
                .unwrap();
            for number in 0..20_006 {
                let id = Uuid::new_v4().to_string();
                let target = if number >= 20_001 {
                    expected.insert(id.clone());
                    &card
                } else {
                    &other
                };
                let metadata = json!({"id":id,"summary":"Report","recorded_at":"2026-09-08T10:00:00Z","target":{"type":"card","id":target}});
                insert
                    .execute(params![project, id, metadata.to_string()])
                    .unwrap();
            }
            // Identical target identifiers in another project or target kind
            // must not leak into the selected card's report history.
            for (project_id, target_type) in
                [(other.as_str(), "card"), (project.as_str(), "milestone")]
            {
                let id = Uuid::new_v4().to_string();
                insert
                    .execute(params![
                        project_id,
                        id,
                        json!({"id":id,"summary":"Report","target":{"type":target_type,"id":card}})
                            .to_string()
                    ])
                    .unwrap();
            }
        }
        tx.commit().unwrap();
    }
    let mut query = Query {
        project: Some(project),
        target_type: Some("card".into()),
        target_id: Some(card),
        limit: Some(2),
        ..Default::default()
    };
    let mut received = BTreeSet::new();
    let mut pages = 0;
    loop {
        let result = index.summary_page(Some("update"), &query).unwrap();
        assert!(result["items"].as_array().unwrap().len() <= 2);
        for item in result["items"].as_array().unwrap() {
            assert!(item.get("body").is_none());
            assert!(received.insert(item["id"].as_str().unwrap().to_owned()));
        }
        pages += 1;
        let Some(cursor) = result["page"]["next_cursor"].as_str() else {
            break;
        };
        query.cursor = Some(cursor.into());
        let mut different = query.clone();
        different.target_id = Some(other.clone());
        assert!(
            matches!(index.query(Some("update"), &different, 200), Err(AppError::Rejected(reply)) if reply.body["error"]["code"] == "CURSOR_STALE")
        );
    }
    assert_eq!(pages, 3);
    assert_eq!(received, expected);
}

#[test]
fn report_target_filter_requires_a_valid_pair_on_update_queries() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = Directory::open(&temporary.path().canonicalize().unwrap())
        .unwrap()
        .child("index", true)
        .unwrap();
    let index = Index::open(directory.path()).unwrap();
    let valid = Query {
        target_type: Some("card".into()),
        target_id: Some(Uuid::new_v4().to_string()),
        ..Default::default()
    };
    for (kind, query) in [
        (Some("card"), valid.clone()),
        (None, valid.clone()),
        (
            Some("update"),
            Query {
                target_type: None,
                ..valid.clone()
            },
        ),
        (
            Some("update"),
            Query {
                target_id: None,
                ..valid.clone()
            },
        ),
        (
            Some("update"),
            Query {
                target_type: Some("update".into()),
                ..valid.clone()
            },
        ),
        (
            Some("update"),
            Query {
                target_id: Some(Uuid::now_v7().to_string()),
                ..valid.clone()
            },
        ),
    ] {
        assert!(
            matches!(index.query(kind, &query, 200), Err(AppError::Rejected(reply)) if reply.body["error"]["code"] == "INVALID_TARGET_FILTER")
        );
    }
    assert!(index.query(Some("update"), &valid, 200).is_ok());
}

#[test]
fn bundled_sqlite_seeks_composite_projection_and_report_target_keys() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = Directory::open(&temporary.path().canonicalize().unwrap())
        .unwrap()
        .child("index", true)
        .unwrap();
    let index = Index::open(directory.path()).unwrap();
    let db = index.connection.lock().unwrap();
    for (sql, expected) in [
        (
            "EXPLAIN QUERY PLAN SELECT source_hash,validity FROM documents WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3",
            "project_id=? AND entity_type=? AND entity_id=?",
        ),
        (
            "EXPLAIN QUERY PLAN SELECT entity_id FROM documents WHERE project_id=?1 AND entity_type='update' AND json_extract(metadata_json,'$.target.type')=?2 AND json_extract(metadata_json,'$.target.id')=?3",
            "documents_report_target",
        ),
    ] {
        let mut statement = db.prepare(sql).unwrap();
        let plan = statement
            .query_map(["project", "card", "id"], |row| row.get::<_, String>(3))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join("\n");
        assert!(plan.contains(expected), "{plan}");
    }
}
