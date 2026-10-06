# Touched menu actions in WebKit dialogs — 2026-10-06

The owner could not delete the pinned card **next** from its editor on a phone.

## Findings

Reproduced on a disposable host holding a copy of the project source, at 390px
with touch input.

- **WebKit dropped the tap.** Touching **Usuń kartę** closed the card menu and
  nothing else happened. `ActionMenu` closes when focus moves outside it and
  ignores that move while a pointer is held inside. WebKit focuses the
  containing dialog before it dispatches the click; with a mouse the pointer is
  still down, but a touch has already released it, so the menu and its button
  were removed before the click arrived. Every menu action inside a dialog was
  affected for touch input in WebKit; Chromium was not.
- **A pinned card is refused by design.** In Chromium the same flow reached the
  server, which answered `409 CARD_IN_FOCUS`. The editor shows that the card
  must be removed from Focus first and then requires reopening it. This rule is
  unchanged here.

## What changed

`ActionMenu` no longer treats focus on an element that contains the menu as a
move away from it. Pointer presses outside, focus on any other element and
Escape dismiss it as before.

## Verification

Release build, real daemon, synthetic disposable hosts.

- New `deletion` check `D01-touch` taps the card menu, **Usuń kartę** and the
  confirmation in a 390px touch context and expects the source file to be
  gone. It failed in WebKit before the change and passes after it.
- WebKit: `deletion`, `menus`, `dialogs`, `navigation` pass.
- Chromium: `deletion`, `menus`, `dialogs`, `navigation`, `editor`, `card`,
  `counters`, `charts`, `card-layout`, `focus-controls`, `tags`, `projects`,
  `comments` pass.
- `npm run check`, ESLint, Prettier and `check:bundle` (80,449 of 81,920 gzip
  bytes).

## Limits

Playwright's WebKit with emulated touch stands in for iOS Safari; no physical
iPhone was used. Whether a pinned card should be deletable in one step is an
owner decision and remains open.
