//! What the two supported providers are asked and what their output means.
//! Everything here is pure: command lines, line framing, output parsing and the
//! final state of a run. Process handling lives in `process.rs`.
use serde_json::Value;
use std::{ffi::OsString, path::Path};

/// A longer stdout line is dropped, never buffered whole.
pub(super) const MAX_LINE: usize = 1 << 20;
pub(super) const STDERR_TAIL: usize = 8 * 1024;
pub(super) const MAX_REPLY_CHARS: usize = 65_536;
pub(super) const MAX_DETAIL_CHARS: usize = 2_000;
/// How many trailing stderr lines describe a failure that had no message.
const STDERR_LINES: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Provider {
    Claude,
    Codex,
}
impl Provider {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            _ => None,
        }
    }
    /// The wire name, which is also the executable's name.
    pub fn name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

/// The command line for one run. The message never appears here: it goes to the
/// provider's stdin. These flag sets were verified against Claude Code 2.1.291
/// and Codex 0.160.0; `--safe-mode` keeps the owner's hooks, plugins and personal
/// instructions out of the run, and `project_root_markers=[]` makes Codex read
/// only the agent directory's `AGENTS.md`.
pub(super) fn arguments(
    provider: Provider,
    directory: &Path,
    session: Option<&str>,
) -> Vec<OsString> {
    let mut arguments: Vec<OsString> = Vec::new();
    match provider {
        Provider::Claude => {
            arguments.extend(
                [
                    "-p",
                    "--safe-mode",
                    "--disable-slash-commands",
                    "--output-format",
                    "stream-json",
                    "--verbose",
                    "--dangerously-skip-permissions",
                    "--append-system-prompt-file",
                ]
                .map(OsString::from),
            );
            arguments.push(directory.join("AGENTS.md").into_os_string());
            if let Some(session) = session {
                arguments.extend(["--resume", session].map(OsString::from));
            }
        }
        Provider::Codex => {
            arguments.push("exec".into());
            if session.is_some() {
                arguments.push("resume".into());
            }
            arguments.extend(
                [
                    "--json",
                    "--skip-git-repo-check",
                    "--ignore-user-config",
                    "--ignore-rules",
                    "--dangerously-bypass-approvals-and-sandbox",
                    "-c",
                    "project_root_markers=[]",
                ]
                .map(OsString::from),
            );
            if let Some(session) = session {
                arguments.push(session.into());
            }
            arguments.push("-".into());
        }
    }
    arguments
}

/// A 36-character lowercase UUID shape; nothing else is kept as a session.
pub(super) fn valid_session(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

/// Cut `text` to at most `max` characters on a character boundary.
pub(super) fn truncate_chars(text: &str, max: usize) -> (String, bool) {
    match text.char_indices().nth(max) {
        Some((end, _)) => (text[..end].to_owned(), true),
        None => (text.to_owned(), false),
    }
}

/// The last `max` characters of `text`, on a character boundary.
fn last_chars(text: &str, max: usize) -> &str {
    let count = text.chars().count();
    match text.char_indices().nth(count.saturating_sub(max)) {
        Some((start, _)) => &text[start..],
        None => "",
    }
}

/// Splits a byte stream into lines without keeping more than `MAX_LINE` bytes.
#[derive(Default)]
pub(super) struct Lines {
    buffer: Vec<u8>,
    /// Inside a line that already exceeded the limit: drop up to its newline.
    skipping: bool,
}
impl Lines {
    pub fn push(&mut self, bytes: &[u8], mut line: impl FnMut(&[u8])) {
        let mut rest = bytes;
        while let Some(end) = rest.iter().position(|byte| *byte == b'\n') {
            let (head, tail) = (&rest[..end], &rest[end + 1..]);
            if self.skipping {
                self.skipping = false;
            } else if self.buffer.len() + head.len() <= MAX_LINE {
                self.buffer.extend_from_slice(head);
                line(&self.buffer);
            }
            self.buffer.clear();
            rest = tail;
        }
        if self.skipping {
            return;
        }
        if self.buffer.len() + rest.len() > MAX_LINE {
            self.buffer.clear();
            self.skipping = true;
        } else {
            self.buffer.extend_from_slice(rest);
        }
    }
    /// The last line of a stream that ended without a newline.
    pub fn finish(&mut self, mut line: impl FnMut(&[u8])) {
        if !self.skipping && !self.buffer.is_empty() {
            line(&self.buffer);
        }
        self.buffer.clear();
        self.skipping = false;
    }
}

/// The last bytes of a stream.
pub(super) struct Tail {
    bytes: Vec<u8>,
    limit: usize,
}
impl Tail {
    pub fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
        }
    }
    pub fn push(&mut self, bytes: &[u8]) {
        self.bytes.extend_from_slice(bytes);
        // Trim in batches so a chatty stream does not shift the buffer per read.
        if self.bytes.len() > 2 * self.limit {
            self.bytes.drain(..self.bytes.len() - self.limit);
        }
    }
    pub fn bytes(&self) -> &[u8] {
        &self.bytes[self.bytes.len().saturating_sub(self.limit)..]
    }
}

