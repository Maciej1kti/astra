# Automated static and unit checks — 2026-09-08

Commit: `c3b912fc122b58780f870ee4da27c2d29411725a`.
Environment: macOS 27.0 (26A5425a), arm64; Node v24.11.0; npm 11.6.1.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | PASS; generated API contracts current; Svelte 0 errors / 0 warnings | [npm-check.txt](npm-check.txt) |
| `node --test scripts/tests/*.test.mjs` | PASS; 7 tests, 0 failures, 0 skipped | [node-tests.txt](node-tests.txt) |

The Node suite checks board preference isolation and storage failure tolerance, date-only moves across leap days/months/years/DST, resize range validity, Markdown script/remote-image suppression, timezone-independent inclusive widget dates, and rejection of reversed or empty widget ranges.

These checks do not prove full UI behavior, physical iPhone/Safari compatibility, production TLS trust, screen-reader behavior, or backend fault recovery. Browser regression evidence is recorded separately under `../regression/` after execution.

The publishable text logs preserve test output; the absolute checkout path in the npm log is replaced with `<repository>`. Original `.log` files remain ignored locally.
