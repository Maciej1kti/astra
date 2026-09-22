# Direct project description editing — 2026-09-22

The owner's follow-up replaces the separate Edit description control with
activation of the rendered description field itself. Clicking outside the source
textarea ends editing, including nonfocusable dialog content and the backdrop.
The modal remains open and valid changes continue to save automatically. Keyboard
activation and leaving the field remain supported.

The Change history section is removed from the project modal. Durable history
and the existing API/CLI contracts retain their current behavior; this is removal
of a presentation section, not a source metadata field or stored audit record.

Verification passed: the full local gate (213 Rust, 95 JavaScript, 12 Python
tests, contracts, typing, formatters, Clippy and release builds), plus release
Chrome 153 autosave (10 scenarios) and editor (15 scenarios) browser suites.
AS06 exercises mouse entry, header/backdrop exit, Enter/Space entry, Tab exit,
no duplicate writes and one-click X flushing. Root corrected pointer event
ordering so centered-dialog reflow cannot move X before its click completes.

The manual runtime was restarted; served assets match the build, and both
project source versions, registrations, instance ID and command epoch survived.
Evidence is ignored under `test-results/project-description-2026-09-22/`.
Linux x86_64, Node 24.11.0, Rust 1.98.1; the pinned Rust 1.92 is unavailable.
Phone viewport emulation does not establish physical phone or Safari acceptance.