/// What a provider's output has said so far.
pub(super) struct Observed {
    provider: Provider,
    session: Option<String>,
    /// Claude: the last `result` line, as an answer or a failure message.
    result: Option<Result<String, String>>,
    /// Codex: the last agent message, whether its turn completed and the last failure.
    message: Option<String>,
    completed: bool,
    failure: Option<String>,
}
impl Observed {
    pub fn new(provider: Provider) -> Self {
        Self {
            provider,
            session: None,
            result: None,
            message: None,
            completed: false,
            failure: None,
        }
    }

    /// Take one stdout line. Anything that is not a JSON object is ignored.
    pub fn feed(&mut self, line: &[u8]) {
        let Ok(Value::Object(object)) = serde_json::from_slice::<Value>(line) else {
            return;
        };
        let text = |value: Option<&Value>| value.and_then(Value::as_str).map(str::to_owned);
        let kind = object.get("type").and_then(Value::as_str);
        match (self.provider, kind) {
            (Provider::Claude, Some("system"))
                if object.get("subtype").and_then(Value::as_str) == Some("init") =>
            {
                self.remember(text(object.get("session_id")));
            }
            (Provider::Claude, Some("result")) => {
                self.result = if object.get("is_error").and_then(Value::as_bool) == Some(true) {
                    Some(Err(text(object.get("result"))
                        .or_else(|| text(object.get("subtype")))
                        .unwrap_or_default()))
                } else {
                    text(object.get("result")).map(Ok)
                };
            }
            (Provider::Codex, Some("thread.started")) => {
                self.remember(text(object.get("thread_id")));
            }
            (Provider::Codex, Some("item.completed")) => {
                if let Some(item) = object.get("item")
                    && item.get("type").and_then(Value::as_str) == Some("agent_message")
                    && let Some(message) = text(item.get("text"))
                {
                    self.message = Some(message);
                }
            }
            (Provider::Codex, Some("turn.completed")) => self.completed = true,
            (Provider::Codex, Some("turn.failed")) => {
                let message = text(object.get("error").and_then(|error| error.get("message")));
                self.failure = Some(
                    message
                        .map(|raw| provider_message(&raw))
                        .unwrap_or_default(),
                );
            }
            (Provider::Codex, Some("error")) => {
                let message = text(object.get("message"));
                self.failure = Some(
                    message
                        .map(|raw| provider_message(&raw))
                        .unwrap_or_default(),
                );
            }
            _ => {}
        }
    }
    fn remember(&mut self, id: Option<String>) {
        if let Some(id) = id.filter(|id| valid_session(id)) {
            self.session = Some(id);
        }
    }

