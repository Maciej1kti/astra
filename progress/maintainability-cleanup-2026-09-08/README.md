# Maintainability cleanup

The owner requested a published safety checkpoint, then local repository cleanup
and implementation of the maintainability review's useful improvements.
Checkpoint `2a5530a8bb83eec0c3f6f289cac8587aa9d66898` was committed and pushed to
`origin/main` before cleanup. The following changes were local and uncommitted
when this task completed; see [current state](../STATE.md) for the later checkpoint.
The owner explicitly deferred the project license decision.

## Repository and documentation

- Removed 433 tracked historical/generated files, totaling 31,302,513 bytes:
  428 progress artifacts plus the original kickoff, generated master specification,
  stale source checksum manifest and two pre-implementation package reports.
- Historical screenshots, logs and one-off probes remain available in the
  published checkpoint. Markdown evidence links now reference that immutable
  source. Direct delivery evidence and compact benchmark/metric summaries remain
  local. Acceptance results, requirements and source schemas were preserved.
- Added contributor and security-reporting guidance, a documentation index and
  an evidence-retention guide. README introduces Astra while retaining the existing
  binary names. START_HERE no longer instructs contributors to scaffold an already
  implemented application. AGENTS and the release checklist are current English
  guidance, with unresolved scope and publication decisions explicit.
- Consolidated specifications now generate into ignored `test-results/docs/`.
  Routine new logs/screenshots remain ignored; this record retains a compact
  [descriptive summary](summary.json).

## Code ownership and types

- Calendar and Gantt use `PlanningRead` for request ownership, cancellation,
  gesture deferral and late-response suppression. Each view keeps its pagination
  policy. Gantt activity uses instance context instead of global window events.
- Calendar event and Gantt task adapters own vendor-specific projection mapping.
  Typed Gantt tasks retain their domain row without erasing it through `ITask`
  assertions. Domain schedules and milestone deadlines remain unchanged.
- `tagReview` owns preview, catalog writes, per-card command identities, partial
  completion and session handling. TagManager owns rendering, filtering, focus,
  draft-close confirmation and clipboard feedback. Its script decreased from
  364 to 92 lines; the responsibility moved to a feature owner rather than being
  removed or hidden in a universal framework.
- Named planning/tag endpoints use generated request/response types; App uses
  existing typed resource endpoints. Resource is now an explicit union of
  generated resource models. Negative compile-time examples protect endpoint
  payload/response distinctions.
- Mutation preparation has named create, patch/undo, placement and report-reference
  steps. Journal owns command target lookup and committed-result warning updates.
  Writer validation, reference/version checks, lock order and durability sequencing
  remain authoritative.
- Command states and workflow kinds are enums with the original stored spellings.
  Compatibility tests compare saved plan JSON and command digests against the
  previous representation. There is no source or operational database migration.
- Removed the generic `AppError::State` variant. Failures identify poisoned locks,
  unavailable subsystems, violated invariants or invalid stored values with their
  cause and a static operation label. Public errors remain sanitized. Accepted-job
  execution and committed-write warning failures keep their original semantics.
- Added a frontend import-boundary check. It found and removed a shared-summary
  dependency on card feature code; acceptance progress now belongs to shared
  resource presentation. The checker directly declares its existing pinned
  TypeScript dependency. No dependency version was upgraded.

## Verification

The final local gate (`.venv-check/bin/python scripts/check.py`) passed:
122 Rust tests, 68 JavaScript tests, 12 Python tests, generated contracts,
OpenAPI/examples/traceability, TypeScript/Svelte with no diagnostics, import
boundaries, formatting, Clippy and production/release builds.

New behavioral tests cover superseded reads even when abort is ignored, a scope
change during a gesture, coalesced refresh, unmount, inclusive/exclusive date
translation and forecasts preserving source data. New backend tests cover saved
workflow representation/digests and useful errors for corrupt operational plans.

Final verification also passed:

- `ASTRA_TEST_PROFILE=release npm run test:browser`: HTTPS/CLI smoke, planning
  widgets and all seven maintained regression suites (card, tags, editor, dialogs,
  planning, code-health and protocol). No suite failed.
- `.venv-check/bin/python scripts/package.py`, then
  `.venv-check/bin/python scripts/release-smoke.py dist/local-projects-0.1.0-darwin-arm64.tar.gz`:
  checksum, repeat installation into paths with spaces, no auto-start, packaged
  daemon/CLI, clean restart, stopped-copy recovery, index rebuild and rejection of
  old command epochs.
- `.venv-check/bin/python scripts/check_package.py`: documentation links, contract
  examples and delivery traceability remain valid after artifact removal.
- `git diff --check`: clean.

Detailed output is under ignored `test-results/cleanup/`: `final-gate.txt`,
`browser-final.txt`, `package.txt`, `release-smoke.txt` and
`documentation-final.txt`. Tests ran on the available macOS ARM64 host with the
pinned toolchains; browser coverage uses Chromium with synthetic fixtures.

## Deliberate limits

This cleanup preserves the five-crate architecture and current transport protocol.
The dispatcher and App remain recognizable composition points. Additional
endpoint migrations or subsystem splits should accompany concrete feature work;
there is no artificial line-count target, new global state store or generic
workflow/CRUD framework. Dynamic patch/extension JSON and private durability
fixtures remain intentional.

Licensing and the supported-release security-reporting channel remain owner
decisions. Historical requirement chapters stay until their unresolved acceptance
obligations can be retired. This change does not establish physical iPhone/Safari,
Arch/ext4, physical power-loss, login-start or final release acceptance. No service
was deployed and no cleanup changes were pushed.
