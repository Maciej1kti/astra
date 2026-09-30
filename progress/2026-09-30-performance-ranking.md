# Remaining performance costs, 2026-09-30

Release application code: `e507d6c`, plus documentation checkpoint `e7445e6`.
This read-only profile follows the calendar rendering/refresh improvements; it
does not implement another application change or close the performance objective.

macOS 27, Apple M4/16 GiB, Node 24.11.0, Rust 1.92.0 and Chromium 153.0.8010.12.
The fixture uses three projects, 1,000 cards and ten source pins. Desktop is
1440 × 1000; each condition has three samples in fresh paired contexts, followed
by a reload with the same browser cache. Constrained profiles emulate 100 ms
latency, 6 Mbps download, 1 Mbps upload and 4× CPU slowdown. Normal release
pairing, reads, source versions and view/page bounds remain in place.

| Readiness median | Local cold / warm | Constrained cold / warm |
| --- | ---: | ---: |
| Projects | 73 / 39 ms | 685 / 415 ms |
| Updates | 73 / 38 ms | 645 / 385 ms |
| List | 73 / 40 ms | 737 / 466 ms |
| Focus | 73 / 39 ms | 797 / 510 ms |
| Board | 74 / 38 ms | 748 / 440 ms |
| Calendar month grid | 203 / 163 ms | 1318 / 999 ms |
| Gantt | 90 / 39 ms | 865 / 425 ms |

Immediate first-card opening from the cold List has a 33 ms local / 198 ms
constrained median. Opening Settings after the warm List has a 43 / 320 ms
median. These include ordinary source/settings reads. They are different
interactions from the no-change refresh in the previous iteration.

The profiler waits for the existing rendered-content selector and two animation
frames, then for outstanding ordinary API requests. Focus/List/Projects/Updates
already wait for the application's loaded-query guard. The optional readiness
metadata is captured for 89 of 96 samples and records zero pending requests at
first paint; six card-opening samples use their existing selector-only metric
and the final sample's auxiliary metadata is not saved. All 96 elapsed times are
retained. The first exploratory observer stalled while waiting across a document
reload at 14 samples; the corrected observer resets on each document
navigation and has a bounded wait. Interrupted results are not used in the table.

This is a small ranking run, not p95 acceptance, physical-device or VPN evidence.
View readiness covers the displayed page, including explicit continuation where
the configured bound is reached. It does not measure every scroll, search,
changed-data render, counter history, dialog or gesture. Local results outside
Calendar are already short; the constrained Calendar remains the clearest browser
cost. Network/CPU emulation leaves noticeable cold/warm costs in other views too.

The next server candidate is the recorded durable-create scan. Each collection
file currently performs a full lease-directory walk and a separate guarded
collection walk. Reusing the approved project descriptor for the lease lookup
may remove duplicate traversal while retaining the current project/collection
identity check before every source read. This is a candidate requiring guard
regressions and release measurement, not an approved relaxation of fsync,
authorization, file bounds or observed versions. No implementation is claimed
at this checkpoint.

Ignored evidence: `test-results/calendar-rendering-2026-09-30/all-desktop-fixed/`
contains all samples, ranges, environment, summary and auxiliary coverage.
`profile-all.mjs` and its log are retained beside it; the interrupted exploration
remains in `all-desktop/` and is excluded from the comparison. Mobile/physical
coverage and the existing durable-write target remain open.
