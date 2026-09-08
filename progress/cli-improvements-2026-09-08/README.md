# CLI confirmation and everyday workflows

Date: 2026-09-08. Scope: CLI behavior, its documentation and regression coverage
on the current working tree over `2a5530a8bb83eec0c3f6f289cac8587aa9d66898`.
Earlier local cleanup changes remain present. No commit, push or deployment was
performed by this task. Application data was exercised only in synthetic fixtures.

## Selected priorities

The [fresh audit](../fresh-quality-audit-2026-09-08/README.md) found a sound shared
engine and a concrete CLI confirmation defect. Strengthening that boundary and
exposing existing server capabilities gives future users and contributors a
useful interface without introducing another owner of business rules.

Importance follows the audit's 1–5 scale: 4 before broader feature expansion,
3 planned maintainability/functionality work, 2 local usability improvements.

| Change | Importance | Risk addressed | Change risk |
| --- | ---: | --- | --- |
| Validate confirmations and retain original command identity | 4 | Automation could report success for an unproven write or follow another command | Medium: deliberately stricter responses and uncertainty exits |
| Separate query, action, command, workflow and status semantics | 3 | New commands could acquire the wrong retry or confirmation behavior | Medium: explicit constructors with regressions for existing operations |
| Named search/views/jobs and conditional editing/undo | 3 | Common CLI workflows required manual URLs and JSON plumbing | Low–medium: translates to existing server endpoints |
| Bounded stdin, optional text output, socket environment and guide | 2 | Temporary-file overhead and poor discoverability for people and scripts | Low: JSON remains the default and explicit socket wins |

## Resulting behavior and ownership

- Source commands require valid committed/no-op confirmations or valid pending
  status; workflows require acceptance or pending status. HTTP success alone is
  insufficient. Unknown or mismatched confirmations retain the submitted ID/epoch.
- Pending status can carry the journal's planned result without becoming success.
  Durable HTTP 5xx and failed status lookups remain `RESULT_UNCERTAIN`, exit 9.
  Valid server diagnostics remain under `error.details.server_error`.
- Search, board, Gantt, calendar, attention and job reads have named commands and
  bounded pages. Project scope comes only from the explicitly selected folder.
- Cards and milestones accept full JSON creation and shorthand title/status/body
  edits. Cards gain schedule set/clear; both resource kinds gain conditional undo.
  All edits retain observed versions and unchanged retry identity/payload.
- Input accepts a file or `-` with a 1.1 MB bound. `ASTRA_SOCKET` is explicit shell
  configuration; `--socket` overrides it. Optional text retains IDs, full versions,
  cursors, warnings and unknown metadata while escaping terminal controls.

Arguments, input/project resolution, named queries, transport confirmation and
presentation have distinct modules under `crates/projectctl/src`. There are no new
dependencies, server endpoints, storage formats or migrations. Domain validation
and write durability remain server-owned. See [the CLI guide](../../CLI.md),
[ADR-032](../../docs/ADR-032-EXPLICIT-CLI-OPERATIONS.md) and the
[uncertain-result example](../../examples/cli-uncertain-output.json).

Compatibility is intentional: existing named invocations, generic API access and
default JSON remain available. Scripts must treat exit 9 as unresolved/pending;
invalid confirmations previously accepted as success and durable server errors
previously returning exit 8 are now classified conservatively. Text layout is
presentation, not a stable parser interface.

## Verification

Host: macOS ARM64, Cargo 1.92.0, Node 24.11.0, Python 3.14.6. Raw logs are ignored
under `test-results/cli-improvements-2026-09-08/`.

- Three malformed-success regressions failed before the confirmation fix.
  Four further regressions failed before the planned-result and server-error
  corrections. Evidence: `responses-before.txt` and `review-regressions-before.txt`.
- The CLI now has 44 passing tests, including process-level Unix HTTP fixtures
  that inspect exact outgoing payloads, versions, identities, URL encoding and
  absence of implicit re-fetching. Pending/rejected/error outcomes, input bounds,
  argument conflicts, terminal controls and environment precedence are covered.
- `.venv-check/bin/python scripts/check.py` passed: **158 Rust, 68 JavaScript and
  12 Python tests**, contracts and examples, frontend typing and boundaries,
  formatting, Clippy with denied warnings, asset checks and release builds.
  Evidence: `full-gate.log`.
- Release binaries passed an isolated real-daemon smoke: registration/job lookup,
  rich stdin create, field edit with unrelated-field preservation, stale-version
  rejection, schedule set/clear/undo, search and all four views, original command
  status, terminal output, legacy JSON and server-side date validation.
  Command: `ASTRA_TEST_PROFILE=release node test-results/cli-improvements-2026-09-08/daemon-smoke.mjs`.
  Evidence: `daemon-smoke-release.log` and `daemon-smoke.json`; the one-off runner
  is stored with ignored evidence. Maintained CLI regressions live in the crate.
- `ASTRA_TEST_PROFILE=release npm run test:browser` passed the HTTPS/CLI smoke,
  planning workflow tests and all seven regression suites: card, tags, editor,
  dialogs, planning, code-health and protocol. Evidence: `browser.log`; browser
  artifacts are under `test-results/browser/`. These use ordinary daemon/auth
  flows with isolated sources and state, not existing user projects.

## Remaining scope

This does not claim full UI/CLI feature parity. Streaming watch, automatic
pagination, dedicated preferences/receipt/project-edit aliases and transactional
batch mutation remain outside this change; supported advanced operations still
use generic API access. Browser-local appearance settings are not server data.
The other audit findings remain separately scoped work. This run does not establish
remote CI, physical-device, Linux-host or power-loss acceptance.
