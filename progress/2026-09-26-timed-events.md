# Timed card events — 2026-09-26

Cards now support a start date/time and duration. Setting time makes the card an
event; date-only cards retain inclusive planned dates. The source/API field is
`event`, mutually exclusive with `schedule`, with shared domain validation,
conditional conversion, restart persistence and generated contracts. See
[ADR-044](../docs/ADR-044-TIMED-EVENTS.md) for civil-clock and DST semantics.

The editor preserves timing during ordinary autosave. Removing time converts to
a single-day plan on the currently selected date. Calendar Day/Week use hourly
slots, with click creation, conditional movement and duration changes. Gantt
includes events without exposing date-only resize handles. Resource badges and
Focus attention include events; Focus refreshes time-sensitive attention each
minute while visible. Milestones remain intact; replacing them is still an open
owner decision.

## Verification

macOS ARM64, pinned Rust 1.92, Node 24.11, release daemon/assets, Playwright
Chromium 153.0.8010.12. The full local gate passes: schemas/examples, generated
contracts, 12 Python tests, 104 JavaScript tests, Svelte checks, formatting,
boundaries, bundle budgets, Clippy, 217 Rust tests and release build. Rust
coverage includes subprocess crashes at write/delete boundaries and new event
validation, midnight overlap, end-time attention and restart persistence.

All 13 browser regression suites pass across the final relevant runs:

- `test-results/events-browser-complete`: events and editor, including
  hour-slot creation, title-only timing preservation, moved-date conversion,
  duration edits, keyboard event movement, reload and Honolulu browser timezone.
- `test-results/events-autosave-confirm`: autosave.
- `test-results/events-browser-v3`: responsive at 320–1024px and landscape.
- `test-results/events-browser-v4`: planning navigation and workspace today.
- `test-results/events-browser-remaining`: card, tags, dialogs, code-health,
  protocol, command-outcomes, deletion and Focus.
- `test-results/events-smoke`: broad HTTPS workflows.
- `test-results/events-gestures-v2`: native calendar move/resize, blank all-day
  selection, cancellation, uncertain retry and held-read behavior.

One repeated gate run had an existing delete crash-test child exit 101 instead
of the injected exit 77; its parent suppresses child diagnostics. The final full
gate passed when rerun separately. A repeated autosave E2E run also reported
`Route is already handled` in its held-response harness; the isolated rerun is
recorded separately and passed. Neither failure required weakening assertions or changing
durability code; the intermittent failures should remain visible in this evidence.

Visual checks caught and fixed workspace sidebar CSS leaking into the hourly
calendar, plus short-event captions overflowing their time blocks. The planning
selection test now targets the all-day lane; hourly creation is covered
separately. Screenshots are browser emulation, not physical iPhone acceptance.

## Live app and scope

The manual app was restarted with the existing data, HTTPS origin and
certificates. Its command epoch survived restart, the current frontend asset
was served with HTTP 200, and all 64 project source documents validated before
completion reporting (65 after the final result report). No
source migration or milestone removal was performed. The owner's remote testing
and restart preference is recorded in AGENTS.md and SCOPE.md. Existing unrelated
live edits to `.project/project.md` are left outside this implementation commit.
