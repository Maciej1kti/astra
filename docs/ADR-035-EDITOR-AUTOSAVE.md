# ADR-035 — Automatic card and project editing

Status: accepted by the owner, 2026-09-22.

## Decision

Card and project editors save changes automatically. Text input is debounced for
400 ms; discrete changes and closing the editor flush valid edits. These editors
have no Save changes or Cancel buttons. Acknowledged writes keep the editor open
and show its save state. New cards are created once a valid title is entered;
subsequent edits update that resource. Board quick creation retains its existing
close-after-creation interaction. Milestones and append-only reports retain their
explicit submission controls.

## Ownership and consistency

The editor owns its draft, acknowledged source/version and queued edits. Only one
resource write is in flight. Each command freezes its input, observed version,
request ID and epoch. Typing may continue while the server processes a write;
the next command uses the acknowledged version and the newest draft. Optional
field removal is calculated against the acknowledged source. The application
refreshes its views and updates the resource route without remounting the editor.

An uncertain result pauses automatic writes. Status checks and retries retain
the original command identity and payload. A conflict preserves the draft and
requires deliberate recovery; no automatic refetch-and-overwrite is introduced.
Correcting a definitively rejected validation proposal starts a new command
against the same observed version. This does not apply to conflicts or unknown
outcomes.
Invalid intermediate input remains in the editor until corrected. Closing must
either finish valid queued edits or expose the unresolved draft. Browser unload
continues to protect unsaved or uncertain work.

Tag and acceptance-item entry buffers are committed through their Add controls;
individual letters are not separate entries. A report draft has its own explicit
Post action and command lifecycle, independent of card edits. Deletion and other
resource commands cannot race with an outstanding automatic write.

## Compatibility

This changes browser interaction only. Existing versioned POST/PATCH commands,
validation, journal durability, source formats and CLI behavior are unchanged.
There is no new mutation endpoint or protocol revision.
