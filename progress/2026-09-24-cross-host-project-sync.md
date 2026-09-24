# Cross-host project source sync — 2026-09-24

The `astra` repository already tracked persistent `.project/` source on Linux and
Mac Mini. The `loai` repository did not. Its Mac Mini project source is now tracked
in Git, with `.project/.local/` excluded. Linux retained a copy of its separate
test project under ignored `test-results/project-sync-2026-09-24/`, pulled the
tracked source, and registered the same project ID through the daemon. Both hosts
now have the same `loai` commit, project/card IDs, and two project reports.

Offline source validation passes on both hosts. Both daemons report `ready` with
zero invalid documents, and both project contexts show the same card and reports.
The Linux manual host was restarted on localhost in tmux. Registration initially
used the CLI's default private mode, which appended `.project/` to the local
`loai` `.gitignore`; that addition was removed. New registrations intended for
Git tracking must use `registration-plan --tracked`.
The full Linux local gate, `.venv-check/bin/python scripts/check.py`, passed,
including package checks, frontend checks, Rust tests, Clippy and release builds.

Focus membership remains host-local in each Astra daemon's `workspace.json`.
Linux has two Astra cards pinned; Mac Mini has one different Astra card pinned,
although all three card source files are tracked. The owner wants membership to
derive from project files while allowing local order. The source/API design and
migration have not been chosen or implemented.
