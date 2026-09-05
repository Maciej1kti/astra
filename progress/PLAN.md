# Implementation plan — updated 2026-09-05

The v1 requirements and G0–G6 gates in `delivery/PLAN.md` remain the scope.
This file tracks the practical implementation order. It is not a release claim.

| Slice | Current state | Exit condition |
| --- | --- | --- |
| Domain and storage | Implemented and locally tested | Retain strict parsing, safe paths, conditional durable writes and process recovery tests. Finish normalization workflows and date warnings. |
| Application engine | Implemented and locally tested | Registration, typed mutations, sessions, FTS projection, stable pagination and recovery run against real folders. |
| HTTP and Unix transport | Implemented; integration testing | Verify exact Host/Origin, session/CSRF, peer UID, same dispatcher, SSE, CLI and real browser writes. |
| Seven-view application | Initial connected implementation | Finish focus editing, history/undo, attention/context APIs, receipts, settings, safe Markdown preview and complete mobile forms. |
| Calendar and timeline | Source-backed rendering and date editor | Required move/resize/scroll/pointercancel trials, accessible fallback, date-only correctness, conflict and cancellation tests. |
| Reliability and maintenance | Outstanding | Backup/restore, normalization, rebalancing, relocation, retention, schema upgrades, complete fault/security tests and bounded operational behavior. |
| Release | Outstanding | Packaging, repeatable installation, release benchmarks, Linux/ext4 and physical iPhone evidence, clean English documentation. |

## Next actions

1. Complete real HTTPS browser + CLI smoke test and fix any integration defects.
2. Commit and push the verified transport/UI slice with evidence and explicit gaps.
3. Implement the remaining workspace/history/context/attention operations through
   durable command handling. No direct-write CLI fallback or forced overwrite.
4. Finish interaction trials, maintenance, reliability tests and release work.

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
