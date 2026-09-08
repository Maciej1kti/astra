# ADR-032 — Explicit CLI operations and compatible terminal ergonomics

Status: accepted for the owner-authorized CLI improvements, 2026-09-08.

The CLI already exposes the shared server engine, but a generic HTTP-method-based
classification conflated source commands, workflow submissions, queries and
session actions. Successful HTTP status plus arbitrary JSON could be reported
as a successful write without a valid confirmation.

Named requests now select their operation semantics explicitly. Durable source
commands require their documented confirmation or unresolved status; workflows
require acceptance or unresolved status. Confirmation identity must match the
submitted request. A missing or invalid reply retains the original ID/epoch and
exit 9. Command-status reads preserve that pair as well. Pending status may
contain a planned result without becoming committed. Non-journaled authentication
actions and plan preparation do not acquire fictitious recovery identities.
HTTP 5xx responses to durable operations also retain uncertainty because an error
may follow durable completion. Failed command-status lookups cannot establish the
original outcome. Both return `RESULT_UNCERTAIN` with exit 9 and preserve the
server's original error in `error.details.server_error` and its HTTP status.
Definitive command rejections and ordinary read/action errors retain their exits.
Generic API access remains available and classifies the supported exceptional
routes centrally. There is no new server endpoint or source/storage format.

The JSON envelope remains the default and the scripting contract. Readable text
is opt-in with `--output text`; it retains versions, identity, cursors and warnings
and escapes source control characters. `--socket` may appear at any command
level and takes precedence over explicit `ASTRA_SOCKET` configuration. No default
instance or project discovery is introduced.

Named search/planning/job reads and card schedule/undo/field edits translate to
existing server requests. Full create input and bounded stdin support remove the
need for temporary files. Mixed JSON/flag edits are rejected instead of choosing
an implicit merge order. Edits still require the observed version and never
refetch it automatically. Server-side validation and durable write rules remain
the authority; the CLI adds no independent business-rule implementation.

The unchanged JSON schema remains normative for JSON output. Its description
identifies the optional presentation mode. Examples and the maintained CLI guide
describe the new invocations; regression tests exercise real CLI processes and
outgoing Unix HTTP requests. Response-validation regressions begin with malformed
successes that previously exited 0. The
[uncertain-result example](../examples/cli-uncertain-output.json) is validated
against the CLI output schema by the package check.
