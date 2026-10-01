# Bounded JSON map lookup probe — 2026-10-01

Outcome: the single-entry parser prototype is rejected and restored. The retained
canonical metadata counter remains. This iteration changes evidence only; it does
not establish a performance plateau or platform/release acceptance.

The prototype replaces `contains_key` followed by `insert` with one vacant/occupied
entry lookup. The existing node increment/limit still precedes duplicate detection;
duplicate detection still precedes the repeated value read. Depth, input/metadata
bounds, source versions, normalization, domain validation and canonical bytes are
unchanged. Both release binaries start from `b7cc3c7738b00ba0baa1069e098c0dbf5fd2d841`.

On M4 / macOS 27 arm64 with Rust 1.92, ordinary Engine contexts use real temporary
sources: 37 cards or 1,000 cards with 512-byte bodies, 1,000 cards with 64-KiB
bodies, and 1,000 cards with escaped Unicode comments/checklists. The response
budget is 24,576 bytes, or 131,072 for rich metadata. Each binary/profile has two
warmups and 40 selected reads. The second series reverses both binary and profile
order. A process guard records observed test/build/browser activity; no selected
pair overlaps detected activity. Ambient load is not fully excluded.

| Profile | First control → entry median | Reverse control → entry median |
| --- | --- | --- |
| Small | 7.321 → 6.900 ms | 7.096 → 7.215 ms |
| Dense | 52.809 → 53.035 ms | 53.669 → 53.491 ms |
| Long body | 90.144 → 90.205 ms | 91.747 → 91.132 ms |
| Rich metadata | 84.857 → 84.734 ms | 84.998 → 84.311 ms |

Small/dense/long results change direction. Rich savings are only 0.12–0.69 ms;
this does not establish a useful complete-read benefit. Tail measurements are
variable and do not justify a broad p95 claim. All 640 selected reads preserve
current project/source versions, ordered Focus membership, excerpts and actual
response byte bounds. Complete normalized responses match in all eight pairs;
only dynamic generation time and random registration project identity/version
are normalized after their actual values are checked.

The production parser is restored exactly and the temporary example is removed.
Raw observations, saved release binaries, runner/source and rejected patch remain
in ignored `test-results/source-map-2026-10-01/`. Documentation/package validation
passes. No full gate, browser or new restart is claimed for rejected code. The
independently published Focus counter change is preserved on integration. A normal
CLI report records the result for the exact owner project; owner card edits and
product scope/acceptance remain separate.

The next allocation to measure is context entry construction: it currently creates
a complete JSON copy of the validated source, including the full body, before
keeping a short excerpt and selected metadata. Any replacement must preserve all
current reads/versions, exact projection values and UTF-8 excerpt boundaries.
