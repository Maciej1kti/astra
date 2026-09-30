# Guarded current-source tag reads, 2026-09-30

The tolerant tag scanner already lists a card folder once but then reopens it
through the generic resource path for every card. It now borrows one guarded
`CollectionReader` per project and uses the source module's common single-item
parser. Every file retains current lease/inode/ancestor, type/link/size, bounded
JSON/domain validation and exact byte-version checks. The scan remains sequential
under the existing project lock and workspace gate; no worker policy, cache,
indexed source authority, protocol, write or synchronization change is introduced.

The same sorted names count toward the 50,000-file budget. Invalid identifiers,
unreadable cards and bounded issues retain their order and partial-result behavior.
Only `MissingCollection` means an empty folder; a lease/path failure remains an
issue. The helper also backs ordinary collection reads without changing their
ordered error or bounded-worker behavior.

The improvement covers project catalogs used by the editor/manager and legacy
global usage/rename previews. Global indexed suggestions remain a separate names
projection with explicit freshness. Project picker catalogs use current source
files; the earlier conversational shorthand about all suggestions using the
index was too broad. ADR-028/032/041 contracts remain intact.

## Release measurements

macOS 27, Apple M4 / 16 GiB, local SSD, Rust 1.92.0 release Engine. The required
fixture contains 100 projects, 10,000 cards and 50,000 reports. Each card has two
literal labels, and the benchmark asserts complete exact global/per-project
usage counts. Control is `4dba534`. Normal source validation, guards and versions
are used. Transport, VPN and browser rendering are excluded.

| Catalog | Samples / warmup per run | Control p50 / p95 / p99 | Scoped p50 / p95 / p99 |
| --- | ---: | ---: | ---: |
| Global, 10,000 cards | 20 / 2 | 1,767.8 / 1,817.0 / 1,817.0 ms | 871.0 / 932.7 / 932.7 ms |
| One project, 100 cards | 200 / 20 | 17.7 / 18.3 / 19.4 ms | 8.8 / 9.0 / 9.1 ms |

Both medians improve by about half. The global tail estimate has only 20 samples;
it is not claimed as 200-sample typical-query acceptance. A separate concentrated
release profile with one project / 1,000 cards / no reports records scoped project
catalog p50/p95/p99 75.3/77.9/82.0 ms (200 samples after 20 warmup). Its global
catalog records 75.4/83.2/83.2 ms (20 samples after two warmup). No matching
concentrated control is measured, so no comparative speedup is attributed to it.
Source-count reads still scale with source files and remain a performance candidate.

## Verification and publication

The new regression passes on the control and scoped implementations. It covers
external source edits before index reconciliation, complete global/project counts,
current titles and byte versions in previews, an invalid file, a symlink, an invalid
identifier, ignored non-card files, partial issues and unchanged source bytes.
The three focused tag tests pass. Existing generic collection/filesystem tests
continue to govern borrowed reader guards and ordered worker behavior.

The full gate passes 259 Rust, 139 JavaScript and 12 Python tests, contracts,
formatting, Svelte, clippy, bundle bounds and release builds. Tags and editor
suites pass in Chromium and WebKit against the real release daemon, including
literal names, source-current catalog/rename behavior, conflicts and retained
drafts. The original embedded frontend and release daemon are rebuilt; the
existing manual launcher is restarted with the same data, settings and certificate.
Trusted HTTPS remains `https://100.122.250.14:47832`, with all 33 build assets
verified. All 51 prior source versions, two pins, preferences and certificate are
preserved. A normal CLI project report records the result
(`9b2728df-6ca1-488d-bc8d-ae829682c284`). No requirement, scope, priority or
acceptance status is changed by this result.

Ignored evidence in `test-results/tag-source-2026-09-30/` includes control/scoped
JSON and time logs, per-call sample arrays, the concentrated profile, focused test
logs and the temporary benchmark source. Calls use
`tag_benchmark 100 100 500 20` and `tag_benchmark 1 1000 0 20`; the temporary example
is removed before the full gate and is not shipped. External process memory
includes fixture creation and indexing, not warmed daemon RSS.

Large all-read receipt histories, dense Calendar rendering, remaining source
costs and recorded durable-create pauses remain open. Physical-device and
end-to-end release acceptance are not established by these Engine measurements.
