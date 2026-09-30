# Deeper performance work — 2026-09-30

The owner requested further algorithmic improvements and asked whether replacing
Python with Rust would make the application faster. The daemon, application rules
and CLI already run in Rust; the browser uses TypeScript/Svelte. Python supports
build/test/package/install tooling and optional Omarchy helpers. It is not on the
ordinary browser request path. Rewriting that tooling does not address the
measured application costs.

## Source reads and version formatting

Collection scans and consecutive write-reference checks now retain one collection
descriptor within a read batch. Each file still verifies the lease, approved
project/collection identities, file type, link count, size and current bytes.
There is no source/version cache. Reference checks retain their existing order
and prepare/write/commit/recovery points; authorization, validation and fsync
remain intact. Hash formatting uses one output allocation while preserving the
exact SHA-256 `r1.` version format.

A failing regression caught a prototype that checked only the collection and
lease: moving both original children into a replacement project directory must
also fail. The retained implementation checks the approved project inode in the
same path walk. Another failing regression distinguished an absent collection
from a missing writer lease; only the former means an empty collection. Tests
also cover current file changes/deletion, noncanonical IDs, symlinks, hardlinks,
oversize files, mixed reference kinds and published hash vectors.

## Release measurement

Same quiet application benchmark before (`6fff17b`) and after: macOS 27 ARM64,
Apple M4 / 16 GiB, local APFS/SSD, Rust 1.92 release build, one project with 1,000
cards and no reports. After 20 warm-ups, 200 mixed durable writes contain 40
creates and 160 title patches. The fixture grows as cards are created.

| Operation | Samples | Before p50, ms | After p50, ms | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Card creation | 40 | 318.3 | 228.9 | 356.0 | 238.3 |
| Title patch | 160 | 27.1 | 26.7 | 38.2 | 32.5 |
| Mixed durable write | 200 | 27.5 | 27.4 | 326.5 | 232.6 |

Creation p50 improves by 28%; mixed p95 by 29%. Title-patch median differences
do not establish a material improvement. Descriptor reuse alone measured 231.9 ms
creation p50; the later hash allocation change has no isolated speed claim.
These application timings exclude HTTP, VPN, browser rendering, steady-state RSS
and physical power loss. Forty creation samples do not establish the full
200-creation acceptance target. Durable writes still miss the 150 ms p95 target;
source scans and fresh reference hashing remain proportional to collection size.

## Remaining desktop Calendar costs

A separate quiet release profile uses three projects, 1,000 cards/ten pins,
Chromium 153.0.8010.12 and a 1440 × 1000 viewport, with five samples per case.
Local fresh/warm medians are 248.9/193.4 ms. Under 100 ms request latency,
6 Mbps download, 1 Mbps upload and 4× CPU emulation they are 1886.7/1478.9 ms;
warm samples range from 1455.7 to 2514.2 ms. A representative warm trace transfers
344,377 Calendar JSON bytes, mounts 7,338 DOM elements and records a 582 ms long
task. This identifies both transfer and rendering costs; changing the server
language cannot remove the browser's work. This is not a physical-device/VPN
measurement or p95 acceptance, and this iteration changes no Calendar behavior.

## Verification and availability

The final full local gate passes 244 Rust, 112 JavaScript and 12 Python tests,
formatting, types, contracts, boundaries, clippy, bundle checks and release build.
All 20 release Chromium regression suites, broad HTTPS smoke and WebKit Focus
pass. The frontend and daemon were rebuilt; the existing manual app was restarted
at its unchanged HTTPS address. All 26 existing resource versions, two pins,
preferences and certificate match the pre-restart snapshot, and served assets
match the build byte for byte. Physical-device and full release acceptance remain
open, as does the owner's performance objective.

Ignored evidence: `test-results/deep-performance-2026-09-30/`, particularly
`source-before.json`, `source-after.json`, `source-final.json`,
`reader-before.log`, `lease-before.log`, `final-full-gate.log`, `chromium.log`,
`smoke.log`, `webkit.log`, `calendar-desktop` and `manual-source.json`.

## Iteration 2: bounded summary compression

