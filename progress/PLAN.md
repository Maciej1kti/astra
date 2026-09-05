# Implementation plan — updated 2026-09-05

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

The v1 requirements and G0–G6 gates in `delivery/PLAN.md` remain the scope.
This file tracks the practical implementation order. It is not a release claim.

| Slice | Current state | Exit condition |
| --- | --- | --- |
| Domain and storage | Implemented and locally tested | Retain strict parsing, safe paths, conditional durable writes and process recovery tests. Finish normalization workflows and date warnings. |
| Application engine | Implemented and locally tested | Registration, typed mutations, sessions, FTS projection, stable pagination and recovery run against real folders. |
| HTTP and Unix transport | Implemented; integration testing | Verify exact Host/Origin, session/CSRF, peer UID, same dispatcher, SSE, CLI and real browser writes. |
| Seven-view application | Initial connected implementation | Focus/history/undo/settings work; finish attention/context APIs, receipts, safe Markdown preview and complete mobile forms. |
| Calendar and timeline | Source-backed rendering and date editor | Required move/resize/scroll/pointercancel trials, accessible fallback, date-only correctness, conflict and cancellation tests. |
| Reliability and maintenance | Outstanding | Stopped-server recovery procedure, normalization, rebalancing, relocation, retention, database versioning, complete fault/security tests and bounded operational behavior. |
| Release | Outstanding | Packaging, repeatable installation, release benchmarks, Linux/ext4 and physical iPhone evidence, clean English documentation. |

## Next actions

1. Keep verified slices committed and pushed, with explicit evidence and gaps.
2. Finish board/date interactions, complete mobile forms and reconnect behavior.
3. Verify maintenance/recovery edge cases, installer and CI results.
4. Finish maintenance, reliability tests and release work.

## Constraints

- Work locally and use the pinned toolchains and repository venv.
- All new repository content is English. Keep outstanding requirements from the
  Polish handoff until implementation and verification allow its replacement.
- GitHub repository is public; source code and synthetic test evidence only.
- The available host is macOS ARM64. Chromium phone emulation does not establish
  physical iPhone/Safari behavior. Process termination is not a power-loss test.
- Do not mark acceptance scenarios passed from a subset of their requirements.
- No public service deployment, VPN changes or privileged service installation
  has been performed or inferred from GitHub publication authorization.
