# Code health implementation

Owner instruction: implement the reviewed audit carefully. Baseline revision:
`171663744338efe8a3f0d23c10d610d6841086f8`.

All work preserves source authority, authenticated server writes, version conflicts,
stable retry identity, journal recovery and durability. Product acceptance statuses
and the retained scope decisions are unchanged.

| Audit | Work item | Owner | State |
| --- | --- | --- | --- |
| 1 | Isolated projection issues and health invalidation | Backend | Implemented; failing-before and green regressions |
| 2 | Target-filtered paginated card history, complete contracts | Backend + frontend | Implemented; 20,000+ unrelated reports and real browser paging |
| 3 | Active-view queries, cancellation and scoped invalidation | Frontend | Implemented; scoped request counts, bursts, cursors, navigation |
| 4 | Bounded relation resolution and shared tag suggestions | Frontend | Implemented; real inspector/tag management plus TTL/session tests |
| 5 | Linear Gantt edge projection | Frontend | Implemented; equivalent output and measured pure-JS speedup |
| 6 | Gantt snapshot/graph lock separation and predecessor lookup | Backend | Implemented; forecast/warning regressions; dense contention measurement open |
| 7 | Selective targeted projection SQL | Backend | Implemented; bundled SQLite plans and incremental projection tests |
| 8 | Reuse mutation preparation and deduplicate references | Backend | Implemented; conflict/crash coverage; large-project cost measured |
| 9 | Recovery-safe startup and bounded reconciliation | Backend + integration | Implemented; cached/empty/recovery tests and engine measurements |
| 10 | Static asset caching and compression | Transport | Implemented; real negotiation, decompression, headers and HEAD tests |
| 11 | Portable maintained browser suites and CI coverage | Integration | Implemented; eight release suites with fresh normal pairing |
| 12 | Shared summary adapter and narrow response enums | Frontend | Implemented; focus fallback badges and strict type checking |
| 13 | Evidence retention and repository hygiene | Integration | Policy applied; historical referenced evidence intentionally retained |
| 14 | SSE shutdown and efficient passive liveness | Transport | Implemented; real process SIGTERM, revocation and expiry tests |
| 15 | Admission before request buffering/parsing | Transport | Implemented; slow bodies, cancellation, deadlines and stream limits |
| 16 | Named CLI requests and shared bounded response handling | Integration | Implemented; structured/malformed errors, replay and preview regressions |

Implementation stages: focused regressions and local fixes; coordinated contract
changes; view/data/transport refactors; full checks and release measurements;
portable browser verification; final documentation and verified integration.
Historical audit evidence is retained. New bulk browser artifacts go to ignored
output with concise checked-in summaries and reproducible commands.

This records the implemented code-health batch, not completion of every proposed
load/device experiment or all v1 acceptance. Dense rendered/concurrent Gantt,
process-to-browser startup and steady-state resource measurements remain separate.
Large single-project mutation cost is recorded in `backend.md`; safety checks were
retained. Shared Date/Move UI state extraction remains optional after measured need.

No root `.project/` exists in this checkout. Do not create one or write project
reports directly; implementation evidence belongs in this progress directory.
