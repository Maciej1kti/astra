# E025 — Final Kanban polish and feature freeze

Date: 2026-09-07. The owner requested finishing useful additions and freezing
Kanban feature work after E024's whole-card dragging.

## Result

Column footers offer title-only creation: enter a title and press Enter or Add.
The existing Editor owns the command immediately, displaying a compact pending
state and exposing its draft and retry controls if the request fails. The
existing server path, request identity, command epoch and durability contract
are unchanged. Column-header creation still opens the detailed editor.

Each project remembers collapsed columns and horizontal/first-page vertical
scroll positions in browser storage. Navigation, project switching and reload
restore those preferences. Only display preferences are persisted; card titles,
content and server cursors are excluded. Invalid or inaccessible browser storage
falls back to a usable default. Pagination resumes at the first page after
navigation; stale server cursors are deliberately not persisted.

Restoration completes before enabling initial board interaction. Ordinary
server refreshes do not reapply saved scroll positions or schedule restoration
across a user's next gesture. Existing gesture deferral and versioned writes
remain in place. No dependency or protocol change was introduced.

## Verification

The expanded real-HTTPS browser suite tests title-only creation in the chosen
column; a simulated 503 exposes the preserved draft, disables independent
creation, and retries with identical payload, request ID and epoch. The saved
result contains exactly one card. View tests cover scroll and collapse after
Focus/Board navigation, switching to another project and back, and browser reload.
Two Node tests check project isolation, preference sanitization and denied storage.

The existing pointer, keyboard, touch-emulation, conflict, uncertain retry,
pagination and session-loss scenarios remain in the same suite. Early runs
exposed scroll-restoration interference with subsequent interactions; restoration
is now limited to entry and pagination, and completes before enabling interaction.
The complete release browser suite passed on Arch Linux with Chromium
151.0.7922.173 and Node 24.11.0. `npm run check` reported zero errors and
warnings; both preference unit tests passed. Evidence is in
`checks/kanban-freeze-browser.txt` and `checks/kanban-freeze-build.txt`.
Reviewed fixture screenshots show quick creation and the restored board view:
`screenshots/desktop-board.png` and `screenshots/board-remembered-view.png`.

Production Vite build: 1.82 s. Incremental Rust release build: 22.55 s.
Initial JS: 246.13 kB / 91.77 kB gzip. Lazy Board JS: 83.91 / 27.95;
Board CSS: 54.96 / 7.73. Relative to E024, Board JS adds 0.97 kB gzip.
These build measurements are not a runtime benchmark. The local manual host was
restarted with the verified release; CLI hello succeeded and HTTPS serves the
new asset hash. User card content was not modified.

## Freeze boundary

New Kanban feature work is frozen at the owner's request. Further libraries,
virtualization, continuous loading and additional Trello-style features need a
new owner request. Bug fixes and outstanding verification remain valid work.
Physical iPhone/Safari and macOS verification, accessibility acceptance and
representative large-dataset performance checks are not claimed complete.
See SCOPE.md for the scope decision; existing release obligations are retained.
