# Inline Focus ordering — 2026-09-22

## Scope

Replace the Arrange focus modal with direct manipulation of pinned cards in a
vertical stack styled like Kanban. Hold the primary mouse button, move the card
and release to save; ordinary clicks open the editor. Alt+Up/Down is the keyboard
alternative. Preserve attention badges, the complete pinned list, conditional
versions and stable command retries. The server contract is unchanged.

## Verification

- Full local gate passes: 212 Rust, 98 JavaScript and 12 Python tests, contracts,
  examples, frontend typing, formatting, boundaries, Clippy, release build and
  bundle budget. Rust tests run serially; the desktop portal test stays ignored.
- Three release browser suites pass: Focus (eight scenarios), dialogs and
  autosave. New Focus scenarios verify pointer reordering with one conditional
  write, retained hidden/unavailable pin slots, reload persistence, ordinary
  clicks, no-op drops, outside drops and Escape cancellation. A real concurrent
  write while dragging produces a 412 without replacing the competing order.
  A committed write with a lost reply retains its exact identity, payload and
  version across navigation; retry does not create another source version.
- The broad HTTPS smoke passes, including the replacement keyboard Focus
  ordering scenario, retained keyboard focus and durable reload order.
- Screenshots at 1440, 390 and 320 pixels and the drag preview were reviewed.
  Cards form a vertical stack without horizontal overflow. There are no page
  errors in the focused suites.

Review corrections preserve ordinary click behavior and pointer offset, prevent
late reads from replacing acknowledged order, keep missing summaries visible,
and retain pending writes at App lifetime with a before-unload guard. Reload is
an explicit way to discard a definitively rejected proposal; uncertain commands
retain their original request identity. The old modal and test helper are removed.

Generated logs and screenshots belong in ignored
`test-results/focus-inline-2026-09-22/`.

## Existing runtime

Initial live inventory: two projects, six cards, 28 project reports and two pinned
cards. An independent design-concept report appeared during the work. Immediately
before and after the runtime restart, both projects, all six cards and 29 existing
reports retain identical source versions. The Focus resource, instance ID and
command epoch are unchanged. Both projects validate cleanly; doctor is ready with
no issues or pending commands. The served JavaScript matches the release build
byte-for-byte. No synthetic project was recreated.

After those comparisons, the explicit-project CLI appended result report
`58fce111-cd65-44e8-a117-05a4f9c34ccb`.

Environment: Linux, Rust 1.98.1 via `scripts/cargo-local` (pinned 1.92 unavailable),
Node 24.11.0, Python 3.14.7 and Chromium 153.0.8010.52. Browser emulation is not
physical iPhone/Safari evidence or full release acceptance.
