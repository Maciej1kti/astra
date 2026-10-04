# Main project status board — 2026-10-04

Implemented the owner's Main workspace view alongside Focus, Chart and the
existing views. Whole projects appear in Active, Paused and Archived columns.
Folder/title filters stay local, project opening reads the current source, and
Add project uses the existing registration workflow. Status changes use an
explicit drag handle or the keyboard/touch Move menu.

Main combines the bounded ordinary and archived-only project lists without
loading card/report collections. The shared read owner separates this combined
project scope from ordinary views when navigating in either direction. If the
two reads straddle a status change, duplicate IDs retain one complete observed
summary and version; no atomic combined snapshot is claimed. State writes retain
that observed version and the existing conflict, durability and unchanged-command
recovery rules. Gestures share the UI cancellation policy and remove their preview
before submitting. The write owner survives view changes.

The protocol adds Main as a conditional workspace default preference. OpenAPI
also documents the already implemented archived-only project query. There are no
new project statuses, position fields, custom columns or source migrations. See
[ADR-063](../docs/ADR-063-MAIN-PROJECT-STATUS-BOARD.md) and the
[user guide](../docs/USER-GUIDE.md#choose-a-view).

## Verification

- The final full local gate passes 601 tests: 336 Rust, 258 Node and 7 Python,
  plus generated contract/schema/example/link checks, boundaries, formatting,
  strict Clippy and release builds. Svelte reports zero errors and warnings.
  Main, its command owner and Projects load as deferred components; the final
  initial bundle is 81,764 bytes gzip, below the 80 KiB gate.
- Domain/application regressions cover valid/unknown default views, observed
  preference versions, stale conflicts, persistence and unchanged replay after
  restart. Authenticated transport coverage verifies ordinary/archived-only
  project pages, summary versions, continuation and cursor scope rejection.
  Frontend regressions cover archive cache transitions, invalidation/reset,
  overlapping observations, filters and pointer cancellation.
- Main passes 12 release Chromium check groups and 11 WebKit groups. Coverage
  includes all project states, entering/leaving the archive scope, local filters
  without extra reads, fresh source opening, conditional pointer/keyboard/touch
  moves, Escape cancellation, persisted reload, competing conflicts, unchanged
  response-loss retries, Check status and durable default-view selection.
- The final navigation suite passes 11 checks in each engine, including old
  saved layouts appending Main without changing existing order or visibility.
  Chromium responsive passes 44 groups across all nine views at 320–1024px,
  including header/filter bounds, touch sidebar scrolling and rotation/reload.
  Shared menus pass six groups in each engine. Light/dark desktop, populated
  320/390px boards and narrow menus were inspected.
- Nine-view navigation exposed a WebKit popover measurement bug: restoring the
  authored height reset internal scrolling. The shared helper now preserves
  offsets during external repositioning and ignores panel-owned scroll events.
  Two failing regressions precede the fix. Real wheel checks retain 256px and
  120px offsets at 390×844 and 640×320, with zero RAF calls during each settled
  600ms sample. Navigation uses ordinary wheel input and clicks.
- Broad HTTPS smoke and the affected loading/deletion suites also pass. The
  final browser runs record no application errors or CSP violations.

Environment: macOS arm64, Node 24.11.0, Rust 1.92.0, Playwright 1.63.0,
Chromium 153.0.8010.12 and WebKit 26.6. Final Main/menu evidence is in ignored
`test-results/main-final2-{chromium,webkit}/`; navigation/responsive diagnostics
are in `test-results/main-responsive-debug/`. Gate and restart evidence is in
`test-results/main-rollout/`. Synthetic status changes belong only to removed
temporary hosts. Browser emulation does not establish physical iPhone acceptance;
complete release acceptance remains open.

## Existing application

Rebuilt the embedded frontend and release daemon, then restarted the existing
manual application at `https://100.122.250.14:47832` with its current data,
connection settings and certificate. Trusted HTTPS verifies all 42 current build
assets. Before/after checks preserve all 31 prior resource versions and source
hashes, two Focus pins, both profiles' names/registrations/approved roots/preferences,
instance identity, command epoch and certificate.

A normally paired read-only live browser verifies all 15 existing projects in
Active, exact status counts, the title filter, desktop layout and the 320px Main
view. Its session is signed out afterward. Existing project statuses and counters
remain unchanged. A concise result is appended and read back through projectctl
with the explicitly selected Astra folder. The owner's pre-existing card edit
remains outside this change and commit.
