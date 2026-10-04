# Projects replaces Main — 2026-10-04

The owner replaced the former Projects overview with the whole-project status
board. Projects retains its name, folder icon, canonical route and default phone
shortcut. The separate Main screen, icon, navigation entry and default-view choice
are removed. Status columns, local folder/title filters, conditional drag/menu
moves and source opening remain. Projects also retains Add project and the
existing More actions → Delete project preview/confirmation workflow.

Old Main routes and browser-local entries resolve to Projects; duplicate entries
collapse into one shortcut while preserving visibility. Reading those local
settings does not rewrite storage. The next explicit layout edit stores canonical
names. The server accepts the exact legacy `main` preference spelling without
rewriting stored workspace bytes on read or restart. It preserves the original
command payload for recovery and replay. See
[ADR-064](../docs/ADR-064-PROJECTS-STATUS-BOARD.md), which supersedes
[ADR-063](../docs/ADR-063-MAIN-PROJECT-STATUS-BOARD.md).

## Verification

- The combined full local gate passes 610 tests: 339 Rust, 264 Node and 7 Python,
  plus contracts, examples, links, boundaries, formatting, strict Clippy and
  embedded frontend/release builds. Svelte reports zero errors and warnings.
  This includes separate concurrent UI work; that work remains outside this
  feature's commit. The measured combined initial bundle is 81,799 bytes gzip,
  below the 80 KiB gate.
- Failing legacy-preference regressions precede the compatibility fix. They
  verify original bytes/version across load and semantic no-op, rejected malformed
  fields, stale-version conflicts, unchanged replay, changed-payload rejection,
  and restart recovery of an older prepared intention's exact saved bytes.
- Projects passes 13 Chromium and 12 WebKit groups: canonical/legacy navigation,
  unchanged folder icon, no separate Main/default option, all statuses, local
  filtering, archive cache transitions, source opening, conditional pointer/menu/
  keyboard/touch moves, conflicts and response-loss recovery.
- Shared menus and navigation pass in both engines. Chromium responsive passes
  40 groups for all eight views at 320–1024px, including sidebar touch scrolling
  and rotation/reload. Loading, seven motion groups and all fourteen deletion
  groups pass. Motion/deletion assertions were updated for the new tile roles and
  empty-state text; no product defect was found in those runs.
- Desktop light/dark and populated 320px boards were inspected. A screenshot
  waits for the selected navigation indicator to match its button. Browser runs
  record no application errors or CSP violations.

Environment remains macOS arm64, Node 24.11.0, Rust 1.92.0 and Playwright 1.63.0
with Chromium 153.0.8010.12 and WebKit 26.6. Fresh ignored evidence is in
`test-results/projects-rendered-final/`, `projects-webkit/`, `projects-responsive/`,
`projects-motion-final/` and `projects-deletion-final/`. Gate/build/restart
snapshots are in `test-results/projects-rollout/` and
`test-results/main-rollout/projects-gate.log`. Physical-device and full-release
acceptance remain open.

## Existing application

Rebuilt the embedded frontend and release daemon and restarted the existing
manual application at `https://100.122.250.14:47832`. Trusted HTTPS verifies all
44 served build assets, including concurrent UI work present at that build.
Before/after checks preserve 33 resource versions/source hashes, two Focus pins,
both profiles' names, registrations, roots and preferences, instance identity,
command epoch and certificate. A normally paired read-only live browser verifies
all 15 existing projects, title filtering, the Projects shortcut and 320px layout;
its session is signed out afterward. Existing project states remain unchanged.

A concise result is appended and read back through projectctl with the explicitly
selected Astra folder. The previous Main result remains historical evidence;
this owner decision supersedes its separate-view behavior. The owner's card edit
and separate concurrent UI work remain outside this change and commit.

## Independent integration check

An isolated source export on `fb2cac1` retains the committed shared navigation
controls and excludes pending localization and definition cleanup. Its complete
check set passes 615 tests: 339 Rust, 269 Node and 7 Python, alongside schema,
examples/link, boundary, formatting, strict Clippy and release-build checks. The
initial bundle is 81,683 bytes gzip. Two existing CLI socket-mock tests initially
reported transient `WouldBlock`; the complete CLI and daemon crates pass on an
unchanged retry. No source or test bounds were changed for that retry.

Projects and navigation also pass against this export's real debug daemon in
Chromium and WebKit. Desktop and 320px rendered boards were inspected. Original
release browser checks and the existing HTTPS restart evidence remain above.
Fresh logs and screenshots are in `test-results/projects-rollout/isolated-*`.
