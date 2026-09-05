# Decyzje podczas wykonania

## ADR-014 — bounded YAML adapter and unresolved-command responses

2026-09-05, T04/T06–T09/T13. Status: adopted.

Use saphyr-parser 0.0.12 (MIT/Apache-2.0) as a pull-event parser. Enforce header
bytes before parsing and depth/node limits before growing application containers.
Reject aliases, anchors, tags, duplicate/merge keys and non-string map keys.
Scalar spans distinguish comments from literal hashes, including Unicode and block
strings. Comments and BOM/CRLF headers require explicit normalization; Markdown
body bytes are preserved. Canonical output uses JSON-quoted keys/scalars and JSON
flow values inside YAML front matter. No serialization library may silently
reinterpret dates or erase the body.

Use rustix 1.1.4 safe descriptor APIs for no-follow traversal, leases, atomic
no-replace creation, rename, fsync and macOS F_FULLFSYNC. Use bundled SQLite through
rusqlite 0.40.2, with WAL, FULL synchronous, fullfsync and checkpoint_fullfsync.
The state mutex is held only during DB operations; each project owns its separate
writer lock. Record original commands and referenced source versions in
`intent_context`, linked to the command journal. Revalidate those references when
replaying a PREPARED intent whose target still has its before hash.

The prose allowed unresolved mutation results, but OpenAPI omitted a 202 response
for single-resource commands. Add `CommandStatus` for those responses, preserving
`Accepted` for explicit jobs. API version is the string `"1"`, as already specified.
The application tests validate real success/error/pending replies against the
generated projection of the normative OpenAPI schema. The projection is drift-checked.

Examples and tests: pending response example; document/filesystem integration tests;
subprocess crash/restart at PREPARED, temp write/sync, rename, directory sync and
COMMITTED. No power-loss or Linux-device guarantee is inferred from those tests.

Sources: [saphyr parser](https://docs.rs/saphyr-parser/0.0.12/saphyr_parser/),
[rustix filesystem APIs](https://docs.rs/rustix/1.1.4/rustix/fs/),
[rusqlite](https://docs.rs/rusqlite/0.40.2/rusqlite/).

Baseline jest w `docs/12-ADRS.md`. Dopisuj tylko istotne decyzje.

## ADR-013 — powtarzalny fundament i walidacja na granicy domeny

2026-09-05, Codex, T01–T03. Status: adopted.

Repo zawierało sam handoff; Rust 1.92.0 był dostępny poza PATH, bez rustfmt/clippy.
Instalacja rustup i przypiętego toolchainu jest lokalna w `.tools/`, Python w
`.venv-check`, Node pozostaje istniejący 24.11.0. Nie zmieniamy ustawień systemu.
Repo powstaje w katalogu zawierającym AGENTS i kontrakty, bez przenoszenia plików.

JSON Schema pozostaje normatywne. `jsonschema` kompiluje lokalny schemat raz,
z włączoną walidacją formatów i wyłączonymi domyślnymi funkcjami sieciowymi.
Rust udostępnia jawne modele i wrapper po walidacji; TypeScript jest generowany
przez `json-schema-to-typescript`, z kontrolą driftu. Typy wire nie udają walidacji
relacji między dokumentami. Biblioteka `chrono` obsługuje daty całodniowe i porównanie
instantów, bez konwersji daty przez strefę klienta.

Pełny walidator OpenAPI 0.9.0 przechodzi niezmieniony kontrakt. Checker handoffu
dopuszcza teraz statusy realizacji z istniejącymi dowodami w `progress/`;
oryginalny manifest pozostaje historycznym baseline. Testy zapobiegają oznaczaniu
zadania jako ukończone bez pliku dowodu. Istnienie dowodu nie zastępuje review jego treści.

Koszt: runtime schema validator zwiększa zależności Rust; przed wydaniem wymagany
pomiar. Pozwala obecnie uniknąć cichego rozjazdu ręcznej walidacji i schematu.
Nie zmieniono formatu danych ani API. Osobna zgoda właściciela nie jest potrzebna.

Źródła: [Cargo installation](https://doc.rust-lang.org/stable/cargo/getting-started/installation.html),
[jsonschema](https://docs.rs/jsonschema/0.52.0/jsonschema/),
[Svelte package](https://www.npmjs.com/package/svelte),
[Vite package](https://www.npmjs.com/package/vite).
Wersje zależności, buildy i testy: `Cargo.lock`, `package-lock.json`,
`scripts/requirements-validation.lock`, `progress/EVIDENCE.md`.