    /// The provider's own ID for the conversation, once it has reported one.
    pub fn session(&self) -> Option<&str> {
        self.session.as_deref()
    }
    /// The final answer: a non-error Claude result, or the last Codex agent
    /// message of a completed turn. Blank text is not an answer.
    pub fn answer(&self) -> Option<&str> {
        let text = match self.provider {
            Provider::Claude => match &self.result {
                Some(Ok(text)) => Some(text.as_str()),
                _ => None,
            },
            Provider::Codex if self.completed => self.message.as_deref(),
            Provider::Codex => None,
        };
        text.filter(|text| !text.trim().is_empty())
    }
    /// A failure the provider reported; possibly with an empty message.
    pub fn failure(&self) -> Option<&str> {
        match self.provider {
            Provider::Claude => match &self.result {
                Some(Err(message)) => Some(message.as_str()),
                _ => None,
            },
            Provider::Codex => self.failure.as_deref(),
        }
    }
}

/// Codex often wraps the API's error as a JSON string; prefer the inner message.
fn provider_message(raw: &str) -> String {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| raw.to_owned())
}

/// How the process ended, when it ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Exit {
    Code(i32),
    Signal(i32),
    Unknown,
}
impl Exit {
    fn describe(self) -> String {
        match self {
            Self::Code(code) => format!("exit status {code}"),
            Self::Signal(signal) => format!("terminated by signal {signal}"),
            Self::Unknown => "exit status unknown".into(),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Final {
    Succeeded {
        reply: String,
        truncated: bool,
    },
    Failed {
        code: &'static str,
        detail: Option<String>,
    },
    Cancelled,
    TimedOut,
}

pub(super) struct Ended<'a> {
    pub observed: &'a Observed,
    pub stderr: &'a [u8],
    pub exit: Exit,
    pub cancelled: bool,
    pub timed_out: bool,
}

/// The final state of a run, from what was read once the process is gone. A
/// final answer that was read wins over cancellation, the time limit and the
/// exit status, because it is what the owner asked for.
pub(super) fn settle(ended: &Ended<'_>) -> Final {
    if let Some(answer) = ended.observed.answer() {
        let (reply, truncated) = truncate_chars(answer, MAX_REPLY_CHARS);
        return Final::Succeeded { reply, truncated };
    }
    if ended.cancelled {
        return Final::Cancelled;
    }
    if ended.timed_out {
        return Final::TimedOut;
    }
    if ended.observed.failure().is_some() || ended.exit != Exit::Code(0) {
        let message = ended
            .observed
            .failure()
            .map(str::trim)
            .filter(|message| !message.is_empty())
            .map(|message| truncate_chars(message, MAX_DETAIL_CHARS).0);
        let detail = message
            .or_else(|| stderr_detail(ended.stderr))
            .unwrap_or_else(|| ended.exit.describe());
        return Final::Failed {
            code: "AGENT_PROVIDER_FAILED",
            detail: Some(detail),
        };
    }
    Final::Failed {
        code: "AGENT_OUTPUT_INVALID",
        detail: None,
    }
}

/// The last non-empty stderr lines, with control characters replaced.
fn stderr_detail(stderr: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(stderr);
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let from = lines.len().saturating_sub(STDERR_LINES);
    let joined = lines[from..].join("\n");
    let clean: String = joined
        .chars()
        .map(|c| if c.is_control() && c != '\n' { ' ' } else { c })
        .collect();
    let clean = last_chars(clean.trim(), MAX_DETAIL_CHARS);
    (!clean.is_empty()).then(|| clean.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b";

    fn claude(lines: &[&str]) -> Observed {
        let mut observed = Observed::new(Provider::Claude);
        for line in lines {
            observed.feed(line.as_bytes());
        }
        observed
    }
    fn codex(lines: &[&str]) -> Observed {
        let mut observed = Observed::new(Provider::Codex);
        for line in lines {
            observed.feed(line.as_bytes());
        }
        observed
    }

    #[test]
    fn providers_are_named_by_their_executables() {
        assert_eq!(Provider::parse("claude"), Some(Provider::Claude));
        assert_eq!(Provider::parse("codex"), Some(Provider::Codex));
        assert_eq!(Provider::parse("Claude"), None);
        assert_eq!(Provider::parse("gemini"), None);
        assert_eq!(Provider::Claude.name(), "claude");
        assert_eq!(Provider::Codex.name(), "codex");
    }

    fn strings(arguments: Vec<OsString>) -> Vec<String> {
        arguments
            .into_iter()
            .map(|argument| argument.into_string().unwrap())
            .collect()
    }

    #[test]
    fn claude_first_run_and_resume_use_the_verified_flag_sets() {
        let directory = Path::new("/agent");
        let first = [
            "-p",
            "--safe-mode",
            "--disable-slash-commands",
            "--output-format",
            "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
            "--append-system-prompt-file",
            "/agent/AGENTS.md",
        ];
        assert_eq!(strings(arguments(Provider::Claude, directory, None)), first);
        let mut resumed = first.to_vec();
        resumed.extend(["--resume", SESSION]);
        assert_eq!(
            strings(arguments(Provider::Claude, directory, Some(SESSION))),
            resumed
        );
    }

    #[test]
    fn codex_first_run_and_resume_read_the_prompt_from_stdin() {
        let directory = Path::new("/agent");
        assert_eq!(
            strings(arguments(Provider::Codex, directory, None)),
            [
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--ignore-user-config",
                "--ignore-rules",
                "--dangerously-bypass-approvals-and-sandbox",
                "-c",
                "project_root_markers=[]",
                "-"
            ]
        );
        assert_eq!(
            strings(arguments(Provider::Codex, directory, Some(SESSION))),
            [
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                "--ignore-user-config",
                "--ignore-rules",
                "--dangerously-bypass-approvals-and-sandbox",
                "-c",
                "project_root_markers=[]",
                SESSION,
                "-"
            ]
        );
    }

    #[test]
    fn only_lowercase_uuid_shapes_are_sessions() {
        assert!(valid_session(SESSION));
        for invalid in [
            "",
            "0F8E1C52-7D3A-4B9E-8A61-2C4D5E6F7A8B",
            "0f8e1c527d3a4b9e8a612c4d5e6f7a8b",
            "0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8",
            "0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8bb",
            "0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8g",
            "--resume",
            "../../etc/passwd",
        ] {
            assert!(!valid_session(invalid), "{invalid}");
        }
    }

    #[test]
    fn truncation_cuts_on_a_character_boundary() {
        assert_eq!(truncate_chars("abc", 3), ("abc".into(), false));
        assert_eq!(truncate_chars("abcd", 3), ("abc".into(), true));
        // Each of these is two bytes: a byte cut at 3 would split a character.
        assert_eq!(truncate_chars("zażółć", 4), ("zażó".into(), true));
        assert_eq!(truncate_chars("ążźć", 4), ("ążźć".into(), false));
        let emoji = "😀".repeat(10);
        let (cut, truncated) = truncate_chars(&emoji, 7);
        assert_eq!(cut.chars().count(), 7);
        assert!(truncated);
        assert_eq!(truncate_chars("", 0), (String::new(), false));
    }

    #[test]
    fn claude_result_need_not_be_the_last_line_and_other_lines_are_ignored() {
        let observed = claude(&[
            "not json at all",
            r#"[1,2,3]"#,
            r#""a string""#,
            r#"{"type":"system","subtype":"init","session_id":"0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b"}"#,
            r#"{"type":"system","subtype":"hook_started"}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"thinking"}]}}"#,
            r#"{"type":"user","message":{}}"#,
            r#"{"type":"rate_limit_event"}"#,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"Done.","session_id":"0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b"}"#,
            r#"{"type":"system","subtype":"hook_response"}"#,
            r#"{"type":"assistant","message":{"content":[]}}"#,
        ]);
        assert_eq!(observed.session(), Some(SESSION));
        assert_eq!(observed.answer(), Some("Done."));
        assert_eq!(observed.failure(), None);
    }

    #[test]
    fn claude_uses_the_last_result_and_only_trusts_valid_session_ids() {
        let observed = claude(&[
            r#"{"type":"system","subtype":"init","session_id":"../../escape"}"#,
            r#"{"type":"result","is_error":false,"result":"first"}"#,
            r#"{"type":"result","is_error":false,"result":"second"}"#,
        ]);
        assert_eq!(observed.session(), None);
        assert_eq!(observed.answer(), Some("second"));
        // A result line carries a session too, but only the init line is trusted.
        let observed = claude(&[
            r#"{"type":"result","is_error":false,"result":"x","session_id":"0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b"}"#,
        ]);
        assert_eq!(observed.session(), None);
    }

    #[test]
    fn claude_error_result_is_a_failure_with_its_text_or_subtype() {
        let observed = claude(&[
            r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"No conversation found"}"#,
        ]);
        assert_eq!(observed.answer(), None);
        assert_eq!(observed.failure(), Some("No conversation found"));
        let observed =
            claude(&[r#"{"type":"result","subtype":"error_max_turns","is_error":true}"#]);
        assert_eq!(observed.failure(), Some("error_max_turns"));
        // The last result decides.
        let observed = claude(&[
            r#"{"type":"result","is_error":true,"result":"boom"}"#,
            r#"{"type":"result","is_error":false,"result":"recovered"}"#,
        ]);
        assert_eq!(observed.answer(), Some("recovered"));
        assert_eq!(observed.failure(), None);
    }

    #[test]
    fn claude_blank_answers_are_not_answers() {
        let observed = claude(&[r#"{"type":"result","is_error":false,"result":"  \n"}"#]);
        assert_eq!(observed.answer(), None);
        assert_eq!(observed.failure(), None);
    }

    #[test]
    fn codex_answer_is_the_last_agent_message_of_a_completed_turn() {
        let observed = codex(&[
            r#"{"type":"thread.started","thread_id":"0f8e1c52-7d3a-4b9e-8a61-2c4d5e6f7a8b"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.completed","item":{"type":"reasoning","text":"hmm"}}"#,
            r#"{"type":"item.completed","item":{"type":"agent_message","text":"first"}}"#,
            r#"{"type":"item.completed","item":{"type":"command_execution","command":"ls"}}"#,
            r#"{"type":"item.completed","item":{"type":"agent_message","text":"last"}}"#,
        ]);
        assert_eq!(observed.session(), Some(SESSION));
        assert_eq!(observed.answer(), None, "no turn.completed yet");
        let mut observed = observed;
        observed.feed(br#"{"type":"turn.completed","usage":{}}"#);
        assert_eq!(observed.answer(), Some("last"));
        assert_eq!(observed.failure(), None);
    }

    #[test]
    fn codex_completed_turn_without_a_message_has_no_answer() {
        let observed = codex(&[r#"{"type":"turn.completed"}"#]);
        assert_eq!(observed.answer(), None);
    }

    #[test]
    fn codex_failures_prefer_the_nested_provider_message() {
        let observed = codex(&[r#"{"type":"turn.failed","error":{"message":"plain failure"}}"#]);
        assert_eq!(observed.failure(), Some("plain failure"));
        let nested = r#"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The model is not supported\"}}"}}"#;
        assert_eq!(
            codex(&[nested]).failure(),
            Some("The model is not supported")
        );
        let error = r#"{"type":"error","message":"{\"error\":{\"message\":\"quota exhausted\"}}"}"#;
        assert_eq!(codex(&[error]).failure(), Some("quota exhausted"));
        let json_without_message = r#"{"type":"error","message":"{\"unrelated\":1}"}"#;
        assert_eq!(
            codex(&[json_without_message]).failure(),
            Some(r#"{"unrelated":1}"#)
        );
    }

    #[test]
    fn a_codex_error_before_a_completed_turn_does_not_hide_the_answer_in_settle() {
        let observed = codex(&[
            r#"{"type":"error","message":"Reconnecting 1/5"}"#,
            r#"{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}"#,
            r#"{"type":"turn.completed"}"#,
        ]);
        assert_eq!(observed.answer(), Some("ok"));
        assert!(observed.failure().is_some());
        let ended = Ended {
            observed: &observed,
            stderr: b"",
            exit: Exit::Code(0),
            cancelled: false,
            timed_out: false,
        };
        assert_eq!(
            settle(&ended),
            Final::Succeeded {
                reply: "ok".into(),
                truncated: false
            }
        );
    }

    #[test]
    fn lines_are_framed_across_chunks_and_unterminated_tails_are_kept() {
        let mut lines = Lines::default();
        let mut seen: Vec<String> = Vec::new();
        let mut take = |line: &[u8]| seen.push(String::from_utf8_lossy(line).into_owned());
        lines.push(b"one\ntw", &mut take);
        lines.push(b"o\n\nthr", &mut take);
        lines.push(b"ee", &mut take);
        lines.finish(&mut take);
        assert_eq!(seen, ["one", "two", "", "three"]);
    }

    #[test]
    fn a_line_longer_than_the_limit_is_dropped_without_buffering_it() {
        let mut lines = Lines::default();
        let mut seen: Vec<usize> = Vec::new();
        let mut take = |line: &[u8]| seen.push(line.len());
        lines.push(b"before\n", &mut take);
        let chunk = vec![b'x'; 64 * 1024];
        for _ in 0..(MAX_LINE / chunk.len() + 8) {
            lines.push(&chunk, &mut take);
            assert!(lines.buffer.len() <= MAX_LINE, "buffer stays bounded");
        }
        lines.push(b"tail of the long line\nafter\n", &mut take);
        lines.push(b"unterminated", &mut take);
        lines.finish(&mut take);
        assert_eq!(seen, [6, 5, 12]);
        // Exactly the limit is still a line; one byte more is not.
        let mut lines = Lines::default();
        let mut seen: Vec<usize> = Vec::new();
        let mut take = |line: &[u8]| seen.push(line.len());
        let mut exact = vec![b'y'; MAX_LINE];
        exact.push(b'\n');
        lines.push(&exact, &mut take);
        let mut over = vec![b'y'; MAX_LINE + 1];
        over.push(b'\n');
        lines.push(&over, &mut take);
        assert_eq!(seen, [MAX_LINE]);
    }

    #[test]
    fn the_stderr_tail_keeps_only_the_last_bytes() {
        let mut tail = Tail::new(8);
        tail.push(b"0123");
        assert_eq!(tail.bytes(), b"0123");
        tail.push(b"456789abc");
        assert_eq!(tail.bytes(), b"56789abc");
        for _ in 0..100 {
            tail.push(b"zz");
        }
        assert_eq!(tail.bytes(), b"zzzzzzzz");
        assert!(tail.bytes.len() <= 2 * 8 + 2, "the buffer stays bounded");
    }

    fn ended<'a>(
        observed: &'a Observed,
        stderr: &'a [u8],
        exit: Exit,
        cancelled: bool,
        timed_out: bool,
    ) -> Ended<'a> {
        Ended {
            observed,
            stderr,
            exit,
            cancelled,
            timed_out,
        }
    }

    #[test]
    fn final_state_follows_the_documented_order() {
        let answered = claude(&[r#"{"type":"result","is_error":false,"result":"yes"}"#]);
        let failed = claude(&[r#"{"type":"result","is_error":true,"result":"provider said no"}"#]);
        let silent = claude(&[r#"{"type":"system","subtype":"init"}"#]);

        let succeeded = Final::Succeeded {
            reply: "yes".into(),
            truncated: false,
        };
        assert_eq!(
            settle(&ended(&answered, b"", Exit::Code(0), false, false)),
            succeeded
        );
        // An answer that was read beats a cancellation, a timeout and the exit status.
        assert_eq!(
            settle(&ended(&answered, b"", Exit::Code(1), true, false)),
            succeeded
        );
        assert_eq!(
            settle(&ended(&answered, b"", Exit::Signal(15), false, true)),
            succeeded
        );

        assert_eq!(
            settle(&ended(&silent, b"", Exit::Signal(15), true, false)),
            Final::Cancelled
        );
        assert_eq!(
            settle(&ended(&silent, b"", Exit::Signal(15), false, true)),
            Final::TimedOut
        );
        assert_eq!(
            settle(&ended(&failed, b"", Exit::Signal(15), true, false)),
            Final::Cancelled
        );

        assert_eq!(
            settle(&ended(&failed, b"noise", Exit::Code(1), false, false)),
            Final::Failed {
                code: "AGENT_PROVIDER_FAILED",
                detail: Some("provider said no".into())
            }
        );
        assert_eq!(
            settle(&ended(&silent, b"", Exit::Code(0), false, false)),
            Final::Failed {
                code: "AGENT_OUTPUT_INVALID",
                detail: None
            }
        );
    }

    #[test]
    fn failure_detail_falls_back_to_stderr_then_the_exit_status() {
        let silent = claude(&[]);
        let detail = |stderr: &[u8], exit| match settle(&ended(&silent, stderr, exit, false, false))
        {
            Final::Failed { code, detail } => {
                assert_eq!(code, "AGENT_PROVIDER_FAILED");
                detail
            }
            other => panic!("{other:?}"),
        };
        assert_eq!(
            detail(b"a\n\n  \nb\nc\nd\ne\nf\n\n", Exit::Code(3)).as_deref(),
            Some("b\nc\nd\ne\nf")
        );
        assert_eq!(
            detail(b"  \n\n", Exit::Code(3)).as_deref(),
            Some("exit status 3")
        );
        assert_eq!(
            detail(b"", Exit::Code(137)).as_deref(),
            Some("exit status 137")
        );
        assert_eq!(
            detail(b"", Exit::Signal(9)).as_deref(),
            Some("terminated by signal 9")
        );
        assert_eq!(
            detail(b"", Exit::Unknown).as_deref(),
            Some("exit status unknown")
        );
        // Control characters are not passed on, and invalid UTF-8 does not fail.
        assert_eq!(
            detail(b"bad \x1b[31mred\x1b[0m\r\xff", Exit::Code(1)).as_deref(),
            Some("bad  [31mred [0m \u{fffd}")
        );
    }

    #[test]
    fn a_provider_message_beats_stderr_and_both_are_bounded() {
        let long = "é".repeat(5_000);
        let failed = claude(&[&format!(
            r#"{{"type":"result","is_error":true,"result":"{long}"}}"#
        )]);
        match settle(&ended(&failed, b"stderr", Exit::Code(1), false, false)) {
            Final::Failed {
                detail: Some(detail),
                ..
            } => {
                assert_eq!(detail.chars().count(), MAX_DETAIL_CHARS);
                assert!(detail.starts_with('é'));
            }
            other => panic!("{other:?}"),
        }
        let silent = claude(&[]);
        let noisy = format!("{}\nlast line", "x".repeat(5_000));
        match settle(&ended(
            &silent,
            noisy.as_bytes(),
            Exit::Code(1),
            false,
            false,
        )) {
            Final::Failed {
                detail: Some(detail),
                ..
            } => {
                assert!(detail.chars().count() <= MAX_DETAIL_CHARS);
                assert!(detail.ends_with("last line"), "the tail is kept");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_long_reply_is_cut_and_marked() {
        let text = "ż".repeat(MAX_REPLY_CHARS + 10);
        let long = claude(&[&format!(
            r#"{{"type":"result","is_error":false,"result":"{text}"}}"#
        )]);
        match settle(&ended(&long, b"", Exit::Code(0), false, false)) {
            Final::Succeeded { reply, truncated } => {
                assert!(truncated);
                assert_eq!(reply.chars().count(), MAX_REPLY_CHARS);
            }
            other => panic!("{other:?}"),
        }
    }
}
