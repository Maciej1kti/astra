# ADR-050: Read recovery and command confirmation

Status: accepted implementation correction, 2026-09-29.

The repository audit reproduced failures that the successful-path browser suites
missed. Preserve the existing engine, durable writer and source ownership; correct
their read and client boundaries without adding another service or state model.

## Focus reads and membership writes

`GET /workspace/focus` now reads the disposable projection, ordered by workspace
rank then registration order, source position and ID. It returns at most 100
references with `page`, `warnings` and `complete`. Invalid/unavailable sources do
not fail healthy projects. Previously indexed pins remain visible; saved order
references without a projection row survive while their source is unavailable
or being reconciled. The UI shows an unavailable card when its detail cannot be
read. Stale, incomplete or overflowing membership disables reordering.

Source cards remain authoritative. New pin admission (including undo) takes the
exclusive workspace operation gate, checks unresolved project writes, then scans
strict sources before the normal writer prepares its durable intent. Concurrent
server commands across projects cannot both take the last slot. Unpinning and
ordinary edits remain possible when external source changes exceed 100 pins.
External writers on other hosts are outside this gate; their overflow is reported
on reads instead of making Focus unusable. Ordering still checks the exact source
membership and references. Fsync and prepare/write/commit ordering are unchanged.

## Pagination and validators

Date-only Focus pages depend on the workspace day. Timed Focus and attention
pages additionally depend on the latest qualifying event end already crossed.
An ordinary minute preserves cursors; midnight, an actual event expiry, source
changes and relevant read receipts invalidate them. Supersedes the minute-based
cursor scope in ADR-048. Browser paging already retries only explicit staleness.

Focus and enriched report reads carry conditional source `version` fields but
no strong ETag: card membership and report read receipts can change without
changing those source bytes. Ordinary source resources retain their ETags.
This follows the same separation already used for tag catalogs.

## Browser lifecycle and confirmation

The authenticated event stream starts independently of view read success.
Workspace/resync notifications and foreground recovery refresh shared timezone
and preferences, including open editors. A counter draft retains the explicit
date on which it started; a new draft uses the updated workspace day. Session
teardown invalidates outstanding bootstrap/preference publication.

A command confirmation must match API version, original request ID, reply kind,
result type and required envelope fields. Status replies validate both the outer
identity/state and embedded response/error. Malformed replies retain the same
pending command and uncertainty. The validator is a small transport boundary;
source document validation remains server-owned. No new command is manufactured
for a retry, and a failed status read never becomes a definitive rejection.

## Verification

Maintained regressions cover malformed confirmations, startup read failure,
cross-client counter dates, invalid/unavailable Focus sources and recovery,
cross-project concurrent pin admission/overflow, minute/event pagination and
HTTP representation validators. The audit evidence records initial failing
results and final gate/browser coverage. Platform acceptance remains separate.
