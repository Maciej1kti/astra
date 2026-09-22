# 01. Produkt i doświadczenie użytkownika

## Cel

Użytkownik ma po otwarciu wiedzieć, co jest istotne, co wymaga decyzji i co planuje na kiedy. Utrzymanie narzędzia nie powinno stawać się oddzielnym projektem administracyjnym. Karta opisuje rezultat lub decyzję. Agent może mieć dowolnie szczegółowy plan poza `.project`.

## Scenariusz podstawowy

The user adds a folder through the CLI or the controlled host form. The application creates explicit files and a short block in `AGENTS.md`. The user saves a card and its schedule, then pins it to focus. An agent reads the context and adds a useful report. The user can change a date on the phone and see the same card on desktop. A report does not close a stage by itself.

## Przepływy v1

**Start:** pierwszy ekran to lista instancji lokalnie zapamiętanych w przeglądarce albo focus bieżącej instancji. Instancja jest zawsze widoczna w chrome aplikacji. Niesparowany klient widzi wyłącznie bezpieczny ekran parowania.

**Dodawanie:** folder wskazany dokładnie. Plan pokazuje tworzone pliki, zmianę bloku instrukcji i regułę ignorowania. Ponowienie nie resetuje projektu. Przeglądarka wskazuje folder serwera, nie folder telefonu. Rozrejestrowanie nie usuwa `.project`.

**Szybka karta:** tytuł to jedyne obowiązkowe pole formularza. Serwer uzupełnia ID, status `planned`, priorytet `normal`, rank, czasy. Zmiana jednego pola nie wymaga przepisywania całego opisu. Formularz nie autosave'uje każdego znaku do plików.

**Work:** an active card has an outcome, context and an optional schedule. A `blocker` report can describe an obstacle without adding a blocking field to the card. Changing status does not update a project phase automatically.

**Decyzja:** raport `decision_needed` pojawia się w uwadze. Samo przeczytanie go nie rozwiązuje sprawy. Raport `resolution` wskazujący go jawnie zamyka sygnał. `correction` odnosi się do błędnego raportu; historia nie znika.

**Zakończenie:** `done` to świadoma akceptacja karty. Wszystkie karty done nie zamykają automatycznie kamienia milowego. Archiwizacja usuwa z bieżącego widoku, nie z danych ani historii. Przy cofaniu sprawdzana jest aktualna wersja.

**Brak połączenia:** nie przyjmujemy nowych zapisów. Ostatni obraz jest oznaczony jako nieaktualny, szkic można skopiować. Nie ma cichej kolejki offline. Wynik już wysłanej komendy sprawdzamy po `request_id`.

## Widoki

| Widok | Minimum v1 | Ważna reguła |
|---|---|---|
| Focus | Własna kolejność, szybkie dodanie/usunięcie, sygnały uwagi | Nie zmienia statusów i priorytetów |
| Projects | Goal, next milestone, availability, latest meaningful update | No progress percentage inferred from commits |
| Kanban | Pięć stanów, ręczne sortowanie, dnd, filtr, karta szczegółów | Cancelled domyślnie zwinięte, archiwum osobno |
| Calendar | Month, all-day week, agenda, schedule move/resize, milestone due dates | Card schedules and milestone due dates have distinct markers and labels |
| Gantt | Days/weeks/months, explicit schedule bars, milestones, unscheduled cards | No connections or automatic scheduling |
| Lista | Wirtualizowane wiersze, status/datowanie/priorytet, filtry i sort | Alternatywa dla każdej czynności wymagającej gestu |
| Aktualizacje | Chronologia, nieprzeczytane, target, źródło, korekta/rozwiązanie | Nie transkrypcje sesji |

All views use the same card panel and mutation contract. The phone has the same editing capabilities: status, description, schedule, focus and reports. The layout may differ; mobile is not read-only and desktop hover is never the only route.

## Sygnały uwagi

Signals are deterministic in the workspace timezone, Europe/Warsaw by default: `overdue` or `due_soon` from an explicit card schedule end, `overdue` or `due_soon` from a milestone due date, unresolved decisions and cards in review. The source and reason are visible. A card without a schedule has no date signal. Done, cancelled and archived cards do not produce card date signals.

Signals do not reorder focus. The user can change a schedule or milestone due date, or resolve a report. Marking a report read does not move dates. This path has no autonomous scoring or LLM.

## Poza v1

MCP, zarządzanie agentami i worktree, natywne frontend'y, wrapper, godziny pracy, cykliczność, planowanie zasobów, procenty ukończenia z Git, płatności, role zespołowe, załączniki binarne, WYSIWYG, publiczne udostępnianie, sync hostów, CRDT, tryb offline, osobny mobilny serwer, powiadomienia push. Nie obiecuj ich w menu jako pustych funkcji.

## Kryterium produktu

Użytkownik prowadzi co najmniej trzy rzeczywiste projekty w testach akceptacji bez ręcznego naprawiania plików, może zapisać i cofnąć zmianę z telefonu, a utrata sieci nie usuwa danych. Lista testów jest w `delivery/ACCEPTANCE.json`. „Ładny dashboard na fixture” nie spełnia tego kryterium.
