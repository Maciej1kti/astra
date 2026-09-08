# Editor and tag repair batch

Implemented on 2026-09-08. Validation is deferred until the integrated batch, as requested by the owner. This file is an implementation record, not a claim that browser acceptance has passed.

## Defects addressed

- **A01 — draft lost during a side action:** focus and read-receipt commands now have their own completion path. A successful send or a recovered `committed` status refreshes the side state without calling the resource-save callback. Pinning and removing a pin preserve the current draft. Focus conflicts refresh only focus state; they do not turn into a card-version conflict or overwrite any card fields.
- **Dirty Undo:** Undo is unavailable while a draft, in-flight command, unknown command result or expired session exists. The history section explains that the draft must first be saved or discarded. The handler repeats this guard before constructing a command.
- **A02 — saved labels silently split:** labels remain an array throughout the editor. Unrelated edits preserve commas, whitespace, case and Unicode representation in existing labels. The array is sent unchanged; source labels are never parsed as comma-separated text.
- **A10 — generic duplicate-label failure:** the chip picker validates duplicate names, the 20-tag limit and the 48-Unicode-code-point name limit next to the field before a write. Removing a chip affects only the edited card. New typed names trim outer whitespace; picking a source suggestion preserves its exact spelling. Identity remains case-sensitive, matching the existing contract.
- **Pending command safety:** fields are locked while a command result is unresolved, preventing the displayed draft from diverging from the immutable payload that will be retried. Retry retains the original `Pending` object, request ID, epoch, expected version and payload.

## Inspector and tag interaction changes

The header shows project, card title and draft state. Description comes before planning details. The date group is explicitly headed Planning. Milestone and dependency selections display resource titles, with raw identifiers in a separate technical disclosure. Archive is under Card lifecycle. Card updates are loaded on demand and displayed in the inspector with their kind, timestamp and safe Markdown body.

The Labels field accepts one literal tag on Enter or Add tag. A nonempty typed name is validated and added as one tag during Save as well. Arrow keys select existing suggestions, Escape dismisses suggestions, and each chip has an explicitly named 44px removal control. Suggestions are derived from paginated active and archived card summaries in the current project. They are not a new global dictionary. Discovery failure leaves manual entry available and offers a retry.

The picker does not implement global rename, merge, usage counts or a schema migration. The inspector does not add a structured acceptance-checklist model; its existing Markdown body remains the source of description and acceptance text.

## Parent integration

- `onchanged?: () => void`: refresh underlying views after a focus/read-receipt commit without closing or remounting the editor.
- `requestClose(): boolean`: request normal close or dirty-draft confirmation. Returns false while a write/status check is in flight, otherwise true.
- `onkeepediting?: () => void`: clear a queued navigation when the user keeps the draft.
- `onsaved`: still handles committed resource changes and clean Undo.

Existing browser fixtures that fill `Labels` with CSV must add each tag separately with Enter. Commas are intentionally literal. Fixtures changing Archived must open Card lifecycle first. Read-receipt and Pin actions now leave the editor open; tests must close it explicitly when moving to another view.

## Required integrated checks

The committed audit already reproduces A01 and A02 (`explore.json` check 04 and `followup.json` check 32). The owner requested implementing the broad batch before executing new tests.

`node --test scripts/tests/editor-actions.test.mjs` covers action routing, Undo guards, literal source labels, duplicate and length/count boundaries, and suggestion identity. Browser checks must additionally verify:

1. Edit title and body, Pin, remove the pin, then save; the draft and eventual source values remain intact.
2. Recover a focus command through Check status after an unknown response; keep the draft and refresh focus without a second command.
3. Reproduce a focus-version conflict; keep the card draft and show the current pin state for an explicit new action.
4. Create a card with a comma-containing label, edit only its title, then inspect the persisted exact array.
5. Add, discover, remove and reject a duplicate tag with keyboard and pointer controls; exercise 20-tag and 48-character limits.
6. Attempt Undo with a dirty draft; no PATCH is sent. After an intentional draft close/reopen, clean Undo still succeeds.
7. Browser Back while dirty shows the normal discard guard; Keep editing retains the URL and draft.
8. Open named relationships, related card updates and archive lifecycle at desktop and narrow widths.

Physical touch-device testing, global tag management and a richer persistent card schema remain separate work.

## Prepared browser harness

`editor-browser-checks.mjs` exports `runEditorChecks({ page, config, cli, evidenceDir, runtimeDir })` and also runs independently against the synthetic audit host. It creates its own repair probes through the CLI, uses ordinary browser pairing, and records each scenario separately before continuing after a failure. Cookies and connection details stay in ignored runtime storage. Its focus recovery case forwards a real command to the daemon, waits for success, then loses only the browser response and checks the actual recorded command status.

An additional navigation regression requests Browser Back with a dirty draft, saves from that confirmation state, verifies the persisted title and queued destination, and then exercises another view transition plus rapid clean resource Back/Forward. Final regressions also distinguish a literal tag with outer spaces from its trimmed spelling, and hold real card-read responses while switching the view or project to verify that late results cannot open an inspector. The custom harness now contains 15 cases.

After building the integrated release and starting `node progress/audit-2026-09-08/audit-host.mjs`:

```sh
ASTRA_EVIDENCE_DIR=progress/fixes-2026-09-08/editor-browser node progress/fixes-2026-09-08/editor-browser-checks.mjs
ASTRA_TEST_PROFILE=release ASTRA_EVIDENCE_DIR=progress/fixes-2026-09-08/browser-smoke node scripts/browser-smoke.mjs
ASTRA_TEST_PROFILE=release ASTRA_EVIDENCE_DIR=progress/fixes-2026-09-08/planning-browser node scripts/planning-browser.mjs
```

The maintained smoke scripts now close the inspector explicitly after Pin and read-receipt mutations, match the descriptive Markdown field label, and send screenshots to `ASTRA_EVIDENCE_DIR`. Their fixtures did not use the removed comma-label entry or Milestone ID input. The separate repair harness covers literal tag creation, archive lifecycle and named relationships directly.
