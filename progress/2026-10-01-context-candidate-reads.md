# Scoped context candidate reads — 2026-10-01

The context assembler reuses one guarded collection descriptor for consecutive
candidates of the same kind. Every candidate still reads and validates current
bytes with its exact byte version. A failed collection open retains the ordinary
lookup for each candidate. Readers end with the request and project lock; lease,
approved ancestry, no-follow, type/link/size checks and parsing remain. A replaced
collection fails within the held reader and is reopened by a later request.
Candidate order, caps, complete metadata, excerpts, warnings, next-read hints and
exact byte accounting remain. There is no source cache or write/protocol change.

M4/macOS 27 arm64, Rust 1.92, ten logical CPUs. Saved release binaries exercise
ordinary `Engine::context` on synthetic projects after registration/startup.
Each binary/profile has two warmups and 40 selected reads. Profiles use 512-byte
bodies, 64-KiB long bodies or 16 acceptance items/eight comments with escaped
Unicode. A second series reverses profile and binary order. The guard observes
test hosts, browsers and Rust build activity throughout each pair, waits while
they are present and discards any pair that overlaps observed work.

| Profile | First control → retained median | Reverse-order repeat |
| --- | --- | --- |
| 37 cards, default 24-KiB budget | 10.392 → 7.171 ms | 10.577 → 7.172 ms |
| 1,000 cards, default budget | 72.349 → 55.481 ms | 72.624 → 53.689 ms |
| 1,000 cards with 64-KiB bodies | 111.388 → 112.910 ms | 111.176 → 92.914 ms |
| 1,000 rich cards, maximum 128-KiB budget | 104.838 → 87.482 ms | 105.619 → 86.941 ms |

Small contexts repeat 3.2–3.4 ms (31–32%) median savings. Ordinary/rich dense
contexts repeat 16.9–18.9 ms (17–26%) savings. The first long-body pair has a
variable retained tail and no gain, despite no guard-detected overlap; its repeat
improves by 18.3 ms. A targeted third pair confirms 108.664 → 90.518 ms, an
18.1-ms gain, with full normalized output equality. Both later long-body pairs
have lower measured tails; the initial variability remains part of the evidence.
These are complete local context reads, not browser rendering/network timings;
one host and variable tails do not establish universal perceived or p95 gains.

All 720 selected observations verify explicit project identity, exact pin order,
current source byte versions/excerpts and response bounds. Full normalized output
matches in all nine pairs, including complete structured metadata, omissions,
warnings and hints. Only generated time and independently registered project
identity/version are normalized; actual project/source versions are verified
before normalization.

An earlier body/metadata-materialization prototype was restored after failing to
establish a repeatable gain. Early grouped measurements of both prototypes were
later found to overlap independently running UI/browser work and are exploratory,
not acceptance evidence. The guarded rich first attempt is discarded after
observing concurrent work. Raw failed/discarded attempts, complete outputs, load
observations, saved binaries and benchmark sources remain ignored in
`test-results/context-entry-2026-10-01/`; the temporary example is removed.

Six focused context tests and three collection-reader guard tests pass. The new
engine regression verifies missing/replaced report collections across requests,
fresh byte versions, an independent card and symbolic/hard-link rejection.
Existing reader tests replace collection/project/lease identities after a prior
read and retain current bytes, link and size checks. The full gate passes 467
tests (288 Rust, 172 JavaScript, seven Python), with independent Rust fixtures
serial to conserve disk; explicit race tests and source boundaries remain.
After incorporating the independently verified motion UI, the complete gate
passes again with the same counts. Its subsequent main update contains only
motion evidence and the ordinary report; application source is unchanged.
Normally paired Chromium/WebKit protocol checks pass before integration,
including complete HTTP/CLI context equality at 4/24/128-KiB budgets, actual UTF-8
response bounds, out-of-range rejection and five-view stale-page recovery.
Both integrated protocol reruns pass the same checks. Manual refresh remains
pending.

Broader performance, Linux widget/QML, physical iPhone and release acceptance
remain open. Remaining parser/metadata-budget allocation costs require separate
measurements; this iteration does not accept an additional optimization.
