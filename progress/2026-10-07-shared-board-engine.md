# One board engine and its movement — 2026-10-07

The owner asked for Projects and the card Board to run on one kanban engine with
one card style, and then for the board's movement to be reviewed and made as
fluid and legible as possible. Decision record:
[ADR-071](../docs/ADR-071-SHARED-BOARD-ENGINE.md).

## What changed

- `KanbanBoard.svelte` is the only board. `Board` (cards) and `ProjectsScreen`
  supply columns and persist a requested move; `project-status-gesture.ts` is
  removed.
- Project cards lose the initials, the handle and the separate move menu. One
  quiet actions menu keeps status moves and deletion.
- Movement: lift with growth and lean, cards parting around a dashed slot,
  landing and return flights, moves shown at once and withdrawn when not saved,
  glides for re-rendered cards, proportional edge scrolling, snap-paged phone
  columns with edge/chip page turns, a collapsed column opening under a held
  card, Alt+Left/Right column moves, focus kept through a refresh.
- A board move no longer opens a modal dialog while it saves; the dialog is
  kept for errors, conflicts and a lost session.

## Review findings that drove the movement work

| Finding in the previous board | Now |
| --- | --- |
| Every drop flashed a modal dialog over a blurred page | Saves silently; dialog only when a decision is needed |
| The card returned to its origin until the refresh arrived | Rendered in its new place at once |
| A thin line marked the target while cards stood still | Cards part around a slot of the card's size |
| The preview vanished on release and on cancel | It flies into the slot, or home |
| Cards dimmed (disabled) on every read and lost keyboard focus | `aria-disabled`, focus follows the card |
| Edge scrolling ran at one speed | Faster the closer the pointer is to the edge |
| Phone columns scrolled freely and a swipe on a card did not turn them | Snap pages; cards allow both pan directions |
| A collapsed column could not receive a card | It opens under a held card |
| A stale card summary could survive in the view after a move | Cards read their summary from the loaded columns |

## Verification

Run on macOS (arm64) against release builds, on disposable hosts with ordinary
pairing.

| Check | Result |
| --- | --- |
| `npm run check`, `npm run lint`, `npm run format:check`, `check-boundaries` | pass |
| `npm run test:unit` | 518 pass, 1 fail: `style-rules` on `AddMenu.svelte` durations, present on `main` before this work |
| `browser-smoke.mjs` (card board drag, touch, keyboard, paging, conflicts) | pass |
| `cli-tag-workflow.mjs`, `planning-browser.mjs` | pass |
| `regressions.mjs`, all 41 Chromium suites | 40 pass; `dialog-components` fails one add-menu check that fails identically on the untouched base commit `aa40b8f` |
| After the rebase onto `3523253`: unit tests, smoke, `projects`, `menus`, `motion`, `dialogs`, `responsive`, `session-recovery`, `command-recovery`, `command-outcomes`, `card`, `deletion`, `loading`, `accessibility`, `focus` | pass, with the same two inherited failures |
| `check:bundle` | 81,965 B against the 81,920 B budget; `main` alone measures 82,001 B, so the overage is inherited and this change lowers it |
| Gate (`scripts/check.py`) | stops at the inherited unit failure; its remaining frontend steps were run by hand as above. No Rust source changed, so `clippy` and `cargo test` were not rerun; the release build passes |

New coverage: `board-gesture.test.mjs` (lift, lean, slot marker, proportional
and paged edge scrolling, landing, return), `board-reflow.test.mjs` (slot index
and parting offsets) and an Alt+Left/Right check in the `projects` suite.

Rendered frames were inspected for the drag, the drop 60 ms after release, a
same-column reorder, cancellation, a project status move, and a 390 px touch
hold, page turn and drop.

## Limits

- Chromium emulation only for touch; no physical iPhone or Safari check of the
  hold, haptics or momentum. That check is the owner's.
- While one move is being saved the board takes no other, so a second keyboard
  move pressed during the save is ignored.
- Acceptance of the look and feel is the owner's.
