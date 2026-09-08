# Implementation state

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

Updated: 2026-09-08. Status: **ready for owner manual testing; full release acceptance remains open**.

Public repository: https://github.com/Maciej1kti/astra. New repository content,
UI text and commits are English. Continue until the v1 scope is implemented and
verified; preserve requirements from the temporary handoff until then.

## Implemented

The [code-health implementation](code-health-implementation-2026-09-08/README.md)
adds scoped/cancelled reads, bounded card history, indexed and graph optimizations,
recovery-first startup, static gzip/cache policy, bounded HTTP admission, SSE
shutdown and portable regression suites. Its release measurements and remaining
large-project/device limits are recorded separately from product acceptance.

The 2026-09-08 follow-up adds structured card results, ordered acceptance criteria,
owner labels, inline card updates, and workspace tag management with versioned
rename/merge previews. See [stage 2 evidence](stage2-2026-09-08/README.md) for the
implemented slice, current checks and remaining product scope. This follows the
[browser-audit repair batch](fixes-2026-09-08/README.md).

- Shared Rust domain and generated TypeScript models; strict document validation.
- Descriptor-based storage, exclusive project leases and durable conditional writes.
- SQLite command journal, stable retries, crash recovery and history recording.
- Resumable registration plans, pairing and sessions, FTS projections and cursors.
- HTTP/Unix service, authenticated browser/UID transports and CLI (integration work).
- Initial seven-view Svelte UI and common editor connected to real API resources.
- Approved directory browsing and SSE invalidations.
- Durable focus/preferences, conditional undo, history and browser settings.

Latest planning slice: [E026](E026-planning-widgets.md), implementing the owner's
2026-09-07 Gantt and calendar request. The preceding Kanban freeze is recorded
in E025 and remains in place. E026 records current Arch Linux checks and the
remaining physical-device and rendering-performance limits.
Workspace/history verification is recorded in E006; use `git status` for the exact
working tree. The current source supersedes historical implementation claims in
older evidence entries.

## Current handoff

Owner steering prioritizes manual feedback over further pre-release hardening.
Run `npm run try`; see `MANUAL-TESTING.md`. The current local automated checks and
HTTPS smoke pass. CI run 33984427678 passed Ubuntu and macOS for 00bb2bd.

## Outstanding after manual feedback

Finish remaining UI forms and release ergonomics,
remaining performance/security/fault coverage, CI/platform verification and final
English documentation cleanup. Gate and acceptance completion remain unclaimed.

## Environment

The code-health batch was verified on macOS arm64 with pinned Rust 1.92.0,
Node 24.11.0 and Chromium 153.0.8010.12. Earlier Arch Linux planning verification
with system Rust 1.98.0 and Chromium 151.0.7922.173 is retained in E026.
Neither batch establishes physical iPhone/Safari acceptance.
Physical power-loss acceptance also remains open.
The HTTPS browser test uses temporary self-signed TLS and the normal pairing
flow, with temporary synthetic projects; it does not change the user's network.

Read `progress/PLAN.md` and the newest evidence entry, then continue the next
unfinished slice. Full checks: `.venv-check/bin/python scripts/check.py`.
Build the frontend and release Rust workspace, install Playwright Chromium, then
run all browser coverage with `ASTRA_TEST_PROFILE=release npm run test:browser`.
See [portable browser suites](../scripts/browser/README.md) for isolated fixtures
and the artifact-retention policy.
