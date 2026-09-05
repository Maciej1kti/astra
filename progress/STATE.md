# Stan wykonania

Status: **G1_IN_PROGRESS — durable command and process-recovery tests pass locally**.

Current implementation: `project-domain`, `project-store`, `project-application`
journal/writer and a Svelte build scaffold. 27 Rust tests pass, including restart
after six subprocess crash points. Next: pairing/session service, registration
workflows, server/CLI/UI slice, and calendar/Gantt interaction trials.
Public remote: https://github.com/Maciej1kti/astra. All new repository content is
English; the Polish sections below are the historical G0 record.

Ostatnia aktualizacja: 2026-09-05. Baseline: handoff 1.0.

## Zrobione w sesji 2026-09-05

- Repo Git `main` zainicjalizowane w katalogu pakietu; bez commitów i remote.
- Lokalny Python venv i lock zależności; izolowany rustup/Rust 1.92.0 w `.tools/`.
- Cargo workspace i `project-domain`: wire models, schema gate, date/rank/graph rules.
- Svelte 5/TypeScript/Vite workspace, generowane typy domeny i kontrola driftu.
- Testy przykładów, 27 wektorów domenowych, limity i graf 10 000 kart.
- Pełny walidator OpenAPI uzupełnia kontrolę oryginalnego pakietu.
- Powtarzalne lokalne kontrole: `.venv-check/bin/python scripts/check.py`.
- Plan wykonania i braków w `progress/PLAN.md`; instrukcja w `DEVELOPMENT.md`.

## Środowisko i ograniczenia

macOS 27.0 (26A5425a), ARM64, SDK CommandLineTools; Node 24.11.0, Python 3.14.6,
Rust 1.92.0. Nie instalowano usług ani nie zmieniano sieci/profilu powłoki.
Nie istnieją jeszcze serwer, CLI, parser plików ani produkcyjne UI. Brak testów
Archa, fizycznego iPhone'a, trwałości, security i wydajności aplikacji.

## Następny krok

T04: parser/serializer `.project` z ograniczeniami i zachowaniem body, potem T06
safe paths/lease oraz T07–T09/T13 trwałość. Próby calendar/Gantt pozostają obowiązkowe
w G1 przed pełnym UI. Szczegóły: `progress/PLAN.md`.

Dowody i zakres poszczególnych testów: `progress/EVIDENCE.md`.

Ostatnia pełna kontrola: `.venv-check/bin/python scripts/check.py` — PASS;
log `progress/checks/g0.txt`. T01–T03 ukończone w zakresie fundamentu,
T05 częściowo wykonane. Scenariusze odbioru produktu pozostają `not_run`:
podstawowe testy domeny nie zastępują całych A14/A16/A51 ani instalacji A42.