The server now negotiates fast gzip for authenticated view/collection summaries
and Focus. The decoded JSON, versions and item limits remain unchanged. Missing
encoding headers preserve identity clients. Normal gzip inputs are 1 KiB–4 MiB;
larger reads retain identity, or return controlled 406 when identity is forbidden.
Compression runs after query locks are released in the existing eight admitted
blocking workers. There is no new process, cache or background queue. Credentials,
bootstrap, source ETag resources, commands and SSE remain outside this boundary.
Responses retain `no-store` and negotiate with `Vary: Accept-Encoding`.
[ADR-052](../docs/ADR-052-BOUNDED-SUMMARY-COMPRESSION.md), OpenAPI headers/parameters
and examples describe the representation behavior; browser schema types are
unchanged.

Same quiet release desktop profile as above, five samples per case, same fixture
size and 1,000-item limit. The selected range returns 995 dated items. The transfer
is 344,377 identity bytes versus about 75,243 gzip bytes, a 78% reduction. DOM work
remains unchanged; this iteration does not reduce or hide the returned items.

| Median, ms | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| Desktop, fresh Calendar | 248.9 | 218.6 | 1886.7 | 1366.6 |
| Desktop, warm Calendar | 193.4 | 186.1 | 1478.9 | 1080.5 |
| 390 × 844, fresh Focus | 73.1 | 73.4 | 806.6 | 789.2 |
| 390 × 844, warm Focus | 54.9 | 39.4 | 523.5 | 504.9 |

Desktop constrained Calendar improves by 28% fresh / 27% warm. Warm ranges are
1455.7–2514.2 ms before and 1044.3–1704.3 ms after; occasional second view reads
and long tasks remain visible in the traces. A representative compressed warm
sample transfers in 205 ms versus roughly 560 ms before, then still records a
548 ms browser long task. Focus's constrained gain is small (about 19 ms warm);
local differences do not establish a material speed improvement. Final expanded
List medians are 73.5/42.8 ms local and 739.9/463.9 ms constrained fresh/warm;
immediate first-card opening is 32.9/187.2 ms local/constrained. These five-sample
profiles do not establish p95, physical-device or VPN acceptance.

A separate quiet release Unix benchmark alternates identity/gzip 200 times each
after 20 warm-ups, on the same fixture with keep-alive and normal same-UID access.
Response p50 is 3.242/3.501 ms; p95 3.937/4.102 ms; p99 5.098/5.021 ms. Median
encoding overhead is about 0.26 ms, excluding browser/VPN/decode cost. Decoded
summaries and source versions match. Browser and server measurements have distinct
coverage and must not be combined into a general latency or memory guarantee.

The pinned `flate2` 1.1.10 uses `miniz_oxide` 0.9.1 and fast compression with
runtime CRC detection. New lock entries are reviewed for license/notices; existing
packaging discovers their license files from Cargo metadata. The selected backend
does not compile the optional zlib-rs lock entry. OSV Scanner 2.6.0 reports no known
vulnerability matches for the current Rust lockfile at this check; that is a
time-specific advisory result, not a guarantee of safety.

The full gate passes 249 Rust, 112 JavaScript and 12 Python tests. New coverage
checks exact decoded bytes, Unicode/versions, explicit quality vetoes, small and
oversize inputs, 406, authenticated HTTP/Unix summaries, unchanged source ETags,
and identity credentials/commands. Earlier failed transport fixtures used fields
outside CardCreate; the corrected test creates and conditionally pins cards through
the real protocol, without relaxing validation.

All 20 release Chromium suites and broad HTTPS smoke pass. WebKit passes loading,
session, Focus, planning, Calendar pagination and timed events. The frontend and
release daemon were rebuilt; the existing manual app was restarted and its HTTPS
assets verified byte for byte. All 27 existing resource versions, two pins,
preferences and certificate match the pre-restart snapshot. A normal local read
also confirms live compression with equal decoded summaries/versions and private
headers. The generated release archive includes the new dependencies' notices.
The remaining large Calendar rendering cost and durable-write target are still
open; this result does not complete performance or product acceptance.

Ignored evidence adds `compression-full-gate.log`, `compression-unit.log`,
`compression-transport-checked.log`, `calendar-compressed`, `phone-compressed`,
`compression-api-benchmark.json`, `compression-advisories.json` and
`compression-dependency-review.json`, plus `compression-chromium.log`,
`compression-webkit.log`, `compression-smoke.log`, `compression-package.log` and
`manual-compression.json` in the same folder.
