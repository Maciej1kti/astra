# Soft materialization, card content layers and Calendar

The owner asks for entrances to emerge gently from nothing, including the content
inside cards across views. The isolated checkout starts from `b7cc3c7` and includes
the concurrent Focus counter footer correction and retained context allocation changes
through `fcd7448`.

## Behavior

A separate zero-slope entrance curve gradually reveals surfaces, with shallow
6px page/row travel and a 12px dialog lift from 0.992 scale. Headings take 600 ms,
sections 640 ms, details 480 ms and dialogs 760 ms. Surface opacity no longer
reaches its endpoint at the first 40% of eased progress. Bounded small headings,
card titles, selected tags and suggestions resolve from 2px blur; whole views,
large surfaces and gesture owners have no blur. Explicit confirmation pulses
use a smaller scale excursion. Press response and existing exit lifetimes remain.

Each card can reveal context, title, metadata, labels, attention reasons and its
daily counter footer separately. This covers In focus, In motion, Events, Projects,
List and both Board modes. List metadata has an explicit owner, and facts/labels
cannot consume a two-item slice ahead of the counter footer. Card children retain
position and size during effects; source refreshes and counter writes retain the
opening sequence. Calendar now waits for its current project/period data and reveals
its surface, weekday heading, date grid and native event groups separately. Agenda
days enter in a bounded cascade, including the mobile month agenda. Project, date
and widget-view changes start a new sequence; refreshes and source writes do not.
The month overflow popup shares the soft surface/header/event-group timing.
All native Calendar layers keep their geometry, without per-event effects.

Scenes retain 24 primary candidates and up to 72 secondary effects. Board opts
into up to eight candidates per visible column, 48 measurements and 24 card
owners, sharing the secondary budget. Local modal/menu sequences keep their
32-target and 560 ms delay bounds. There are no persistent observers or effects.
Reduced motion cancels every layer and clears temporary filters.

## Verification

The rendered baseline fails the new gentle-onset regression: a row is already
53.4% opaque at 50 ms and fully opaque at 150 ms. The new row samples are 2.25%
and 25.6%; dialog samples are 2.59% and 29.3%. At 150 ms title/tag blur is about
1.40/1.10px and fully clears at completion. These are controlled samples of real
rendered effects, not input-latency or frame-rate claims.

The motion suite verifies every visible card role across all named views,
including narrow Focus. Sampled inner bounds remain unchanged, and a real counter
save and ordinary refresh do not replay content. Its initial Focus fixture left
daily sections below the viewport; selecting its ordinary project folder makes
those sections visible without changing production bounds or weakening assertions.

The combined full gate passes **471 tests** (292 Rust, 172 JavaScript and seven
Python), plus types, format, package/docs/contracts, boundaries, Clippy, bundle
limits and the embedded release build. The final Calendar/shared-motion/planning
selection passes all eight suites in both Chromium and WebKit. Together with the
preceding card refinement run, 15 distinct Chromium suites and 13 WebKit suites
pass. The Calendar baseline fails with only one surface layer; the new regression
checks distinct layers in every desktop and narrow month/week/day/agenda mode,
project/date changes, empty content, source refresh, reduced motion, keyboard
popup opening and touch opening/dismissal. Sampled native bounds remain unchanged.

Inspected actual light/dark editor and Projects sequences at 80/200/380/620/1200 ms,
plus Calendar month/grid/agenda intermediate frames at 220/420 ms and settled
phone popups. Later phases remain sharp and properly laid out. WebKit retains its
existing screenshot/CSP limitation. These are desktop browsers and mobile/touch
emulation, not physical-device, frame-rate or release acceptance.

The broad HTTPS smoke rerun exposed an outdated accessibility-only dialog wait
before raw Board dragging: outgoing dialogs leave that tree before native close.
The smoke now waits for native `dialog[open]` removal throughout, matching the
maintained motion suites and retaining the actual pointer/drag assertions.
The corrected broad HTTPS smoke passes, including actual Board dragging, keyboard
ordering, touch hold/scroll, cancellation, conflict/retry and Calendar navigation.
Application commit `c48f38f` is integrated. The primary checkout's embedded
frontend and release daemon were rebuilt; all 33 build files match the tested
checkout. The existing manual application was restarted with its original data,
connection settings and certificate. Trusted `https://100.122.250.14:47832` serves
all 32 expected assets. All 82 prior resource versions, three pins, preferences,
certificate, instance and command epoch are unchanged.

Ordinary CLI report `f25d7ff7-2162-4a76-a4db-8b4e6a876470` is committed and read
back with exact source/version equality. The two concurrent owner card edits remain
separate. This is implementation/verification evidence, not owner acceptance.
Raw output belongs in ignored `test-results/soft-motion-2026-10-01/`.
