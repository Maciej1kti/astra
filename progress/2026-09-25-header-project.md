# Project selection in the shared header

The shared workspace header now owns the project selector for Focus, Board,
Calendar, Timeline, List and Updates. Removed the duplicate label/selector and
the redundant Workspace prefix. Projects remains the full workspace overview.
Focus uses the same top header and places title filtering before its sections.
Its floating Add card action remains accessible above mobile navigation.

Narrow headers retain settings and refresh; Git, diagnostics and Sign out use
the shared action menu. Project names truncate without widening the page. Menu
actions close through a shared callback so dialogs return keyboard focus to the
menu trigger. A direct browser check reproduced the missing focus restoration
before this final correction; responsive E2E now covers it.

Verification on macOS with release assets and Chromium:

- Responsive: 36 checks, including all seven views at 320, 390, 768 and 1024px,
  a single header picker, project changes, reload, Back/Forward, retained project
  selection across views, menu Escape and dialog focus restoration.
- Focus: 9/9, dialogs: 7/7, editor: 14/14. Responsive, dialogs and editor were
  rerun after the menu focus correction. No browser exceptions were observed.
- Reviewed the running dev app at 1440 × 1000, 768 × 1024, 390 × 844,
  320 × 740 and 844 × 390, with light/dark screenshots. Header placement,
  filtering, reload, menu availability and overflow checks pass.
- Frontend types/contracts, formatting, boundaries, bundle, package validation
  and `git diff --check` pass. The existing dev launcher runs the rebuilt assets
  and release daemon with its previous configuration.

Reproduce with:

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs responsive focus dialogs editor
```

Evidence is in ignored
`test-results/header-project-2026-09-25/`, with the final menu checks in
`final-e2e/`. No unit tests were added or run, following the owner's direction.
Physical-phone/Safari acceptance and the full release gate remain open.
