//! Audit-only reproduction against existing application library artifacts.
use project_application::{engine::Engine, index::Query, now_millis};
use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf};

fn main() {
    let root = PathBuf::from(std::env::args().nth(1).unwrap());
    for path in [&root, &root.join("state"), &root.join("project")] {
        fs::create_dir(path).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let engine = Engine::open(&root.join("state")).unwrap();
    let project_path = root.join("project");
    let plan = engine.registration_plan(project_path.to_str().unwrap(), Some("Audit fixture"), true).unwrap();
    let project = plan["project_id"].as_str().unwrap().to_owned();
    let millis = now_millis() as u64;
    let request = format!("{:08x}-{:04x}-7000-8000-000000000001", millis >> 16, millis & 0xffff);
    let registration = engine.commit_registration(plan["plan_id"].as_str().unwrap(), &request, &engine.journal.epoch).unwrap();
    assert_eq!(registration.http_status, 202);

    for kind in ["cards", "milestones"] {
        fs::create_dir_all(project_path.join(".project").join(kind)).unwrap();
    }
    let cursor = engine.index.cursor().unwrap();
    fs::write(project_path.join(".project/cards/foo.md"), b"Invalid filename fixture").unwrap();
    engine.refresh_project(&project, None).unwrap();
    assert_eq!(engine.index.issue_count().unwrap(), 1);
    let after = engine.index.cursor().unwrap();
    let events = engine.index.events_since(&cursor, now_millis()).unwrap();
    assert_eq!(cursor, after, "Expected current missing health invalidation behavior");
    assert!(events.is_empty());
    println!("One malformed filename: refresh succeeds, issue_count=1, cursor_changed=false, events=[]");

    fs::write(project_path.join(".project/milestones/foo.md"), b"Second invalid filename fixture").unwrap();
    let result = engine.refresh_project(&project, None);
    let error = format!("{result:?}");
    assert!(result.is_err());
    assert!(error.contains("UNIQUE constraint failed: projection_issues.project_id, projection_issues.path"));
    println!("Same malformed basename in cards and milestones: {error}");
    let projects = engine.list(Some("project"), &Query::default()).unwrap();
    assert_eq!(projects["items"][0]["availability"], "unavailable");
    println!("After failed refresh, healthy project summary availability: {}", projects["items"][0]["availability"]);
}
