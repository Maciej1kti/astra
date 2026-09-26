# Project folders and Focus filtering

The owner clarified that Folder belongs only to projects. Projects now store one
optional category, editable with autosave and suggestions. Project overview cards
show the category. Existing card tags remain independent; cards have no folder
field. No project directory is moved and existing sources need no migration.

Focus selects All folders or an exact folder across projects. The selection
covers pins, active cards, date/review attention and project reports. List and
attention queries filter before pagination and bind cursors to their scope.
Project changes invalidate the relevant Focus sections. Filtered reordering
preserves hidden and unavailable pins. Card creation uses the sole matching
project or opens an explicit project chooser. Other views retain their project
selection, including after reloading Focus.

The source/API contracts, generated types, conditional CLI patches, project
context, examples and [ADR-043](../docs/ADR-043-PROJECT-FOLDERS.md) describe the
same behavior. Folder names are exact, 1–48 characters and single-line; clearing
is explicit. The new paginated folder catalog is a disposable projection.

Verification on macOS ARM64, Node 24.11.0, Rust 1.92.0 and Chromium 153:

- Full local gate: 215 Rust, 102 JavaScript and 12 Python tests; schemas/examples,
  OpenAPI validation, generated contracts, frontend typing, import boundaries,
  formatters, Clippy and release builds pass. Subprocess durability is included.
- All 12 release browser regression suites pass across the recorded runs.
  Focus includes new project-folder autosave, reload, clear, cross-project
  grouping and creation tests, plus hidden-pin ordering and conflict recovery.
  Responsive covers 320, 390, 768 and 1024px and phone landscape. The 320px Focus
  screenshot was reviewed directly.
- Final broad HTTPS/CLI smoke and planning-browser checks pass. Focus,
  responsive and editor were rerun after restoring cross-view project context.
  The planning runner now selects its project in Timeline because Focus owns
  a folder selector.
- Two pre-existing FIFO test fixtures did not compile on macOS because rustix
  does not expose mkfifoat there. Both now use the POSIX mkfifo utility and assert
  that the created fixture is actually a FIFO before testing rejection.
- Initial browser assertions expecting project filtering in Focus were updated
  to folder filtering. An accidental out-of-scope test variable was corrected.
  The broad smoke first missed a Board card click; its next run exposed lost
  project context after a Focus reload. Keeping that context in the URL, while
  ignoring it for Focus filtering, resolves the latter regression.

Browser artifacts are under ignored `test-results/browser/regressions/`, with
successful editor and responsive reruns under `test-results/folders-editor/`
and `test-results/folders-responsive/`. Final navigation suites are in
`test-results/folders-navigation-final/`; broad and planning successes are in
`test-results/folders-smoke-final/` and `test-results/folders-planning-final/`.
Gate and runner logs are in `test-results/project-folders-2026-09-26/`.
Initial smoke failures are retained in
`test-results/folders-smoke/` and `test-results/folders-smoke-retry/`.

The existing manual daemon was not restarted or deployed. No live folder
assignments were changed. Physical iPhone/Safari and full release acceptance
remain open; Chromium emulation is not device acceptance.
