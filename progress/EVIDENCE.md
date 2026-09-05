# Dowody wykonania

## E002 — strict document storage foundation, 2026-09-05

T04/T06 implementation is in progress. `project-store` now parses bounded YAML
events with saphyr-parser, rejects duplicate keys/anchors/tags and invalid source
IDs, preserves Markdown body bytes, and exposes normalization-required for comments
and BOM/CRLF headers. Canonical headers use quoted JSON scalars and flow values,
a YAML 1.2 subset. No custom YAML scanner is implemented.

Filesystem access uses rustix directory descriptors, NOFOLLOW, regular-file and
hardlink checks, directory identity verification, an exclusive writer lease,
conditional atomic replace/no-replace create, file/directory sync and macOS
F_FULLFSYNC. A failure after rename retains the new source for journal recovery.
The journal and application dispatcher are the next layer; this is not yet a
complete durable command implementation.

Validation: 17 Rust integration tests passed (7 domain, 5 document, 5 filesystem),
including all 6 parser vectors and body/comment/UTF-8/symlink/race scenarios.
Full local fmt/clippy/tests/release/Svelte/OpenAPI sequence passed:
[store check log](checks/store.txt). Environment matches E001. No physical power
loss, Linux/ext4, phone or server test is claimed.

Owner decisions: public GitHub repository `Maciej1kti/astra`, English for all new
repository content, regular verified commits and pushes. Recorded in `AGENTS.md`.

## E001 — fundament G0, 2026-09-05

Zadania T01–T03; częściowe T05 (daty/rank/graf). Checkout `main`, bez commita.
Host macOS 27.0 (26A5425a), ARM64, Python 3.14.6, Node 24.11.0, Rust 1.92.0.
Nie testowano przeglądarek ani urządzenia mobilnego.

| Polecenie / kontrola | Rzeczywisty wynik |
|---|---|
| `python scripts/check_package.py` przed zmianami | PASS 12 grup, w tym oryginalne sumy; 33 wektory referencyjne, 39 ścieżek/49 operacji OpenAPI. |
| `python -m openapi_spec_validator contracts/openapi.yaml` | OK, pełna walidacja OpenAPI uzupełniająca handoff. |
| `scripts/cargo-local test --workspace --locked` | 7 testów integracyjnych domeny PASS: 6 przykładów, 14 dokumentów + 5 dat + 5 grafów + 3 ranki z handoffu; granice bytes/depth/nodes, NUL/unsafe keys, fractional timestamps i graf 10 000 węzłów. |
| `python -m unittest discover -s scripts/tests` | 3 testy PASS: obowiązkowy dowód postępu, statusy i pomijanie katalogów zależności. |
| Rust fmt / clippy `-D warnings` / release build | PASS dla obecnego workspace domeny. Nie jest to build serwera. |
| `npm run check` | Typy wygenerowane zgodne; Svelte/TypeScript 0 błędów, 0 ostrzeżeń. |
| `npm run build` | PASS; JS pustego shellu 23.09 kB (9.47 kB gzip), CSS 0.26 kB. To nie benchmark docelowej aplikacji. |
| `npm install` | 0 znanych vulnerabilities według npm podczas tej instalacji; nie pełny audyt Rust/licencji. |
| `.venv-check/bin/python scripts/check.py` | PASS pełnej lokalnej sekwencji. |

Artefakty: [baseline](checks/baseline.json), [pełny log G0](checks/g0.txt).

Scenariusze A14/A16/A51 mają częściowe podstawy, lecz nie zostały zaliczone:
A14 wymaga parsera i zmiany pliku, A16 adapterów wszystkich widoków, A51 całego
łańcucha adapterów. A42 wymaga instalacji na obu hostach. Wszystkie acceptance
pozostają `not_run`; nie wykonano serwera, fault injection, E2E ani testów telefonu.
