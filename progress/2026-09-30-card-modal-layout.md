# Responsive card modal — 2026-09-30

The owner requested a clearer card modal on phones, tablets and desktop while
preserving its functionality and using the existing design system.

## Result

- Desktop uses a 1040px maximum dialog with a reading column and a quieter
  Schedule/Labels sidebar. Both use one scroll surface and the persistent header.
- Below 900px, properties follow Description, Checklist and Counters, before
  Comments. Tablet dates share a row; phone fields use pairs where native values
  fit, falling back to one column below 360px.
- Phones up to 520px use the full viewport with safe-area spacing. The title
  shows two complete lines without clipping; status now includes its name.
- Shared `SectionHeading`, `ActionMenu`, `Button`, `Badge` and existing tokens
  provide consistent hierarchy, semantic priority colors and section actions.
  Checklist input, counter groups and the comment composer have clearer bounds.

Autosave, uncertain commands, conflicts, pinning, archive/deletion, date/event
editing, checklist ordering, tag suggestions, counter drafts and comments retain
their existing owners and contracts. No dependency or protocol change is involved.

## Verification

Release browser checks use synthetic projects, ordinary HTTPS pairing and real
conditional writes on macOS 27.0 arm64, Node 24.11.0, Chromium 153 and WebKit 26.6.
Visual review covers 320, 390, 768, 1024 and 1440px, plus short landscape and dark
appearance. The maintained header suite now checks an unclipped two-line title.

The isolated full gate passes 249 Rust, 112 JavaScript and 12 Python tests,
contracts, formatting, types, boundaries, Clippy, bundle checks and release build.
All thirteen affected Chromium suites passed on that release. Six WebKit suites
passed: editor
inputs, header/feedback, tags, comments, counters and autosave. The card suite's
other eight scenarios passed in WebKit, but its touch-drag scenario requires
Chromium CDP. The broad WebKit responsive suite stops at a workspace selector
outside the modal: its 23px native height at 320px was reproduced unchanged using
the original running frontend and the revised frontend. Neither limitation is
reported as a pass or as physical iPhone acceptance.

Concurrent calendar work changed the main checkout's build inputs during the
gate, causing stale embedded-asset references and then an unrelated build-plugin
type failure. Final verification is isolated at `ae3ceab3` plus only this change.
Bulk logs and screenshots remain in ignored `test-results/card-modal/`.

The verified embedded frontend and release daemon are running in the existing
manual application. HTTPS serves all 32 public files byte-for-byte from that
build. All 28 pre-existing resource versions, two pins, preferences, certificate
and the existing origin were preserved across the restart. This is browser and
local release verification; physical iPhone and other release obligations remain
open.
