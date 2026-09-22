# Card deletion feedback — 2026-09-22

The owner reported that confirming card deletion disabled its button without
removing the card. Read-only inspection of the running command journal identified
`CARD_REFERENCED`: an archived card still depended on the selected card. Subsequent
save requests were confirmed no-ops.

The editor rendered the deletion rejection near the end of its long form without
moving focus or scrolling to it. Its delete button became disabled after that
rejection, leaving the explanation outside the visible area. The original browser
suite covered successful deletion and version conflicts but did not verify visible
feedback for this dependency blocker.

The correction scrolls and focuses the rejection after rendering, names incoming
cards and their archived state, and explicitly says that a definitively rejected
card was not deleted. Uncertain requests retain their identity and status controls.
Delete is also disabled consistently while a save conflict is active. Existing
source/reference checks remain; no dependency is disconnected or card deleted
automatically.

The new D13 regression uses an ordinary archived dependency and a short viewport.
It checks pointer hit targets, immediately visible blocker feedback without
Playwright scrolling, preserved source and a successful unchanged save after
rejection. Initial Chrome 153 execution reproduced the missing blocker feedback.

Full local gate passed: 210 Rust, 85 JavaScript and 12 Python tests, contracts,
frontend typing, formatters, Clippy and release build. The interactive portal test
remains ignored. Environment: Linux x86_64, Node 24.11.0, Rust 1.98.1, Python 3.14.7.
Routine evidence is in ignored `test-results/deletion-feedback-2026-09-22/`.
Release browser suites `deletion` (D01–D13) and `editor` passed in Chrome
153.0.8010.52. Parent review inspected the resulting 390×640 screenshot and
confirmed visible rejection and named archived blocker. This is browser emulation,
not physical-device acceptance; live source cards were not changed by verification.
