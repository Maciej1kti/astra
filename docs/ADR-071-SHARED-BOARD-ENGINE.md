# ADR-071 — One board engine for Projects and cards

Status: accepted on the owner's 2026-10-07 direction.

Projects and the card Board were two implementations of the same idea. The card
Board rendered through the SVAR Kanban view with `boardGesture`; Projects had
its own flex layout, a handle gesture (`project-status-gesture.ts`), a move menu
and a tile showing initials. The owner asked for one engine and one card style,
with columns as the only difference.

## Decision

`features/board/KanbanBoard.svelte` is the only board. It owns the SVAR view
adapter, the card face (`BoardCard`), the move gesture on the card surface, the
phone column strip, collapsing and the browser-local view memory
(`astra-board-view:<key>`). A host passes columns and receives
`onmove(item, column, placement?)`:

- `Board` loads paged card columns, adds the footer for quick creation and
  paging, and turns a move into the existing ordered `MoveProposal`.
- `ProjectsScreen` builds Active, Paused and Archived from loaded project
  summaries with `ordered={false}`: a drop names a column only, shown as an
  outline of that column, and becomes the existing conditional state command in
  `ProjectStateChange`. Projects with an unreadable state sit in a locked
  **Niedostępne** column.

Project cards drop the initials, the handle and the separate move menu. One
quiet actions menu remains for keyboard/touch status moves and deletion; the
project editor's Status field is a further keyboard path.

## Consequences

- No protocol, schema, source or command change. Moves still carry the observed
  version, and a project summary that changed during a gesture cancels the move
  instead of supplying a newer version.
- Touch moves on Projects now need the same short hold as card moves, so a
  vertical swipe scrolls the column.
- Projects columns scroll on their own inside the board's height instead of
  growing the page, and remember collapse and scroll offsets in the browser.
- `project-status-gesture.ts` and its unit test are removed; the gesture rules
  are covered by `board-gesture.test.mjs` and the `projects` browser suite.

## Movement

The owner then asked for the board's movement to be reviewed and made as fluid
and legible as it can be. The review found a rigid preview, a thin insertion
line while cards stood still, no landing or return, a modal dialog flashing over
the blurred page on every drop, the card jumping back to its origin until the
refresh arrived, cards dimming on each read, constant-speed edge scrolling, free
(unsnapped) column scrolling on phones and no sideways swipe from a card.

- **Shown at once.** `KanbanBoard` renders a requested move immediately and keeps
  it while the host saves. This is presentation only: the command, its observed
  version and its recovery are unchanged, nothing is reported as saved, and
  `settle(false)` (a conflict or a closed proposal) returns the card to where
  the source has it. A read that fails releases the shown move. While one move
  is shown the board takes no other, so two proposals never overlap.
- **No dialog for a board move.** `MoveChange` with `autoCommit` saves without a
  dialog and opens one only for an error, a conflict or a lost session — the
  behaviour `ProjectStateChange` already had.
- **Cards make room.** Rows move by transform; the slot and hit testing are
  measured from layout offsets, so a running transition never moves the target.
- **Cards stay focusable.** A busy board marks card titles `aria-disabled`
  instead of disabling them, so focus survives a refresh and cards do not dim.
  Alt+Left/Right moves a card one column over, to the end its loaded page knows.
- **Phones page.** Columns are scroll-snap pages, cards allow both pan
  directions, and a held card turns pages by resting at an edge or on a chip.

Physical-device feel (haptics, iOS momentum) is not covered by Chromium or
WebKit emulation and remains the owner's check.
