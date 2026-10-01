# Daily counter footers across Focus sections — 2026-10-01

The owner found that In motion lacked the counter footer shown in In focus.
Although the cards shared a component, the daily motion/event pages omitted
`daily_counters`. Both pages now reuse the pin snapshot projection, including
active current-day values and observed source version, without history or body
reads. Unverified rows omit previews; archived counters stay hidden. Existing
explicit Save, conflict and retained-command semantics remain unchanged.

## Verification

The extended release `focus-controls` regression first fails on the previous
application: the In motion counter spinbutton is absent. With the fix, Chromium
and WebKit pass both `focus-controls` and `focus`, including motion/event footers,
1440/390/320 layouts, cancelled pointer scrubs, keyboard saves, source readback,
reload persistence and no per-card detail GETs. Desktop In motion and narrow
Events screenshots were inspected. This is browser coverage, not a physical
phone test.

A new application regression covers both pages' conditional versions, current
day zero/recorded totals, archived-counter omission and next-day motion rollover.
The shared projection already checks invalid/stale/unavailable omission.
OpenAPI descriptions, a schema-validated daily-page example, ADR-059 and the user
and module guides accompany the correction.

The initial default gate stopped during Rust compilation because the filesystem
ran out of space. A release-profile equivalent runs every `scripts/check.py`
step, changing only Clippy/test profile to reuse existing release dependencies;
validation, durability, filesystem fixtures and test bounds remain intact.
The release-profile gate passes 289 Rust, 172 JavaScript and seven Python tests,
including types/contracts, boundaries, formatting, Clippy, package/link validation,
bundle checks and release builds.
