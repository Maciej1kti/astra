# Card editor and field simplification — 2026-09-22

## Change

The owner requested removal of card Kind, Expected result and Owner, including
source/API schemas, CLI behavior and existing data. Card acceptance, priority,
status, scheduling, review dates, relations and extensions remain. Report kinds
and nested deadline/author kinds retain their independent meanings.

Card descriptions share the project editor's direct click/keyboard activation,
Markdown rendering on outside click and autosave behavior. Both editors are
centered over a dimmed, blurred backdrop and omit the Change history section.
Durable audit history and API/CLI Undo remain subject to current schema validation.

## Bounded source cleanup

Before implementation, source validation passed in both registered projects.
Five cards were inventoried, including one archived card; all had `kind`, and one
also had `expected_result` and `owner`. The source format required `kind`, so a
bounded compatibility build was prepared separately: it reads old card fields,
allows explicit clearing, and rejects newly setting or creating retired fields.
Cleanup used ordinary versioned CLI PATCH commands and the durable writer.
The final release rejects the retired fields entirely. No direct source writes
or general migration framework are introduced.

## Verification

The full local gate passes: 216 Rust, 95 JavaScript and 12 Python tests,
schema/example validation, generated contracts, frontend typing, import
boundaries, formatting, Clippy, bundle limits and release builds. Regression
coverage includes strict rejection of retired fields, rejection of historical
Undo snapshots that would restore them, intact bounded acceptance context,
report-kind preservation and removal of stale retired-field search terms when
upgrading either an old body-only index or the format-2 search index.

The temporary compatibility checkout and final checkout use separate build
directories. Sharing package artifacts initially produced inconsistent schema
results; both sets of local Rust packages were cleaned and rebuilt independently.
The bridge passes all 115 application tests serially. Its parallel run passed 114
with one unrelated maintenance-lock contention failure. The rebuilt bridge CLI
also validates all 28 existing Astra source documents offline.

All ten release browser suites pass, plus the broad HTTPS/CLI/browser smoke.
The card suite includes direct/keyboard description editing, Markdown on outside
click and close-time flushing. The project suite retains sanitized Markdown,
outside/backdrop clicks, keyboard controls and desktop/mobile centering checks.
The command-outcomes suite initially expected a textarea after leaving editing;
its corrected checks verify exact rendered draft text and pass all 14 cases.
The other nine suites passed in the original run. Desktop and 390px screenshots
were inspected; these remain browser-emulation evidence.

Five live cards, including one archived card, were cleaned successfully. Every
body and retained metadata value was compared before/after; only the retired
fields and normal `updated_at` changed. Project documents stayed identical.
Both registered projects validate without invalid or normalization-required
documents. The final manual runtime is ready with the same instance and command
epoch, zero pending commands and the verified embedded frontend bytes. Replaying
an original cleanup request after the strict-version restart returned its original
committed result without another write.

Raw evidence belongs in ignored `test-results/card-field-removal-2026-09-22/`,
including the temporary bridge patch, binary hashes, command identities, source
comparisons and runtime verification. Environment: Arch Linux x86_64 on btrfs,
Rust 1.98.1 (the pinned 1.92 toolchain is unavailable locally), Node 24.11.0,
Python 3.14.7 and Chrome 153. This is not physical-device or full release acceptance.
