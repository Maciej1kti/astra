# Local Projects — implementacja i specyfikacja

Budowa rozpoczęta 5 września 2026. Działa fundament G0: biblioteka domeny Rust,
szkielet Svelte i lokalne kontrole. Serwer, CLI i funkcje użytkowe nie są jeszcze gotowe.

**Development:** [DEVELOPMENT.md](DEVELOPMENT.md) · [stan](progress/STATE.md) ·
[plan dalszej pracy](progress/PLAN.md) · [dowody](progress/EVIDENCE.md).

```sh
.venv-check/bin/python scripts/check.py
```

Poniżej orientacja w oryginalnym handoffie 1.0. Jego instrukcje rozpoczęcia oraz
dołączone raporty opisują baseline; aktualny postęp jest w `progress/`.

**Zacznij od [START_HERE.md](START_HERE.md), a następnie [instrukcji dla Astry](ASTRA-KICKOFF.md).**

| Materiał | Lokalizacja |
|---|---|
| Pełna scalona specyfikacja | [MASTER-SPEC.md](docs/MASTER-SPEC.md) |
| Decyzje i rozróżnienie [U]/[B]/[S] | [00-DECISIONS.md](docs/00-DECISIONS.md) |
| Kontrakt źródeł | [domain.schema.json](contracts/domain.schema.json) |
| Kontrakt HTTP | [openapi.yaml](contracts/openapi.yaml) |
| Plan produkcji | [PLAN.md](delivery/PLAN.md) |
| Backlog wykonawczy | [BACKLOG.md](delivery/BACKLOG.md) |
| Scenariusze odbioru | [ACCEPTANCE.md](delivery/ACCEPTANCE.md) |
| Wynik sprawdzenia pakietu | [PACKAGE-VALIDATION.md](delivery/PACKAGE-VALIDATION.md) |

Dane w `examples/` są syntetyczne. Nazwy programu i ścieżki są robocze. Szablony w `ops/` wymagają dostosowania; nie uruchamiaj ich bez zmiany placeholderów i kontroli aktualnej konfiguracji hosta.

## Powtórzenie sprawdzenia pakietu

Python 3.11+; zależności walidatora instaluj w oddzielnym środowisku, nie w systemowym Pythonie Archa:

```sh
python3 -m venv .venv-check
.venv-check/bin/python -m pip install -r scripts/requirements-validation.txt
.venv-check/bin/python scripts/check_package.py
```

Powyższa instalacja może wymagać sieci. Sam walidator pracuje offline, nie uruchamia serwera i nie modyfikuje repozytoriów użytkownika. Opcja `--report /ścieżka/poza/pakietem/report.json` zapisuje raport. Nie nadpisuj dołączonego raportu przed kontrolą sum, bo zmienisz plik objęty manifestem.

Skrypt sprawdza artefakty handoffu, nie spełnienie testów produktu. Pełna walidacja standardu OpenAPI przez osobne narzędzie, rzeczywiste testy hostów/telefonu, testy awarii i pomiary aplikacji pozostają pracą Astry.

## Aktualizacja dokumentacji podczas budowy

```sh
python3 scripts/assemble_spec.py
python3 scripts/check_package.py --skip-manifest
```

Manifest `MANIFEST.sha256` dotyczy niezmienionego pakietu startowego, nie późniejszych zmian kodu. Sumy kontrolne wykrywają zmianę bajtów; nie są podpisem autora. Raporty postępu w `progress/` należy aktualizować na podstawie rzeczywistych dowodów. Walidator początkowy pilnuje stanu `not_run`/`not_started`; po rozpoczęciu pracy Astra dostosowuje tę kontrolę do legalnych statusów i wymaga dowodów dla ukończonych elementów.
