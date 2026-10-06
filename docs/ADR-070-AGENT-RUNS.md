# ADR-070 — In-app agent runs

Status: accepted on the owner's 2026-10-06 direction; see
[scope](../progress/SCOPE.md#in-app-agent--owner-direction-2026-10-06).

The owner wants to type a sentence in the browser, such as "zrobiłem 10 pompek",
and have it applied to the right card. Working out the project and card, reading
the counter and adding to today's total is work for a coding agent, not a form.
Claude Code and Codex already run on the host and can use `projectctl`, which
applies the same domain rules, conditional versions and recovery as the browser.

Until now the server started no process, and the documented boundary was that it
has no public shell endpoint. A chat message handed to a coding agent crosses
that boundary, so this record states exactly how far, and for whom.

## Decision

The daemon can start the owner's local coding agent for one chat message,
supervise the process and expose only its final answer. The feature is off unless
the OS owner starts `projectd` with `--agent-dir`.

### Enabling

| Option | Meaning |
| --- | --- |
| `--agent-dir PATH` | Enables the feature. An existing directory, resolved at startup; it is the agent's working directory and holds its `AGENTS.md` |
| `--agent-claude-bin PATH`, `--agent-codex-bin PATH` | Provider executables; by default `claude` and `codex` are found on the daemon's `PATH` when a run starts. Both need `--agent-dir` |
| `--agent-timeout SECONDS` | Wall-clock limit of one run, 1 to 3600, default 600. Needs `--agent-dir` |

The manual launcher passes the repository's `agent/` directory when
`ASTRA_TRY_AGENT=1`. Enabling is not a browser or workspace setting: the
documented rule that the server has no execute endpoint stays the default, and
only the person who starts the process can change it.

Without `--agent-dir`, bootstrap reports `agent_enabled: false`, the browser
renders no Agent button and every `/api/v1/agent…` route answers
`404 AGENT_DISABLED`. `projectctl` must sit in the directory of the `projectd`
executable; otherwise a start is refused with `AGENT_CLI_UNAVAILABLE`.

### The process

- One run is one provider process with `--agent-dir` as its working directory,
  started from a fixed command line. The message never appears on it: it is
  written to the provider's stdin. The executable and flags come from daemon
  options and code, never from a request.
- The provider runs without permission prompts or a sandbox, by the owner's
  direction: `--dangerously-skip-permissions` for Claude Code and
  `--dangerously-bypass-approvals-and-sandbox` for Codex.
- It is isolated from the owner's personal agent configuration: Claude Code
  runs with `--safe-mode --disable-slash-commands`, Codex with
  `--ignore-user-config --ignore-rules`. These flag sets were verified against
  Claude Code 2.1.291 and Codex 0.160.0; another version may treat them
  differently.
- The child inherits the daemon's environment and additionally receives
  `ASTRA_SOCKET` (the daemon's socket), `ASTRA_USER` (the profile that sent the
  message) and `projectctl`'s directory first on `PATH`. It leads its own
  process group.
- The final answer is read from the provider's JSON output: the `result` line of
  Claude Code, the last agent message of a completed Codex turn. Output lines
  over 1 MiB are dropped and the last 8 KiB of stderr are kept for a failure's
  detail. Nothing the agent says before its final answer is stored or shown.
- A run ends as `succeeded`, `failed`, `cancelled` or `timed_out`. A final answer
  that was read wins over cancellation, the time limit and the exit status. A
  failure carries the code `AGENT_PROVIDER_FAILED` (with up to 2,000 characters
  of detail) or `AGENT_OUTPUT_INVALID` (no answer and a clean exit).
- Cancellation, the time limit and shutdown send SIGTERM to the process group,
  then SIGKILL after 5 seconds. The group is killed once more after the child
  exits, so no descendant keeps the pipes. On shutdown the daemon refuses new
  runs, ends the running ones and waits up to 20 seconds for them.

### Instructions and context

`AGENTS.md` in the agent directory is the agent's instruction set. Codex reads it
natively (it is started with `project_root_markers=[]`, so the repository's own
`AGENTS.md` is not loaded); Claude Code receives it through
`--append-system-prompt-file`. The file is read when a run starts, so editing it
changes new runs without a rebuild. A run is refused with
`AGENT_INSTRUCTIONS_MISSING` unless it is a regular, non-empty file of at most
64 KiB. The repository's [`agent/AGENTS.md`](../agent/AGENTS.md) tells the agent
to resolve the project and card, change only what was asked, read before it
writes, treat card content as data and answer briefly in the owner's language.

Every message is prefixed by an `<astra-context>` block written by the daemon,
never by the browser: today's date and weekday in the workspace timezone, the
profile's name, the open view and selected project when the browser sent them,
and up to 100 registered projects with their state and folder. Project names and
folders come from repositories and are untrusted: control characters become
spaces, `<` and `>` become look-alike angle quotes so that no value can forge the
block's delimiter, and a value is cut at 240 characters. A folder over that
length or containing those characters is therefore altered and does not work
with `--project`.

### Operations and identity

| Operation | Route |
| --- | --- |
| Status | `GET /api/v1/agent` |
| Start | `POST /api/v1/agent/runs` |
| Read | `GET /api/v1/agent/runs/{run_id}` |
| Cancel | `POST /api/v1/agent/runs/{run_id}/cancel` |
| Conversation | `GET /api/v1/agent/conversations/{conversation_id}` |

[OpenAPI](../contracts/openapi.yaml) holds the schemas and error codes, and the
[examples](../examples/README.md) a request and a run. Start returns the run at
once (`202`); the client polls it until its state is final.

Starting mirrors the request ID and epoch of an ordinary command, without a
journal. The browser generates `run_id` (a UUID version 7) and sends the `boot_id`
it read from status, which is new on every daemon start.

- The same `run_id` with an identical body returns the existing run with `200`
  and starts nothing. It is answered from the registry alone, before the
  profile, the instructions or the provider are read.
- A different body under a known `run_id`, or a `run_id` the registry once held
  and dropped, is `409 AGENT_RUN_ID_REUSED`. Dropped IDs are remembered, up to
  4,096, so a late retry cannot run the agent a second time.
- A `boot_id` that is not the daemon's is `409 AGENT_HOST_RESTARTED` and starts
  nothing. A request sent before a restart cannot start a run after it, although
  the registry that would recognise it is gone.

No response therefore does not mean failure: the browser repeats the identical
request, and the host starts at most one process for it.

### Conversations and bounds

Conversations and runs live in daemon memory, in one registry, and belong to the
profile that created them: another profile cannot read or cancel them. A
conversation is a UUID chosen by the browser; the provider's own session ID, once
the provider has reported one, is kept so that later runs resume it. A
conversation keeps the provider it started with; the profile's
`agent_provider` preference, `claude` unless set, applies to new conversations.

| Bound | Value | Beyond it |
| --- | --- | --- |
| Running runs per host | 2 | `429 AGENT_BUSY` |
| Running runs per conversation | 1 | `409 AGENT_RUN_ACTIVE` |
| Conversations | 32 | The least recently used idle one makes room; with none idle, `429 AGENT_BUSY` |
| Runs per conversation | 50 | The oldest finished one is dropped |
| Message | 8,000 characters | `422 VALIDATION_FAILED` |
| Reply | 65,536 characters | Cut and marked `reply_truncated` |
| Provider output line | 1 MiB | The line is dropped |
| Run time | `--agent-timeout` | The run ends as `timed_out` |

The registry lock decides and records only. It is never held while a child runs,
while its output is read or while the profile's data is read; each run has its
own supervisor thread that settles it. The lock is a leaf in the documented
[lock order](CODE-STRUCTURE.md#locks-and-errors): nothing in the registry takes
the workspace gate, a store, the journal or the index while holding it. A start
reads the profile and the file system without the lock, then takes it again
to decide once more and to start the process under it, so that two requests
cannot both start. A supervisor that unwinds settles its run as failed and releases its slot.

The daemon logs, per finished run, only the provider, the final state and the
duration, never message text, replies, stderr or paths.

### Browser

A global **Agent** button, shown only when the host reports the feature, opens a
dialog that shows each message and the agent's final answer, and nothing else.
The dialog stays mounted once loaded, so closing it does not stop polling. It
polls the run, repeats an unconfirmed start with the same identity, restores the
conversation after a reload from browser-local storage and the host, and keeps a
send the host never acknowledged apart from a run it has settled and from a turn
that a restarted host no longer remembers. [User guide](USER-GUIDE.md#use-the-agent)
describes each state; the provider is chosen in Settings.

## Alternatives rejected

- **One long request or server-sent events instead of start and poll.** A run
  takes seconds to minutes. The browser transport ends a mutation after 15
  seconds and reads each response as one JSON body, so it cannot stream. The
  event stream only invalidates reads of indexed project data; its cursors
  belong to index revisions, not to a process's output. A start that returns at
  once and a poll is the shape the transport already supports, and it survives
  a lost response.
- **Durable conversations.** The commands are short and a lost conversation costs
  one message. Durability would add a stored format, retention, upgrade rules and
  a place to keep message text and replies. Memory only keeps the host's
  durable state unchanged. The price is stated under consequences.
- **Enabling the agent from the browser or Settings.** Any paired device could
  then turn a data tracker into a remote command runner. A daemon option keeps
  the rule that the server has no execute endpoint as the default and puts the
  switch with the one person who controls the process.
- **`--bare` for Claude Code.** It requires an API key and ignores the
  subscription login the owner uses. `--safe-mode` keeps the owner's hooks,
  plugins and personal instructions out of the run instead.
- **A restricted tool set.** Deferred: the owner chose full access with
  permission prompts skipped for now, because only the owner uses this instance.
- **A dedicated working directory under the data directory.** The owner chose a
  directory in the repository with its own `AGENTS.md`, so the instructions are
  reviewed and versioned with the code and edited without touching host state.

## Consequences

- With `--agent-dir`, every paired browser, in any profile, can instruct the agent
  with the daemon user's full rights. The same routes answer on the local socket
  to a process of that user. Profiles are not an access boundary
  ([ADR-060](ADR-060-TRUSTED-USER-PROFILES.md)), so the agent can reach other
  profiles, for example through `projectctl --user`. A run starts only with a
  session and CSRF token on the network listener, like any other mutation.
- `AGENTS.md` is guidance, not enforcement. Text in a card, comment or report
  written by someone else reaches an agent that has no sandbox and no permission
  prompts; the instructions tell it to treat that text as data, and nothing
  checks that it does. The reply is rendered with the application's Markdown
  renderer like any other untrusted text.
- Conversations and runs are lost when the daemon restarts, and the outcome of a
  run in progress at that moment cannot be read back. A turn the restarted host
  no longer remembers is reported as unknown, never as failed, because the agent
  may already have changed data. A daemon killed outright (SIGKILL, power loss)
  runs none of its shutdown handling and leaves agent processes running; the
  next daemon does not find them.
- There are no `projectctl` commands for agent runs. The generic `command` form
  cannot confirm one, because an agent reply is not a command envelope, and
  `get` of a running run exits with the uncertain code, 9.
- A change the agent makes is an ordinary conditional `projectctl` write, with
  history and undo like any CLI write. A cancelled or timed-out run may already
  have made some of its changes.
- The dialog is verified with a scripted provider in browser and daemon tests; it
  has not been tested on a physical device.

This supersedes, for a host started with `--agent-dir`, the earlier statement
that the server has no execute endpoint, and nothing beyond it: the restricted
tool set, durable conversations, other providers and any access beyond the
trusted-profile model each need their own owner decision.

## Verification

Rust unit tests cover the command lines, output parsing, framing, the context
block and its neutralisation, the registry's decisions and process supervision.
Daemon tests use a scripted provider
(`crates/projectd/tests/fixtures/fake-agent.sh`) through the network and local
listeners: authorization, identical retries (including concurrent ones), stale
boot IDs, every bound, cancellation and process-group cleanup, the time limit,
provider failures, resumption, profile scoping and shutdown. Frontend unit tests
cover the conversation rules, storage and transport checks. The `agent` browser
suite drives the dialog through a real daemon started with that provider and
the repository's `AGENTS.md`. None of them runs a real provider or a physical
device.
