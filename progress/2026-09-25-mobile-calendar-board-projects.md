# Mobile Calendar, Board and Projects polish

The phone header now uses an opaque sticky surface below the top safe area, so
its project picker and utility controls stay clear during vertical scrolling.
Calendar keeps period navigation and date/layout controls compact, presents
agenda/grid as a direct choice, and shows dated items before secondary guidance.
The calendar surface begins at 378px rather than 550px in the 390px Chromium
review. Date headings use the shared type scale instead of heavy monospaced
labels.

The all-project Board stacks populated statuses vertically on phones; its first
visible section contains cards instead of an empty Planned column. A selected
project gets a status strip for jumping between columns, and an untouched view
opens the first column with cards. Projects cards now group title and counts in
one compact row, with project deletion in the card's actions menu. The first
card in the reviewed 390px application fell from 264px to 148px tall. Project
counts say "shown" because the workspace can hold a partial loaded page.

Verification: `npm run check`, `npm run build`, release daemon build and
`git diff --check` pass. The release browser regressions for responsive,
planning, deletion and dialogs pass; responsive was repeated after the final
Board refinement. The normally paired HTTPS dev app was reviewed at 320, 390,
768, 844 landscape and 1440px in Chromium with touch emulation, including both
themes, navigation, calendar mode switching, scheduled creation, Board column
jumps, project opening and the deletion menu. No page-level horizontal overflow
or JavaScript errors appeared. Screenshots and direct-app results are in ignored
`test-results/mobile-polish-2026-09-25/`.

The original blur was reported from a physical iPhone. The safe-area and opaque
header behavior is implemented and checked in a browser emulator; a follow-up
look on that iPhone is still needed to confirm the native status-bar overlay.
This work does not establish full release acceptance.
