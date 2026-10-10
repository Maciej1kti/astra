use super::*;

const MEMBER_BLOCK: &str = include_str!("../../../../templates/managed-member-block.md");
const PROJECT_BLOCK: &str = include_str!("../../../../templates/managed-agents-block.md");

fn member_plan(
    engine: &Engine,
    project: &str,
    operation: &str,
    relative: &str,
) -> Result<Value, crate::AppError> {
    // The published example is the input shape; only its values are replaced.
    let mut input: Value = serde_json::from_str(include_str!(
        "../../../../examples/requests/member-folder.json"
    ))
    .unwrap();
    assert_eq!(input["operation"], "add_member");
    input["operation"] = json!(operation);
    input["project_id"] = json!(project);
    input["relative_path"] = json!(relative);
    input["expected_workspace_version"] = json!(engine.workspace().unwrap().version);
    engine.maintenance_plan(&input)
}

fn apply(engine: &Engine, plan: &Value) -> (String, Reply) {
    let request = Uuid::now_v7().to_string();
    let reply = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(reply.http_status, 202, "{reply:?}");
    wire::validate("Accepted", &reply.body).unwrap();
    let job = (Workflows {
        journal: &engine.journal,
    })
    .job(reply.body["job_id"].as_str().unwrap())
    .unwrap();
    assert_eq!(job["state"], "done");
    (request, reply)
}

fn rejection(error: crate::AppError) -> (u16, String) {
    match error {
        crate::AppError::Rejected(reply) => (
            reply.http_status,
            reply.body["error"]["code"].as_str().unwrap().to_owned(),
        ),
        other => panic!("expected a rejection, got {other:?}"),
    }
}

fn members(engine: &Engine) -> Vec<String> {
    engine.workspace().unwrap().value.projects[0]
        .members
        .clone()
}

#[test]
fn declared_member_folder_selects_its_project_until_it_is_removed() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let folder = env.root.join("project/server");
    fs::create_dir_all(folder.join("child")).unwrap();
    fs::write(folder.join("AGENTS.md"), "# Server\n").unwrap();
    let path = folder.to_str().unwrap();
    let workspace_file = env.root.join("state/workspace.json");
    let registered = fs::read(&workspace_file).unwrap();

    // A folder below a project selects nothing until the owner declares it.
    assert_eq!(
        rejection(engine.resolve_path(path).unwrap_err()),
        (404, "PROJECT_NOT_REGISTERED".into())
    );
    let plan = member_plan(&engine, &project, "add_member", "server").unwrap();
    assert_eq!(plan["kind"], "add_member");
    assert_eq!(plan["relative_path"], "server");
    assert_eq!(plan["steps"][0]["path"], "AGENTS.md");
    assert_eq!(plan["steps"][1]["path"], "workspace.json");
    // The preview is a read.
    assert_eq!(fs::read(folder.join("AGENTS.md")).unwrap(), b"# Server\n");
    assert_eq!(fs::read(&workspace_file).unwrap(), registered);
    assert!(engine.resolve_path(path).is_err());

    let (request, reply) = apply(&engine, &plan);
    let instructions = format!("# Server\n\n\n{MEMBER_BLOCK}");
    assert_eq!(
        fs::read_to_string(folder.join("AGENTS.md")).unwrap(),
        instructions
    );
    assert_eq!(members(&engine), ["server"]);
    assert_eq!(engine.resolve_path(path).unwrap(), project);
    assert_eq!(engine.resolve_path(&env.path()).unwrap(), project);
    // Only the declared folder is mapped: not its children, not its siblings.
    for other in ["project/server/child", "project/other", "project/serve"] {
        assert_eq!(
            rejection(
                engine
                    .resolve_path(env.root.join(other).to_str().unwrap())
                    .unwrap_err()
            ),
            (404, "PROJECT_NOT_REGISTERED".into()),
            "{other}"
        );
    }
    // An unchanged retry replays the recorded outcome.
    let declared = fs::read(&workspace_file).unwrap();
    let replay = engine
        .commit_maintenance(
            plan["plan_id"].as_str().unwrap(),
            &request,
            &engine.journal.epoch,
        )
        .unwrap();
    assert_eq!(replay.body, reply.body);
    assert_eq!(fs::read(&workspace_file).unwrap(), declared);

    // Declaring the folder again restores removed instructions and nothing else.
    fs::remove_file(folder.join("AGENTS.md")).unwrap();
    let again = member_plan(&engine, &project, "add_member", "server").unwrap();
    apply(&engine, &again);
    assert_eq!(
        fs::read_to_string(folder.join("AGENTS.md")).unwrap(),
        MEMBER_BLOCK
    );
    assert_eq!(members(&engine), ["server"]);
    assert_eq!(fs::read(&workspace_file).unwrap(), declared);

    let stale = engine
        .maintenance_plan(&json!({
            "operation": "remove_member", "project_id": project,
            "relative_path": "server", "expected_workspace_version": "stale",
        }))
        .unwrap_err();
    assert_eq!(rejection(stale), (412, "VERSION_CONFLICT".into()));
    let removal = member_plan(&engine, &project, "remove_member", "server").unwrap();
    assert_eq!(removal["warnings"][0]["code"], "FILES_RETAINED");
    assert_eq!(members(&engine), ["server"]);
    apply(&engine, &removal);
    assert!(members(&engine).is_empty());
    // The registration returns to the bytes it had before any member existed.
    assert_eq!(fs::read(&workspace_file).unwrap(), registered);
    assert_eq!(
        rejection(engine.resolve_path(path).unwrap_err()),
        (404, "PROJECT_NOT_REGISTERED".into())
    );
    assert_eq!(
        fs::read_to_string(folder.join("AGENTS.md")).unwrap(),
        MEMBER_BLOCK
    );
    assert_eq!(
        rejection(member_plan(&engine, &project, "remove_member", "server").unwrap_err()),
        (404, "MEMBER_NOT_DECLARED".into())
    );
}

