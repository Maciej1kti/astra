# Report deletion API and CLI — 2026-09-26

Added `DELETE /api/v1/projects/{project_id}/updates/{update_id}` and
`projectctl --project <folder> report delete <id> --if-version <version>`.
Both require the observed version and an empty payload, with ordinary durable
command identity/replay. Report contents remain immutable. Incoming `supersedes`
or `resolves` references return `409 REPORT_REFERENCED` with the referring ID;
remove those reports first. No cascade or Undo is introduced.

Cards and reports share source-deletion orchestration, the existing journal,
fsync/unlink sequence and projection repair. Guards read source data before
preparation, before unlink and during startup recovery. A new external report
reference prevents recovery from silently removing the target. See
[ADR-047](../docs/ADR-047-REPORT-DELETION.md).

Verification on macOS ARM64, release daemon and Chromium:

- Full local gate passes: schemas/OpenAPI/examples, frontend and Rust tests,
  formatting, Clippy and embedded frontend/release builds.
- Application tests cover missing/stale versions, invalid payloads, immutable
  rejection, correction/resolution blockers, reverse dependency deletion order,
  projection removal, repeated commands, restart and changed-payload rejection.
  Recovery tests cover an external reference created after preparation.
- Subprocess crash tests now exercise both card and report deletion at Prepared,
  Unlinked, DirectorySynced and Committed, preserving replay without resurrection.
- Real transport tests cover report deletion/replay/status over Unix and browser
  pairing/CSRF requirements. CLI tests assert exact method, payload, path, version,
  request ID and epoch without a refetch-and-overwrite.
- The release browser deletion suite passes, including a new end-to-end report
  case: typed CLI deletion removes JSON and refreshes Updates through normal
  invalidation, remaining absent after reload. Existing card/project cases pass.
- Rebuilt and restarted the existing manual app at its unchanged HTTPS address.
  HTTPS/assets return 200; all 9 live card/project source documents remain byte
  identical, both projects validate and both Updates collections remain empty.
  Pairing, workspace, command epoch and instance identity are retained.

Evidence: ignored `test-results/report-deletion/`. No test report was added to
live projects, preserving the owner's freshly cleared Updates. Existing owner
changes to project/card JSON are excluded from this commit. No new report-delete
button is claimed; this change provides the requested API and typed CLI.
