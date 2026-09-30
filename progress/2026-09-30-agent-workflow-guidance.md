# Agent planning and documentation guidance

The owner requested a concise AGENTS.md update so other agents maintain plans,
documentation and verification as work proceeds. The repository guidance now
requires a short current plan for nontrivial tasks, documentation/examples in the
same change as implementation, and current status linked to dated evidence.
Affected UI workflows use real-daemon Playwright checks and rendered inspection.
Small fixes need no separate plan file; documentation edits need no UI suites.

The file grows from 93 to 113 lines and links to the existing documentation map
and browser guide instead of duplicating their detail. The managed user-project
block and its template are unchanged; these rules govern development of Astra.

Verified on macOS ARM64 at application/documentation baseline `69d246a`:
`scripts/check_package.py`, link-anchor and managed-block preservation checks,
`git diff --check`, and the full `scripts/check.py` gate pass (255 Rust, 137
JavaScript and 12 Python tests, contracts, frontend checks, formatting, Clippy and
release build). Logs are in ignored `test-results/agent-guidance/`. No application
behavior or acceptance status changed; the running manual app needed no restart.
