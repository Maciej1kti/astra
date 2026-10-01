# Context entry allocation — 2026-10-01

The retained prototype borrows the body from the already validated typed source
instead of creating a complete temporary JSON envelope before taking an excerpt.
It serializes metadata alone and moves selected values into the context entry,
avoiding another structured-metadata copy. The original current reads, source
versions, normalization, complete domain/metadata validation, kind/title/project
state mapping, optional fields, excerpt boundaries and response accounting remain.
There is no protocol, source cache, lock, authorization or durability change.

## Release measurements

M4 / macOS 27 arm64, Rust 1.92. Saved release binaries start from
`cf1c7a7e4c76887490a50fdd7f38a0611f4eefbd`, including the independently published
motion and Focus counter work. Real temporary Engine projects contain 37 or 1,000
cards with 512-byte bodies, 1,000 cards with 64-KiB bodies, or 1,000 cards with
escaped Unicode comments/checklists. Budgets are 24,576 bytes or 131,072 for rich
metadata. Each binary/profile has two warmups and 40 selected reads. The second
series reverses both orders; two additional pairs per long/rich profile repeat
those orders. A guard records observed test/build/browser activity; no selected
pair overlaps detected activity. Ambient load is not fully excluded.

| Profile | First control → entry median | Reverse control → entry median |
| --- | --- | --- |
| Small | 7.241 → 6.730 ms | 7.133 → 7.071 ms |
| Dense | 52.861 → 53.015 ms | 53.690 → 53.531 ms |
| Long body | 90.111 → 89.846 ms | 91.880 → 91.146 ms |
| Rich metadata | 84.823 → 83.591 ms | 85.113 → 84.066 ms |

The additional rich pairs repeat 84.810 → 83.803 and 85.507 → 84.098 ms. Rich
savings are 1.0–1.4 ms across four pairs; ordinary/dense gains are negligible.
Long-body savings remain below 1 ms. This is a small CPU/allocation improvement,
not a large perceived-latency jump or a process-RSS claim. Tail measurements vary:
one reversed rich prototype p95 rises to 122.3 ms versus 89.8 ms, while later
pairs are lower. These samples do not establish a universal tail improvement.

All 960 selected complete-context reads check current project/source byte versions,
ordered Focus membership, excerpts and actual response byte bounds. Full normalized
responses match in all 12 pairs. Only dynamic generation time and random project
registration identity/version are normalized after their actual values are checked.
Raw timings, load observations, binaries and benchmark sources remain ignored in
`test-results/context-entry-allocation-2026-10-01/`; the temporary example is removed.

## Verification

Eight focused context tests pass. New projection regressions cover all four kinds,
complete structured fields, bounded extensions, an event with absent optional
fields, empty bodies and adjacent UTF-8 excerpt boundaries. The complete gate
passes 471 tests: 292 Rust, 172 JavaScript and seven Python. Independent Rust tests
run serially to conserve disk; explicit races, source limits and durability checks
remain. Normally paired Chromium/WebKit protocol checks compare complete HTTP/CLI
context at minimum/default/maximum budgets and recover stale pages in all five
views. All 14 editor scenarios pass in both engines, retaining current versions,
conflict/uncertain-save behavior, late cancellation and autosave/history safety.

Application commit: `3608b8a8980b05c2750b1fcd2926d14f6f2986bc`. The original checkout's
frontend and release daemon are rebuilt; all 33 distribution files match the
verified worktree. The existing manual launcher is restarted with the same data,
HTTPS origin and certificate. Snapshots preserve all 81 prior resource versions,
three pins, preferences, instance/epoch and the complete native CLI context.
Trusted `https://100.122.250.14:47832` verifies all 32 served assets.

The normal CLI result `7548f1b5-fed8-4d4c-9e25-32771394af66` is committed and read
back exactly. Both owner card changes remain separate. The next investigation is
complete large-view and editor/startup interaction profiling, beyond these small
source-assembly gains. No physical-device or release acceptance is claimed.
Broader perceived performance, Linux widget/QML, physical iPhone and release
acceptance remain open.
