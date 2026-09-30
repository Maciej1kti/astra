# Empty card counter action

Date: 2026-09-30. Owner-requested follow-up to the counter actions menu.

A card with no counter definitions shows a direct Add counter button on the right,
in the same 44px action row as the existing menu. The shared quiet button retains
creation, pending-write and draft guards. Existing counters keep the three-dot menu;
archived-only cards retain access to their history. Section dividers are unchanged.

Release `counters` and `card-layout` pass in Chromium and WebKit. A separate release
check passes 36 layout cases across both engines: empty, active and archived-only
cards at six viewport sizes from 320px to 1440px, including short landscape. It
verifies equal action-row height, right alignment, no horizontal page overflow,
focus on opening configuration, draft cancellation and access to archived counters.
The checks do not mutate existing source versions. Light/dark phone screenshots
were reviewed. Evidence is under ignored `test-results/empty-counter-action/`.
Physical-device and full release acceptance remain open.

On macOS arm64 / Node 24.11, the full gate passes 255 Rust, 137 JavaScript and
12 Python tests, including the rebuilt embedded frontend and release daemon.
The restarted manual app at `https://100.122.250.14:47832` preserves all 44 prior
source versions, two pins, preferences and its certificate. Trusted HTTPS verifies
all 33 served files against the build.
