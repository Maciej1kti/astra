# Project folder chips — 2026-09-26

The project editor now uses the same picker and chip presentation as card tags.
Enter, Add/Set folder or an existing suggestion confirms the choice; a chip's
remove button clears it. Projects still have one optional folder. Choosing another
replaces the existing folder through the ordinary conditional autosave.

Unconfirmed input lives in the editor draft, is excluded from saved metadata,
survives unrelated autosaves and triggers the existing close guard. The full-width
picker fits the project modal on phones. Folder suggestions now avoid a duplicate
`limit` parameter that caused the previous catalog request to fail.

Verification on macOS ARM64 with release assets/daemon and Chromium 153:

- Full local gate: contracts, 104 JS / 12 Python / 217 Rust tests, Svelte,
  formatting, boundaries, bundle checks, Clippy and release build.
- Focus browser regression in `test-results/folder-chips-focus` covers adding,
  replacing, keyboard suggestions, removal, overlong-name validation, incomplete
  draft protection, reload persistence, folder filtering and the 390px layout.
- Tags, editor and autosave regressions pass in `test-results/folder-chips`.
  The initial Focus run exposed the catalog query error; its corrected run passes.
- The 390px screenshot was visually reviewed. This is Chromium emulation, not
  physical iPhone acceptance.

The manual app is restarted with its existing data, origin and certificates after
verification. No source/API schema change or project metadata migration is needed.
The unrelated live edit to `.project/project.md` stays outside this commit.
