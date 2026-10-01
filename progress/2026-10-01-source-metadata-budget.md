# Counting canonical metadata bytes — 2026-10-01

The store sends the ordinary pretty-JSON serializer to a byte-counting sink
instead of retaining a serialized metadata buffer only to inspect its length.
The exact 64-KiB canonical limit, escaping/indentation, stage before domain
validation and rejection order remain. Parsing, duplicate/depth/node/NUL checks,
source bounds, original byte versions, normalization and actual canonical source
serialization remain. There is no source cache, protocol or writer/durability
exception. The counter reads the complete value and adds no early admission.
The verified application is `31de716064687552cba7c32d229f827d921ab595`.

M4/macOS 27 arm64, Rust 1.92, ten logical CPUs. Saved release binaries exercise
ordinary `Engine::context` after registration/startup on synthetic projects.
Each profile/binary has two warmups and 40 selected reads. A second series
reverses profile/binary order; a third checks ordinary/rich dense profiles.
The observer waits for external test hosts, browsers, Rust builds and native
test executables to disappear and monitors each complete pair. Selected pairs
have no detected overlap; this does not exclude every kind of ambient activity.

| Profile | First control → counter median | Reverse-order repeat | Targeted third pair |
| --- | --- | --- | --- |
| 37 cards, default 24-KiB budget | 6.790 → 6.763 ms | 7.442 → 7.464 ms | — |
| 1,000 cards, default budget | 53.015 → 52.735 ms | 71.614 → 53.428 ms | 53.199 → 52.278 ms |
| 1,000 cards with 64-KiB bodies | 91.126 → 90.367 ms | 92.874 → 92.272 ms | — |
| 1,000 rich cards, 128-KiB budget | 88.535 → 85.314 ms | 87.423 → 84.965 ms | 85.647 → 84.265 ms |

Rich contexts repeat 1.4–3.2 ms (1.6–3.6%) median savings. Small contexts are
unchanged; ordinary/long-body gains are below 1 ms outside the unusually high
second ordinary control. The third ordinary pair does not reproduce that
18-ms difference, so it is not attributed to this change. Variable tails do
not support a universal p95 or perceived browser-readiness claim. This is a
small allocation/CPU improvement after the larger candidate-read iteration.

All 800 selected complete context reads check explicit identity, pin order,
current source byte versions/excerpts and response budgets. Full normalized
outputs match in all ten pairs, retaining metadata, counts, omissions, warnings
and hints. Only generated time and independent registration identity/version
are normalized after current project/source versions are verified.

An isolated release comparison alternates buffered/counter order in 40 measured
pairs of 1,000 operations for each profile. Ordinary 392-byte metadata measures
0.497 → 0.195 ms; rich 15,642-byte metadata 9.971 → 4.901 ms; metadata exactly at
65,536 bytes 16.747 → 15.747 ms. All 240,000 selected operations check exact
length equality. These attribute serializer work, not full source or UI latency.
Actual process memory/RSS is not measured. Raw output, load observations, binaries,
sources and the short plan stay ignored in `test-results/source-metadata-2026-10-01/`.
Both temporary examples are removed.

Nine focused document tests pass, including a new exact/adjacent canonical
boundary with escaped Unicode, controls, nested values and numeric extremes.
Both parsing and serialization retain acceptance/rejection; original byte
versions and type/filename errors before the metadata limit remain verified.
The worktree's rebuildable 867-MiB incremental cache is discarded before the
serial full gate to conserve disk for actual source-boundary fixtures. No source,
runtime state or test bounds change. The full gate passes 468 tests (289 Rust,
172 JavaScript, seven Python), including actual source bounds and subprocess
durability. Normally paired Chromium/WebKit protocol checks pass complete
HTTP/CLI context equality at three budgets, actual response-byte limits,
out-of-range rejection and five-view stale-page recovery. Both engines also
pass all 14 editor scenarios, including current sources, conflict/uncertain
saves, late-response cancellation and autosave before Back/rapid navigation.
The original frontend and release workspace are rebuilt; all 33 dist files
match the verified worktree. The existing manual launcher 86879 is replaced by
53340 with the same data and connection. Trusted `https://100.122.250.14:47832`
verification preserves 77 prior resource versions, three pins, preferences,
certificate, instance/epoch and complete normalized native CLI context. All 32
served assets match the rebuilt frontend. The ordinary CLI report
`9323cadb-6a41-4e40-9787-e2ab8d09fca9` is committed/read back exactly, preserving
both unrelated owner card changes. A second discard of only the verified
worktree's 548-MiB rebuildable incremental cache permits the original release
rebuild; runtime data and bounds remain unchanged.

Broader UI/perceived performance, Linux widget/QML, physical iPhone and release
acceptance remain open. The bounded JSON map visitor currently checks duplicate
keys and then inserts with a second map lookup; measuring a single-entry lookup
is the next parser investigation, with its existing rejection order required.
