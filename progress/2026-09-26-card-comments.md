# Card comments — 2026-09-26

Cards now retain an ordered conversation in the `comments` field of their
Markdown front matter, separate from description Markdown. Entries have a stable
server-generated ID, UTC timestamp, author name, human/bot kind and Markdown body.
A dedicated conditional CardPatch append and typed `card comment` CLI command
share the normal durability/retry path. Ordinary set/clear and undo cannot replace
comment history. Existing sources without comments remain valid and unchanged.

The shared card editor shows the conversation and an explicit Add comment form.
Unsent comments survive autosave, pinning and guarded close; uncertain commands
retain their original identity and text. Main card surfaces (List, Board and
Focus) show counts. Calendar and Timeline open the same comment-capable editor.
Search includes comment text/author names, and bounded agent context includes
history or a next-read reference. [ADR-045](../docs/ADR-045-CARD-COMMENTS.md) records
attribution, limits, source ownership and append-only semantics.

Verification on macOS ARM64 / Node 24.11 / release daemon:

- Full local gate passes: schemas/examples/OpenAPI, Python/JS/Rust tests, Svelte,
  import boundaries, formatting, Clippy and embedded frontend/release builds.
- Domain/application tests cover both author kinds, invalid/duplicate entries,
  conditional concurrent appends, replay before/after restart, source round-trip,
  preservation through unrelated changes, denied undo, search and agent context.
  CLI tests verify human/bot translation with the observed version.
- Chromium suites `comments autosave editor card focus events` all pass. The new
  comments suite exercises browser human and CLI bot comments, source Markdown,
  safe rendering, unsubmitted text across autosave/pin/close, all card editor entry
  points, count badges, 320/390px layouts, response-loss replay and a real conflict
  with another bot comment. Mobile screenshots were visually reviewed.
- Broad release HTTPS browser smoke passes. Physical iPhone/Safari acceptance is
  not claimed by Chromium emulation.
- Rebuilt and restarted the existing manual app, preserving its origin, data,
  certificates, instance ID and command epoch. HTTPS returns 200 and serves
  `/assets/index-moDcNkS7.js` at `https://100.122.250.14:47832/`.

The initial gate exposed an existing summary test expectation needing the new
comment count; it was updated to verify that counts do not leak comment bodies.
No runtime behavior was bypassed. Evidence: ignored `test-results/card-comments/`.
Owner edits to `.project/project.md` and the existing card source remain outside
this change. No sample comments were posted to the owner's cards.
