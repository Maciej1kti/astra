# Card and project editor autosave — 2026-09-22

## Result

Card and project editors save valid text after 400 ms and discrete changes
immediately. Save changes and Cancel are removed. Closing flushes pending edits;
new cards are created once and then edited with PATCH. Board quick creation still
closes after creation. Reports and milestones retain explicit submission.

The editor retains its live draft across acknowledgements, including unfinished
tag/checklist entries. Its command queue builds each patch against the preceding
acknowledged source/version, including optional-field removal. Conflicts and
unknown outcomes preserve the draft and original command identity. Correcting a
definitively rejected validation proposal creates a new conditional command.
Delete, Undo and navigation coordinate with pending saves; loaded history updates
after an acknowledgement. App refreshes routes/views without remounting the editor.
See [ADR-035](../docs/ADR-035-EDITOR-AUTOSAVE.md).

## Verification

Baseline browser regression failed on the retained Cancel control. Review
regressions also reproduced redundant writes after reverting queued input and
the inability to correct a definitively rejected validation proposal. Each now
passes. Queue coverage includes latest-value serialization, optional-field clear,
second-command failure identity, stable retry and session loss between writes.

The local gate passes 210 Rust, 93 JavaScript and 12 Python tests, schemas/examples,
frontend typing, import boundaries, formatters, Clippy and release builds. One
desktop-portal test remains ignored as in the preceding checkpoint. Logs and
browser artifacts are under ignored `test-results/autosave-2026-09-22/`.

All ten release browser regression suites pass, including eight new autosave
cases, 15 editor cases, direct/status conflict outcomes and permanent deletion.
The full HTTPS browser smoke and planning browser workflow also pass. The browser review caught and fixed
quick creation being skipped when its prefilled title equalled the initial draft;
it also verifies queued deletion, unchanged report semantics, clear-after-ACK,
entry-buffer preservation and navigation through an outstanding write.

The smoke harness now clicks the enabled card action after refresh, verifies
keyboard focus before ordering and waits for its held request handler before
removing the session-revocation interception. These preserve the original
interaction and session assertions while accommodating automatic writes.

## Local runtime

Restarted the existing manual launcher as previously requested by the owner.
The HTTPS service serves the verified build bytes; its instance identity, command
epoch and two registrations are unchanged. No network or privileged-service
configuration was changed. The source repository and user project data remain
separate from ignored runtime/test artifacts.

Environment: Arch Linux/Btrfs, Node 24.11.0, Rust 1.98.1 via `scripts/cargo-local`,
Python 3.14.7 and Chrome 153.0.8010.52. Browser fixtures use isolated temporary
projects, ordinary pairing, HTTPS and the release daemon. No user project was used
as a destructive test fixture. Phone-sized Chromium is not physical iPhone/Safari
acceptance; process-crash coverage does not establish physical power-loss safety.
