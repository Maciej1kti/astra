# E026 — Gantt dependencies and calendar widgets

Owner request: 2026-09-07. Verification continued on 2026-09-08.

The owner requested implementation after reviewing the existing Kanban work:
one card per Gantt task, connected dependencies, project finish impact and a
calendar with day/week navigation, drag, resize and keyboard alternatives.
The Kanban feature freeze remains in place.

## Implemented behavior

- Pinned MIT SVAR Svelte Gantt 2.7.2 and EventCalendar 5.12.2, with local license
  notices in `apps/web/public/third-party/PLANNING.txt`. Each view loads lazily.
- Gantt card bars, milestone deadlines, day/week/month scales, date handles,
  unscheduled cards and pagination. Connectors and labelled predecessor/successor
  controls propose versioned `depends_on` edits. Disconnecting retains other
  predecessors. Outside-page edges remain visible as a list.
- A shared Rust finish-to-start forecast from one index snapshot, independent
  of the displayed page. It preserves inclusive calendar-day durations and
  recorded starts as lower bounds, shows project finish impact and one driving
  chain, and marks missing/invalid/cyclic or truncated work as incomplete.
  It never rewrites recorded schedules or deadlines. See ADR-026.
- Calendar day, all-day week, month and agenda; previous/next/today/date
  navigation; range selection and scheduled-card creation; native move and
  both-boundary resize; keyboard date changes and view/navigation shortcuts.
  Deadlines and reviews remain distinct from planned work.
- Shared confirmation, conflict and uncertain-command handling. Widget changes
  are previews; normal writes go through the server with the expected version.
  SSE refreshes wait for active gestures and do not replace a held baseline.

## Integration findings

SVAR's theme/holiday wrappers include static inline styles. The adapter avoids
those wrappers and retains the existing strict CSP; no remote fonts, scripts,
widget REST provider or paid module is used. Read-only compact chart mode in
2.7.2 assumes a removed action column and can throw during resizing. The adapter
keeps the renderer above that breakpoint in a bounded horizontal viewport,
hides the title grid on narrow screens and intercepts display-mode switches.
Bar overflow styling must not apply to the surrounding chart layout, or native
scrolling stops working. The narrow test checks actual bar/viewport intersection.

The calendar uses local date fields when converting inclusive source dates to
exclusive widget ends. A nested event button was removed so each event has one
keyboard target. Drag callbacks revert the widget before opening a proposal;
Escape cancels without a write. The forecast has no capacity model, working-day
calendar, actual completion dates or cross-project dependencies. The calendar
remains date-only, without hourly reservations or recurrence.

## Verification and limits

Release domain tests: 5 passed, including branching dependencies, missing and
cyclic paths, date bounds and a 10,000-card / 9,999-edge chain. That single domain
sample took 61.184702 ms. Application engine tests: 29 passed, including forecast
pagination independence, unchanged recorded dates and OpenAPI/example validation.
Date adapter tests: 4 passed across UTC, Warsaw, Los Angeles and Auckland,
including DST, leap dates and invalid ranges. Evidence: `checks/planning-domain.txt`,
`checks/planning-application.txt`, `checks/planning-dates.txt`.

`npm run check` reports zero errors/warnings. Generated contracts, package
validation with `--skip-manifest` and Rust formatting checks pass. The package's
legacy checksum manifest was already stale at the owner's AGENTS.md update;
it is not regenerated as part of this feature. Contract evidence is in
`checks/planning-contracts.txt`.
Release Clippy for the changed domain/application crates and all their targets
also passes with warnings denied; see `checks/planning-clippy.txt`.

Browser suites use isolated fixture projects, actual HTTPS, normal pairing,
the Unix CLI and a release daemon. They do not bypass authentication or change
owner card data. See `scripts/planning-browser.mjs` and the extended
`scripts/browser-smoke.mjs`; both are wired into CI. Screenshots in
`screenshots/gantt-*.png` and `screenshots/calendar-*.png` are Chromium evidence.

The full application browser suite passed after fixing a queued SVAR scroll
callback during teardown. The widget API is stored without a Svelte deep proxy;
a target-local capture guard stops detached-chart scroll callbacks. The suite
retains Kanban regression coverage and adds scheduled creation, form-based
dependency editing, cycle rejection, read-only forecast and calendar keyboard
movement. See `checks/planning-app-browser.txt`.

The focused suite additionally checks direct connector linking, a synthetic 503
followed by identical request ID/epoch/version/payload retry, disconnect preserving
other edges, native calendar movement and both resize boundaries, cancellation,
day/week/month/agenda, dark theme and actual narrow-viewport bar visibility. It
requires no page errors, external asset requests or CSP violations; evidence is
in `checks/planning-browser.txt`. Expected unauthenticated pairing responses,
the missing favicon and the intentionally injected 503 can appear in that log.

Final production measurements are in `checks/planning-build.txt`: initial JS
248.55 kB / 92.87 kB gzip; lazy Gantt JS approximately 266.3 / 86.8 and CSS
134.35 / 17.43; lazy Calendar JS 64.80 / 22.71 and CSS 31.43 / 3.85. The shared
planning chunks remain small. Incremental release host compilation took 19.91 s.
Initial JS remains below the 300 KiB budget. These are build measurements,
not large-dataset rendering benchmarks.

The existing local manual host was started with this release. CLI context for
the explicitly selected Astra folder succeeds; HTTPS at `https://localhost:47832`
returns 200 and serves the built `index-B4ICsZoY.js` asset. Existing project
content, credentials and runtime state remain outside version control.

Environment: Arch Linux, Chromium 151.0.7922.173, Node 24.11.0 and system Rust
1.98.0. Physical iPhone/Safari, macOS, accessibility acceptance and representative
large-dataset rendering performance remain unverified. Domain timing and build
size are not a claim of browser frame rate or complete product acceptance.
