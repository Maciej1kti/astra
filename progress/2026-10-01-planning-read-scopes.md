# Planning read scopes and local title filters — 2026-10-01

Starting revision: `ed3d06a` (deployed application/control `4906f1c`).
This checkpoint fixes redundant browser reads. The broader performance objective
and release/product acceptance remain open.

## Change and invariants

Calendar, Gantt and Board observe a derived scalar read scope instead of depending
directly on route-backed prop getters. Republishing an identical route during
bootstrap/preferences completion no longer requests the same page again. Typing
or clearing a loaded-title filter also stays local. Calendar includes its actual
project, date range and page limit; all three include the planning revision.

Actual source/health/workspace invalidations, explicit refreshes and query changes
retain their reads. The existing request/gesture owners keep queued invalidations
and fresh follow-ups when a real edit arrives during an unfinished read. Resource
opening, current versions, paging, bounds and partial-result notices are unchanged.
There is no response/source cache or change to protocol, source formats, command
identity, authorization, lock order, fsync or durability. Python remains tooling
and optional Linux integration outside ordinary browser/Rust request handling.

## Release measurements

Apple M4, macOS 27.0 arm64, Node 24.11.0, Rust 1.92.0 and Chromium
153.0.8010.12; 1440 × 1000. Each group has seven cold and seven warm
loads, followed by filtering/clearing on the warm document. Local and constrained
profiles run sequentially without concurrent gates, builds or browser suites.
Constrained settings are CPU ×4, 100 ms latency and 6/1 Mbps download/upload.
Readiness includes rendered DOM, two animation frames and observed ordinary API
reads settling; all samples, resource timings and outliers are retained.

The 37-source-card and 1000-source-card fixtures use ordinary daemon/pairing and
synthetic projects. Gantt/Board retain their existing bounded pages; these are
not claims to render all 1000 cards in those widgets. The dense Calendar page
contains 995 dated items. The additional whole-month fixture spans September.

Constrained median interaction readiness (milliseconds):

| Action | 37 cards before → after | 1000 cards before → after |
| --- | ---: | ---: |
| Calendar filter | 135.9 → 36.2 | 262.4 → 46.1 |
| Calendar clear filter | 142.5 → 43.8 | 363.2 → 177.1 |
| Gantt filter | 147.7 → 30.3 | 174.6 → 28.0 |
| Gantt clear filter | 161.1 → 42.3 | 179.8 → 40.3 |
| Board filter | 30.9 → 30.3 | 34.5 → 30.4 |
| Board clear filter | 176.3 → 43.4 | 227.6 → 60.5 |

Across 168 selected filter/clear actions there are zero planning data GETs, versus
154 in the matched controls. Local median interactions change little because the
redundant read often completed before the next paint; reduced request counts alone
are not used to claim a local speed gain.

Normal opening medians remain broadly unchanged: small Calendar local cold/warm
72.2/39.2 → 72.6/39.5 ms; dense short-plan Calendar 110.3/64.5 → 110.5/65.3 ms;
whole-month 252.6/200.9 → 251.4/201.0 ms. Constrained whole-month cold is
1470.0 → 1471.8 ms, with warm median 1254.2 → 1176.3 ms.
There are no duplicate planning reads in the 196 selected opening samples.

The occasional constrained warm duplicate-read tails are retained: small Calendar
maximum 535.7 → 404.2 ms, dense short-plan 957.0 → 644.5 ms and whole-month
1424.5 → 1253.2 ms. Seven samples per group do not establish a universal tail
bound or a stable percentage improvement for ordinary opening. Dense whole-month
rendering and other workloads still require work.

## Verification and limits

The initial delayed-preferences Calendar and Gantt checks reproduce two reads
instead of one. A Board-only control initially passes; the broader Chromium run
then reproduces two startup reads and WebKit reproduces three reads during the
loaded-title filter sequence. Retained evidence records both observations.
After the scalar scopes, the same start/filter checks pass in both engines.
Subsequent ordinary CLI edits must publish their acknowledged title and exact
current source version, including hidden Calendar items and virtualized Gantt
selection. A focused unit regression retains real same-scope invalidation
follow-ups independently of gestures.

The selected full gate passes 269 Rust, 147 JavaScript and 12 Python tests (428).
Loading, planning, Calendar pages/layout, session and timed events pass in
Chromium/WebKit. An initial concurrent WebKit events setup runs out of disk space;
after package-aware debug artifact cleanup, its repeat passes. The final loading
checks include local filters, pending pairing and failed deferred-import recovery.
Desktop/390px actual Chromium screenshots are inspected; WebKit geometry/behavior
are checked without claiming physical iPhone or real remote-network acceptance.

Raw profiles, saved current control binaries, diagnostic probes, failures, gates,
screenshots and comparisons are in ignored
`test-results/calendar-reads-2026-10-01/`. Diagnostics are removed from app code
and are not published assets.

## Integration

Manual rebuild/restart, preservation verification and the normal CLI outcome
report are pending at this evidence draft. No scope/card acceptance is changed.
