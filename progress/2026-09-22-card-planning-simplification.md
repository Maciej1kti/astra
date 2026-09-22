# Card connections and planning simplification — 2026-09-22

## Change

Card planning retains Start and End only. Remove card deadline/review dates,
deadline types, milestone links, dependencies and blocked reasons throughout
the UI, source/API contracts, CLI and derived planning views. Milestones keep
a single date without a deadline type. Archived cards remain supported.

## Existing data

The current server's conditional CLI PATCH cleared `depends_on` in all five
cards across the two registered projects, including the archived card. One card
had an actual dependency and four had empty arrays. No other removed card field
or milestone document was present. Every write retained its observed version,
request ID and epoch. Card bodies, schedules and unrelated metadata were checked
before/after and match. There were no direct source writes or migration bridge.

The updated manual runtime preserves the source versions of both projects, all
five cards and all 25 existing project reports. Both projects validate with no
issues, and doctor is ready with no pending commands. Instance identity and
command epoch are unchanged. The served JavaScript asset matches the release
build byte-for-byte. No synthetic project was recreated.

## Verification

- Full local gate: 209 Rust, 93 JavaScript and 12 Python tests, schema/example
  validation, generated contracts, frontend typing, boundaries, formatting,
  Clippy, production build and bundle budget. Rust tests run with
  `RUST_TEST_THREADS=1`; the desktop portal interaction remains explicitly ignored.
- Strict source/create/patch/Undo regressions reject retired card fields and
  milestone deadline kinds without changing source bytes or versions. Stale
  projection coverage prevents old fields from leaking through summaries.
- Planning preserves milestone and unscheduled timeline rows, recorded schedule
  movement, calendar gestures, conditional conflicts and unchanged retry identity.
  Desktop and 390-pixel card screenshots were inspected.
- All ten release browser suites pass across `browser/`, `browser-final/` and
  `browser-verified/`; the last run covers all 14 command-outcome scenarios.
  The broad HTTPS smoke (`smoke-final/`) and native planning gesture scenario
  (`planning/`) pass. The final local gate is recorded in `check-verified.log`.

The initial protocol browser fixture no longer exceeded the calendar page size
after removal of extra card date events. It now creates 1050 scheduled cards and
verifies stale-page recovery in all five paginated views. The initial broad
smoke timed out on keyboard ordering after a pointer move; explicitly directing
the key press to the focused handle preserves the same durable-order assertion
and the complete smoke passes.

The command-outcome suite exposed a real description interaction problem:
collapsing the textarea on pointerdown could move the retry button before its
click. Pointer-driven description rendering now waits for the click; keyboard
blur still exits editing immediately. The existing lost-reply test keeps the
description focused while clicking recovery. Confirmed conflicts retain their
request identity and draft but no longer display uncertainty recovery buttons.
Initial failures are retained in the evidence rather than overwritten.

Environment: Linux, Rust 1.98.1 through `scripts/cargo-local` (pinned 1.92 is
unavailable), Node 24.11.0, Python 3.14.7 and Chromium 153.0.8010.52.
Evidence belongs in ignored `test-results/card-planning-simplification-2026-09-22/`.
Chromium viewport/touch emulation does not establish physical iPhone or Safari
acceptance. No remote CI or final release acceptance is claimed.

A short report was appended through the explicit-project CLI after live checks:
`dac896a6-067e-4c2c-be3f-835b7d1dce28`.
