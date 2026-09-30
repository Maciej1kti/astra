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