#[test]
fn refused_member_declarations_write_nothing() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let root = env.root.join("project");
    for folder in [
        "Docs",
        "deep/er",
        "target",
        "was-project/.project",
        "edited",
    ] {
        fs::create_dir_all(root.join(folder)).unwrap();
    }
    std::os::unix::fs::symlink(root.join("target"), root.join("link")).unwrap();
    fs::write(root.join("deep/agents.md"), "lowercase\n").unwrap();
    fs::create_dir_all(root.join("once")).unwrap();
    fs::write(root.join("once/AGENTS.md"), PROJECT_BLOCK).unwrap();
    fs::write(
        root.join("edited/AGENTS.md"),
        MEMBER_BLOCK.replace("append a short report", "append a long report"),
    )
    .unwrap();
    let nested = root.join("nested");
    fs::create_dir_all(&nested).unwrap();
    register(&engine, nested.to_str().unwrap());
    let workspace_file = env.root.join("state/workspace.json");
    let before = fs::read(&workspace_file).unwrap();

    let stale = engine
        .maintenance_plan(&json!({
            "operation": "add_member", "project_id": project,
            "relative_path": "target", "expected_workspace_version": "stale",
        }))
        .unwrap_err();
    assert_eq!(rejection(stale), (412, "VERSION_CONFLICT".into()));
    for (relative, status, code) in [
        ("", 422, "MEMBER_PATH_INVALID"),
        ("/target", 422, "MEMBER_PATH_INVALID"),
        ("target/", 422, "MEMBER_PATH_INVALID"),
        ("deep//er", 422, "MEMBER_PATH_INVALID"),
        (".", 422, "MEMBER_PATH_INVALID"),
        ("../project/target", 422, "MEMBER_PATH_INVALID"),
        ("deep/./er", 422, "MEMBER_PATH_INVALID"),
        (".project", 422, "MEMBER_PATH_INVALID"),
        ("was-project/.Project", 422, "MEMBER_PATH_INVALID"),
        ("missing", 404, "MEMBER_FOLDER_NOT_FOUND"),
        // The spelling must be the one the folder lists, on any filesystem.
        ("docs", 404, "MEMBER_FOLDER_NOT_FOUND"),
        ("was-project", 409, "MEMBER_IS_PROJECT"),
        ("nested", 409, "PATH_ALREADY_REGISTERED"),
        ("deep", 409, "AGENTS_CASE_CONFLICT"),
        ("once", 409, "MANAGED_BLOCK_CONFLICT"),
        ("edited", 409, "MANAGED_BLOCK_CONFLICT"),
    ] {
        assert_eq!(
            rejection(member_plan(&engine, &project, "add_member", relative).unwrap_err()),
            (status, code.into()),
            "{relative:?}"
        );
    }
    // A link is never followed into a member folder.
    assert!(member_plan(&engine, &project, "add_member", "link").is_err());
    assert_eq!(fs::read(&workspace_file).unwrap(), before);
    assert!(!root.join("target/AGENTS.md").exists());
    assert!(!root.join("Docs/AGENTS.md").exists());
    assert_eq!(
        fs::read_to_string(root.join("once/AGENTS.md")).unwrap(),
        PROJECT_BLOCK
    );

    // A nested folder is declared with its full relative path.
    let plan = member_plan(&engine, &project, "add_member", "deep/er").unwrap();
    apply(&engine, &plan);
    assert_eq!(
        engine
            .resolve_path(root.join("deep/er").to_str().unwrap())
            .unwrap(),
        project
    );
    assert!(
        engine
            .resolve_path(root.join("deep").to_str().unwrap())
            .is_err()
    );
}

