# Transport and connected UI verification

Date: 2026-09-05. Host: macOS 27.0 ARM64. This is an implementation slice,
not completion of G1/G2/G4 or the v1 acceptance matrix.

Implemented an Axum daemon with embedded Svelte assets, loopback-only HTTP,
strict HTTPS public-origin/Host validation, browser pairing/session/CSRF checks,
a separate Unix transport authenticated by peer UID, bounded blocking dispatch
and SSE connections, and a Unix-only CLI. Approved root capabilities constrain
browser directory browsing; tests reject traversal, symlinks and replaced roots.

The seven-view UI reads real projects, cards, milestones and updates. The common
editor preserves drafts on conflict and keeps command identity for uncertain
retries. Registration has an explicit source-change preview. Native dialogs trap
focus. Markdown is currently shown as escaped source; safe rendered preview is
still outstanding.

Validation:

- 41 Rust tests pass, including HTTP pairing/CSRF and Unix registration/retry tests.
- Python, OpenAPI, generated contract drift, strict Clippy, Rust release build and
  Svelte checks/build pass. Svelte reports zero errors and warnings.
- `scripts/browser-smoke.mjs` passes through real HTTPS pairing, CLI registration,
  real file creation, desktop and Chromium phone emulation, a two-client version
  conflict and preserved mobile draft. The script visits all seven views.
- Frontend production output is about 78 kB JavaScript and 18.7 kB CSS before gzip.
  This is bundle evidence, not a performance acceptance benchmark.

Logs: `progress/checks/transport-ui.txt`, `progress/checks/browser-smoke.txt`.
Synthetic screenshots: `progress/screenshots/desktop-board.png` and
`progress/screenshots/mobile-conflict.png`.

Remaining work includes workspace writes, history/undo/context/attention APIs,
receipts, settings, full date manipulation and touch trials, complete maintenance,
security/fault/retention coverage, packaging, Linux and physical iPhone testing.
No physical power-loss, public deployment or completed acceptance gate is claimed.
