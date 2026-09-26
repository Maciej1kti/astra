# Project planning data

This directory is the source of truth for project work, milestones and dates.
`project.json` contains the project's stable ID and context. `cards/<uuid>.json`
describes a card work item, `milestones/<uuid>.json` a milestone, and
`updates/<uuid>.json` an immutable report. `.local/` contains runtime files only.

Every source uses the same UTF-8 JSON envelope: `type`, `metadata`, `body`.
Metadata follows the per-kind schema; `body` and comment bodies contain Markdown
strings. IDs, dates, comments and checklist items are structured values. Duplicate
keys, unknown fields and mismatched types/filenames are rejected. Names and IDs
are stable; descriptions never encode status or deadlines. Files use canonical
JSON with two-space indentation and LF. BOM/CRLF normalization remains explicit.

Normal edits go through `projectctl` and the local server. Read a resource and its
version before editing. A conflict requires reconciling intent, not fetching a
new version just to overwrite it. A timeout is an uncertain result: inspect the
original request ID instead of submitting a new command.

Card schedule start/end dates are inclusive and are the only card planning
dates. Milestones may have a separate date, without a deadline type. All-day
dates are independent of the phone's timezone. Reading a decision report does not resolve it.

Keep detailed agent plans and transcripts outside this directory. Add reports
only for meaningful outcomes, blockers or decisions. Corrections and resolutions
reference earlier reports instead of rewriting history. Explicit deletion uses
`projectctl report delete <id> --if-version <version>`; reports that reference it
must be removed first. Deletion cannot be undone.

Back up this directory even when Git ignores it. Never restore source content
from a stale search index. Report invalid or unsupported data instead of silently
reinitializing or rewriting it.
