use project_application::{
    AppError,
    journal::Journal,
    now_millis,
    workflow::{Plan, Step, Workflows},
};
use project_store::filesystem::Directory;
use serde_json::json;
use uuid::Uuid;

#[test]
fn recovery_rechecks_completed_steps_before_publishing_registration() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let journal = Journal::open(state.path()).unwrap();
    let workflows = Workflows { journal: &journal };
    let plan = Plan {
        id: Uuid::new_v4().to_string(),
        kind: "registration".into(),
        project_id: Uuid::new_v4().to_string(),
        expires_at: now_millis() + 300_000,
        steps: ["first", "second", "registry"]
            .iter()
            .map(|name| Step::plan(&root, &[name], b"approved".to_vec()).unwrap())
            .collect(),
        view: json!({}),
    };
    workflows.save(&plan).unwrap();
    let result = workflows
        .commit_with(
            &plan.id,
            &Uuid::now_v7().to_string(),
            &journal.epoch,
            now_millis(),
            |index| {
                if index == 1 {
                    Err(AppError::State)
                } else {
                    Ok(())
                }
            },
        )
        .unwrap();
    let job = result.body["job_id"].as_str().unwrap();
    std::fs::write(root.path().join("first"), b"external change").unwrap();
    assert!(workflows.resume(job).is_err());
    assert_eq!(workflows.job(job).unwrap()["state"], "needs_review");
    assert!(!root.path().join("registry").exists());
    assert_eq!(
        std::fs::read(root.path().join("first")).unwrap(),
        b"external change"
    );
}
