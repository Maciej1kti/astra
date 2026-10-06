//! The in-app agent over real transport, with the fake provider command line.
use super::*;
use project_application::wire;
use std::time::{Duration, Instant};

async fn call(
    app: &Running,
    method: &str,
    path: &str,
    user: Option<&str>,
    body: Option<&Value>,
) -> (u16, Value) {
    let mut request = app.local(method, path);
    if let Some(user) = user {
        request = request.header("x-astra-user", user);
    }
    if let Some(body) = body {
        request = request.json(body);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap())
}
async fn get(app: &Running, path: &str) -> (u16, Value) {
    call(app, "GET", path, None, None).await
}
fn code(reply: &(u16, Value)) -> &str {
    reply.1["error"]["code"].as_str().unwrap_or("")
}
async fn boot(app: &Running) -> String {
    let (status, value) = get(app, "/api/v1/agent").await;
    assert_eq!(status, 200);
    value["boot_id"].as_str().unwrap().to_owned()
}
/// A start request with a fresh run ID.
fn input(boot: &str, conversation: &str, message: &str) -> Value {
    json!({
        "run_id": Uuid::now_v7().to_string(),
        "boot_id": boot,
        "conversation_id": conversation,
        "message": message,
    })
}
async fn start(app: &Running, body: &Value) -> (u16, Value) {
    call(app, "POST", "/api/v1/agent/runs", None, Some(body)).await
}
async fn read_run(app: &Running, run: &str, user: Option<&str>) -> (u16, Value) {
    call(app, "GET", &format!("/api/v1/agent/runs/{run}"), user, None).await
}
async fn finished(app: &Running, run: &str) -> Value {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let (status, value) = read_run(app, run, None).await;
        assert_eq!(status, 200, "{value}");
        wire::validate("AgentRun", &value).unwrap();
        if value["state"] != "running" {
            return value;
        }
        assert!(Instant::now() < deadline, "the run did not finish");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
/// Start a run and wait for its final state.
async fn ask(app: &Running, boot: &str, conversation: &str, message: &str) -> Value {
    let body = input(boot, conversation, message);
    let (status, value) = start(app, &body).await;
    assert_eq!(status, 202, "{value}");
    wire::validate("AgentRun", &value).unwrap();
    finished(app, body["run_id"].as_str().unwrap()).await
}
fn log(app: &Running) -> Vec<String> {
    let path = app
        .agent
        .as_ref()
        .unwrap()
        .directory
        .join(".fake-agent.log");
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(str::to_owned)
        .collect()
}
fn field(line: &str, name: &str) -> String {
    line.split(' ')
        .find_map(|part| part.strip_prefix(&format!("{name}=")))
        .unwrap_or("")
        .to_owned()
}
async fn wait_for_log(app: &Running, lines: usize) -> Vec<String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let entries = log(app);
        if entries.len() >= lines {
            return entries;
        }
        assert!(Instant::now() < deadline, "the agent never started");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
async fn set_provider(app: &Running, user: Option<&str>, provider: &str) {
    let (_, preferences) = call(app, "GET", "/api/v1/workspace/preferences", user, None).await;
    let (_, boot) = call(app, "GET", "/api/v1/bootstrap", user, None).await;
    let mut request = app
        .local("PATCH", "/api/v1/workspace/preferences")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", boot["command_epoch"].as_str().unwrap())
        .header(
            "if-match",
            format!("\"{}\"", preferences["version"].as_str().unwrap()),
        );
    if let Some(user) = user {
        request = request.header("x-astra-user", user);
    }
    let response = request
        .json(&json!({"preferences":{"agent_provider":provider}}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
}
fn group_exists(pid: i32) -> bool {
    use rustix::process::{Pid, test_kill_process_group};
    test_kill_process_group(Pid::from_raw(pid).unwrap()).is_ok()
}
async fn group_gone(pid: i32) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while group_exists(pid) {
        assert!(
            Instant::now() < deadline,
            "the process group is still alive"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
async fn second_profile(app: &Running) -> String {
    let (_, boot) = get(app, "/api/v1/bootstrap").await;
    let id = Uuid::new_v4().to_string();
    let response = app
        .local("POST", "/api/v1/users")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", boot["command_epoch"].as_str().unwrap())
        .json(&json!({"id":id,"name":"Second user"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201);
    id
}

#[tokio::test]
async fn a_host_without_an_agent_directory_answers_agent_disabled_everywhere() {
    let app = Running::new().await;
    let (status, bootstrap) = get(&app, "/api/v1/bootstrap").await;
    assert_eq!(status, 200);
    wire::validate("Bootstrap", &bootstrap).unwrap();
    assert_eq!(bootstrap["agent_enabled"], false);
    let run = Uuid::now_v7().to_string();
    let start_body = input(
        &Uuid::new_v4().to_string(),
        &Uuid::new_v4().to_string(),
        "hi",
    );
    let routes = [
        ("GET", "/api/v1/agent".to_owned(), None),
        ("POST", "/api/v1/agent/runs".to_owned(), Some(start_body)),
        ("GET", format!("/api/v1/agent/runs/{run}"), None),
        (
            "POST",
            format!("/api/v1/agent/runs/{run}/cancel"),
            Some(json!({})),
        ),
        (
            "GET",
            format!("/api/v1/agent/conversations/{}", Uuid::new_v4()),
            None,
        ),
    ];
    for (method, path, body) in routes {
        let reply = call(&app, method, &path, None, body.as_ref()).await;
        assert_eq!(reply.0, 404, "{method} {path}");
        assert_eq!(code(&reply), "AGENT_DISABLED", "{method} {path}");
        wire::validate("Error", &reply.1).unwrap();
    }
}

#[tokio::test]
async fn status_reports_the_boot_id_providers_and_the_profile_preference() {
    let app = Running::with_agent(|config| {
        config.codex = Some("/nonexistent/codex".into());
    })
    .await;
    let (status, bootstrap) = get(&app, "/api/v1/bootstrap").await;
    assert_eq!(status, 200);
    wire::validate("Bootstrap", &bootstrap).unwrap();
    assert_eq!(bootstrap["agent_enabled"], true);
    let (status, value) = get(&app, "/api/v1/agent").await;
    assert_eq!(status, 200);
    wire::validate("AgentStatus", &value).unwrap();
    assert!(Uuid::parse_str(value["boot_id"].as_str().unwrap()).is_ok());
    assert_eq!(value["provider"], "claude");
    assert_eq!(
        value["providers"],
        json!([{"id":"claude","available":true},{"id":"codex","available":false}])
    );
    assert_eq!(
        get(&app, "/api/v1/agent").await.1["boot_id"],
        value["boot_id"]
    );
    set_provider(&app, None, "codex").await;
    assert_eq!(get(&app, "/api/v1/agent").await.1["provider"], "codex");
    // A second profile has its own preference.
    let other = second_profile(&app).await;
    let (_, other_status) = call(&app, "GET", "/api/v1/agent", Some(&other), None).await;
    assert_eq!(other_status["provider"], "claude");
    assert_eq!(other_status["boot_id"], value["boot_id"]);
    // A query string is not part of the operation.
    assert_eq!(get(&app, "/api/v1/agent?x=1").await.0, 400);
}

#[tokio::test]
async fn a_run_goes_from_running_to_succeeded_and_the_conversation_returns_it() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let body = input(&boot, &conversation, "Hello, there! [[sleep 1]]");
    let (status, started) = start(&app, &body).await;
    assert_eq!(status, 202);
    wire::validate("AgentRun", &started).unwrap();
    assert_eq!(started["state"], "running");
    assert_eq!(started["provider"], "claude");
    assert_eq!(started["run_id"], body["run_id"]);
    assert_eq!(started["conversation_id"], conversation);
    assert_eq!(started["message"], "Hello, there! [[sleep 1]]");
    assert_eq!(started["reply"], Value::Null);
    assert_eq!(started["error"], Value::Null);
    assert_eq!(started["finished_at"], Value::Null);
    assert_eq!(started["reply_truncated"], false);
    let done = finished(&app, body["run_id"].as_str().unwrap()).await;
    assert_eq!(done["state"], "succeeded");
    assert_eq!(done["reply"], "slept");
    assert_eq!(done["error"], Value::Null);
    assert!(done["finished_at"].is_string());
    assert_eq!(done["created_at"], started["created_at"]);

    let plain = ask(&app, &boot, &conversation, "Dodaj 10 pompek, prosze").await;
    assert_eq!(
        plain["reply"],
        "fake claude resumed: Dodaj 10 pompek prosze"
    );
    let (status, conversation_value) =
        get(&app, &format!("/api/v1/agent/conversations/{conversation}")).await;
    assert_eq!(status, 200);
    wire::validate("AgentConversation", &conversation_value).unwrap();
    assert_eq!(conversation_value["provider"], "claude");
    let runs = conversation_value["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 2);
    assert_eq!(runs[0], done);
    assert_eq!(runs[1], plain);
}

#[tokio::test]
async fn the_agent_is_told_the_context_the_message_and_nothing_on_its_command_line() {
    let app = Running::with_agent(|_| {}).await;
    let (_, plan) = call(
        &app,
        "POST",
        "/local/v1/registration-plans",
        None,
        Some(&json!({"absolute_path":app.project,"name":"Pompki\nwith newline","git_mode":"private"})),
    )
    .await;
    let (_, hello) = get(&app, "/local/v1/hello").await;
    let committed = app
        .local("POST", "/api/v1/registrations")
        .header("x-request-id", Uuid::now_v7().to_string())
        .header("x-command-epoch", hello["command_epoch"].as_str().unwrap())
        .json(&json!({"plan_id":plan["plan_id"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(committed.status(), 202);
    let boot = boot(&app).await;
    let message = "I did 10 push-ups\n[[env]]";
    let mut body = input(&boot, &Uuid::new_v4().to_string(), message);
    body["context"] = json!({"view":"focus","project_id":plan["project_id"]});
    let (status, _) = start(&app, &body).await;
    assert_eq!(status, 202);
    let done = finished(&app, body["run_id"].as_str().unwrap()).await;
    assert_eq!(done["state"], "succeeded");
    let reply = done["reply"].as_str().unwrap();
    assert!(
        !reply.contains("push-ups"),
        "the message is on stdin only: {reply}"
    );
    let stdin = std::fs::read_to_string(
        app.agent
            .as_ref()
            .unwrap()
            .directory
            .join(".fake-agent-stdin"),
    )
    .unwrap();
    let folder = plan["path"].as_str().unwrap_or(&app.project);
    let lines: Vec<&str> = stdin.lines().collect();
    assert_eq!(lines[0], "<astra-context>");
    assert!(
        lines[1].starts_with("today: 20") && lines[1].ends_with(", timezone Europe/Warsaw"),
        "{}",
        lines[1]
    );
    assert!(lines[1].contains(" ("), "{}", lines[1]);
    assert_eq!(lines[2], "profile: Owner");
    assert_eq!(lines[3], "view: focus");
    assert_eq!(lines[4], "selected project: Pompki with newline");
    assert_eq!(lines[5], "projects (name | state | folder):");
    assert_eq!(
        lines[6],
        format!("- Pompki with newline | active | {folder}")
    );
    assert_eq!(lines[7], "</astra-context>");
    assert_eq!(lines[8], "");
    assert_eq!(&lines[9..], ["I did 10 push-ups", "[[env]]"]);
    assert!(stdin.ends_with("[[env]]\n"));

    // Without a view, and for a project that is not registered, the lines are omitted.
    let mut body = input(&boot, &Uuid::new_v4().to_string(), "plain");
    body["context"] = json!({"project_id":Uuid::new_v4().to_string()});
    assert_eq!(start(&app, &body).await.0, 202);
    finished(&app, body["run_id"].as_str().unwrap()).await;
    let stdin = std::fs::read_to_string(
        app.agent
            .as_ref()
            .unwrap()
            .directory
            .join(".fake-agent-stdin"),
    )
    .unwrap();
    assert!(!stdin.contains("view:"));
    assert!(!stdin.contains("selected project:"));
}

#[tokio::test]
async fn repeating_the_identical_post_returns_the_run_and_starts_nothing() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let body = input(&boot, &conversation, "once only");
    let first = start(&app, &body).await;
    assert_eq!(first.0, 202);
    let done = finished(&app, body["run_id"].as_str().unwrap()).await;
    let replay = start(&app, &body).await;
    assert_eq!(replay.0, 200);
    wire::validate("AgentRun", &replay.1).unwrap();
    assert_eq!(replay.1, done);
    assert_eq!(wait_for_log(&app, 1).await.len(), 1);
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(log(&app).len(), 1, "the agent was invoked exactly once");

    // The same run ID with another message, another conversation or another profile.
    let mut changed = body.clone();
    changed["message"] = json!("different");
    let reply = start(&app, &changed).await;
    assert_eq!((reply.0, code(&reply)), (409, "AGENT_RUN_ID_REUSED"));
    wire::validate("Error", &reply.1).unwrap();
    let mut elsewhere = body.clone();
    elsewhere["conversation_id"] = json!(Uuid::new_v4().to_string());
    assert_eq!(code(&start(&app, &elsewhere).await), "AGENT_RUN_ID_REUSED");
    let other = second_profile(&app).await;
    let reply = call(
        &app,
        "POST",
        "/api/v1/agent/runs",
        Some(&other),
        Some(&body),
    )
    .await;
    assert_eq!((reply.0, code(&reply)), (409, "AGENT_RUN_ID_REUSED"));
    assert_eq!(log(&app).len(), 1);
}

#[tokio::test]
async fn stale_boot_ids_and_invalid_bodies_are_refused_before_anything_starts() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let stale = input(&Uuid::new_v4().to_string(), &conversation, "hi");
    let reply = start(&app, &stale).await;
    assert_eq!((reply.0, code(&reply)), (409, "AGENT_HOST_RESTARTED"));
    // Nothing was recorded: the same run ID works with the right boot ID.
    let mut fixed = stale.clone();
    fixed["boot_id"] = json!(boot);
    assert_eq!(start(&app, &fixed).await.0, 202);
    finished(&app, fixed["run_id"].as_str().unwrap()).await;

    for invalid in [
        json!({}),
        json!({"run_id":"nope","boot_id":boot,"conversation_id":conversation,"message":"x"}),
        {
            let mut body = input(&boot, &conversation, "x");
            body["message"] = json!("");
            body
        },
        {
            let mut body = input(&boot, &conversation, "x");
            body["message"] = json!("x".repeat(8001));
            body
        },
        {
            let mut body = input(&boot, &conversation, "x");
            body["extra"] = json!(1);
            body
        },
        {
            let mut body = input(&boot, &conversation, "x");
            body["context"] = json!({"view":"nowhere"});
            body
        },
    ] {
        let reply = start(&app, &invalid).await;
        assert_eq!(
            (reply.0, code(&reply)),
            (422, "VALIDATION_FAILED"),
            "{invalid}"
        );
    }
    assert_eq!(log(&app).len(), 1);
}

async fn resumes_with_the_first_sessions_id(provider: &str) {
    let app = Running::with_agent(|_| {}).await;
    if provider == "codex" {
        set_provider(&app, None, "codex").await;
    }
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let first = ask(&app, &boot, &conversation, "first").await;
    assert_eq!(first["provider"], provider);
    assert_eq!(first["reply"], format!("fake {provider} new: first"));
    let second = ask(&app, &boot, &conversation, "second [[env]]").await;
    assert_eq!(second["state"], "succeeded");
    let entries = log(&app);
    assert_eq!(entries.len(), 2);
    let session = field(&entries[0], "session");
    assert!(Uuid::parse_str(&session).is_ok());
    assert!(entries[0].contains(&format!("{provider} new ")));
    assert!(entries[1].contains(&format!("{provider} resumed ")));
    assert_eq!(field(&entries[1], "session"), session);
    let reply = second["reply"].as_str().unwrap();
    if provider == "claude" {
        assert!(
            reply.ends_with(&format!(
                "args=-p --safe-mode --disable-slash-commands --output-format stream-json \
                 --verbose --dangerously-skip-permissions --append-system-prompt-file {}/AGENTS.md \
                 --resume {session}",
                app.agent.as_ref().unwrap().directory.display()
            )),
            "{reply}"
        );
    } else {
        assert!(
            reply.ends_with(&format!(
                "args=exec resume --json --skip-git-repo-check --ignore-user-config --ignore-rules \
                 --dangerously-bypass-approvals-and-sandbox -c project_root_markers=[] {session} -"
            )),
            "{reply}"
        );
    }
    // A third run keeps resuming the same session.
    ask(&app, &boot, &conversation, "third").await;
    assert_eq!(field(&log(&app)[2], "session"), session);
}
#[tokio::test]
async fn the_second_run_of_a_claude_conversation_resumes_the_first_session() {
    resumes_with_the_first_sessions_id("claude").await;
}
#[tokio::test]
async fn the_second_run_of_a_codex_conversation_resumes_the_first_thread() {
    resumes_with_the_first_sessions_id("codex").await;
}

#[tokio::test]
async fn a_busy_conversation_and_a_busy_host_are_refused_without_recording_anything() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let (first, second, third) = (
        Uuid::new_v4().to_string(),
        Uuid::new_v4().to_string(),
        Uuid::new_v4().to_string(),
    );
    let a = input(&boot, &first, "a [[sleep 20]]");
    let b = input(&boot, &second, "b [[sleep 20]]");
    assert_eq!(start(&app, &a).await.0, 202);
    assert_eq!(start(&app, &b).await.0, 202);

    let again = input(&boot, &first, "more");
    let reply = start(&app, &again).await;
    assert_eq!((reply.0, code(&reply)), (409, "AGENT_RUN_ACTIVE"));
    let crowded = input(&boot, &third, "third");
    let reply = start(&app, &crowded).await;
    assert_eq!((reply.0, code(&reply)), (429, "AGENT_BUSY"));
    // Neither refusal recorded a run or a conversation.
    assert_eq!(
        read_run(&app, again["run_id"].as_str().unwrap(), None)
            .await
            .0,
        404
    );
    assert_eq!(
        read_run(&app, crowded["run_id"].as_str().unwrap(), None)
            .await
            .0,
        404
    );
    assert_eq!(
        get(&app, &format!("/api/v1/agent/conversations/{third}"))
            .await
            .0,
        404
    );

    // Once one finishes, the same request goes through.
    let cancel = call(
        &app,
        "POST",
        &format!(
            "/api/v1/agent/runs/{}/cancel",
            a["run_id"].as_str().unwrap()
        ),
        None,
        Some(&json!({})),
    )
    .await;
    assert_eq!(cancel.0, 200);
    assert_eq!(
        finished(&app, a["run_id"].as_str().unwrap()).await["state"],
        "cancelled"
    );
    assert_eq!(start(&app, &crowded).await.0, 202);
    assert_eq!(
        finished(&app, crowded["run_id"].as_str().unwrap()).await["state"],
        "succeeded"
    );
    call(
        &app,
        "POST",
        &format!(
            "/api/v1/agent/runs/{}/cancel",
            b["run_id"].as_str().unwrap()
        ),
        None,
        Some(&json!({})),
    )
    .await;
    finished(&app, b["run_id"].as_str().unwrap()).await;
}

#[tokio::test]
async fn cancelling_ends_the_run_and_its_whole_process_group() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let body = input(&boot, &Uuid::new_v4().to_string(), "[[sleep 60]]");
    let run = body["run_id"].as_str().unwrap().to_owned();
    assert_eq!(start(&app, &body).await.0, 202);
    let entries = wait_for_log(&app, 1).await;
    let pid: i32 = field(&entries[0], "pid").parse().unwrap();
    assert!(group_exists(pid));
    let path = format!("/api/v1/agent/runs/{run}/cancel");
    let cancel = call(&app, "POST", &path, None, Some(&json!({}))).await;
    assert_eq!(cancel.0, 200);
    wire::validate("AgentRun", &cancel.1).unwrap();
    let done = finished(&app, &run).await;
    assert_eq!(done["state"], "cancelled");
    assert_eq!(done["reply"], Value::Null);
    assert_eq!(done["error"], Value::Null);
    assert!(done["finished_at"].is_string());
    group_gone(pid).await;

    // Cancelling a finished run changes nothing, however often it is repeated.
    for _ in 0..2 {
        let again = call(&app, "POST", &path, None, Some(&json!({}))).await;
        assert_eq!(again.0, 200);
        assert_eq!(again.1, done);
    }
    // A body other than an empty object is not a cancellation.
    let reply = call(&app, "POST", &path, None, Some(&json!({"force":true}))).await;
    assert_eq!((reply.0, code(&reply)), (422, "VALIDATION_FAILED"));
    // Unknown runs and malformed IDs.
    for unknown in [Uuid::now_v7().to_string(), "not-an-id".to_owned()] {
        let reply = call(
            &app,
            "POST",
            &format!("/api/v1/agent/runs/{unknown}/cancel"),
            None,
            Some(&json!({})),
        )
        .await;
        assert_eq!((reply.0, code(&reply)), (404, "AGENT_RUN_NOT_FOUND"));
    }
    // The conversation can be used again after a cancellation.
    let next = ask(
        &app,
        &boot,
        done["conversation_id"].as_str().unwrap(),
        "after",
    )
    .await;
    assert_eq!(next["state"], "succeeded");
}

#[tokio::test]
async fn the_time_limit_ends_the_run_as_timed_out() {
    let app = Running::with_agent(|config| config.timeout = Duration::from_secs(1)).await;
    let boot = boot(&app).await;
    let body = input(&boot, &Uuid::new_v4().to_string(), "[[sleep 60]]");
    let started = Instant::now();
    assert_eq!(start(&app, &body).await.0, 202);
    let pid: i32 = field(&wait_for_log(&app, 1).await[0], "pid")
        .parse()
        .unwrap();
    let done = finished(&app, body["run_id"].as_str().unwrap()).await;
    assert_eq!(done["state"], "timed_out");
    assert_eq!(done["error"], Value::Null);
    assert!(done["finished_at"].is_string());
    assert!(started.elapsed() < Duration::from_secs(15));
    group_gone(pid).await;
}

#[tokio::test]
async fn provider_failures_crashes_and_silence_become_failed_runs() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let failure = |run: &Value, code: &str, detail: Value| {
        assert_eq!(run["state"], "failed", "{run}");
        assert_eq!(run["reply"], Value::Null);
        assert_eq!(run["error"], json!({"code":code,"detail":detail}), "{run}");
        assert!(run["finished_at"].is_string());
        wire::validate("AgentRun", run).unwrap();
    };
    for provider in ["claude", "codex"] {
        if provider == "codex" {
            set_provider(&app, None, "codex").await;
        }
        let conversation = |marker: &str| (Uuid::new_v4().to_string(), format!("try {marker}"));
        let (id, message) = conversation("[[fail]]");
        let run = ask(&app, &boot, &id, &message).await;
        assert_eq!(run["provider"], provider);
        failure(&run, "AGENT_PROVIDER_FAILED", json!("fake failure"));
        let (id, message) = conversation("[[crash]]");
        let run = ask(&app, &boot, &id, &message).await;
        failure(&run, "AGENT_PROVIDER_FAILED", json!("fake crash"));
        let (id, message) = conversation("[[silent]]");
        let run = ask(&app, &boot, &id, &message).await;
        failure(&run, "AGENT_OUTPUT_INVALID", Value::Null);
    }
    // The nested Codex error is reduced to the API's own message.
    let (id, _) = (Uuid::new_v4().to_string(), ());
    let run = ask(&app, &boot, &id, "[[nested-error]]").await;
    assert_eq!(run["provider"], "codex");
    failure(
        &run,
        "AGENT_PROVIDER_FAILED",
        json!("The model is not supported"),
    );
}

#[tokio::test]
async fn a_reply_over_the_limit_is_cut_and_marked() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    for provider in ["claude", "codex"] {
        if provider == "codex" {
            set_provider(&app, None, "codex").await;
        }
        let run = ask(&app, &boot, &Uuid::new_v4().to_string(), "[[big]]").await;
        assert_eq!(run["state"], "succeeded");
        assert_eq!(run["reply"].as_str().unwrap().chars().count(), 65_536);
        assert_eq!(run["reply_truncated"], true);
        wire::validate("AgentRun", &run).unwrap();
    }
}

#[tokio::test]
async fn markdown_replies_arrive_as_plain_text_data() {
    let app = Running::with_agent(|_| {}).await;
    let run = ask(
        &app,
        &boot(&app).await,
        &Uuid::new_v4().to_string(),
        "[[markdown]]",
    )
    .await;
    assert_eq!(
        run["reply"],
        "**bold** and a list:\n\n- one\n- two\n\n[link](https://example.com) ![img](https://example.com/x.png) <script>alert(1)</script>"
    );
}

#[tokio::test]
async fn the_agent_runs_in_its_directory_with_the_profile_socket_and_cli() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let config = app.agent.as_ref().unwrap();
    let owner = get(&app, "/api/v1/bootstrap").await.1["user"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let run = ask(&app, &boot, &Uuid::new_v4().to_string(), "[[env]]").await;
    let reply = run["reply"].as_str().unwrap();
    assert!(
        reply.starts_with(&format!("cwd={} ", config.directory.display())),
        "{reply}"
    );
    assert!(reply.contains(&format!(" user={owner} ")), "{reply}");
    assert!(reply.contains(" socket=set "), "{reply}");
    assert!(reply.contains(" projectctl=yes "), "{reply}");
    // Another profile gets its own ID in the environment.
    let other = second_profile(&app).await;
    let body = input(&boot, &Uuid::new_v4().to_string(), "[[env]]");
    let (status, started) = call(
        &app,
        "POST",
        "/api/v1/agent/runs",
        Some(&other),
        Some(&body),
    )
    .await;
    assert_eq!(status, 202);
    for _ in 0..200 {
        let (_, value) = read_run(&app, started["run_id"].as_str().unwrap(), Some(&other)).await;
        if value["state"] != "running" {
            assert!(
                value["reply"]
                    .as_str()
                    .unwrap()
                    .contains(&format!(" user={other} "))
            );
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("the second profile's run did not finish");
}

#[tokio::test]
async fn a_run_can_call_back_into_the_same_daemon_through_projectctl() {
    let cli = support::projectctl_dir();
    let app = Running::with_agent(move |config| config.cli_dir = cli).await;
    let boot = boot(&app).await;
    let run = ask(&app, &boot, &Uuid::new_v4().to_string(), "[[cli]]").await;
    assert_eq!(run["state"], "succeeded");
    assert_eq!(run["reply"], "projects exit 0");
}

#[tokio::test]
async fn another_profile_can_neither_read_nor_cancel_a_run_or_a_conversation() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let run = ask(&app, &boot, &conversation, "private").await;
    let id = run["run_id"].as_str().unwrap();
    let other = second_profile(&app).await;
    let reply = read_run(&app, id, Some(&other)).await;
    assert_eq!((reply.0, code(&reply)), (404, "AGENT_RUN_NOT_FOUND"));
    let reply = call(
        &app,
        "GET",
        &format!("/api/v1/agent/conversations/{conversation}"),
        Some(&other),
        None,
    )
    .await;
    assert_eq!(
        (reply.0, code(&reply)),
        (404, "AGENT_CONVERSATION_NOT_FOUND")
    );
    let reply = call(
        &app,
        "POST",
        &format!("/api/v1/agent/runs/{id}/cancel"),
        Some(&other),
        Some(&json!({})),
    )
    .await;
    assert_eq!((reply.0, code(&reply)), (404, "AGENT_RUN_NOT_FOUND"));
    // The owner still sees everything, and the same conversation ID is free for the other profile.
    assert_eq!(read_run(&app, id, None).await.0, 200);
    let body = input(&boot, &conversation, "mine");
    let reply = call(
        &app,
        "POST",
        "/api/v1/agent/runs",
        Some(&other),
        Some(&body),
    )
    .await;
    assert_eq!(reply.0, 202);
    assert_eq!(
        get(&app, &format!("/api/v1/agent/conversations/{conversation}"))
            .await
            .1["runs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn unknown_and_malformed_ids_are_not_found() {
    let app = Running::with_agent(|_| {}).await;
    for path in [
        format!("/api/v1/agent/runs/{}", Uuid::now_v7()),
        "/api/v1/agent/runs/not-a-run".to_owned(),
    ] {
        let reply = get(&app, &path).await;
        assert_eq!(
            (reply.0, code(&reply)),
            (404, "AGENT_RUN_NOT_FOUND"),
            "{path}"
        );
    }
    for path in [
        format!("/api/v1/agent/conversations/{}", Uuid::new_v4()),
        "/api/v1/agent/conversations/not-a-conversation".to_owned(),
    ] {
        let reply = get(&app, &path).await;
        assert_eq!(
            (reply.0, code(&reply)),
            (404, "AGENT_CONVERSATION_NOT_FOUND"),
            "{path}"
        );
    }
}

#[tokio::test]
async fn missing_instructions_cli_or_provider_are_refused_and_not_recorded() {
    let app = Running::with_agent(|_| {}).await;
    let config = app.agent.clone().unwrap();
    let boot_id = boot(&app).await;
    let body = input(&boot_id, &Uuid::new_v4().to_string(), "needs a fix");
    let refused = |reply: (u16, Value), expected: &str| {
        assert_eq!((reply.0, code(&reply)), (409, expected), "{}", reply.1);
        wire::validate("Error", &reply.1).unwrap();
    };

    // AGENTS.md: missing, empty, too large, not a regular file.
    let instructions = config.directory.join("AGENTS.md");
    let original = std::fs::read(&instructions).unwrap();
    std::fs::remove_file(&instructions).unwrap();
    refused(start(&app, &body).await, "AGENT_INSTRUCTIONS_MISSING");
    std::fs::write(&instructions, "").unwrap();
    refused(start(&app, &body).await, "AGENT_INSTRUCTIONS_MISSING");
    std::fs::write(&instructions, vec![b'x'; 64 * 1024 + 1]).unwrap();
    refused(start(&app, &body).await, "AGENT_INSTRUCTIONS_MISSING");
    std::fs::remove_file(&instructions).unwrap();
    std::fs::create_dir(&instructions).unwrap();
    refused(start(&app, &body).await, "AGENT_INSTRUCTIONS_MISSING");
    std::fs::remove_dir(&instructions).unwrap();
    // The limit itself is allowed.
    std::fs::write(&instructions, vec![b'x'; 64 * 1024]).unwrap();
    std::fs::write(&instructions, &original).unwrap();

    // projectctl: absent, or not executable.
    let ctl = config.cli_dir.join("projectctl");
    let script = std::fs::read(&ctl).unwrap();
    std::fs::remove_file(&ctl).unwrap();
    refused(start(&app, &body).await, "AGENT_CLI_UNAVAILABLE");
    std::fs::write(&ctl, &script).unwrap();
    std::fs::set_permissions(&ctl, std::os::unix::fs::PermissionsExt::from_mode(0o644)).unwrap();
    refused(start(&app, &body).await, "AGENT_CLI_UNAVAILABLE");
    std::fs::set_permissions(&ctl, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();

    // The provider's executable: absent, or not executable.
    let missing =
        Running::with_agent(|config| config.claude = Some("/nonexistent/claude".into())).await;
    let missing_body = input(&boot(&missing).await, &Uuid::new_v4().to_string(), "hi");
    refused(
        start(&missing, &missing_body).await,
        "AGENT_PROVIDER_UNAVAILABLE",
    );
    assert_eq!(
        read_run(&missing, missing_body["run_id"].as_str().unwrap(), None)
            .await
            .0,
        404
    );
    let plain_file = tempfile::NamedTempFile::new().unwrap();
    let not_executable = plain_file.path().to_owned();
    let blocked = Running::with_agent(move |config| config.claude = Some(not_executable)).await;
    let blocked_body = input(&boot(&blocked).await, &Uuid::new_v4().to_string(), "hi");
    refused(
        start(&blocked, &blocked_body).await,
        "AGENT_PROVIDER_UNAVAILABLE",
    );

    // Nothing was recorded or started, and the same run ID works once the cause is gone.
    assert_eq!(
        read_run(&app, body["run_id"].as_str().unwrap(), None)
            .await
            .0,
        404
    );
    assert_eq!(
        get(
            &app,
            &format!(
                "/api/v1/agent/conversations/{}",
                body["conversation_id"].as_str().unwrap()
            )
        )
        .await
        .0,
        404
    );
    assert!(log(&app).is_empty());
    assert_eq!(start(&app, &body).await.0, 202);
    assert_eq!(
        finished(&app, body["run_id"].as_str().unwrap()).await["state"],
        "succeeded"
    );
}
#[tokio::test]
async fn the_provider_without_an_explicit_path_is_found_on_the_daemons_path() {
    // No configured path: the name is looked up on PATH when the run starts.
    let app = Running::with_agent(|config| {
        config.claude = None;
        config.codex = None;
    })
    .await;
    let (_, status) = get(&app, "/api/v1/agent").await;
    let on_path = |name: &str| {
        std::env::var_os("PATH")
            .into_iter()
            .flat_map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
            .any(|dir| {
                dir.join(name).metadata().is_ok_and(|m| {
                    m.is_file()
                        && std::os::unix::fs::PermissionsExt::mode(&m.permissions()) & 0o111 != 0
                })
            })
    };
    assert_eq!(
        status["providers"],
        json!([
            {"id":"claude","available":on_path("claude")},
            {"id":"codex","available":on_path("codex")}
        ])
    );
}

#[tokio::test]
async fn a_new_conversation_follows_the_preference_but_an_existing_one_keeps_its_provider() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let old = Uuid::new_v4().to_string();
    let first = ask(&app, &boot, &old, "one").await;
    assert_eq!(first["provider"], "claude");
    set_provider(&app, None, "codex").await;
    let second = ask(&app, &boot, &old, "two").await;
    assert_eq!(second["provider"], "claude");
    assert_eq!(second["reply"], "fake claude resumed: two");
    let fresh = ask(&app, &boot, &Uuid::new_v4().to_string(), "three").await;
    assert_eq!(fresh["provider"], "codex");
    assert_eq!(fresh["reply"], "fake codex new: three");
    let (_, conversation) = get(&app, &format!("/api/v1/agent/conversations/{old}")).await;
    assert_eq!(conversation["provider"], "claude");
    let entries = log(&app);
    assert!(entries[1].starts_with("claude resumed "));
    assert!(entries[2].starts_with("codex new "));
}

#[tokio::test]
async fn a_resume_that_reports_no_session_makes_the_next_run_start_fresh() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    ask(&app, &boot, &conversation, "one").await;
    let crashed = ask(&app, &boot, &conversation, "two [[crash]]").await;
    assert_eq!(crashed["state"], "failed");
    let next = ask(&app, &boot, &conversation, "three").await;
    assert_eq!(next["state"], "succeeded");
    assert_eq!(next["reply"], "fake claude new: three");
    let entries = log(&app);
    assert!(entries[0].starts_with("claude new "));
    assert!(entries[1].starts_with("claude resumed "));
    assert!(entries[2].starts_with("claude new "), "{}", entries[2]);
    // The fresh session is then kept and resumed.
    let after = ask(&app, &boot, &conversation, "four").await;
    assert_eq!(after["reply"], "fake claude resumed: four");
    assert_eq!(
        field(&log(&app)[3], "session"),
        field(&log(&app)[2], "session")
    );
}

#[tokio::test]
async fn at_most_thirty_two_conversations_are_kept_and_the_oldest_idle_one_is_evicted() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversations: Vec<String> = (0..32).map(|_| Uuid::new_v4().to_string()).collect();
    let mut first_run = String::new();
    for (index, conversation) in conversations.iter().enumerate() {
        let run = ask(&app, &boot, conversation, "hi").await;
        if index == 0 {
            first_run = run["run_id"].as_str().unwrap().to_owned();
        }
    }
    // Reading the oldest conversation makes it recent; the next one is evicted instead.
    assert_eq!(
        get(
            &app,
            &format!("/api/v1/agent/conversations/{}", conversations[0])
        )
        .await
        .0,
        200
    );
    let newest = ask(&app, &boot, &Uuid::new_v4().to_string(), "one more").await;
    assert_eq!(newest["state"], "succeeded");
    assert_eq!(read_run(&app, &first_run, None).await.0, 200);
    let (status, _) = get(
        &app,
        &format!("/api/v1/agent/conversations/{}", conversations[1]),
    )
    .await;
    assert_eq!(
        status, 404,
        "the least recently used conversation was evicted"
    );
    let (status, _) = get(
        &app,
        &format!("/api/v1/agent/conversations/{}", conversations[2]),
    )
    .await;
    assert_eq!(status, 200);
}

#[tokio::test]
async fn a_conversation_keeps_its_last_fifty_runs() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let conversation = Uuid::new_v4().to_string();
    let mut ids = Vec::new();
    for number in 0..52 {
        let run = ask(&app, &boot, &conversation, &format!("run {number}")).await;
        ids.push(run["run_id"].as_str().unwrap().to_owned());
    }
    let (_, value) = get(&app, &format!("/api/v1/agent/conversations/{conversation}")).await;
    wire::validate("AgentConversation", &value).unwrap();
    let runs: Vec<&str> = value["runs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|run| run["run_id"].as_str().unwrap())
        .collect();
    assert_eq!(runs.len(), 50);
    assert_eq!(
        runs,
        ids[2..].iter().map(String::as_str).collect::<Vec<_>>()
    );
    assert_eq!(read_run(&app, &ids[0], None).await.0, 404);
    assert_eq!(read_run(&app, &ids[51], None).await.0, 200);
}

#[tokio::test]
async fn the_network_listener_requires_a_session_and_csrf_to_start_a_run() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let body = input(&boot, &Uuid::new_v4().to_string(), "from the network");
    let origin = "https://projects.test";
    let without = app
        .browser("POST", "/api/v1/agent/runs")
        .header("origin", origin)
        .json(&body)
        .send()
        .await
        .unwrap();
    let other = app
        .browser("POST", "/api/v1/workspace/tags/preview")
        .header("origin", origin)
        .json(&json!({"source":"a","target":"b"}))
        .send()
        .await
        .unwrap();
    assert_eq!(without.status(), 401);
    assert_eq!(
        without.status(),
        other.status(),
        "refused like any other mutation"
    );
    assert_eq!(without.status(), 401);
    assert_eq!(
        app.browser("GET", "/api/v1/agent")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert!(log(&app).is_empty());

    let cookie = super::users::paired_cookie(&app).await;
    let missing_csrf = app
        .browser("POST", "/api/v1/agent/runs")
        .header("origin", origin)
        .header("cookie", &cookie)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(missing_csrf.status(), 403);
    assert!(log(&app).is_empty());
    let bootstrap: Value = app
        .browser("GET", "/api/v1/bootstrap")
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(bootstrap["agent_enabled"], true);
    let started = app
        .browser("POST", "/api/v1/agent/runs")
        .header("origin", origin)
        .header("cookie", &cookie)
        .header("x-csrf-token", bootstrap["csrf_token"].as_str().unwrap())
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(started.status(), 202);
    let run: Value = started.json().await.unwrap();
    wire::validate("AgentRun", &run).unwrap();
    finished(&app, run["run_id"].as_str().unwrap()).await;
}

fn pid_alive(pid: i32) -> bool {
    use rustix::process::{Pid, test_kill_process};
    test_kill_process(Pid::from_raw(pid).unwrap()).is_ok()
}
fn recorded_pid(app: &Running, name: &str) -> i32 {
    std::fs::read_to_string(app.agent.as_ref().unwrap().directory.join(name))
        .unwrap()
        .trim()
        .parse()
        .unwrap()
}

#[tokio::test]
async fn a_descendant_left_behind_in_the_group_is_killed_when_the_run_ends() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let started = Instant::now();
    let run = ask(&app, &boot, &Uuid::new_v4().to_string(), "[[orphan]]").await;
    assert_eq!(run["state"], "succeeded");
    assert_eq!(run["reply"], "orphaned");
    // The pipes closed with the group, so there was no wait for the drain limit.
    assert!(started.elapsed() < Duration::from_secs(5));
    let orphan = recorded_pid(&app, ".fake-agent-orphan");
    let deadline = Instant::now() + Duration::from_secs(5);
    while pid_alive(orphan) {
        assert!(Instant::now() < deadline, "the descendant is still running");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn a_descendant_that_escaped_the_group_cannot_keep_a_run_running() {
    let app = Running::with_agent(|_| {}).await;
    let boot = boot(&app).await;
    let started = Instant::now();
    let run = ask(&app, &boot, &Uuid::new_v4().to_string(), "[[escape]]").await;
    let elapsed = started.elapsed();
    let escaped = recorded_pid(&app, ".fake-agent-escaped");
    // It is still alive and holds the output pipes open; the run ended anyway.
    let still_alive = pid_alive(escaped);
    let _ = rustix::process::kill_process(
        rustix::process::Pid::from_raw(escaped).unwrap(),
        rustix::process::Signal::KILL,
    );
    assert_eq!(run["state"], "succeeded");
    assert_eq!(run["reply"], "escaped");
    assert!(still_alive, "the escaped descendant should have survived");
    assert!(elapsed < Duration::from_secs(10), "{elapsed:?}");
}
