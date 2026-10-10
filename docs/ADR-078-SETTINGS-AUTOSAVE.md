# ADR-078 — Settings save themselves

Status: accepted on the owner's 2026-10-10 direction; see
[scope](../progress/SCOPE.md#settings-save-themselves--owner-direction-2026-10-10).

Settings had a **Zapisz ustawienia** button in the dialog header: fields were a
draft until it was pressed, and a successful save closed the dialog. The owner
asked for Settings to behave as the card does
([ADR-035](ADR-035-EDITOR-AUTOSAVE.md)): every edit saves, and the header says
**Zapisano**.

## Decision

Workspace preferences save automatically, through the card editor's autosave
engine. The header shows that engine's state in the card's three words,
**Zapisywanie…**, **Zapisano** and **Niezapisane**, and has no Save button and
no Control-Enter shortcut. The dialog stays open after a save.

- Every preference is a discrete choice, so a change is sent at once. The zone
  field is text: it is sent when what is typed names a zone, and until then the
  draft is unsaved.
- One command is in flight at a time. Each is conditional on the version the
  previous one produced; a change made meanwhile waits behind it with the newest
  draft, as in ADR-035.
- The reply to a preferences command names only the new version, so the settings
  a next command is based on are the acknowledged payload over the previous
  settings. They are not read again after a save: a read could bring in someone
  else's later change, which the next command would overwrite without a
  conflict.
- Closing lets a save on its way finish. If anything was saved while the dialog
  was open, the workspace reads its settings again when it closes.

Recovery is as explicit as before, and nothing is retried or re-read for the
owner:

- A conflict locks the fields and offers **Wczytaj aktualne ustawienia**. That
  read keeps the fields the owner edited and lets the others follow the saved
  state. The kept edits are then unsaved until **Zapisz zachowane zmiany** is
  pressed; loading never writes.
- An unknown outcome locks the fields and offers the status check and the
  identical retry, with the original request ID, epoch, version and payload.
- A definite validation rejection shows its message; a corrected value is a new
  command.
- Closing with unsaved or unresolved work asks before discarding it, and the
  page guards against unloading it.

Adding a user stays an explicit action with its own command: it creates
something, like the Add controls of ADR-035. Appearance choices were already
immediate and local to the browser.

## Compatibility

Browser interaction only. The versioned `PATCH /api/v1/workspace/preferences`,
its validation, durability and the CLI are unchanged; there is no new endpoint
or protocol revision.

## Consequences

- A change takes effect without a second step, and a mistaken choice is undone
  by choosing again, which is another save.
- Changing the timezone is as immediate as any other choice. Its note that
  all-day dates do not move still stands beside the field.
- The engine keeps its editor name and lives in `features/editor`; Settings
  import it from there.
