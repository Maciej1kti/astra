# Dialog editing, responsive controls and motion

Date: 2026-09-25. This continues the shared UI system from `c2a7266`.

## Result

- All dialog features use a shared header, fixed actions and a scrolling body.
  Card/project titles are directly editable once in the content; Enter finishes
  editing through existing autosave. Card pinning remains visible, while archive
  and deletion live in a compact action disclosure.
- Checklist controls remain compact and usable. Description/tag editing keeps
  pointer targets stable through clicks. Closing the tag manager returns focus
  to settings, including Escape dismissal and reopening.
- Mobile List no longer squeezes its controls into unreadable arrows. Project,
  resource type and search stay visible; secondary filters expand with an active
  count and preserve route state on reload. Calendar navigation has a full row.
  Planning controls are isolated from workspace toolbar selectors.
- Dialogs allow vertical content scrolling without sideways movement. Long text,
  code and Markdown table cells wrap; the background document is locked. Pinch
  zoom remains available. Narrow native form controls use readable text sizes.
- Shared motion tokens drive brief vertical/fade entrances, action disclosures,
  button feedback and fine-pointer card hover. View animation does not rerun for
  typing or data refreshes. Reduced motion disables transitions and animations.

## Verification

Release assets and binaries were built in the required order. Chromium
153.0.8010.12 on macOS, Node 24.11.0:

- `npm run check`, `npm run format:check`, `node scripts/check-boundaries.mjs`,
  `npm run check:bundle`, package checks with `--skip-manifest`, and
  `git diff --check` pass.
- The broad HTTPS smoke and planning gesture check pass. All 12 browser
  regression suites pass across the final broad run and a focused autosave rerun.
  AS09 originally measured centering during the new entrance animation; it now
  waits for the actual animation to finish, preserving its centering assertions.
  No application change was needed for that rerun.
- New responsive coverage checks seven views at 320, 390, 768 and 1024px,
  List filter persistence, readable Calendar navigation, diagonal touch swipes
  in a long modal, wrapped table/text content and reduced-motion behavior.
- The running manual app was reviewed at 320, 390, 768, 1024 and 1440px across
  all seven views. Card/project/settings and eight supporting dialog scenarios
  were reviewed at desktop, phone and tablet widths. No page overflow or browser
  exceptions were observed. Source validation passed for all 54 documents after
  appending this result's project report.

Evidence is ignored under `test-results/modal-ux-2026-09-25/`: `final-complete/`,
`autosave-motion/`, `responsive-verified/`, `mobile-after/` and `live/`.
Reproduce with `ASTRA_TEST_PROFILE=release npm run test:browser` after building;
the maintained `responsive` suite also runs independently through the runner.

The in-app browser rejected the local self-signed certificate. Actual app checks
used the normally paired development host and browser automation with test-only
certificate handling. TLS, authentication, release CSP and network settings
were unchanged. Per the owner's E2E direction, no unit tests were added or run;
this is not the full local gate, physical iPhone/Safari evidence or release
acceptance. The two pre-existing card source edits were excluded from this work.
