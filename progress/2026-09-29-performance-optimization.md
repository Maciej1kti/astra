# Iterative performance optimization — 2026-09-29

Owner direction: continue improving performance until further changes stop making
a noticeable difference. The goal remains active; this records the first verified
iteration, not a claim that every bottleneck or release target is resolved.

## Iteration 1: startup and navigation

- View/project/discrete-filter changes start immediately. The 200 ms debounce
  remains only for typed server-side search; obsolete reads and cursors still
  belong to the existing generation/cancellation owner.
- Editor/Markdown, settings and administrative dialogs are separate chunks.
  Editor code loads alongside an early resource read and warms 150 ms after the
  first view is ready. A hidden registration browser keeps its command owner
  mounted after the component first loads.
- Bootstrap and preferences travel concurrently using the existing endpoints.
  A regression covers the unauthorized preference read cancelling bootstrap:
  pending pairing state still appears after reload. Remote preference generations
  and draft preservation remain intact.
- Calendar/Gantt no longer wait for a separate wrapper chunk before requesting
  their own module. No widget, source format or API contract was replaced.
- Initial JS/CSS is 63,328 gzip bytes (61.8 KiB), down from 142,354 (139.0 KiB).
  The build now rejects initial bundles above 80 KiB, leaving headroom while
  protecting the measured reduction. The historical product ceiling remains
  distinct from this tighter build check.

Failed deferred components remain closable. Explicit reload first revalidates at
most 16 failed local build assets with three concurrent reads and a five-second
deadline, then lets the ordinary unload guards run. This addresses the reproduced
[WebKit failed-preload cache issue](https://bugs.webkit.org/show_bug.cgi?id=270357):
ordinary reload alone did not recover a failed module, while cache revalidation
followed by reload did. No automatic reload discards a draft. Dynamic import
failures and their browser retry limits are also described in
[Vite's troubleshooting guide](https://vite.dev/guide/troubleshooting#failed-to-fetch-dynamically-imported-module).

## Release measurements

Same method and environment as the [baseline](2026-09-29-loading-profile.md):
macOS 27 ARM64, Apple M4 / 16 GiB, Chromium 153.0.8010.12, 390 × 844 viewport,
ordinary HTTPS pairing, three synthetic projects and 37 cards. Five samples per
case, 15 List returns. Content readiness uses DOM mutation and two animation
frames, not automation polling. The final run had no concurrent build or test.

| Median, ms | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| Fresh-cache List | 72.2 | 56.7 | 878.8 | 683.7 |
| Warm-cache List | 38.5 | 38.2 | 514.5 | 403.5 |
| Switch to List | 242.4 | 30.4 | 350.4 | 160.5 |
| Switch to Projects | 235.0 | 35.4 | 355.4 | 157.7 |
| Switch to Updates | 241.7 | 31.1 | 337.0 | 142.0 |
| Switch to Focus | 242.6 | 30.0 | 438.2 | 243.5 |
| Open card after navigation | 28.7 | 30.6 | 178.8 | 184.4 |

The constrained profile emulates 100 ms request latency, 6 Mbps download,
1 Mbps upload and 4× CPU slowdown. It is not a physical iPhone or measured VPN
path. The small change in card-opening time does not establish an improvement;
first-click and larger-project coverage are the next measurements. The daemon and
index were warm. Small-sample medians do not establish p95 acceptance.

## Verification and current availability

The full local gate passes: 238 Rust, 110 JavaScript and 12 Python tests, types,
formatting, boundaries, contracts, bundle check and release build. Broad HTTPS and
planning checks plus all 19 Chromium regression suites passed in the recorded run.
Final loading/session/dialog checks cover the later bounded reload recovery;
WebKit loading/session and autosave also pass across the recorded runs.

One final session test exposed a verification race: a disabled counter button can
mean a write is still pending. It now waits for the acknowledged draft removal
before reading source values. The corrected check passes in Chromium and WebKit.
Earlier failed pairing and failed-preload probes remain in the evidence folder.

The existing manual app was rebuilt and restarted. HTTPS serves byte-identical
current assets; all 23 existing resource versions, two pins, preferences and the
certificate matched the pre-restart snapshot. No network or service settings
changed. Physical-device and full performance/reliability acceptance remain open.

Evidence is ignored under `test-results/loading-2026-09-29/`: the final gate,
`pass1-browser`, `pass1-final-chromium`, `pass1-session-ack`, `pass1-final-webkit`,
`pass1-final/loading-baseline.json`, its summary and `manual-pass1.json`.
The earlier `pass1` timing run overlapped browser verification and is exploratory;
the table uses only the final quiet run. Preload recovery probes and their logs
record both the failing case and the verified workaround.

## Continuing work

Measure immediate first-card opening, cold/warm Board, Calendar and Timeline,
then larger source sets and full pages. Follow the measured request and render
costs before choosing the next change. Evaluate compression and remaining serial
reads against their actual effect; retain durability, source validation and read
bounds. Do not treat the improvements above as completion of the owner's goal.
