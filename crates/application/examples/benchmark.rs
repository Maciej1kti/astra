//! Synthetic release workload. No user folders, weakened durability or auth bypass.
use project_application::{Mutation, engine::Engine, index::Query, now_millis};
use project_store::{document::Kind, filesystem::Directory};
use serde_json::{Value, json};
use std::{fs, time::Instant};
use uuid::Uuid;
fn statistics(mut samples: Vec<f64>) -> Value {
    samples.sort_by(f64::total_cmp);
    let n = samples.len();
    json!({"samples":n,"p50_ms":samples[n/2],"p95_ms":samples[(n*95/100).min(n-1)],"p99_ms":samples[(n*99/100).min(n-1)]})
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let projects: usize = args.get(1).map(|v| v.parse().unwrap()).unwrap_or(3);
    let cards: usize = args.get(2).map(|v| v.parse().unwrap()).unwrap_or(100);
    let updates: usize = args.get(3).map(|v| v.parse().unwrap()).unwrap_or(300);
    assert!(projects > 0 && projects <= 300 && cards > 0 && cards <= 50000 && updates <= 250000);
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let directory = Directory::open(&root).unwrap();
    let state = directory.child("state", true).unwrap();
    let engine = Engine::open(state.path()).unwrap();
    let mut targets = Vec::new();
    for n in 0..projects {
        let path = directory.child(&format!("project-{n}"), true).unwrap();
        let plan = engine
            .registration_plan(
                path.path().to_str().unwrap(),
                Some(&format!("Synthetic project {n}")),
                true,
            )
            .unwrap();
        engine
            .commit_registration(
                plan["plan_id"].as_str().unwrap(),
                &Uuid::now_v7().to_string(),
                &engine.journal.epoch,
            )
            .unwrap();
        let project = plan["project_id"].as_str().unwrap().to_owned();
        fs::create_dir_all(path.path().join(".project/cards")).unwrap();
        fs::create_dir_all(path.path().join(".project/updates")).unwrap();
        for c in 0..cards {
            let id = Uuid::new_v4().to_string();
            let meta = json!({"id":id,"title":format!("Synthetic card {c}"),"kind":"outcome","status":if c%3==0{"active"}else{"planned"},"priority":"normal","position":format!("{:032x}",(u128::MAX/(cards as u128+1))*(c as u128+1)),"archived":false,"created_at":"2026-09-05T10:00:00Z","updated_at":"2026-09-05T10:00:00Z"});
            // JSON object syntax is valid YAML and avoids template-specific metadata.
            fs::write(
                path.path().join(format!(".project/cards/{id}.md")),
                format!(
                    "---\n{}\n---\n{}",
                    serde_json::to_string(&meta).unwrap(),
                    "Synthetic body. ".repeat(32)
                ),
            )
            .unwrap();
            if c == 0 {
                targets.push((project.clone(), id));
            }
        }
        for u in 0..updates {
            let id = Uuid::new_v4().to_string();
            let meta = json!({"id":id,"kind":"note","target":{"type":"project","id":project},"summary":format!("Synthetic report {u}"),"author":{"kind":"human","label":"Benchmark"},"recorded_at":"2026-09-05T10:00:00Z"});
            fs::write(
                path.path().join(format!(".project/updates/{id}.md")),
                format!(
                    "---\n{}\n---\nShort synthetic report.\n",
                    serde_json::to_string(&meta).unwrap()
                ),
            )
            .unwrap();
        }
    }
    drop(engine);
    let start = Instant::now();
    let engine = Engine::open(state.path()).unwrap();
    let startup = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    engine.refresh_all().unwrap();
    let reconciliation = start.elapsed().as_secs_f64() * 1000.0;
    let mut query = Vec::new();
    let mut attention = Vec::new();
    let mut writes = Vec::new();
    for n in 0..220 {
        let (project, id) = &targets[n % targets.len()];
        let start = Instant::now();
        let result = engine
            .list(
                Some("card"),
                &Query {
                    limit: Some(50),
                    search: Some("Synthetic".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        assert!(!result["items"].as_array().unwrap().is_empty());
        if n >= 20 {
            query.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        let start = Instant::now();
        engine.attention(None, 50, now_millis()).unwrap();
        if n >= 20 {
            attention.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        let resource = engine.get(project, Kind::Card, id).unwrap();
        let start = Instant::now();
        let create = n % 5 == 0;
        let reply = engine
            .mutate(Mutation {
                project_id: project.clone(),
                kind: Kind::Card,
                id: if create { None } else { Some(id.clone()) },
                payload: if create {
                    json!({"title":format!("Created benchmark card {n}")})
                } else {
                    json!({"set":{"title":format!("Synthetic edited card {n}")}})
                },
                request_id: Uuid::now_v7().to_string(),
                epoch: engine.journal.epoch.clone(),
                expected: if create {
                    None
                } else {
                    Some(resource["version"].as_str().unwrap().into())
                },
            })
            .unwrap();
        assert_eq!(reply.http_status, 200, "{}", reply.body);
        if n >= 20 {
            writes.push(start.elapsed().as_secs_f64() * 1000.0);
        }
    }
    println!("{}",serde_json::to_string_pretty(&json!({"profile":{"projects":projects,"cards":cards*projects,"reports":updates*projects},"build":"release","os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"startup_ms":startup,"reconciliation_ms":reconciliation,"query":statistics(query),"attention":statistics(attention),"durable_mutation":statistics(writes),"limitations":"Application-level timings exclude HTTP/VPN and browser rendering. Fixture generation is included in external process peak RSS."})).unwrap());
}
