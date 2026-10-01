# Current tag-source cost probes — 2026-10-01

Outcome: both application prototypes are rejected and restored. The running
application remains `186b2f8d70287dd769d1682bb230ba9b665af6f4`, published with
`5b27bb40923bf129ffe8a4c3f63fd9121f050dee`. This iteration changes evidence only;
broader performance and release acceptance remain open.

## Release measurements

M4 / macOS 27 arm64, Rust 1.92, release builds. An isolated synthetic workload
uses normal Engine registration and source-current tag catalogs on real temporary
filesystem paths. Each catalog is checked for complete literal tag names, exact
usage and project counts. Per-project measurements have 20 warmups / 200 samples;
global measurements have two warmups / 20 samples. No build, test or browser
profiling ran alongside the quiet comparisons. Large bodies contain 65,536 bytes;
ordinary bodies contain 512 bytes.

Serial attribution separately measures three passes over the actual guarded
collection reader, ordinary complete parser, full domain validator and exact
byte hash. For 1,000 ordinary cards, baseline medians are approximately 69.3 µs
for guarded reading, 4.0 µs for the complete parser and 1.7 µs for standalone
validation. Validation/hash are also contained within parsing: these numbers
must not be added as independent pipeline stages. The attribution is serial,
not the exact distribution across the catalog's four workers. It identifies
filesystem work as the dominant ordinary-file cost without weakening its checks.

## Rejected allocation-size hint

This prototype used the existing regular-file `fstat` size only to reserve a
bounded byte buffer. The ordinary read still reached EOF or the overflow byte;
all lease, ancestry, no-follow, type/link, parsing and exact-version checks stayed
in place. A first series and two quiet repeats reversed measurement order.

| Workload | Existing project median | Prototype project median |
| --- | --- | --- |
| 37 cards | 3.79–4.06 ms | 3.72–3.95 ms |
| 1,000 ordinary cards | 33.71–33.75 ms | 33.27–33.55 ms |
| 1,000 large-body cards | 44.15–44.48 ms | 43.17–43.44 ms |

The small-project improvement disappears in one repeat. The ordinary 1,000-card
saving is only 0.21–0.45 ms. Global 100-project / 10,000-card / 50,000-report
medians change from 427.8 to 423.4 ms, then reverse from 429.8 to 458.4 ms.
The prototype's global p95 values are worse in both repeats (522.9/640.9 ms
versus 457.6/458.6 ms). The large-body project saving does not establish an
end-user benefit or a broad tail improvement. The source change is restored.

## Rejected paired worker handoff

This separate prototype kept guarded reads and input order but handed off pairs
through zero-capacity channels with three scoped workers. Workers and the caller
could hold at most two observations each: eight total, below the existing nine.
The shared nonblocking admission guard, sequential fallback and explicit receiver
closure / all-worker join remained. The strict collection helper was unchanged.

| Workload | Existing project median | Paired handoff median |
| --- | --- | --- |
| 37 cards, sequential | 4.00 ms | 3.99 ms |
| 1,000 ordinary cards | 33.81 ms | 39.33 ms |
| 1,000 large-body cards | 44.39 ms | 53.39 ms |

The global 100-project / 10,000-card / 50,000-report median regresses from
430.34 to 488.06 ms. Lower handoff frequency cannot compensate for reduced
parallelism. The prototype and temporary benchmark example are removed; saved
binaries, diffs and raw JSON remain only in ignored
`test-results/tag-source-stages-2026-10-01/`.

## Verification and limits

Both prototypes build in release and every measured catalog passes its normal
result checks. Final application source is restored exactly to the published
baseline. Documentation/package checks pass. No full-gate, browser, physical-device
or new app deployment result is claimed for rejected code; the prior application's
verified gate and manual instance remain in place. These are Engine measurements
on one macOS host with warm source reads, not HTTP, constrained-device or universal
p95 guarantees. Temporary path depth and filesystem behavior affect read cost.

Python is absent from ordinary daemon/browser request handling. The optional
Omarchy widget still launches Python helpers for status and window activation.
Its status helper performs a Focus read followed by up to five full card reads,
although the current Focus response already carries bounded membership summaries.
Reducing that read fan-out and reusing the existing Rust client is a concrete next
investigation; no widget behavior or platform acceptance changes in this iteration.
An ordinary CLI report records the result for the explicitly selected repository;
project priorities, card status and acceptance remain unchanged.
