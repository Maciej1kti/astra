# Project planning data

This directory is the source of truth for project work, milestones and dates.
`project.md` contains the project's stable ID and context. `cards/<uuid>.md`
describes a card work item, `milestones/<uuid>.md` a milestone, and
`updates/<uuid>.md` an append-only report. `.local/` contains runtime files only.

Documents use UTF-8, restricted YAML front matter and Markdown bodies. Names and
IDs are stable; the body does not encode status or deadlines. Anchors, aliases,
duplicate keys and custom tags are forbidden. Comments require an explicit
normalization preview and backup before rewriting a header.

Normal edits go through `projectctl` and the local server. Read a resource and its
version before editing. A conflict requires reconciling intent, not fetching a
new version just to overwrite it. A timeout is an uncertain result: inspect the
original request ID instead of submitting a new command.

Card schedule start/end dates are inclusive and are the only card planning
dates. Milestones may have a separate date, without a deadline type. All-day
dates are independent of the phone's timezone. Reading a decision report does not resolve it.

Keep detailed agent plans and transcripts outside this directory. Add reports
only for meaningful outcomes, blockers or decisions. Corrections and resolutions
reference earlier reports instead of rewriting history.

Back up this directory even when Git ignores it. Never restore source content
from a stale search index. Report invalid or unsupported data instead of silently
reinitializing or rewriting it.
