# Implementation state

Updated: 2026-09-05. Status: **in progress; not release-ready**.

Public repository: https://github.com/Maciej1kti/astra. New repository content,
UI text and commits are English. Continue until the v1 scope is implemented and
verified; preserve requirements from the temporary handoff until then.

## Implemented

- Shared Rust domain and generated TypeScript models; strict document validation.
- Descriptor-based storage, exclusive project leases and durable conditional writes.
- SQLite command journal, stable retries, crash recovery and history recording.
- Resumable registration plans, pairing and sessions, FTS projections and cursors.
- HTTP/Unix service, authenticated browser/UID transports and CLI (integration work).
- Initial seven-view Svelte UI and common editor connected to real API resources.
- Approved directory browsing and SSE invalidations.

Latest fully verified committed engine slice: `a7a822a`; evidence E004.
Transport/UI changes are under active verification; use `git status` for the exact
working tree. The current source supersedes historical implementation claims in
older evidence entries.

## Outstanding

Full workspace writes, history/undo/context/attention APIs, receipts, settings,
Markdown preview, calendar/Gantt manipulation trials, maintenance operations,
retention/upgrades, performance/security/fault coverage, packaging and final
English documentation cleanup. Gate and acceptance completion remain unclaimed.

## Environment

macOS 27.0 ARM64; Rust 1.92.0 in `.tools/`; Node 24.11.0; Python 3.14.6 in
`.venv-check`. No Linux/ext4, physical iPhone or physical power-loss evidence.
The HTTPS browser test uses temporary self-signed TLS and the normal pairing
flow, with temporary synthetic projects; it does not change the user's network.

Read `progress/PLAN.md` and the newest evidence entry, then continue the next
unfinished slice. Full checks: `.venv-check/bin/python scripts/check.py`.
Browser smoke: `node scripts/browser-smoke.mjs` after the frontend and debug Rust
workspace are built and Playwright Chromium is installed.
