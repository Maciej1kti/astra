# 12. Rejestr decyzji architektonicznych (baseline)

## ADR-001 — pliki źródłowe

**Decyzja:** stan projektów w `.project`, nie wyłącznie DB. **Powód:** jawność, dostęp agenta i niezależność od uruchomionej aplikacji. **Koszt:** kontrolowany parser, konflikty i protokół trwałości. **Odrzucono:** dwie równorzędne kopie Markdown/SQLite. Indeks jest odtwarzalny.

## ADR-002 — jeden serwer zapisujący

**Decyzja:** UI i CLI używają koordynatora. **Powód:** host jest zwykle stale dostępny, telefon pisze po sieci. **Koszt:** zwykłe CLI potrzebuje serwera. **Odrzucono:** cichy bezpośredni fallback oraz ukryte uruchamianie kolejnego pisarza.

## ADR-003 — webowy frontend

**Decyzja:** Svelte SPA + Rust API. **Powód:** wymagany browser na telefonie z pełną edycją i dwa hosty. **Koszt:** testy browser/device, narzut klienta web. **Odrzucono:** równoległe SwiftUI/AppKit i frontend Linux bez dowodu konieczności, obowiązkowy wrapper.

## ADR-004 — prywatne HTTPS i parowanie

**Decyzja:** loopback backend, prywatny proxy/VPN, proste sesje właściciela. **Powód:** ograniczona ekspozycja i możliwość odwołania urządzenia. **Koszt:** konfiguracja sieci pozostaje po stronie właściciela. **Odrzucono:** publiczne porty, niejawne zaufanie wszystkim klientom VPN, cloud account produktu.

## ADR-005 — jedna instancja jako workspace

**Decyzja:** focus i aggregate views perinstancja. **Powód:** brak replikacji źródeł i konfliktu gospodarzy. **Koszt:** przełączanie serwerów przy dwóch maszynach. **Odrzucono:** automatyczny globalny focus bez osobnego projektu agregacji.

## ADR-006 — plan != zobowiązanie

**Decyzja:** schedule, due i review_on rozdzielone; daty całodniowe. **Powód:** planner rezultatów, nie timesheet. **Koszt:** widget adaptery i różne markery. **Odrzucono:** drag paska zmienia deadline i algorytm automatycznie przesuwający plan.

## ADR-007 — request window i restore epoch

**Decyzja:** request UUIDv7, ograniczone okno nowej komendy, trwały rejestr i epoch. **Powód:** bezpieczne retry także po usunięciu starych wyników i restore. **Koszt:** kontrola zegara i jawny status uncertain. **Odrzucono:** „idempotencja” przez cache wyników bez polityki wygaśnięcia.

## ADR-008 — append-only raporty

**Decyzja:** correction/resolution jako nowe obiekty. **Powód:** brak nadpisywania historii i mały konflikt zapisów agentów. **Koszt:** projekcja otwartych decyzji. **Odrzucono:** wszystkie raporty w jednym wspólnym dzienniku, automatyczne stosowanie raportu jako patcha karty.

## ADR-009 — indeks i trwały state oddzielone

**Decyzja:** index.sqlite można odtworzyć, state.sqlite i workspace wymagają backupu. **Powód:** rebuild nie może usuwać sesji i focusu. **Koszt:** dwie małe bazy. **Optymalizacja:** read receipts w state, nie przepisywanie workspace na każde przeczytanie.

## ADR-010 — własne kontrakty, wymienne widgety

**Decyzja:** dane widgetu nigdy nie są formatem plików. **Powód:** możliwość wymiany biblioteki bez migracji projektów. **Koszt:** cienkie adaptery i testy round-trip dat. Wybór widgetów wymaga próby mobilnej i sprawdzenia licencji.

## ADR-011 — brak edycji offline

**Decyzja:** nowe komendy wymagają połączenia. **Powód:** wyłączony host jest akceptowanym stanem. **Koszt:** brak w pełni offline planera. **Odrzucono:** service worker/CRDT/replay queue jako obowiązkowy element v1. RAM szkicu i rozstrzyganie wysłanego requestu nie są sync offline.

## ADR-012 — jawna archiwizacja

**Decyzja:** UI używa archiwizacji i rozrejestrowania bez kasowania źródeł. **Powód:** bezpieczeństwo danych i referencji. **Koszt:** osobny proces późniejszego purge. Trwałe usuwanie nie jest skrótem do „naprawy” konfliktu.

Nowe ADR dodawaj do `progress/DECISION-LOG.md`: kontekst, decyzja, alternatywy, dowód, wpływ na kontrakty i testy. Nie traktuj rejestru jako miejsca na każdy drobny refactor.

## ADR-015 — expose shared report read state

The original API accepted read receipts but did not return their state. Add an
optional `read` boolean to update resources and update summaries. It comes from
state.sqlite, never from the Markdown source or disposable index. This additive
field enables the required unread UI without treating reading as resolution.
Ordinary document schemas remain unchanged; receipt commands and their results
commit together in one SQLite transaction. Tests verify source bytes are unchanged.

## ADR-016 — bounded workspace resource lists

Add `GET /api/v1/views/list` with a required resource type and optional project and
field filters. It returns the existing SummaryPage contract and stable index
cursors. This supports the cross-project list and update views without fetching
every project's entire archive or adding an unbounded bootstrap payload. The
per-project APIs retain their contracts. Search uses its documented `q` parameter.

## ADR-017 — Exact local CLI project resolution

The Unix-only POST `/local/v1/projects/resolve` reads the registry for an exact
absolute path. It never searches parents, Git remotes or folder names. Typed CLI
commands require `--project`; `.` is resolved explicitly by the client. This
read-only route is not mounted on TCP and does not register unknown folders.
