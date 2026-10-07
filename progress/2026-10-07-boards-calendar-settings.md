# Boards as long as their cards, a denser calendar and rebuilt settings

2026-10-07. The owner reviewed the interface view by view and asked for three
corrections: boards whose page ends with the longest list and whose lists are
all named, a calendar of clearly higher quality in its month, week and day
layouts, and Settings put in order without a footer.

## What changed

- **Boards.** A column is as tall as its cards and the page scrolls; the fixed
  board height and the per-column scroll memory are gone. The workspace Board
  renders the same `KanbanBoard` as Projects and the project Board, read only.
  The narrow layout keeps each column's heading, which also restores the
  collapse button: the reported "Anulowane cannot be closed" was that heading
  being hidden. A phone board takes the height of the column in view. See
  [ADR-071](../docs/ADR-071-SHARED-BOARD-ENGINE.md#columns-as-long-as-their-cards).
- **Calendar.** Items are one compact line under a pointer, so a month cell
  shows three before "+N więcej" where it showed one, and a week's all-day rows
  leave the hours most of the grid. The grid ends with the window. Week and day
  now open at 08:00: scroll anchoring had been sliding the first hours under
  the all-day rows that arrive after the first scroll.
- **Settings.** One large dialog with a rail of sections, saving from the
  header and no footer. Profiles are a list with a switch action, the agent
  provider and appearance are cards, plugins and publication are switches, and
  the timezone has a map with the zone's hours and current time. See the
  [design system](../docs/DESIGN-SYSTEM.md#settings).

No protocol, schema or command changed.

## Not done as asked

The owner asked for the page to end with its content. It ends the floating add
button's own height above the end, down from one and a half times that: the
existing rule that nothing to read or press lies under that button at the end
of a page is tested in every view and width, and was kept. Removing the band
altogether means moving or dropping the floating button on wide screens, which
is the owner's decision.

The calendar's layout control is still a select; a segmented control was left
out because seventeen checks read that select's value.

## Verification

Local, release daemon, Chromium, on the final tree:

- `npm run check`, `npm run lint`, `npm run format:check`, `npm run check:bundle`
  (81,817 of 81,920 bytes) and 540 unit tests pass.
- All 42 regression suites ran on the tree before the last two test updates
  and the bundle trim, with `charts` and `dialogs` failing on checks that still
  expected checkboxes and a footer; those two and fourteen other suites that
  touch boards, calendar and settings pass on the final build. `browser-smoke`,
  `planning-browser` and `cli-tag-workflow` pass.
- New checks: columns have no inner scroll and end with their cards, a narrow
  board names its columns and an opened column closes again (`ui-corrections`);
  the timezone map's land, places and offsets (`timezone-map.test.mjs`); a held
  card scrolls the page (`board-gesture.test.mjs`, `browser-smoke`).

WebKit was not run. Rendered results were inspected in screenshots at 1440,
680 and 320 px in light and dark; this is browser emulation, not a phone.
