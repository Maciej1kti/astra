# One card section order

Date: 2026-09-30. Follow-up to the owner's request to remove the Content/Properties
split. Baseline: `8bd35b9`.

Description, Checklist, Counters, Comments, Schedule and Labels now share one
ordered list and one keyed body flow. Any section can move past any other section
without remounting its controls. The modal uses an 800px reading width, consistent
dividers and its existing phone/full-screen behavior. Expanded date/time fields
retain their responsive grid; collapsed schedules retain the relative-time row.
The final history item no longer duplicates the following section's divider.

Browser preferences use a sanitized flat order. Existing grouped preferences
upgrade in their prior reading order; only section identifiers are stored.
Reordering retains explicit drafts, schedule expansion, keyboard focus, position
announcements, FLIP motion and reduced-motion behavior. It does not write card
source or workspace preferences. No protocol/source-format change was needed.

Verification on macOS arm64, Node 24.11, release builds:

- Full local gate: 251 Rust, 126 JavaScript and 12 Python tests; schemas,
  generated contracts, Svelte, boundaries, format, Clippy and bundle checks pass.
- Eight release Chromium suites pass: `card-layout`, `editor-inputs`,
  `editor-header`, `card-calendar`, `card`, `counters`, `comments`, `tags`.
- Four release WebKit suites pass: `card-layout`, `editor-inputs`,
  `editor-header`, `card-calendar`.
- Layout coverage moves Schedule from last to first and Labels between former
  content sections, preserves mounted drafts/disclosure state, checks reload,
  reset, the legacy preference and unchanged card versions. Visual and DOM
  order match at 1440, 1024, 768, 390 and 320px, plus 844 × 390 landscape.
- Reviewed default and mixed layouts, light/dark appearance, shared controls
  and reduced motion in the real release frontend with synthetic source data.

The initial Chromium layout check sampled geometry during modal entrance; it now
waits for a stable, scrolled-into-view control before measuring the 44px target.
The comments test also used an obsolete `.resource-metadata` selector for Focus;
it now opens the card by its visible title and still verifies count/history,
uncertain retries and conflicts. The corrected suites pass. After the final
divider refinement, the full gate, Chromium layout/comments, WebKit layout and
visual review were repeated successfully.

The existing manual application was rebuilt and restarted at
`https://100.122.250.14:47832`. Trusted-certificate HTTPS checks verify all 33
served build assets byte-for-byte. All 31 pre-existing resource versions, two
pins, workspace preferences and certificate match the pre-restart snapshot.

Commands and artifacts: `.venv-check/bin/python scripts/check.py`;
`ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs <suites>`;
WebKit uses `ASTRA_TEST_BROWSER=webkit`. Logs, screenshots and restart snapshots
are under ignored `test-results/unified-card-layout/`. Browser emulation is not
physical phone/tablet acceptance; full release acceptance remains open.
