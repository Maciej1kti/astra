# ADR-033 — Explicit ownership of command outcomes, saved plans and navigation

Status: accepted for the owner-authorized audit fixes, 2026-09-08.

The fresh audit identified places where one rule had several owners: command
records were assembled by different write families, workflow execution depended
on preview JSON, and browser dialogs handled submission and status lookup
differently. These are maintained as explicit boundaries while retaining the
existing storage and HTTP contracts.

## Command outcomes and records

Journal owns command-row insertion, state transitions and status reply selection.
Small operations accept the caller's transaction or connection; they neither
acquire another lock nor commit the transaction. Source, workspace, receipt and
workflow code retain their distinct prepare/write/commit sequences. Saved target
labels, digests, result/error slots and seven-day result retention stay compatible.

Rejected replies are read from `error_json`, so command-status now returns the
original rejection code and request identity. Pending rows can contain a planned
result, but only their outer state establishes the outcome. The existing
CommandStatus schema already describes these fields; see the
[rejected-status example](../examples/command-status-rejected.json).

Each browser edit feature handles an outcome through the same path after send,
retry and status lookup. Known conflict codes are meaningful even when status
lookup cannot reproduce the original HTTP status. A conflict preserves the draft
and invalidates the stale proposal before an optional current-resource read.
Failure of that read cannot re-enable the stale edit. A failed lookup still does
not establish rejection or authorize a new command identity.

## Saved workflow inputs

PlanLocation and ApprovedRoot expose typed execution inputs. Preview fields are
private data converted explicitly for presentation. The serializer retains the
legacy `view`, `display_path`, `previous_path` and `approved_root` fields, including
valid extensions. Execution and restart recovery never recover a path by indexing
presentation JSON. Valid older saved plans and command digests require no migration;
malformed required inputs fail with a stored-data error before use.

## Operational failure reporting

Continued operations and uncertain recovery now emit bounded stderr records with
an operation stage, error category, available IO/SQLite code and valid project or
request identifiers. Raw error messages and sources are intentionally excluded:
they can contain local paths, document content or credentials. The reporter cannot
panic on a closed stderr or replace a durable outcome. Watcher workers distinguish
an application error from a failed blocking task. The diagnostics HTTP contract
remains unchanged.

## Projections after durable maintenance

A completed maintenance job retains its recorded Accepted reply even if later
projection work fails. Previous store handles are released independently of that
work. An in-memory queue retries failed projects from the current workspace, with
at most 16 due entries per batch and a 30-second delay after failure. It refreshes
registered projects and removes unregistered projects, including the last project
in an empty workspace. Successful repairs leave the queue; startup reconciliation
recovers its work after restart.

Until a repair succeeds, views can retain stale projections. Retry never rewrites
source documents or repeats the maintenance command. IndexRebuild is different:
the index refresh is the requested job work and must succeed before the job is
marked done. A failed rebuild remains recoverable through the existing workflow.

## Browser ownership and timeline inputs

Focus, project overview, resource list, updates and the workspace board overview
own their markup and selectors. App composes them and coordinates sessions, dialogs
and data refresh. Navigation exposes read-only route state and named actions;
its resource-read generation is private. View/project changes, draft creation
and reset cancel obsolete resource reads, including interrupted history restoration.

Timeline analysis accepts typed ID, schedule, dependencies and reliability inputs.
The application converts its indexed snapshot at the boundary. A malformed
dependency or schedule shape is reported instead of being silently interpreted as
missing data. The domain retains date, cycle, missing-predecessor and forecast
rules; it no longer interprets an internal magic JSON field. Public Gantt output
and source schedules remain unchanged for valid inputs.

## Browser verification runtime

Regression suites receive an explicitly selected synthetic runtime. Shared host,
CLI, pairing and browser lifecycle helpers own startup and teardown, including
setup, assertion and report failures. Ordinary CLI checks require exit zero and
a successful envelope; registration explicitly permits the documented accepted
workflow exit with its job identity. Each suite keeps its own assertions,
screenshots, context options and test data. The broad smoke suite remains a
separate scenario owner.

Compatibility and behavioral evidence are recorded with the
[audit implementation](../progress/audit-fixes-2026-09-08/README.md).
