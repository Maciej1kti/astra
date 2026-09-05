# 01. Produkt i doświadczenie użytkownika

## Cel

Użytkownik ma po otwarciu wiedzieć, co jest istotne, co wymaga decyzji i co planuje na kiedy. Utrzymanie narzędzia nie powinno stawać się oddzielnym projektem administracyjnym. Karta opisuje rezultat lub decyzję. Agent może mieć dowolnie szczegółowy plan poza `.project`.

## Scenariusz podstawowy

Użytkownik dodaje folder przez CLI lub kontrolowany formularz hosta. Aplikacja tworzy jawne pliki i krótki blok w `AGENTS.md`. Użytkownik zapisuje kartę, plan i deadline, przypina ją do focusu. Agent odczytuje kontekst i dopisuje istotny raport. Na telefonie użytkownik zmienia datę; desktop widzi tę samą kartę. Raport nie zamyka sam etapu i nie zmienia deadline'u.

## Przepływy v1

**Start:** pierwszy ekran to lista instancji lokalnie zapamiętanych w przeglądarce albo focus bieżącej instancji. Instancja jest zawsze widoczna w chrome aplikacji. Niesparowany klient widzi wyłącznie bezpieczny ekran parowania.

**Dodawanie:** folder wskazany dokładnie. Plan pokazuje tworzone pliki, zmianę bloku instrukcji i regułę ignorowania. Ponowienie nie resetuje projektu. Przeglądarka wskazuje folder serwera, nie folder telefonu. Rozrejestrowanie nie usuwa `.project`.

**Szybka karta:** tytuł to jedyne obowiązkowe pole formularza. Serwer uzupełnia ID, status `planned`, priorytet `normal`, rank, czasy. Zmiana jednego pola nie wymaga przepisywania całego opisu. Formularz nie autosave'uje każdego znaku do plików.

**Praca:** aktywna karta ma wynik, kontekst, ewentualną przeszkodę, zakres planu, deadline, przegląd i kamień milowy. Blokada nie zastępuje statusu. Zmiana statusu nie aktualizuje automatycznie fazy projektu.

**Decyzja:** raport `decision_needed` pojawia się w uwadze. Samo przeczytanie go nie rozwiązuje sprawy. Raport `resolution` wskazujący go jawnie zamyka sygnał. `correction` odnosi się do błędnego raportu; historia nie znika.

**Zakończenie:** `done` to świadoma akceptacja karty. Wszystkie karty done nie zamykają automatycznie kamienia milowego. Archiwizacja usuwa z bieżącego widoku, nie z danych ani historii. Przy cofaniu sprawdzana jest aktualna wersja.

**Brak połączenia:** nie przyjmujemy nowych zapisów. Ostatni obraz jest oznaczony jako nieaktualny, szkic można skopiować. Nie ma cichej kolejki offline. Wynik już wysłanej komendy sprawdzamy po `request_id`.

## Widoki

| Widok | Minimum v1 | Ważna reguła |
|---|---|---|
| Focus | Własna kolejność, szybkie dodanie/usunięcie, sygnały uwagi | Nie zmienia statusów i priorytetów |
| Projekty | Cel, faza, następny milestone, stan dostępności, ostatnia istotna aktualizacja | Brak procentu postępu z commitów |
| Kanban | Pięć stanów, ręczne sortowanie, dnd, filtr, karta szczegółów | Cancelled domyślnie zwinięte, archiwum osobno |
| Kalendarz | Miesiąc, tydzień całodniowy, agenda, move/resize planu, osobne markery terminów | Plan i deadline są rozróżnione także ikoną/etykietą |
| Gantt | Dni/tygodnie/miesiące, paski, milestones, zależności, niezaplanowane | Bez automatycznego przesuwania następców |
| Lista | Wirtualizowane wiersze, status/datowanie/priorytet, filtry i sort | Alternatywa dla każdej czynności wymagającej gestu |
| Aktualizacje | Chronologia, nieprzeczytane, target, źródło, korekta/rozwiązanie | Nie transkrypcje sesji |

Wszystkie widoki mają wspólny panel karty i jeden kontrakt mutacji. Telefon ma tę samą możliwość edycji: status, opis, daty, focus, raporty, milestone i zależności. Układ może być inny; nie stosujemy mobilnego read-only ani desktopowego hover jako jedynej drogi.

## Sygnały uwagi

Wyliczane deterministycznie w strefie workspace, domyślnie Europe/Warsaw: overdue hard deadline, hard deadline dzisiaj/najbliższe 7 dni, przekroczona data przeglądu, jawna blokada, nierozwiązana decyzja i karta w review. Źródło i powód są widoczne. Target date to plan, nie czerwony alarm równy hard deadline. Done/cancelled/archived nie generują zaległości kart. Wstrzymany projekt może nadal mieć realny deadline; nie ukrywaj go, tylko pokaż stan projektu.

Sygnały nie przestawiają focusu. Użytkownik może zmienić datę przeglądu albo rozwiązać raport. Oznaczenie jako przeczytane nie przesuwa terminów. Nie dodajemy autonomicznego scoringu ani LLM w tej ścieżce.

## Poza v1

MCP, zarządzanie agentami i worktree, natywne frontend'y, wrapper, godziny pracy, cykliczność, planowanie zasobów, procenty ukończenia z Git, płatności, role zespołowe, załączniki binarne, WYSIWYG, publiczne udostępnianie, sync hostów, CRDT, tryb offline, osobny mobilny serwer, powiadomienia push. Nie obiecuj ich w menu jako pustych funkcji.

## Kryterium produktu

Użytkownik prowadzi co najmniej trzy rzeczywiste projekty w testach akceptacji bez ręcznego naprawiania plików, może zapisać i cofnąć zmianę z telefonu, a utrata sieci nie usuwa danych. Lista testów jest w `delivery/ACCEPTANCE.json`. „Ładny dashboard na fixture” nie spełnia tego kryterium.
