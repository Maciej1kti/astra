# Verification scope and provenance

Final results are linked from [README](README.md). The historic audit directory is unchanged. Screenshots and test data contain synthetic work only; runtime sockets, browser state, certificates and credentials remain ignored.

## Commands

```sh
npm run check
npm run build
scripts/cargo-local build --workspace --locked --release
node --test scripts/tests/*.test.mjs
node progress/audit-2026-09-08/audit-host.mjs
node progress/fixes-2026-09-08/run-browser-checks.mjs
ASTRA_TEST_PROFILE=release ASTRA_EVIDENCE_DIR=progress/fixes-2026-09-08/regression/browser node scripts/browser-smoke.mjs
ASTRA_TEST_PROFILE=release ASTRA_EVIDENCE_DIR=progress/fixes-2026-09-08/regression/planning node scripts/planning-browser.mjs
```

The helper suite passed 25 tests covering board preferences/default collapse, date arithmetic, editor command completion/Undo guards, literal tag limits and suggestions, Markdown safety, route serialization/history decisions and primary creation type, calendar navigation/mobile view selection, and semantic resource dates. The full browser suites also exercise real file persistence, conflicts, retries, SSE, pointer/touch/keyboard gestures, pagination and session loss.

## Repairs discovered during integration

The first static pass found Svelte selector placement, optional Willow children typing and ordinary TypeScript/CSS diagnostics; all were corrected and the final static check is clean. Browser/visual checking then found missing overflow Close text, low-contrast overflow/Today labels, and mobile agenda rows collapsing over their event contents. These were fixed in the application and retested with visible/operable event assertions. A final source review found exact tag-filter trimming and delayed resource-open responses after ordinary scope navigation; both now have passing browser regressions.

## Harness corrections

- Saving settings now intentionally preserves an explicit route. The maintained test checks that behavior and separately verifies the new default at a clean application entry.
- Default Cancelled collapse means a wide board can fit after another column is collapsed. Scroll restoration uses a narrower viewport that actually overflows.
- The status-drag test waits for the real preview and drop indicator before releasing the pointer, preventing a rapid gesture from racing rendering. The source result and identical retry identity remain asserted.
- Focus-response-loss interception waits for the command to finish before checking the persisted result; callback failures are recorded rather than terminating the process.
- A synthetic Board tag was initially 49 characters; it was corrected to the schema limit of 48 after the server correctly rejected it.
- The archive empty-state assertion was updated to the final helpful copy, and archive tests were extended to positive/negative status, priority and exact-tag filtering through reloads.
- Audit connection metadata contains card IDs but not card titles. The planning runner reads the real title through the CLI, asserts it, and reports timeline coverage only when that branch actually runs.
- Dialog evidence uses viewport capture in editor tests; planning checkpoints reset the outer scroll before full-page capture. Earlier failed/stale captures are kept only in ignored local diagnostics, not the final screenshot inventory.

## Limits

Chromium device emulation at 320/390 px does not establish physical iPhone or Safari acceptance. The full regression intentionally mocks native folder selection and selected error responses; ordinary save/conflict/source-update/gesture behavior uses the real release daemon and files. No production SSL, CSP, authentication, durability or protocol requirements were relaxed. This is a verified repair batch, not acceptance of every deferred product-roadmap feature.
