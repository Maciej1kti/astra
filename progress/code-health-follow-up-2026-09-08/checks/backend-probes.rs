//! Analysis-only reproductions on temporary synthetic sources; no product writes.
use project_application::{AppError, Mutation, engine::Engine, index::Query, now_millis};
use project_store::{document::Kind, filesystem::Directory};
use serde_json::{Value, json};
use std::{fs, time::Instant};
use uuid::Uuid;

fn error(result: Result<Value, AppError>) -> Value {
    match result {
        Err(AppError::Rejected(reply)) => reply.body["error"]["code"].clone(),
        other => panic!("Expected stale cursor rejection: {other:?}"),
    }
}
fn sample(mut run: impl FnMut(), count: usize) -> Value {
    run();
    let mut times = Vec::new();
    for _ in 0..count {
        let start = Instant::now();
        run();
        times.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(f64::total_cmp);
    json!({"samples":count,"p50_ms":times[count/2],"max_ms":times[count-1]})
}
fn main() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let mut projects = Vec::new();
    let mut cards = Vec::new();
    for (name, count) in [("A", 1000), ("B", 1)] {
        let folder = root.child(name, true).unwrap();
        let plan = engine.registration_plan(folder.path().to_str().unwrap(), Some(name), true).unwrap();
        let reply = engine.commit_registration(plan["plan_id"].as_str().unwrap(), &Uuid::now_v7().to_string(), &engine.journal.epoch).unwrap();
        assert_eq!(reply.http_status, 202);
        let project = plan["project_id"].as_str().unwrap().to_owned();
        let sources = folder.path().join(".project");
        fs::create_dir_all(sources.join("cards")).unwrap();
        fs::create_dir_all(sources.join("updates")).unwrap();
        for n in 0..count {
            let id = Uuid::new_v4().to_string();
            if n == 0 { cards.push(id.clone()); }
            let metadata = json!({"id":id,"title":format!("Needle card {n:04}"),"kind":"outcome","status":"active","priority":"normal","position":format!("{:032x}",(u128::MAX/(count as u128+1))*(n as u128+1)),"archived":false,"blocked":{"reason":"Synthetic dependency"},"labels":["audit","common"],"schedule":{"start":"2026-09-08","end":"2026-09-09"},"created_at":"2026-09-05T10:00:00Z","updated_at":"2026-09-05T10:00:00Z"});
            fs::write(sources.join(format!("cards/{id}.md")), format!("---\n{metadata}\n---\nSynthetic body.\n")).unwrap();
        }
        if name == "A" {
            for n in 0..60 {
                let id = Uuid::new_v4().to_string();
                let metadata = json!({"id":id,"kind":"note","summary":format!("Needle report {n}"),"target":{"type":"project","id":project},"author":{"kind":"human","label":"Synthetic audit"},"recorded_at":"2026-09-08T10:00:00Z"});
                fs::write(sources.join(format!("updates/{id}.md")), format!("---\n{metadata}\n---\nSynthetic report.\n")).unwrap();
            }
        }
        projects.push(project);
    }
    engine.refresh_all().unwrap();
    let (a, b) = (&projects[0], &projects[1]);
    let query = Query { project: Some(a.clone()), limit: Some(50), ..Default::default() };
    let list = engine.list(Some("card"), &query).unwrap();
    let attention = engine.attention_project(Some(a), None, 200, now_millis()).unwrap();
    let board = engine.board(a, None, 50).unwrap();
    let gantt = engine.gantt(a, None, 200).unwrap();
    let resource = engine.get(b, Kind::Card, &cards[1]).unwrap();
    let reply = engine.mutate(Mutation { project_id:b.clone(),kind:Kind::Card,id:Some(cards[1].clone()),payload:json!({"set":{"title":"Changed only in B"}}),request_id:Uuid::now_v7().to_string(),epoch:engine.journal.epoch.clone(),expected:Some(resource["version"].as_str().unwrap().into()) }).unwrap();
    assert_eq!(reply.http_status, 200);
    let mut next_query = query.clone();
    next_query.cursor = Some(list["page"]["next_cursor"].as_str().unwrap().into());
    let stale = json!({
        "list": error(engine.list(Some("card"), &next_query)),
        "attention": error(engine.attention_project(Some(a), Some(attention["page"]["next_cursor"].as_str().unwrap()), 200, now_millis())),
        "board": error(engine.board(a, Some(board["columns"].as_array().unwrap().iter().find(|c|c["status"]=="active").unwrap()["page"]["next_cursor"].as_str().unwrap()), 50)),
        "gantt": error(engine.gantt(a, Some(gantt["page"]["next_cursor"].as_str().unwrap()), 200))
    });
    let search = Query { project:Some(a.clone()),search:Some("Needle".into()),limit:Some(50),..Default::default() };
    let mixed = engine.list(None, &search).unwrap();
    let typed = engine.list(Some("card"), &search).unwrap();
    let surviving = mixed["items"].as_array().unwrap().iter().filter(|r|r["type"]=="card").count();
    assert_eq!(surviving, 0);
    assert_eq!(typed["items"].as_array().unwrap().len(), 50);
    let timings = json!({
        "tag_catalog":sample(||{engine.tag_catalog().unwrap();},10),
        "gantt_page":sample(||{engine.gantt(a,None,200).unwrap();},10),
        "board_page":sample(||{engine.board(a,None,50).unwrap();},10),
        "scoped_card_list":sample(||{engine.list(Some("card"),&query).unwrap();},10)
    });
    println!("{}",serde_json::to_string_pretty(&json!({"profile":{"projects":2,"cards":1001,"reports":60},"unrelated_project_write_stales_cursors":stale,"relation_search":{"untyped_results":50,"cards_after_client_filter":surviving,"server_filtered_cards":50},"exploratory_release_timings":timings,"limitations":"Ten samples per read are exploratory, not p95 acceptance. Engine timings exclude HTTP and browser rendering. Synthetic sources and state are removed on exit."})).unwrap());
}
