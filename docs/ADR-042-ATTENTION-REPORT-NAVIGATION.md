# ADR-042 — Open decision reports from Focus attention

Date: 2026-09-24

## Decision

An unresolved `decision_needed` report appears in Focus attention. Its
`target` identifies the project, card or milestone the decision concerns; it is
not the report itself. The attention response now also includes `report_id` for
decision rows. Other attention rows omit it. Clicking a decision row opens the
source update record, while clicking a card or milestone signal still opens its
target.

The browser groups report signals by `report_id`, so two decisions about one
target remain separate, and a pinned card does not hide a report about it.
Existing reports remain append-only. Their detail modal presents the saved
content and metadata as a record rather than a disabled edit form; read receipts
remain actionable. A decision record offers Resolve decision, which opens a new
resolution draft with the decision ID and target prefilled. Saving that report
removes the decision from attention without changing the original report. The
optional response field is additive to API v1 and does not change stored project
data or command semantics.