#[test]
fn member_folder_cannot_also_be_registered_until_its_membership_is_removed() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    let folder = env.root.join("project/app");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("AGENTS.md"), "# App\n").unwrap();
    let path = folder.to_str().unwrap();
    apply(
        &engine,
        &member_plan(&engine, &project, "add_member", "app").unwrap(),
    );

    assert_eq!(
        rejection(engine.registration_plan(path, None, false).unwrap_err()),
        (409, "PATH_IS_MEMBER".into())
    );
    let relocation = engine
        .maintenance_plan(&json!({
            "operation": "relocate", "project_id": project, "new_absolute_path": path,
            "expected_workspace_version": engine.workspace().unwrap().version,
        }))
        .unwrap_err();
    assert_eq!(rejection(relocation), (409, "PATH_IS_MEMBER".into()));
    assert!(!folder.join(".project").exists());

    apply(
        &engine,
        &member_plan(&engine, &project, "remove_member", "app").unwrap(),
    );
    // The retained member instructions give way to the project's own.
    let own = register(&engine, path);
    assert_ne!(own, project);
    assert_eq!(engine.resolve_path(path).unwrap(), own);
    assert_eq!(
        fs::read_to_string(folder.join("AGENTS.md")).unwrap(),
        format!("# App\n\n\n{PROJECT_BLOCK}")
    );
    // A project folder is not declared as a member again.
    assert_eq!(
        rejection(member_plan(&engine, &project, "add_member", "app").unwrap_err()),
        (409, "PATH_ALREADY_REGISTERED".into())
    );
}

#[test]
fn members_follow_a_relocated_project_and_end_with_its_registration() {
    let env = Environment::new();
    let engine = env.engine();
    let project = register(&engine, &env.path());
    fs::create_dir_all(env.root.join("project/server")).unwrap();
    apply(
        &engine,
        &member_plan(&engine, &project, "add_member", "server").unwrap(),
    );

    let moved = env.root.join("moved");
    fs::rename(env.root.join("project"), &moved).unwrap();
    let relocation = engine
        .maintenance_plan(&json!({
            "operation": "relocate", "project_id": project, "new_absolute_path": moved,
            "expected_workspace_version": engine.workspace().unwrap().version,
        }))
        .unwrap();
    apply(&engine, &relocation);
    assert_eq!(members(&engine), ["server"]);
    assert_eq!(
        engine
            .resolve_path(moved.join("server").to_str().unwrap())
            .unwrap(),
        project
    );
    assert!(
        engine
            .resolve_path(env.root.join("project/server").to_str().unwrap())
            .is_err()
    );

    let unregister = engine
        .maintenance_plan(&json!({
            "operation": "unregister", "project_id": project,
            "expected_workspace_version": engine.workspace().unwrap().version,
        }))
        .unwrap();
    assert!(
        unregister["warnings"][0]["message"]
            .as_str()
            .unwrap()
            .contains("member folders")
    );
    apply(&engine, &unregister);
    assert!(
        engine
            .resolve_path(moved.join("server").to_str().unwrap())
            .is_err()
    );
    assert_eq!(
        fs::read_to_string(moved.join("server/AGENTS.md")).unwrap(),
        MEMBER_BLOCK
    );
}
