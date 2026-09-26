# JSON project sources — 2026-09-26

All project resources now use one `{type, metadata, body}` JSON envelope and the
shared domain schema. Projects use `.project/project.json`; cards, milestones
and reports use `<id>.json` in their collections. Description and comment bodies
remain Markdown strings. Folder, event, checklist and comment semantics remain
unchanged. Documentation stays Markdown. [ADR-046](../docs/ADR-046-JSON-SOURCES.md)
records the source contract and the owner's explicit one-time conversion decision.

The source parser rejects duplicate keys, trailing JSON, mismatched kinds/IDs,
invalid UTF-8 and excessive bytes/depth/nodes. Metadata retains its 64 KiB budget.
Canonical serialization uses sorted keys, two-space indentation and LF. Unrelated
edits preserve decoded bodies exactly; semantic no-ops preserve source bytes and
versions even after external whitespace edits. BOM/CRLF normalization remains an
explicit conditional workflow. Production YAML dependencies are removed.

Source discovery, registration, watching, diagnostics, index projections, tag
jobs, deletion, workflow/history paths, fixtures, schemas, examples and CLI docs
use JSON. Conditional versions, command identities, lock ownership and durable
prepare/write/fsync/commit ordering remain intact.

Verification on macOS ARM64, Node 24.11, release daemon and Chromium:

- The full local gate passes, including schemas/examples/OpenAPI, frontend tests,
  Svelte, import boundaries, formatting, Clippy, Rust tests with subprocess crash
  recovery, and embedded frontend/release builds. Focused parser tests also assert
  the actual limit errors, rather than relying on unrelated schema rejection.
- All 15 maintained browser suites pass across the broad run and isolated Focus
  rerun. The initial broad run's Focus creation checks reported no available
  project immediately after reload; the isolated rerun passed without a product
  change. Both runs are retained rather than hiding the timing sensitivity.
- Broad HTTPS smoke and planning gestures pass, including native external JSON
  edits, create/reload, comment history, conflict/retry, undo, deletion and search.
  Browser emulation is not physical iPhone acceptance.
- The synthetic release benchmark executes with 1 project, 5 cards and 5 reports
  to validate its converted fixture format. No performance claim is made.

With the existing daemon stopped and instance/project leases held, converted 72
validated resources across the two registered projects: 2 projects, 7 cards and
63 reports. Export versions were compared to source hashes before any mutation.
Unresolved commands, writes, workspace intents and workflow jobs were absent.
Original sources and stopped runtime files were retained in owner-only ignored
conversion evidence. IDs, metadata and decoded bodies were compared before old
source names were removed. The disposable search index was rebuilt; operational
journal records, workspace settings, pairing and certificates were retained.

The rebuilt manual app was restarted at `https://100.122.250.14:47832/`. HTTPS and
embedded assets return 200. Every converted resource was read through the new
server and matched its exported value; both projects validate with zero issues.
Instance ID and command epoch are unchanged. Existing Markdown history is kept
in the journal but cannot be undone by the JSON-only parser; new JSON history
uses normal undo rules. Users with an open stale editor must reload.

Evidence is ignored under `test-results/json-sources/`. Existing owner changes
to the project and two card documents remain in their converted working JSON
files and are excluded from the staged semantic changes.
