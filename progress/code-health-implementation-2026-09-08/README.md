# Code health implementation — 2026-09-08

Implemented the owner-authorized follow-up to the [repository audit](../code-health-2026-09-08/README.md),
starting from `171663744338efe8a3f0d23c10d610d6841086f8`. The application keeps its
existing features, source authority, authenticated server writes, expected versions,
stable retries and durability/recovery guarantees.

## Result

- Active views fetch their own data, cancel obsolete reads and refresh only affected
  sections. Pagination survives refresh or explicitly restarts after a stale cursor.
- Card history uses 50 target-filtered records per page; unrelated report volume
  no longer breaks it. Editor relations use known IDs and tag suggestions share a
  short-lived, invalidated cache. Tag management still validates fresh sources.
- Gantt edge preparation is linear. Backend graph analysis runs after releasing
  the index lock, with one bulk predecessor read. Targeted SQL uses composite keys;
  mutation preparation reuses scans and removes identical reference checks.
- Startup completes recovery before admission and verifies projections in the
  background. Pending data is explicitly marked; unchanged sources do not rewrite
  the index. Malformed filenames remain isolated and publish diagnostic changes.
- Assets have verified gzip and immutable caching; API data remains private.
  SSE observes shutdown, revocation and expiry without one-second database polling.
  Request admission now bounds body collection and parsing together.
- CLI requests have named fields and shared bounded error decoding. Invalid server
  errors preserve uncertain command identity instead of producing `error: null`.
- Browser regressions use portable, normally paired temporary hosts and run in CI.
  New bulk artifacts are ignored, checksummed and retained by CI for 90 days.
  Historical acceptance screenshots remain referenced; this does not shrink Git history.

The browser run additionally exposed and fixed a calendar loading-layout shift,
disappearing resize handles during a background read and unsafe selection-helper
rendering. Regression coverage deliberately holds a real response during a gesture.

## Measurements

| Measurement | Before | After |
| --- | ---: | ---: |
| Standard workload durable mutation p95 | 111.11 ms | 71.66 ms |
| Standard workload list/search p95 | 20.86 ms | 20.45 ms |
| Standard workload attention p95 | 31.39 ms | 29.82 ms |
| Pure JS projection: 200 nodes, 14,950 edges | 199–407 ms | 0.33–1.18 ms |
| List manual refresh, real browser | Six base collections plus focus hydration | Projects + cards only |
| Card activity, real browser | Full project report enumeration | 50 + 5 targeted records, lazy bodies |

The final implementation's fully indexed eager initialization took 4,952 ms versus
52 ms for recovery-first initialization; the first retained query took 10 ms.
Required source verification still took 4,994 ms afterward. Startup modes have one
sample each and exclude listener binding/browser rendering. The graph measurement
compares the original expression with the actual extracted function, not widget
rendering. See [backend evidence](backend.md), [raw final workload](checks/backend-final.json)
and [graph measurements](checks/gantt-benchmark.json).

The initial JS/CSS gzip estimate is about 119 KiB, versus 115.5 KiB at the baseline,
still below the 300 KiB entry budget. This refactor improves reads, computation and
actual asset delivery; it does not claim a smaller JavaScript bundle. No runtime
dependency was added, and two unused direct dependencies were removed.

## Verification

The integrated check covers generated contracts/examples, package links, OpenAPI,
112 Rust tests, 47 JavaScript tests, 12 Python tests, zero Svelte errors/warnings,
formatting, strict Clippy and the release build. See the [full integrated output](checks/full-check.txt)
and [final verification capture](checks/final-check.txt).

The release browser command runs the broad workflow and planning suites plus card,
tags, editor, dialogs, planning navigation and code-health regressions. It uses real
HTTPS, normal pairing, Unix CLI writes and synthetic files. Bulk output remains in
`test-results/browser/`; all eight suites passed. See the [result summary](checks/browser-results.json)
and [complete browser output](checks/browser-release.txt). Expected authentication
and deliberately injected service errors in the log are exercised recovery cases;
there were no unhandled page errors or CSP violations.
The packaged archive also passed checksum verification, repeat temporary installation,
stop/restart, copied-state recovery, index rebuild and old-epoch rejection.
[Packaged release check](checks/package-release.txt).

```sh
.venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release npm run test:browser
scripts/cargo-local run --release --locked -p project-application --example benchmark -- 100 100 500
node progress/code-health-implementation-2026-09-08/checks/gantt-benchmark.mjs
```

## Deliberate boundaries

The single-project stress workload with 1,000 cards has mutation p95 478 ms;
large-collection source checks remain a measured follow-up. Dense concurrent Gantt
latency, steady-state memory and physical iPhone/Safari/Omarchy acceptance are not
established here. A generic Date/Move dialog state machine was not introduced across
different completion semantics; the shared transport and existing conflict/draft
behavior are verified. The [work-item record](PLAN.md) maps every audited item to
its implementation and evidence. This batch does not claim complete v1 acceptance.
