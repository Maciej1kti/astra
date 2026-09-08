# Settings and focus-order dialog follow-up

Date: 2026-09-08. Bounded source implementation; tests and browser checks remain
deferred to the final integrated verification pass.

## Concrete problems addressed

- Settings had no initial loading/error-reload presentation. Week start and
  default view remained editable while an uncertain preferences command was
  retained, whereas timezone was disabled. Saving unchanged preferences was
  enabled, and clipboard success used the error alert.
- Revoking the current Settings browser called the close callback even when
  preferences were dirty. The current-browser action is now disabled while a
  draft or pending command exists, with a visible explanation and the same guard
  in its handler. This protects the draft without silently saving preferences.
- Browser access and pairing maintenance occupied the main settings form area;
  technical command IDs were shown directly. Those sections are now named
  disclosures. Outstanding pairing requests start expanded, pending-command
  feedback and retry remain visible, and the ID is available under Save details.
- Settings uses consistent English enum labels (including Timeline), says that
  theme changes apply immediately to this browser, and labels session timestamps
  as UTC. Current-browser access uses a recognizable Sign out action.
- FocusOrder used unkeyed rows, so reordering changed the card under the focused
  arrow. Rows are keyed by project/card identity; after movement, focus follows
  the moved card and switches to the available arrow at a boundary. Alt+Up/Down
  performs the same guarded local move and announces the new position.
- Both dialogs expose loading, failure/reload, empty or unchanged states and
  unsaved/pending feedback. Success feedback uses a status region. Save guards
  apply in handlers as well as disabled buttons. Ctrl/Cmd+Enter invokes a valid
  save, with normal form validation for Settings.
- Both dialogs use a consistent sans-serif heading, fixed header/footer and one
  scrollable body. Footer actions wrap, long labels/IDs wrap, phone fields use
  16 px text, controls use 44 px targets and the footer respects the bottom safe
  area. Discard confirmation focuses Keep editing and restores the triggering
  focus when dismissed.

No API/backend/domain expansion was made. Existing expected versions, pending
payloads, request IDs, epochs and explicit retries are preserved. Session and
pairing authorization remain the existing application operations.

## Deferred regression helpers

`scripts/settings-dialog-regression.mjs` was written before the current-session
draft-protection change. It exports checks for disabled unchanged Save, protection
against current-browser sign-out with a preferences draft, and the three frozen
preference fields during an uncertain save.

`scripts/focus-order-regression.mjs` exports a browser check that moves the second
card up with the keyboard, confirms focus follows it at the boundary, moves it
back down and verifies the original order and unchanged Save state.

The integration pass should also inspect these dialogs at 320/390 px with long
device names, IDs and titles, keyboard-only close/discard/save, session loss,
clipboard status, and the existing pending-settings browser smoke scenario.
Only formatting was run during implementation, not tests/builds/browser runs.
