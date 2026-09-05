# Workspace and history verification

Date: 2026-09-05. Platform: macOS ARM64.

Workspace focus/preferences changes use conditional durable replacement with a
persisted command result, before/after bytes and focus reference versions. Restart
finishes a rename whose result was not yet committed; an external workspace edit
causes needs_review instead of overwrite. No-op and retry semantics share the
normal command journal. Timezones are validated against the IANA timezone database.

History is paginated with revision-bound cursors. Undo is a new conditional command
and restores a retained previous document only when its recorded successor remains
the current target. Later source changes prevent undo. Update records remain
append-only, and creation is not undone by deleting a resource.

The browser now supports focus pinning, history/undo and workspace preferences,
plus session revocation and pairing approval from an already trusted browser.
Conflict messages preserve the draft and explain the failure in plain English.

Validation: 43 Rust tests pass, including workspace interruption/restart and
external-change protection, and successful/stale undo. Full local checks pass in
`progress/checks/workspace-history.txt`. The real HTTPS browser smoke also verifies
undo, focus and preference persistence across page reload; output is in
`progress/checks/browser-smoke.txt`. Svelte checks have no errors or warnings.

This does not complete maintenance, context/attention/report semantics, date gesture
trials, release packaging or platform/device acceptance. See `progress/PLAN.md`.
