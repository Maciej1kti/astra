# Settings save themselves — 2026-10-10

The owner asked that the Save button leave the Settings header: Settings should
work as the card does, where every edit saves and the header then says
"Zapisano". Decisions are in [ADR-078](../docs/ADR-078-SETTINGS-AUTOSAVE.md).

## What changed

- `Settings.svelte` no longer holds a draft for a button. Each preference
  change is sent at once through the card editor's autosave engine; the zone
  field, which is text, waits 400 ms and for a name the browser can resolve.
- The header shows the card's save indicator, **Zapisywanie…**, **Zapisano** or
  **Niezapisane**. The button and Control-Enter are gone, and the dialog stays
  open after a save. The workspace reloads its settings when the dialog closes
  after a save.
- `settings-autosave.ts` wires the engine; `settings-draft.ts` builds the
  payload and the settings an acknowledged save leaves. The engine's type no
  longer requires one of the editor's resources.
- The indicator's styles moved from the editor's stylesheet to the shared
  dialog one, so both dialogs draw the same pill.
- After a conflict, loading the current settings keeps the owner's edits
  unsaved until **Zapisz zachowane zmiany** is pressed.

No server, schema, OpenAPI or CLI change.

## Checks

macOS 27.0.1, Node 24.11, Chromium through Playwright, daemon from
`target/release` rebuilt with the new frontend.

- Six new unit tests for the payload, the acknowledged settings, the snapshot,
  the chain of versions across two saves, a conflict that stops saving, and the
  header label. Seen failing first (the module did not exist). `npm run
  test:unit`: 579 pass.
- `npm run check` (contracts and `svelte-check`): 0 errors. `npm run lint`,
  `npm run format:check`, `scripts/check-boundaries.mjs` and
  `scripts/check_package.py` pass. `npm run check:bundle`: 81,744 of 81,920
  bytes.
- `node scripts/browser/regressions.mjs`: all 44 suites pass. Rewritten for the
  new flow: the conflict (C07: one request, fields locked, loading does not
  write, the kept edit saves only on its button, the second request carries the
  competing version), the lost reply (C11: one write, the status check does not
  resend, Settings stay open and saved), the pending-command identity in
  `dialogs`, and the saves in `projects`, `charts`, `project-creation` and
  `agent`. `session-recovery` and `accessibility` now make their unsaved draft
  with an unfinished zone name.
- `node scripts/browser-smoke.mjs` passes.
- In the iOS app on an iPhone 13 mini simulator the header shows "Zapisano"
  beside the close button, below the status bar.

## Found on the way

- My first version treated a zone as valid only when it was in the browser's
  list of zones. Chrome leaves "UTC" out of that list, so that change was never
  sent; two suites caught it. A zone is now sent once the browser can resolve
  its name, and the server decides, as before.
- The first version showed no error text beside the recovery controls after an
  unknown outcome, which the old flow did. One suite caught it.

## Not verified

- A physical phone.
- The Rust part of the gate (`scripts/check.py`): no Rust changed, and the debug
  build cache it needs was removed on 2026-10-09 to make room for Xcode.
- WebKit through Playwright; the suites ran in Chromium.

## Rollout

The release daemon was rebuilt with the final frontend and the owner's manual
instance restarted with its settings unchanged. Instance ID, command epoch,
both profiles, 15 projects, 18 sessions and the stored preferences were
identical before and after; `/healthz` answers 200 and `/api/v1/bootstrap` 401
without a session at the Tailscale address, and all 82 served files equal the
build.
