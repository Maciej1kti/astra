# Phone navigation bar alignment — 2026-10-06

The owner reported that the phone's bottom navigation bar looked uneven around
its icons and asked for a visually clean result.

## What was uneven

Measured at 390px on the release daemon before the change:

- A bottom safe area was added as padding inside the bar. With a 34px
  home-indicator inset the bar grew from 68.5px to 98.5px and its icons sat
  against the top edge.
- More used the shared menu button's type (13px, weight 500, 11px on a phone)
  beside views at weight 400, kept 11px below 360px while the views dropped to
  10px, and drew three hairline dots next to outlined 20px icons. In the
  sidebar it was also centered instead of aligned with the views.
- Labels had no inline room: Aktualizacje was wider than its 63px cell.
- The bar was centered with a transform and used a 16.5px label line, placing
  every edge on a half pixel.
- The 10px selection surface was not concentric with the 20px bar, and a
  scrolling bar cut its first and last shortcut with a hard edge.

## What changed

- The safe area now lifts the bar (`max(8px, inset − 8px)` from the bottom);
  its content keeps an even 5px inset on all sides.
- More has its own four-square `views` icon and inherits the same size and
  weight as every view, on the phone and in the sidebar.
- Icons are 22px, labels 11px on a 16px line at weight 500, 600 when selected.
  Each label reserves its selected width, so selection moves no cell. Cells
  have 6px inline padding, are equal while the bar fits and follow their
  labels when it scrolls.
- The bar is centered by auto margins. The selection surface, the scroll clip
  and the inset keyboard focus ring share one 15px concentric radius. A
  scrolling bar fades only the edge that still hides views.
- A touch device no longer leaves the hover background on a tapped shortcut.

Overall height is 66px, inside the existing 76px `--dock-height` reservation.

## Verification

Release build, real daemon, synthetic disposable hosts.

- `npm run check`, Prettier and ESLint on the changed files, `check:bundle`
  (80,417 of 81,920 gzip bytes).
- Chromium: `navigation`, `menus`, `motion`, `responsive`, `localization`,
  `projects`, `accessibility` pass. `navigation` gained assertions for even
  insets, one label size and resting weight, centered labels with at least 4px
  of room, unchanged cells across a selection change and an emulated 34px
  bottom inset.
- WebKit: `navigation`, `menus`, `motion`, `localization` pass. `responsive`
  fails on the header project picker's height at 320px, the open WebKit
  finding already carried by [the review completion](2026-10-05-review-completion.md).
- Rendered frames at 3× were inspected in both engines for the default,
  five-shortcut, all-shortcut, 320px and dark cases, and in Chromium with the
  emulated inset.

The Chart work in the same checkout was uncommitted during these runs, so the
tested bundle also contained it.

## Limits

The home-indicator inset was emulated in Chromium only. No physical iPhone was
used; this is not device acceptance.
