# Project editor and metadata simplification — 2026-09-22

## Change

The project editor is centered with bounded desktop/mobile margins and a dimmed,
blurred backdrop. Description shows sanitized Markdown, switches to source with
Edit description and renders automatically on blur. Autosave continues to flush
pending edits on close, including a single pointer click on the close button.
Project Preview Markdown, Review on, Phase and Additional fields controls are
removed.

The owner's follow-up extends the removal to project metadata, patches, CLI
validation, generated types, summaries, context, calendar and attention reads.
Projects accept only their required metadata and Markdown body. Card review dates
and card/milestone/report extensions remain supported. See
[ADR-036](../docs/ADR-036-PROJECT-FIELD-REMOVAL.md).

## Existing sources

Both registered project documents were read through the running local CLI before
upgrading the schema. Only `loai` contained a retired field (`phase`); a conditional
PATCH cleared it with the observed version. Subsequent reads verified that both
projects contain no retired fields, while bodies and unrelated metadata were
preserved. Astra's document required no change. Audit history is retained; old
Undo candidates must pass current validation before any source write.

## Verification

- Full local gate passed: 213 Rust tests (including subprocess durability),
  95 JavaScript tests and 12 Python tests; contracts/examples, Svelte typing,
  boundaries, formatting, Clippy and release builds passed.
- Release Chrome 153 browser suites passed: autosave (10 scenarios), editor
  (15 scenarios), planning, protocol and command outcomes. AS06/AS09 verify
  actual heading/strong rendering, source reentry, sanitized content, no remote
  image fetching, close flushing, centered layout and a 390px viewport. AS10
  verifies CLI validation failures for removed fields/clears without a changed
  source version, followed by a successful supported edit and readback.
- Root reviewed desktop and mobile screenshots and corrected project patch
  typing, schedule conflict narrowing and precise CLI rejection assertions.
- The existing manual launcher was gracefully restarted. Both registered
  projects, all observed source versions, instance ID and command epoch were
  preserved. HTTPS serves JavaScript identical to the verified release build.

Commands: `.venv-check/bin/python scripts/check.py` and
`ASTRA_TEST_PROFILE=release ASTRA_TEST_CHROMIUM=/opt/google/chrome/chrome node
scripts/browser/regressions.mjs autosave editor planning protocol command-outcomes`.
Post-review documentation/package and browser-script formatting checks passed.

Environment: Linux x86_64, Node 24.11.0, Rust 1.98.1 via `scripts/cargo-local`,
Python 3.14.7. The pinned Rust 1.92 toolchain was unavailable on this host.
Raw logs and screenshots are ignored under `test-results/project-modal-2026-09-22/`.
Chrome viewport emulation is not physical phone or Safari acceptance; no broader
release acceptance is claimed.
