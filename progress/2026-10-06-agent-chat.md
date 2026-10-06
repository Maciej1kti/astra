# In-app agent — 2026-10-06

The owner asked for an Agent button that opens a chat backed by Claude Code or
Codex, with full access for now, showing only the message and the final answer
([scope](SCOPE.md#in-app-agent--owner-direction-2026-10-06)).
[ADR-070](../docs/ADR-070-AGENT-RUNS.md) records the design.

## What changed

- `projectd` started with `--agent-dir` starts the selected provider for one
  chat message in that directory, supervises its process group with a time
  limit and cancellation, and keeps only the final answer. Without the option
  nothing changes: no button, and every agent route answers `AGENT_DISABLED`.
- The agent's instructions are [`agent/AGENTS.md`](../agent/AGENTS.md). Each
  message carries a context block with the workspace date, the profile, the
  open view and the registered projects.
- Five operations start, read and cancel runs. The browser's run ID and the
  daemon's boot ID make a repeated request harmless, including after the
  registry has dropped the run or the daemon has restarted.
- The browser gains the floating Agent button, a retained chat dialog and the
  provider choice in Settings. The dialog retries an unconfirmed send with the
  same identity, restores a conversation after a reload and reports a restarted
  host instead of guessing the outcome.
- The all-projects Board view now loads on demand, which keeps the initial
  bundle inside its budget (80,523 of 81,920 bytes).

## Verification

- `scripts/check.py`: all 16 steps pass on the branch rebased on `5b9fc80`,
  including 524 Node tests and the Rust workspace (233 application, 69
  `projectd` unit, 54 transport and 4 lifecycle tests among them).
- The transport tests drive both provider formats through a test double:
  disabled host, status, a run to each final state, identical and concurrent
  retries starting one process, a stale boot ID, a forgotten run ID,
  resume with the provider's session, limits, cancellation with the process
  group gone, the time limit, profile separation, the three refused
  preconditions, and shutdown ending a child.
- Chromium, release daemon, disposable hosts: the complete `npm run
  test:browser` chain passes, 41 suites. The new `agent` suite has 25 checks,
  among them the button in all eight views at five widths without covering
  content, keyboard-only use, safe Markdown, each final state, a lost response
  retried into one run, an unreachable host, and a reload during a run.
- WebKit: `agent` passed before the last rebase onto main; it was not repeated
  afterwards.
- Real providers, release daemon, temporary host with a synthetic project,
  Claude Code 2.1.291 and Codex 0.160.0: four turns ("zrobiłem 10 pompek",
  "dorzuć jeszcze 5", a comment on another card, seven more push-ups after
  switching the provider). The counter read 10, 15 and 22 and the comment was
  attributed to the agent; each turn took 10 to 16 seconds. The check was
  repeated against the final build.
- An independent review of the daemon code found a forged delimiter reaching
  the context block through a project name and a second start after the
  registry forgot a run. Both have regressions and are fixed.

## Limits

Runs and conversations live in memory and are lost when the daemon restarts. A
daemon killed outright leaves agent processes running. Any paired browser can
instruct the agent with the daemon user's rights, and `AGENTS.md` is guidance,
not enforcement; see [limitations](../docs/LIMITATIONS.md). The lost-turn,
stale boot ID, unavailable-provider and session-loss states of the dialog are
covered by unit tests and the transport tests, not by a browser check against
a restarted daemon. No physical iPhone was used. The owner's projects were not
touched by any check.
