# Rozwój Local Projects

Kod i dokumentacja są w tym katalogu. Repo Git zainicjalizowano tutaj, na gałęzi
`main`; nie przenosimy materiałów do katalogu nadrzędnego. Nie ma jeszcze serwera ani CLI.

## Przygotowanie

Python używany podczas G0: 3.14.6. Walidator wymaga Python 3.11+.

```sh
python3 -m venv .venv-check
.venv-check/bin/python -m pip install -r scripts/requirements-validation.lock
npm ci
```

Rust jest przypięty w `rust-toolchain.toml` do 1.92.0. Jeżeli używasz własnego
rustup, standardowe `cargo` pobierze wskazany toolchain. W obecnym środowisku
rustup i toolchain są lokalnie w `.tools/cargo` i `.tools/rustup`.
`scripts/cargo-local` wybiera tę instalację, bez zmiany profilu powłoki.
Node 24.11.0 wskazuje `.nvmrc`; zależności npm mają dokładne wersje i lockfile.

## Kontrola jednym poleceniem

```sh
.venv-check/bin/python scripts/check.py
```

Obejmuje walidację materiałów, pełne OpenAPI, kontrolę dowodów postępu,
Rust fmt/clippy/test/release build, kontrolę driftu generowanych typów,
Svelte/TypeScript i produkcyjny build frontendu. Nie obejmuje jeszcze testów
serwera, trwałości, przeglądarek ani urządzeń; będą dodawane wraz z implementacją.

```sh
npm run dev
npm run contracts
scripts/cargo-local test --workspace --locked
```

Frontend developmentowy nasłuchuje tylko na loopback. Obecny ekran jest
szkieletem kompilacji; nie zawiera projektów demonstracyjnych ani funkcji zapisu.

## Zasady zależności i kontraktów

- Python: `.venv-check`, lock w `scripts/requirements-validation.lock`.
- Rust: dokładne zależności w workspace i `Cargo.lock`; brak sieciowych resolverów
  JSON Schema w runtime. Schemat wkompilowany, walidator inicjalizowany raz.
- Frontend: `package-lock.json`, `npm ci`; Node potrzebny wyłącznie w development/build.
- Typy TypeScript generuje `json-schema-to-typescript` z normatywnego schematu.
  Modele Rust przechodzą ten sam schema gate i testy zachowania reprezentacji.
  Deserializacja samych struktur Rust nie oznacza walidacji; granicą wejścia są
  `validate_document` i `validate_workspace`. Relacje między dokumentami wymagają
  dodatkowej walidacji pod lockiem projektu.
- Aktualizacja zależności wymaga ponownego wykonania kontroli; pełny audyt licencji
  i advisories Rust pozostaje elementem przygotowania wydania.

Manifest SHA-256 zachowuje oryginalny baseline handoffu. Po rozpoczęciu budowy
kontrole używają `--skip-manifest`; oryginalny wynik zachowano w `progress/`.
Nie regeneruj manifestu, aby ukryć zmiany względem pakietu wejściowego.

Plan najbliższej pracy: [progress/PLAN.md](progress/PLAN.md).
Stan i ograniczenia: [progress/STATE.md](progress/STATE.md).
