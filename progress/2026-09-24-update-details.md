# Update details and Focus decision navigation — 2026-09-24

Existing Updates are append-only records, but their modal reused the creation
form with disabled fields and an edit label. The modal now renders saved body,
author, kind, time, target, evidence and report references as readable content.
Read/unread remains an active action; new reports still use the creation form.

Focus decision attention previously exposed only the report's subject as its
click target. The response now also exposes the source `report_id`; Focus opens
that report and groups separate reports about one subject separately. Card and
milestone attention still open their own resources. See [ADR-042](../docs/ADR-042-ATTENTION-REPORT-NAVIGATION.md).

The local automated gate passed: schemas, examples, OpenAPI, Python and JavaScript
checks, frontend type check, Rust tests and Clippy, bundle budget, and release
build. All 11 release Chromium regression suites passed, including new browser
checks for the Update modal, read state, Focus decision navigation and two
decisions about one project. Broad HTTPS smoke passed on retry after one Board
focus assertion failed without a code change; the planning browser test passed.
These runs use Chromium emulation, not a physical iPhone or Safari.

The verified release build was started on Linux and built and started on Mac
Mini with its existing Node 22 runtime. Both manual HTTPS endpoints returned
HTTP 200, and both daemons exposed `report_id` for the existing decision row in
Focus attention. Mac Mini's web and Rust release builds passed. Both working
trees were clean at deployment.
