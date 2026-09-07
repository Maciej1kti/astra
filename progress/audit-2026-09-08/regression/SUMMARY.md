# Browser regression results — 2026-09-08

The existing **browser smoke and planning scripts both reached their final PASS assertions** using the freshly built release binaries from commit `c3b912fc122b58780f870ee4da27c2d29411725a`.

Environment: macOS 27.0 (26A5425a), arm64; Node v24.11.0; npm 11.6.1; Playwright 1.63.0; Chromium 153.0.8010.12. Each test used separate temporary daemon state, synthetic project folders, a local HTTPS proxy, and real browser pairing through `projectctl`.

| Script | Observed result | Evidence |
| --- | --- | --- |
| `browser-smoke.mjs` | PASS, exit 0; all 11 screenshot checkpoints reached; no primary-page JavaScript errors | `browser-smoke.txt` |
| `planning-browser.mjs` | PASS, exit 0; all 8 screenshot checkpoints reached; no page errors, recorded CSP violations, or external-origin requests | `planning-browser.txt` |

Root audit agent launched the commands after owner authorization; the regression worker reviewed the actual output and source. Both shell commands completed with exit code **0**, confirmed by the execution owner. No assertion failures occurred, so no regression rerun was needed.

The planning log includes two HTTP 401 console messages during initial unauthenticated setup and one HTTP 503 from the deliberately injected uncertain dependency write. These console messages did not fail the tested authenticated flows. The script specifically asserts absence of JavaScript page exceptions, CSP violations, and external requests; it does not assert absence of every console message.

**18 screenshots** are stored under `screenshots/`. The smoke script captures its desktop board twice into the same audit-local file; this accounts for 19 checkpoint captures producing 18 final image files. The prior committed `progress/screenshots/` files were not overwritten. Checksums and file sizes are recorded in `results.json`.

The detailed assertion inventory and mocked boundaries are in `../checks/regression-coverage.md`. In particular, TLS trust is bypassed only for each temporary test context, the native OS folder-picker response is mocked, and HTTP 503/prepared replies are injected. Mobile evidence uses Chromium's iPhone 13 device descriptor and synthetic touch events, not physical iPhone/Safari hardware.

These passes establish only the existing scripts' scenarios. They do not clear separate exploratory defects, including unsaved-editor side actions, archive retrieval, or view-dependent Add-action state. The existing scripts do not cover those cases. They also do not establish visual consistency, screen-reader accessibility, valid production certificates, sustained performance, or full release acceptance.
