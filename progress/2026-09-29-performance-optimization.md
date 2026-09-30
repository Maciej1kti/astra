# Iterative performance optimization — 2026-09-29

Owner direction: continue improving performance until further changes stop making
a noticeable difference. The objective remains open; this records verified
iterations, not a claim that every bottleneck or release target is resolved.

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

## Iteration 2: planning views and the first card

Explicit Calendar/Timeline routes now request their widget during bootstrap.
Editor code warms immediately after the initial ordinary view read completes.
An earlier experiment fetched it alongside that read, but delayed the large List
by about 70 ms under network constraints; the retained ordering avoids that
competition. Small- and large-fixture first List times remain essentially unchanged.

Calendar data and derived events no longer acquire deep reactive proxies, the
initial layout uses the actual viewport, and weekday formatting reuses one formatter.
These changes alone improved the large agenda modestly. The main cost was about
18,000 DOM elements for 1,000 dated items repeated across their occupied days.
Agenda now requests 200 items per page, displays a count and retains explicit
Next/First controls. Grid/time views retain 1,000; switching page size resets the
cursor. This is a paging tradeoff, not faster rendering of the same 1,000-item DOM.
Existing server limits, source versions and gesture/write ownership are unchanged.

Measurements use the same hardware, browser, viewport and constrained profile
as iteration 1. Both fixtures have three projects; the expanded one has 1,000
cards including ten pins. Before: three exploratory samples on `10f9be5`; after:
five samples per case in a quiet run. The warm daemon/index and synthetic sources
do not establish physical-device, VPN or p95 acceptance.

| Median, ms | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| Small, fresh Calendar | 90.0 | 73.4 | 897.1 | 747.9 |
| Small, fresh Timeline | 88.9 | 90.0 | 997.0 | 847.1 |
| Small, immediate first card | 34.1 | 33.7 | 295.3 | 219.8 |
| 1,000 cards, fresh Calendar | 307.8 | 107.3 | 2259.6 | 954.5 |
| 1,000 cards, warm Calendar | 254.6 | 59.2 | 1727.6 | 633.7 |
| 1,000 cards, fresh Timeline | 89.1 | 90.0 | 1164.5 | 946.6 |
| 1,000 cards, immediate first card | 36.6 | 33.2 | 316.5 | 192.3 |

The large warm Calendar samples ranged from 631.9 to 998.0 ms under constraints;
the table does not hide that remaining variation behind a tail-latency claim.
Initial JS/CSS remains 63,409 gzip bytes, below the 80 KiB regression ceiling.

The full local gate passes with the same 238 Rust, 110 JS and 12 Python tests.
Release Chromium and WebKit pass loading, planning, calendar-pages and timed-event
checks; the separate Chromium gesture suite also passes. The new real-source
pagination regression adds 205 cards and verifies every item, Next/First pages,
versioned keyboard opening and agenda/grid cursor changes.

The first WebKit planning run exposed Playwright's screenshot preparation injecting
an inline `body {}` stylesheet, rejected by the existing CSP. The harness now
records metrics without WebKit screenshots and recognizes its `cancelled` navigation
reads. The corrected run has no page, console or CSP errors; application policy
was not weakened. Chromium screenshots remain available.

The rebuilt manual app serves verified current assets at its existing HTTPS
address. All 24 existing resource versions, two pins, preferences and the certificate
matched the pre-restart snapshot. Evidence: `pass2-full-gate.log`, `pass2-browser`,
`pass2-gestures`, `pass2-webkit`, `pass2-webkit-final`, `pass2-final-small`,
`pass2-final-large` and `manual-pass2.json` under the ignored loading evidence folder.
Earlier raw-state and eager-editor experiments remain there with their actual results.

## Iteration 3: Focus snapshot summaries — verified 2026-09-30

Focus now includes up to 100 card summaries with its ordered pin membership,
from the same locked projection snapshot. This removes the individual full-source
reads previously used only to construct summaries. Pending/invalid/unavailable
rows retain their availability; missing retained references keep their positions
as unavailable placeholders. Opening a card still reads its current source before
editing. The optional response field preserves compatibility with reference-only
hosts, whose existing bounded detail-read path remains. Contracts, examples and
[ADR-051](../docs/ADR-051-FOCUS-SNAPSHOT-SUMMARIES.md) describe that boundary.

The partial pin index remains in use. Selection/order/limit precede primary-key
document joins; source scans, admission rules, write durability and the no-ETag
rule are unchanged. Initial JS/CSS totals 63,480 gzip bytes (62.0 KiB).

Before and after use five quiet release samples per case with the same hardware,
Chromium 153, 390 × 844 viewport and network/CPU emulation recorded above. The
three-project fixtures contain either 37 cards or 1,000 cards with ten pins.

| Median, ms | Local before | Local after | Constrained before | Constrained after |
| --- | ---: | ---: | ---: | ---: |
| Small, fresh Focus | 73.4 | 73.8 | 749.5 | 754.3 |
| Small, warm Focus | 39.1 | 39.5 | 482.3 | 484.1 |
| 1,000 cards, fresh Focus | 73.4 | 73.1 | 1220.9 | 806.6 |
| 1,000 cards, warm Focus | 56.0 | 54.9 | 935.4 | 523.5 |

The expanded warm constrained case improves by 44%; its final range is
515.8–528.1 ms. Resource traces contain no individual pin reads. Small/local
differences do not establish a speed improvement. Warm daemon/index, synthetic
sources and five-sample medians still do not establish physical-device, VPN or
p95 acceptance.

The final full local gate passes 239 Rust, 112 JavaScript and 12 Python tests.
Release Chromium passes Focus/session, protocol and broad HTTPS checks; WebKit
passes session and the corrected Focus suite. Coverage includes source versions
without bodies, pending reconciliation, unavailable sources, missing index rows,
overflow/order bounds and reference-only host behavior. Safari's click behavior
also exposed missing focus restoration after closing the editor; the Focus add
action now explicitly establishes the focus target before opening it.

WebKit reported queued fetches as access-control page errors when the test
reloaded immediately after an acknowledged reorder, while its follow-up read
was starting. Instrumented runs located them between beforeunload and pagehide,
with cancelled existing reads and no window error/unhandled rejection. The
persistence test now waits for the post-write Focus response and ordinary API
reads to settle before reload; page errors remain failures, without filtering.
The corrected Chromium/WebKit runs pass. An initial broad Chromium run failed
to open a Board editor once; an unmodified repeat and the final application run
passed. The initial cause remains unknown and its evidence is retained.

The existing manual app was rebuilt/restarted and its HTTPS assets match the
current build byte for byte. All 25 existing resource versions, two pins,
preferences and the certificate matched the pre-restart snapshot.

Evidence under the same ignored folder: `pass3-final-gate.log`,
`pass3-format-final.log`, `pass3-browser`, `pass3-protocol`, `pass3-smoke-final`,
`pass3-chromium-refresh`, `pass3-webkit`, `pass3-webkit-refresh`,
`pass3-webkit-diagnostic`, `pass3-final-small`, `pass3-final-large` and
`manual-pass3.json`. Earlier failing SQL, focus restoration, reload and smoke
probes remain there with their actual results.

## Continuing work

Evaluate remaining transfer costs and desktop planning rendering against their
actual effect, followed by source-collection costs in durable creation if still
material. Retain durability, source validation and read bounds. Do not treat the
improvements above as completion of the owner's objective.
