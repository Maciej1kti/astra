# Cards-only List

List now reads and displays cards only. Removed its Cards/Milestones selector,
collection routing/state and milestone pagination branch. Legacy
`collection=milestones` links resolve to cards and discard milestone status
filters, including `achieved`. Card search, filters, archived cards and pagination
remain available. The mobile project selector spans the toolbar row.

This is a List UI change. Milestone source data, APIs, planning views and report
targets remain supported.

Verification on the release build:

- Editor E2E: 14/14; responsive: 35 checks across all seven views; request-scope:
  5 checks; stale pagination: all five paged views. Legacy links read only cards,
  reload correctly and retain card creation in List and planning views.
- The first editor run failed two outdated empty-state text assertions.
  Updated them to the card-specific copy and reran the full editor suite.
- Reviewed the running dev app in Chromium at 1440 × 1000, 390 × 844,
  320 × 740 and 844 × 390. Legacy links, filter reload, card opening and page
  overflow checks pass. No browser exceptions were observed.
- Frontend types/contracts, formatting, boundaries, bundle, package checks and
  `git diff --check` pass. Web assets and the release daemon were rebuilt, then
  the existing dev launcher was restarted with its prior configuration.

Reproduce the relevant E2E with:

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs editor responsive code-health protocol
```

Evidence is in ignored `test-results/list-cards-2026-09-25/`, including the
initial run and editor rerun. Existing unit expectations for the removed selector
were adjusted; no unit tests were added or run, following the owner's direction.
This is Chromium emulation, not physical-phone or Safari acceptance. The full
release gate was not run.
