# ADR-046: One JSON envelope for all project sources

Date: 2026-09-26. Status: accepted by owner direction.

The owner explicitly replaces Markdown/YAML source files with JSON for projects,
cards, milestones and reports, and authorizes rewriting the small test dataset.
All files use the existing domain envelope `{type, metadata, body}`. A project
lives in `.project/project.json`; collections use `<id>.json`. Markdown remains
inside description/comment body strings. Ordinary documentation stays Markdown.
This supersedes the source-container decisions in ADR-045 and earlier handoff
chapters, without changing comment authorship or domain behavior.

One schema governs sources, domain models and resource API documents. The parser
validates the explicit type against the requested kind, checks filename identity,
rejects duplicate keys (including escaped duplicates) and trailing JSON, and
bounds input bytes, depth and nodes. Pretty JSON uses stable sorted keys and LF.
Existing byte limits remain: 1 MiB document, 64 KiB canonical metadata, 960 KiB
body. JSON transport encoding can consume additional document bytes. BOM/CRLF
normalization remains an explicit conditional workflow; JSON comments are invalid.
The production YAML parser/dependency is removed.

Registration, collection discovery, source diagnostics, watching, deletion,
reference reads and journal-relative paths use JSON names. API commands still
require observed versions and retain their identities on uncertain retries.
The writer's prepare/fsync/replace/fsync/commit sequence is unchanged. New history
and recovery intents contain JSON bytes. Byte-preserving no-op writes remain
no-ops even when an externally edited JSON document uses different whitespace.

The owner's current test sources are converted with the daemon stopped, holding
its instance and project leases, from observed validated documents. Exact old
bytes are retained outside active source folders for rollback. Every new JSON
value is compared with its exported document before old names are removed; IDs,
metadata, descriptions and comment histories are preserved. The conversion checks
for unresolved commands/workflows before touching files and keeps workspace
configuration, pairing, certificates, command epoch and instance identity.
The disposable search index is rebuilt from JSON sources.
This is an explicitly authorized one-time conversion, not a general migration
framework or runtime legacy-format fallback. Source-file migration frameworks
remain deferred for future releases.

Versions change because source bytes change; stale clients must reload. Existing
operational journal records keep their original bytes/results. Pre-conversion
Markdown history cannot be parsed or undone by the JSON-only source parser and
is not rewritten to fabricate matching hashes. The current test data and original
bytes remain available separately. New JSON history retains normal undo rules.
