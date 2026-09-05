# Decyzje podczas wykonania

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
