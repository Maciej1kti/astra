# Bounded source-backed pin discovery — 2026-10-01

The retained implementation consumes guarded source observations in sorted order
and holds at most 101 pin ID/position pairs per project. It replaces full parsed
card retention during source-backed pin admission, ordering and agent context.
Source validation, versions, leases, project locks, archived membership and
registration/position/workspace order remain. Every recognized source is checked
before the existing 50,000-card and 100-pin bounds, preserving error precedence.
Complete collection callers and the snapshot-backed browser Focus query are
unchanged. This is a memory bound improvement; a context speedup is not claimed.
The verified application is `cfc35c1ea6908725701ef9178157f3a4e09de4e3`.

M4/macOS 27 arm64, Rust 1.92, ten available logical CPUs. Saved release binaries
exercise ordinary `Engine::context` after normal registration/startup on synthetic
projects, with a 4,096-byte context budget and ten pins, including an archived pin.
Matched sources use deterministic IDs, positions and equivalent bodies. Two
warmups precede 40 measured samples per binary/profile. A quiet second series
reverses binary/profile order; no builds/tests/browser work runs alongside them.
All 480 selected observations verify scope, exact pin membership/order, included
card byte versions/excerpts, serialized budget and stable normalized output.

| Profile | First control → retained median | Reverse-order repeat |
| --- | --- | --- |
| 37 cards, 512-byte bodies | 10.450 → 11.099 ms | 11.466 → 12.148 ms |
| 1,000 cards, 512-byte bodies | 71.754 → 72.969 ms | 72.252 → 72.678 ms |
| 1,000 cards, 64-KiB bodies | 107.770 → 108.716 ms | 108.822 → 109.076 ms |

The approximately 0.25–1.22 ms median cost is accepted for bounded temporary
memory. p95s vary across profiles; neither a universal tail improvement nor
perceptible faster context readiness is established.

A separate allocation-instrumented release harness links the same application
libraries and resets its live-allocation peak immediately before each context
read. Three measured reads per binary/profile retain the same output assertions;
their instrumented timings are excluded from latency comparisons. Incremental
Rust allocation peaks for 1,000 long-body cards fall from 63.35–63.42 MiB to
0.96–1.15 MiB (over 98%). For ordinary bodies they fall from 1.33–1.39 MiB to
0.17–0.22 MiB. These are temporary live allocations, not whole-process RSS or
all native allocations. The ignored external meter uses the system allocator;
production code retains `unsafe_code = forbid` and introduces no dependency.

Whole-process peak RSS includes fixture setup and index startup. On long-body
profiles it falls only from approximately 90–91 MiB to 85 MiB. The allocator's
startup high-water mark makes this a distinct, smaller observed benefit. Initial
exploration used equivalent random-ID fixtures; the final latency table uses
matched deterministic sources. An initial meter invocation resolved the Rust
shim to `rustup`; correcting the executable pathname fixes only the harness.
An initial test compile omitted an error import; the retained focused tests pass.

Focused source/ordering tests verify current external bytes, strict sorted errors,
unsafe neighbors, identifier recognition, scoped and archived pins, source edits,
shared-capacity fallback and lease replacement. The actual 50,001/50,000-source
and 101/100-pin regression passes. The full gate passes 462 tests (284 Rust,
171 JavaScript, seven Python), including six new native regressions. Normally
paired Chromium and WebKit Focus/protocol suites pass: pin admission/order,
archived membership, competing versions, unchanged uncertain command identity
and stale-page recovery remain covered. The original frontend and release
workspace are rebuilt; manual launcher 8193 is replaced by 41022 using the
existing data and HTTPS connection. Trusted `https://100.122.250.14:47832`
verification preserves 71 prior resource versions, two pins, preferences,
certificate, epoch/instance and the complete normalized ordinary CLI context.
All 32 served assets match the rebuilt frontend, and all 33 dist files match the
verified worktree. The ordinary CLI result report
`4a8bf0ca-cf27-40ad-946b-8912c457596f` is committed and read back exactly, while
preserving the unrelated owner card. Raw output,
saved binaries, harness sources and failed attempts stay in ignored
`test-results/source-focus-stream-2026-10-01/`. Broader perceived performance,
Linux widget/QML and physical iPhone/release acceptance remain open.

The next context cost investigation is supported by current code: each candidate
performs a guarded source read, and each append serializes the complete JSON
output again to enforce the exact byte budget. Profiling these costs is still
pending; no skipped source validation or budget change is accepted.
