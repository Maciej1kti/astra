# Local Projects — pełna specyfikacja wykonawcza dla Astry GPT6

**Wersja:** 1.0 · **Data:** 5 września 2026 r.  
**Status:** pakiet do budowy, nie zaimplementowany produkt.  
**Platformy:** serwer macOS Apple Silicon i Arch Linux/Omarchy; pełne webowe UI na desktopie i telefonie przez prywatne HTTPS.

## Jak korzystać z tego dokumentu

To scalona kopia specyfikacji i materiałów zarządzania wykonaniem. Źródłem poszczególnych rozdziałów są wymienione pliki w pakiecie `astra-project-handoff-v1.0`. Zmiany nanosimy w źródłowych rozdziałach i odtwarzamy ten dokument skryptem `scripts/assemble_spec.py`; nie utrzymujemy dwóch niezależnych specyfikacji.

**Przekaż Astrze cały ZIP, nie tylko ten dokument.** W `contracts/` znajdują się JSON Schema, OpenAPI, katalog lokalnego IPC i początkowe schematy SQL. `examples/`, `templates/`, `tests/` i `ops/` zawierają materiały do użycia w implementacji. `delivery/PACKAGE-VALIDATION.md` opisuje rzeczywisty zakres sprawdzenia plików.

Najważniejszy kontrakt: `.project/` jest źródłem prawdy, jeden serwer koordynuje zapisy, CLI jest klientem lokalnym, a telefon ma te same funkcje edycji przez przeglądarkę. Nie budujemy MCP, worktree-managera, synchronizacji offline ani osobnego klienta iOS.

[U] oznacza wymaganie użytkownika, [B] domyślne rozstrzygnięcie wykonawcze, [S] wybór wymagający próby. Testy i budżety opisują warunki przyszłej implementacji; nie są deklaracją wyników istniejącej aplikacji.

## Spis treści

- [00. Decyzje, status i reguły interpretacji](#chapter-00)
- [01. Produkt i doświadczenie użytkownika](#chapter-01)
- [02. Architektura i moduły](#chapter-02)
- [03. Format danych i inwarianty domeny](#chapter-03)
- [04. Trwały zapis, konflikty i odzyskiwanie](#chapter-04)
- [05. API HTTP, kontrakty i aktualizowanie widoków](#chapter-05)
- [06. CLI, lokalne IPC i współpraca z agentami](#chapter-06)
- [07. Prywatna sieć i model bezpieczeństwa](#chapter-07)
- [08. Specyfikacja UI, ruchu i estetyki](#chapter-08)
- [09. Wydajność, obserwacja i diagnostyka](#chapter-09)
- [10. Instalacja, aktualizacje, backup i utrzymanie](#chapter-10)
- [11. Testy i definicja jakości](#chapter-11)
- [12. Rejestr decyzji architektonicznych (baseline)](#chapter-12)
- [13. Ryzyka, kontrole i decyzje delegowane](#chapter-13)
- [14. Źródła techniczne](#chapter-14)
- [Załącznik 1. Instrukcja startowa dla Astry](#annex-01)
- [Załącznik 2. Plan wykonania i bramki](#annex-02)
- [Załącznik 3. Podział pracy i integracja](#annex-03)
- [Załącznik 4. Backlog wykonawczy](#annex-04)
- [Załącznik 5. Testy akceptacyjne](#annex-05)
- [Załącznik 6. Powiązanie wymagań, zadań i testów](#annex-06)
- [Załącznik 7. Lista kontrolna wydania](#annex-07)


---

<a id="chapter-00"></a>

## 00. Decyzje, status i reguły interpretacji

Pakiet jest specyfikacją wykonawczą. **MUSI** określa wymóg, **POWINIEN** preferencję wymagającą uzasadnienia odstępstwa, **MOŻE** element fakultatywny. [U] to ustalenie użytkownika; [B] to przyjęty baseline projektowy dla Astry; [S] to wybór po próbie. Odmienne znaczenie etykiet UI nie może zmieniać wartości maszynowych.

### Zamrożone wymagania [U]

| ID | Wymaganie |
|---|---|
| U01 | Budujemy własny produkt, nie konfigurujemy odrzuconego istniejącego kanbana. Gotowe biblioteki są dozwolone. |
| U02 | Jawnie wskazany folder stanowi projekt. W nim procedura tworzy `.project`, a `AGENTS.md` zna kontrakt. |
| U03 | Narzędzie służy rezultatom, etapom, terminom i uwadze człowieka, nie szczegółowym planom agentów. |
| U04 | Agenci mają pełnoprawne CLI. Nie potrzebujemy MCP. |
| U05 | Kanban, kalendarz i Gantt są pełnymi widokami, nie obietnicą nieokreślonej przyszłości. |
| U06 | UI ma być bardzo szybkie, lekkie, estetyczne; gesty i animacje są częścią jakości. |
| U07 | Hosty: Arch Linux/Omarchy i macOS Apple Silicon. Windows ewentualnie później. |
| U08 | Telefon używa przeglądarki z pełną edycją, jak desktop. Nie budujemy aplikacji iOS. |
| U09 | Dostęp zdalny odbywa się przez prywatną sieć. Nie ma potrzeby publicznego wystawiania. |
| U10 | Hosty zwykle działają stale. Gdy są wyłączone, usługa jest niedostępna; nie rozwiązujemy tego chmurą. |
| U11 | Aplikacja nie tworzy i nie scala worktree; agent wskazuje właściwy projekt niezależnie od miejsca pracy nad kodem. |

### Baseline wykonawczy [B]

Rust/Axum + Svelte 5/TypeScript/Vite; jeden proces i koordynator zapisów; dokładny format w Markdown/YAML; SQLite jako indeks oraz osobna baza stanu; CLI przez Unix socket; Tailscale Serve jako rekomendowany transport prywatnego HTTPS. Pełna edycja po sparowaniu przeglądarki, jeden właściciel, bez ról organizacyjnych.

Wersja 1 operuje na dniach, nie godzinach. Jedna instancja jest zakresem focusu, wyszukiwarki i kalendarza zbiorczego. Każdy projekt ma jednego gospodarza. `.project` domyślnie prywatne i ignorowane przez Git. Nagłówek YAML jest kontrolowanym formatem, nie dowolnym dokumentem do edycji bez zmiany białych znaków.

Są to decyzje projektowe wynikające z finalnego kierunku rozmowy, nie wszystkie były osobno literalnie potwierdzane. Astra ma na nich rozpocząć wykonanie, zamiast otwierać całą dyskusję ponownie. Jeśli baseline koliduje z nowym jawnym wymaganiem użytkownika, należy wskazać konkretną różnicę i ADR.

### Próby przed wyborem [S]

Konkretne widgety kalendarza/Gantta, biblioteka ograniczonego YAML, trwałość plików na APFS/ext4, docelowe wersje toolchain, budżet RAM klienta i ergonomia na fizycznym iPhonie. Nie są luką pozwalającą odłożyć funkcję poza v1. Próba ma dać wynik, test i decyzję, nie niekończący się research.

### Świadome doprecyzowania względem v0.3

- `request_id` komend to UUIDv7 z oknem przyjmowania, aby usunięcie starych wyników nie pozwalało automatycznie wykonać starej komendy na nowo. ID obiektów to UUIDv4.
- `command_epoch` przetrwa restart, ale zmieni się po restore/utracie stanu operacyjnego; stare niepewne komendy nie przechodzą przez granicę odtworzenia.
- Potwierdzenia odczytu aktualizacji trafiają do `state.sqlite`, a nie rosnącego `workspace.json`. To trwały stan użytkownika, objęty backupem, nie cache.
- Klucz kolejności zostaje zdefiniowany jako 128-bitowy nieprzezroczysty rank, zamiast przykładowego nieokreślonego `aM`.
- UI nie obiecuje twardego usuwania wszystkich obiektów w v1. Standardem jest archiwizacja; niebezpieczne purge należy do jawnego utrzymania poza podstawowym UI.
- Wydanie przeglądarkowe nie wymaga service workera. Brak edycji offline i obowiązkowego cache danych projektu na telefonie.

### Reguły zmian

Przy sprzeczności respektuj nowszą jawną decyzję użytkownika. Następnie rozstrzygaj intencją tego rozdziału i inwariantami bezpieczeństwa danych. Niezgodność prozy i schema/OpenAPI to błąd pakietu: napraw oba, dodaj test i ADR, nie wybieraj po cichu wygodniejszego wariantu.

Samo ulepszenie układu modułów nie wymaga zgody użytkownika. Zmiana topologii na chmurę, źródła prawdy na DB, obowiązkowe opłaty, usunięcie mobilnej edycji lub zmiana zakresu v1 wymaga decyzji właściciela. Licencja własnego produktu i publiczna publikacja pozostają decyzją właściciela; nie zakładaj, że produkt musi być open source.

Nie podajemy dat ukończenia. Etapy kończą się dowodami. Zgodność z przyszłym macOS 28 nie jest potwierdzona; dokumentujemy rzeczywiście testowane systemy i przeglądarki.


*Plik źródłowy: `docs/00-DECISIONS.md`.*


---

<a id="chapter-01"></a>

## 01. Produkt i doświadczenie użytkownika

### Cel

Użytkownik ma po otwarciu wiedzieć, co jest istotne, co wymaga decyzji i co planuje na kiedy. Utrzymanie narzędzia nie powinno stawać się oddzielnym projektem administracyjnym. Karta opisuje rezultat lub decyzję. Agent może mieć dowolnie szczegółowy plan poza `.project`.

### Scenariusz podstawowy

Użytkownik dodaje folder przez CLI lub kontrolowany formularz hosta. Aplikacja tworzy jawne pliki i krótki blok w `AGENTS.md`. Użytkownik zapisuje kartę, plan i deadline, przypina ją do focusu. Agent odczytuje kontekst i dopisuje istotny raport. Na telefonie użytkownik zmienia datę; desktop widzi tę samą kartę. Raport nie zamyka sam etapu i nie zmienia deadline'u.

### Przepływy v1

**Start:** pierwszy ekran to lista instancji lokalnie zapamiętanych w przeglądarce albo focus bieżącej instancji. Instancja jest zawsze widoczna w chrome aplikacji. Niesparowany klient widzi wyłącznie bezpieczny ekran parowania.

**Dodawanie:** folder wskazany dokładnie. Plan pokazuje tworzone pliki, zmianę bloku instrukcji i regułę ignorowania. Ponowienie nie resetuje projektu. Przeglądarka wskazuje folder serwera, nie folder telefonu. Rozrejestrowanie nie usuwa `.project`.

**Szybka karta:** tytuł to jedyne obowiązkowe pole formularza. Serwer uzupełnia ID, status `planned`, priorytet `normal`, rank, czasy. Zmiana jednego pola nie wymaga przepisywania całego opisu. Formularz nie autosave'uje każdego znaku do plików.

**Praca:** aktywna karta ma wynik, kontekst, ewentualną przeszkodę, zakres planu, deadline, przegląd i kamień milowy. Blokada nie zastępuje statusu. Zmiana statusu nie aktualizuje automatycznie fazy projektu.

**Decyzja:** raport `decision_needed` pojawia się w uwadze. Samo przeczytanie go nie rozwiązuje sprawy. Raport `resolution` wskazujący go jawnie zamyka sygnał. `correction` odnosi się do błędnego raportu; historia nie znika.

**Zakończenie:** `done` to świadoma akceptacja karty. Wszystkie karty done nie zamykają automatycznie kamienia milowego. Archiwizacja usuwa z bieżącego widoku, nie z danych ani historii. Przy cofaniu sprawdzana jest aktualna wersja.

**Brak połączenia:** nie przyjmujemy nowych zapisów. Ostatni obraz jest oznaczony jako nieaktualny, szkic można skopiować. Nie ma cichej kolejki offline. Wynik już wysłanej komendy sprawdzamy po `request_id`.

### Widoki

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

### Sygnały uwagi

Wyliczane deterministycznie w strefie workspace, domyślnie Europe/Warsaw: overdue hard deadline, hard deadline dzisiaj/najbliższe 7 dni, przekroczona data przeglądu, jawna blokada, nierozwiązana decyzja i karta w review. Źródło i powód są widoczne. Target date to plan, nie czerwony alarm równy hard deadline. Done/cancelled/archived nie generują zaległości kart. Wstrzymany projekt może nadal mieć realny deadline; nie ukrywaj go, tylko pokaż stan projektu.

Sygnały nie przestawiają focusu. Użytkownik może zmienić datę przeglądu albo rozwiązać raport. Oznaczenie jako przeczytane nie przesuwa terminów. Nie dodajemy autonomicznego scoringu ani LLM w tej ścieżce.

### Poza v1

MCP, zarządzanie agentami i worktree, natywne frontend'y, wrapper, godziny pracy, cykliczność, planowanie zasobów, procenty ukończenia z Git, płatności, role zespołowe, załączniki binarne, WYSIWYG, publiczne udostępnianie, sync hostów, CRDT, tryb offline, osobny mobilny serwer, powiadomienia push. Nie obiecuj ich w menu jako pustych funkcji.

### Kryterium produktu

Użytkownik prowadzi co najmniej trzy rzeczywiste projekty w testach akceptacji bez ręcznego naprawiania plików, może zapisać i cofnąć zmianę z telefonu, a utrata sieci nie usuwa danych. Lista testów jest w `delivery/ACCEPTANCE.json`. „Ładny dashboard na fixture” nie spełnia tego kryterium.


*Plik źródłowy: `docs/01-PRODUCT.md`.*


---

<a id="chapter-02"></a>

## 02. Architektura i moduły

### Jednostka wdrożenia

`projectd` jest programem użytkownika, bez roota, obsługującym HTTP i lokalne IPC. Serwuje statyczny build SPA. `projectctl` jest klientem IPC i narzędziem diagnostycznym. Nie uruchamia ukrytego daemon'a przy każdej komendzie. Node jest narzędziem builda, nie runtime'em wydania.

Baseline Axum/Tokio jest zgodny z rolą serwera HTTP [S01]. Frontend Svelte jest SPA, bez SvelteKit/SSR; Vite tylko buduje i służy developmentowi [S02]. Nie implementujemy własnego systemu kontenerów, plug-inów ani event sourcingu całej domeny.

### Proponowany układ repo

```text
apps/web/                 # Svelte, UI, API client, adaptery widoków
crates/domain/            # typy, reguły, daty, graf, rank; bez Axum i dysku
crates/project-store/     # parser, walidacja, bezpieczne ścieżki, atomic replace
crates/application/       # komendy, locks, idempotencja, recovery, query service
crates/projectd/          # HTTP/UDS, auth, uruchomienie usług
crates/projectctl/        # parsowanie CLI, IPC, formatowanie wyjścia
contracts/                # schematy kontrolowane wraz z kodem
integration-tests/        # procesy, filesystem, IPC, awarie
ops/                      # pakowanie i konfiguracje
```

To punkty podziału; Astra może połączyć małe crate'y. Nie wolno rozdzielić reguł biznesowych między CLI i frontend. Frontend ma powtórną lekką walidację UX, ale o przyjęciu zmiany decyduje domena serwera.

### Źródła danych

`.project` jest źródłem kart i celów. `workspace.json` jest źródłem rejestru, focusu, strefy i preferencji globalnych. `state.sqlite` zawiera trwały stan sesji, potwierdzeń odczytu, command journal i odzyskiwania. `index.sqlite` jest tylko pochodną; FTS5 służy do wyszukiwania [S06].

Powiązania w focusie są `(project_id, card_id)`, bez kopii opisów. Dane lokalnego wyglądu, np. szerokość panelu, mogą być w localStorage. Token sesji, źródłowe karty i kolejka offline nie trafiają tam. Potwierdzenia przeczytania są wspólne dla jednego właściciela instancji, a nie pertelefon.

### Ruch żądań

HTTP/UDS → principal → limit/wersja kontraktu → typed command/query → application service → domena i magazyn → trwały wynik → projekcja indeksu → SSE. Mutacje są jawne i typowane. Nie ma uniwersalnego execute, filesystem download, shell ani SQL endpointu.

Blokujące operacje dysku/SQLite i Git pracują poza event loop; początkowo ograniczona pula workerów. Jedna kolejka pisarza `state.sqlite` eliminuje niekontrolowaną konkurencję. Sam Rust nie chroni przed blokowaniem handlerów długim parserem.

Serwer ma lock instancji i lease każdego `.project/.local/writer.lock`. Druga instancja nie może obsługiwać tego samego magazynu. Prawa katalogu runtime 0700, UDS 0600. Proces działający jako ten sam UID nie jest izolowany od danych.

### Odczyt i indeks

Listy i widoki czytają indeks. Szczegół do edycji potwierdza źródłowy plik i zwraca jego wersję. Mutacja zawsze odczytuje źródło pod lockiem. Indeks nie przywraca skasowanej karty.

Po starcie recovery jest pierwsze. Dopiero potem read/write dla zdrowych projektów. Przy istniejącym indeksie pokazujemy od razu oznaczony stan, podczas gdy skan aktualizuje świeżość. Bez indeksu budujemy go przyrostowo i pokazujemy postęp, nie pustą tablicę udającą brak kart.

Inwalidację wywołuje watcher `.project`, nie całego drzewa kodu. Zdarzenia agregujemy i sprawdzamy hash. Częściowy zapis z zewnętrznego edytora nie trafia do UI jako nowy poprawny stan. Ograniczenia watcherów są znane; kontrolny skan jest wymagany [S12].

### Topologia hostów

Instancja ma `instance_id`, nazwę i origin. Może działać jeden serwer na Archu i klienci na Macu/telefonie. Drugi serwer na Macu jest potrzebny dla jego lokalnych folderów. V1 nie agreguje danych obu serwerów; przełącznik to nawigacja do innego originu, nie CORS ani kopia danych. Sesje i focus są perinstancja.

Jeden projekt ma jednego gospodarza. Nie wspieramy zapisu do udziałów sieciowych ani do synchronizowanych aktywnie kopii. Przeniesienie: backup, wyrejestrowanie na starym gospodarzu, przeniesienie źródeł, jawna rejestracja na nowym. Nie dedukuj tożsamości z remote Git.

### Platformy i uruchomienie

Linux: usługa użytkownika systemd, macOS: LaunchAgent, plus foreground do developmentu. To tryb po zalogowaniu, nie gwarancja pracy przed pierwszym loginem. Program nie zmienia sam ustawień usypiania ani sieci. Host wyłączony oznacza niedostępność. Wzorce ops są do dostosowania i testu na docelowej maszynie [S23][S24].

### Granice błędów

Uszkodzony dokument jest izolowany. Błędny `project.md` blokuje zwykłe zapisy całego projektu, nie całej instancji. Problem indeksu oznacza degraded projections, nie cofnięcie zatwierdzonego zapisu. Niejasny stan recovery blokuje dany target/projekt. Brak serwera zwraca błąd CLI bez trybu awaryjnego pisania.


*Plik źródłowy: `docs/02-ARCHITECTURE.md`.*


---

<a id="chapter-03"></a>

## 03. Format danych i inwarianty domeny

### Kontrakt plikowy

`contracts/domain.schema.json` jest schematem JSON Schema 2020-12 [S22]. Waliduje reprezentację sparsowanego dokumentu `{type, metadata, body}`; na dysku `type` wynika z lokalizacji, metadata jest front matter, body to pozostałe bajty tekstu. Sam schema nie sprawdza cykli grafu, relacji, istnienia folderu ani poprawności wszystkich zakresów — reguły domenowe są dodatkowe.

Plik UTF-8 rozpoczyna się dokładnie delimitrem `---` w pierwszej linii i zamyka front matter następnym takim delimitem. Nagłówek MUSI być jedną mapą. Zakazane: duplicate keys, anchors, aliases, merge keys, własne tagi, wiele dokumentów YAML i tabulatory jako wcięcia. Daty, czasy, UUID i rank zapisujemy jako stringi; wartości bool jako bool. Żadnego automatycznego zamieniania dat na typ JS Date. UTF-8 BOM i CRLF można odczytać, ale normalizacja wymaga jawnego kontraktu; pisarz generuje UTF-8 bez BOM i LF.

Body zachowujemy bajt w bajt przy operacji niedotyczącej body, łącznie z pustymi liniami i końcowym newline. Wymiana body jest osobną świadomą zmianą. Pole tekstowe nie wykonuje skryptów ani komend. Parser MUSI odrzucać niepoprawny UTF-8, NUL i przekroczenie limitów zanim stworzy duży obiekt w pamięci.

Nagłówek jest formatowany kanonicznie. Nieznane pola poza `x-*` blokują zwykły zapis. Rozszerzenia `x-*` zachowujemy jako ograniczone JSON values. Komentarz YAML, który zniknąłby podczas serializacji, powoduje `NORMALIZATION_REQUIRED`; użytkownik dostaje podgląd i jawną operację normalizacji, z backupem i If-Match. Serwer nie „akceptuje” normalizacji po cichu przez flagę frontendu.

### Lokalizacje i tożsamość

`project.md` zawiera `schema_version: 1` i ID projektu. Karty, milestones i updates używają nazwy `<id>.md`; ID w nagłówku musi się zgadzać. Nazwa i tytuł nie są tożsamością. Serwer generuje UUIDv4 z CSPRNG; komendy używają UUIDv7 — odrębna rola [S09]. Import nie zmienia ID bez jawnej migracji.

Puste katalogi można tworzyć leniwie. Inne pliki są ignorowane z diagnostyką, nie automatycznie kasowane. `README.md`, `.gitignore` i `.local` nie są kartami. Dane `.local` nigdy nie wchodzą do indeksu treści ani właściwego backupu źródeł.

### Pola

| Obiekt | Pola wymagane w poprawnym pliku | Opcjonalne |
|---|---|---|
| Project | schema_version, id, name, state, created_at, updated_at | phase, review_on, x-* |
| Card | id, title, kind, status, priority, position, archived, created_at, updated_at | schedule, due, review_on, milestone_id, blocked, depends_on, labels, x-* |
| Milestone | id, title, status, position, archived, created_at, updated_at | due, x-* |
| Update | id, kind, target, summary, author, recorded_at | observed_at, supersedes, resolves, evidence, x-* |

Body projektu opisuje cel i kontekst. Body karty/milestone opisuje rezultat i warunki akceptacji; nie wymagamy konkretnych nagłówków do parsowania. Body raportu zawiera szczegóły, nie pełną transkrypcję agenta.

Tworzenie przez API potrzebuje tylko tytułu karty lub nazwy projektu; pola wymagane w pliku uzupełnia serwer. Czasy są RFC3339 UTC z `Z`. `created_at` jest niezmienne w zwykłych mutacjach; `updated_at` ustala serwer dopiero przy rzeczywistej zmianie. No-op nie zmienia czasu ani wersji. Zwykły zapis nie tworzy updated_at wcześniejszego od created_at; wykryty skok zegara obsługuje polityka admission/recovery zamiast fałszowania chronologii. Zewnętrzna edycja może pozostawić stary czas; świeżość źródła określa też hash i `observed_at` w indeksie, nie tylko nagłówek.

#### Enumy

- Project state: `active | paused | archived`.
- Card kind: `outcome | decision`.
- Card status: `planned | active | review | done | cancelled`.
- Priority: `low | normal | high | urgent`.
- Milestone status: `planned | active | achieved | cancelled`.
- Update kind: `result | blocker | decision_needed | note | correction | resolution`.
- Author kind: `human | agent`; obserwacje Git nie udają raportów człowieka.

Brak sztucznego workflow przechodzenia przez wszystkie stany. Done/cancelled można ponownie otworzyć. `archived` ukrywa z bieżących widoków, nie zmienia historii rezultatu. Projekt archived jest widoczny w archiwum; zwykła edycja jego kart wymaga najpierw przywrócenia projektu. Projekt paused nie blokuje edycji.

### Daty

Daty całodniowe mają format `YYYY-MM-DD` i muszą istnieć w kalendarzu gregoriańskim. Sam regex nie odrzuci 30 lutego. `schedule` występuje z obiema granicami; `start <= end`, obie **włączne**. Jednodniowy plan ma tę samą datę start/end. Dodajemy dni kalendarzowe, nie stałe 86 400 000 ms. Nie wykonujemy `new Date('YYYY-MM-DD')` jako kanonicznego modelu daty.

`due` to `{date, kind: hard|target}`. `review_on` jest niezależne. Gdy plan kończy się po due, zwracamy ostrzeżenie; nie odrzucamy realnego planu ani nie przesuwamy deadline'u. `due_today` to date == dziś w strefie workspace; overdue to date < dziś dla niezamkniętej karty. Telefon za granicą nie przesuwa dat. Oś czasu może użyć adaptera ze sztuczną reprezentacją biblioteki, ale musi wrócić do identycznych LocalDate.

Finish-to-start: poprzednik zaplanowany do 18 września wymaga startu następcy co najmniej 19 września, jeśli przyjmujemy rozłączne dni. Nie ma kalendarza roboczego, weekendów jako blokad, lagów, leadów ani auto-schedulera. Brak planu którejkolwiek strony to stan nieoceniony, nie konflikt.

### Relacje i raporty

`milestone_id` odnosi się do milestone tego samego projektu. `depends_on` zawiera unikalne ID kart tego projektu, bez self-edge i bez cykli. Wprowadzenie cyklu jest błędem. Naruszenie dat zależności jest ostrzeżeniem. Zmiana statusu nie wykonuje kaskady. Archiwizacja zależnej karty nie kasuje krawędzi; UI pokazuje ukryty cel. Przy ręcznym usunięciu referencji oznaczamy broken reference, nie usuwamy jej cicho.

Update jest append-only w normalnym API. `target` to typ `project|card|milestone` i ID istniejącego obiektu z tego projektu. Korekta wskazuje wcześniejszy raport przez `supersedes`; rozwiązanie wskazuje wcześniejsze raporty przez `resolves`. Referencje muszą należeć do tego samego projektu, resolution nie wskazuje siebie i nie tworzy cyklu. Nowy raport `blocker` nie ustawia automatycznie `card.blocked`. Odczyt raportu nie rozwiązuje decyzji. `resolution` jawnie zamyka sygnał; korekta oznacza zastąpienie treści, nie tajne przepisanie historii.

`evidence` jest listą typowanych referencji: `url` (http/https, bez automatycznego pobierania), `commit` (hex OID jako tekst), `path` (względna ścieżka do opisu, nie uprawnienie do zdalnego czytania pliku). Author jest deklaracją, nie podpisem tożsamości.

### Kolejność

`position` to 32 małe cyfry hex kodujące unsigned 128-bit. Rezerwujemy 0 i 2^128−1 jako wirtualne granice. Porządek to `(position, id)` w obrębie statusu kart, a w milestones w obrębie projektu. Priorytet nie zmienia kolejności ręcznej. UI nie wylicza rank i nie wysyła floatów.

Komenda move wskazuje sąsiadów `after_id` i `before_id` w nowej kolumnie. Serwer pod lockiem odczytuje kolejność, usuwa przesuwaną kartę z rozważanego zbioru i sprawdza sąsiedztwo. Null oznacza krawędź kolumny; oba null są poprawne dla pustej kolumny. Nieaktualne sąsiedztwo → `ORDER_CHANGED`, nie nieoczekiwana pozycja.

Nowy rank = low + floor((high−low)/2), jeżeli istnieje przerwa. Tworzenie i zmiana statusu bez wskazania sąsiadów dopisuje na końcu. Gdy zabraknie miejsca albo ręcznie zdublowane ranki blokują wstawienie, zwracamy `ORDER_REBALANCE_REQUIRED`. Jawna wznawialna konserwacja rozkłada ranki równomiernie i emituje resync. Nie przepisujemy dziesiątek plików w ukryciu podczas każdego gestu.

### Limity baseline

Cały dokument <= 1 MiB; nagłówek <= 64 KiB; body <= 960 KiB. Title <= 240 znaków, project name <= 120, summary <= 500, label <= 48 i max 20 etykiet. Max 100 zależności na kartę, 50 evidence na raport, 100 resolves. Max depth JSON/YAML 12 i 10 000 węzłów. Limits działają w parserze i HTTP; JSON Schema nie zastępuje limitu bajtowego.

Limit testowy 100 projektów/10k kart/50k raportów nie jest limitem danych. Lista i raporty są stronicowane. Nie podnosimy limitów bez pomiaru i testu nadużycia.

### Profil workspace

W `workspace.json`: format_version, instance_id, timezone, locale, projects (ID, ścieżka, data dodania), focus (referencje w kolejności), preferences. Sekrety i sesje nie są tu przechowywane. `focus` max 100 pozycji, rekomendacja UX 3–5, bez twardej blokady przy czwartej. Nieistniejąca referencja pozostaje oznaczona, dopóki użytkownik jej nie usunie. Root do rejestracji przez WWW jest konfiguracją hosta; nie wynika z dowolnej treści workspace.


*Plik źródłowy: `docs/03-DATA-FORMAT.md`.*


---

<a id="chapter-04"></a>

## 04. Trwały zapis, konflikty i odzyskiwanie

### Inwarianty

W1: istnieje jeden pisarz normalnych operacji na projekt. W2: zapis istniejącego dokumentu wymaga wersji, na której powstała intencja. W3: sukces nie jest zwracany przed końcem protokołu trwałości. W4: indeks nie jest źródłem naprawy plików. W5: ponowienie nie jest nową intencją. W6: niepewny wynik nie staje się porażką ani sukcesem przez zgadywanie.

Nie ma automatycznej transakcji SQLite + plik źródłowy. Opisujemy mały protokół z trwałym dziennikiem; SQLite ma własny model atomic commit, który nie obejmuje cudzych plików [S07]. Rename ma wymagania platformowe i nie wystarcza sam do gwarancji przetrwania utraty zasilania [S11].

### Tożsamość operacji i wersja

ID źródła to UUIDv4; wersja pliku to SHA-256 surowych bajtów. `version` dla edytowalnej reprezentacji API ma postać `r1.<64hex>`. Representation r1 zawiera tylko metadata, body, type i tę wersję — bez dynamicznych alerts, ścieżki, kursora SSE i czasu odczytu. HTTP ETag ma cudzysłowy: `"r1.<hash>"`. Nie kompresujemy tej pojedynczej reprezentacji w sposób łamiący silny validator. Zmiana formatu reprezentacji wymaga zmiany prefixu. `If-Match` musi wskazać konkretną silną wersję, nie `*` [S08].

Przy przechowaniu JSON błędów/wyników wersja zasobu nie jest ETag endpointu statusu komendy. Opisany validator dotyczy GET/PATCH konkretnego zasobu, nie dowolnego POST z cudzym ETag.

`request_id` to UUIDv7, czas z identyfikatora służy wyłącznie oknu retry, nie autoryzacji [S09]. Nowy, nieznany request jest przyjmowany od `now−24h` do `now+5min`. Klient używa czasu serwera z bootstrap do kompensacji zegara. Wyniki zostają przez co najmniej 7 dni od przyjęcia. Znany request jest sprawdzany przed ponowną oceną If-Match i okna nowej komendy, ale zawsze po auth i sprawdzeniu epoch.

Unikalność rejestru: `(command_epoch, request_id)`. Digest obejmuje metodę, logiczny target, API contract, payload po jednoznacznej kanonizacji i oryginalną precondition. Ten sam ID z inną treścią → `IDEMPOTENCY_KEY_REUSED`. CSRF, numer połączenia i cookie nie są częścią digest. Retry po zmianie sesji jednego właściciela nadal może odzyskać wynik.

`command_epoch` jest trwałym UUID. Zwykły restart go nie zmienia. Restore, utrata state DB lub inicjalizacja nowego stanu zmienia epoch. Żądanie starej epoki → `EPOCH_CHANGED`, bez auto-retry jako nowa komenda. To odcina niepewne stare intencje od odtworzonej historii.

Przy cofnięciu zegara hosta nie można przedłużać ważności usuniętych kluczy: zapisuj trwały floor czasu admission. Znaczny wykryty skok wstecz blokuje nowe mutacje do diagnozy; odczyt pozostaje. Nie implementuj własnego distributed clock.

### Kolejność normalnego zapisu jednego pliku

1. Auth/CSRF/limity/API epoch i lookup request. Znany committed → zwróć oryginalny wynik; rejected → oryginalny błąd; unresolved → status, nie drugi wykonawca.
2. Globalna bramka utrzymania w trybie shared, potem lock projektu, potem kolejka state DB. Nie trzymaj globalnego mutexa nad całym dyskiem przy zwykłym zapisie innego projektu.
3. Zweryfikuj lease, katalog i typ pliku. Odczytaj aktualne bajty. Waliduj front matter i oczekiwaną wersję. Odczytaj wymagane referencje i sprawdź domenę.
4. Wylicz wynik bez skutków ubocznych. No-op zapisuje wynik komendy bez zmiany dokumentu. Konflikt walidacji nie zmienia pliku.
5. Zapisz `PREPARED` w `state.sqlite`: target logiczny i bezpieczna lokalizacja, przed/po hash, pełne potrzebne bajty, rodzaj operacji, digest i rezultat planowany. Użyj trwałej transakcji. Nie wykonuj rename, jeśli ten krok się nie udał.
6. Utwórz unikalny plik tymczasowy obok celu, bez podążania za symlinkami, z odpowiednimi prawami. Zapisz całe bajty, sprawdź wynik i zsynchronizuj plik. Przy create wymagaj braku istniejącego targetu; nie stosuj zwykłego overwrite-rename do istniejącego obcego pliku.
7. Ponownie sprawdź obecny target oraz precondition, zachowując lock. Wykonaj platformowo bezpieczną podmianę/no-replace create i synchronizację katalogu. Sprawdź wynik; nie traktuj cache OS jako dowodu trwałości.
8. Zapisz `COMMITTED` i trwały wynik w state DB. Dopiero po tym można odpowiedzieć committed. Awaria po zmianie pliku, lecz przed potwierdzeniem state oznacza pending recovery, nie „zapis się nie udał”.
9. Aktualizuj indeks i opublikuj inwalidację z nową wersją. Przy błędzie indeksu wynik dokumentu pozostaje committed; odpowiedź/health ostrzega o degraded projection i planuje odbudowę.

SQLite state: WAL, foreign_keys=ON, bounded busy_timeout i `synchronous=FULL`; na macOS sprawdź potrzebę `fullfsync` z modelem trwałości i testem [S20]. Dla plików użyj platformowego adaptera z fsync/directory sync oraz oceną APFS F_FULLFSYNC. Nie zadeklaruj odporności na utratę zasilania tylko dlatego, że unit test zabił proces.

Jeżeli journal nie przyjmuje zapisu, nie modyfikuj źródła. Jeśli rename już nastąpił, a kolejne utrwalenie zawiedzie, odetnij nowe mutacje tego targetu i zachowaj stan niepewny. Szeregowanie komend tego samego projektu nie może omijać nierozstrzygniętego zamiaru.

### Macierz recovery po PREPARED

| Stan targetu | Wynik |
|---|---|
| Hash == after | Utrwal/zweryfikuj doc i katalog, dokończ COMMITTED, odbuduj projekcję |
| Hash == before | Dla zwykłej edycji wznowienie zapisanej intencji, o ile precondition i zależności nadal poprawne; w przeciwnym razie konflikt recovery |
| Brak, a before był absent (create) | Wznów no-replace create |
| Inne bajty, błędny plik, nowy symlink lub nieoczekiwany brak | NEEDS_REVIEW; nie nadpisuj i nie przywracaj automatycznie |
| Niedostępny katalog/dysk | BLOCKED; zachowaj journal do powrotu zasobu |

Nie usuwaj nierozstrzygniętych zamiarów przez zwykłą retencję. Recovery wykonuje się przed dostępem do zapisu, według kolejności w obrębie projektu. Wznowienie nie ignoruje zewnętrznej zmiany zależności tylko dlatego, że target ma stary hash.

### Zewnętrzny edytor i granice gwarancji

Watcher wykrywa zmiany i emituje external update. Uszkodzony dokument ma ostatnią poprawną projekcję oznaczoną jako nieaktualna, ale zwykły zapis jest zablokowany. Wersje z błędnego pliku nigdy nie są pretekstem do jego nadpisania dawnym cache.

Hash pod własnym lockiem chroni współpracujące UI/CLI. Nie jest atomowym compare-and-swap względem niewspółpracującego procesu piszącego w ostatniej chwili. Mamy ograniczenia systemu plików i advisory locks. Pełny lokalny agent z tym samym UID jest poza granicą izolacji. Zalecany kanał automatycznego zapisu to CLI.

### Operacje wieloplikowe

Rejestracja, normalizacja wielu dokumentów, renumeracja ranków, restore i migracje to jawne workflow z listą kroków i preconditions. Zapisujemy stan przed/po każdego kroku. Po awarii resume/review, bez obietnicy atomowości całego drzewa. Rejestr workspace aktualizujemy dopiero po poprawnym przygotowaniu `.project` i świadomie rozstrzygniętym bloku AGENTS.

W razie częściowego wykonania nie usuwaj w rollbacku pliku, który użytkownik zdążył zmienić. Automatyczne sprzątanie obejmuje wyłącznie pliki nadal identyczne z utworzonymi przez operację. W API workflow ma job/status, nie fałszywy pojedynczy sukces.

### Undo, historia, retencja

Undo to nowa intencja z aktualną oczekiwaną wersją. Może odwrócić pojedynczą własną zmianę, ale jeżeli zasób się później zmienił, pokazuje konflikt. Nie cofamy update do nieistnienia jako zwykłej operacji; dodajemy correction/resolution. No-op nie dodaje kolejnej treści do historii.

Retencja wyników 7 dni jest minimalnym gwarantowanym oknem. Historia treści: docelowo 30 dni, do 1 GiB, z jawnym wskaźnikiem i możliwym wcześniejszym usunięciem starej opcjonalnej historii. Dane wymagane przez retry i unresolved recovery nie podlegają takiemu usuwaniu. Przy presji dysku odmawiamy nowych zapisów, zamiast osłabiać gwarancję. Nie logujemy treści dokumentów ani sekretów do zwykłych logów.

Stare nieznane request ID poza oknem przyjęcia są odrzucane. Klient nie tworzy automatycznie nowego ID po wygaśnięciu wyniku; najpierw odczyt aktualnego stanu i świadoma nowa decyzja. Po restore nowe epoch oraz sesje zapobiegają niezamierzonemu odtworzeniu starych kliknięć.


*Plik źródłowy: `docs/04-WRITES-AND-RECOVERY.md`.*


---

<a id="chapter-05"></a>

## 05. API HTTP, kontrakty i aktualizowanie widoków

### Unresolved single-resource commands — implementation clarification

A mutation that durably reached PREPARED but has no confirmed outcome returns
HTTP 202 with `CommandStatus` (`api_version: "1"`, `request_id`, `state`).
The state is `prepared`, `blocked`, or `needs_review` as observed in the journal.
It does not return `CommandResponse.status=committed` or a new job ID. Poll the
command status with the original request ID and epoch. A workflow returning
`Accepted` with a job ID remains a separate contract. See ADR-014 and
`examples/requests/command-pending-response.json`.

Pełna lista ścieżek, typów, nagłówków i podstawowych odpowiedzi jest w `contracts/openapi.yaml` (OpenAPI 3.1.1 [S21]). Kontrakt ma być sprawdzany w CI. Poniższy opis definiuje semantykę wykraczającą poza sam schemat.

### Wersja i format

Prefix `/api/v1`. JSON UTF-8. API i zasoby statyczne pochodzą z tego samego originu. `bootstrap` zawiera instance_id/name, build_id, api_version, command_epoch, server_time, timezone, capabilities i csrf_token. Nie zawiera wszystkich kart, ścieżek repo i raportów.

Reprezentacja pojedynczego obiektu: `{type, metadata, body, version}`. Wersja jest opaque dla klienta. Listy zwracają małe summary, nie pełne body. Dynamiczne warnings, freshness i cursors należą do projekcji widoku, nie do repr r1 z silnym ETag.

Błąd ma `{api_version, error: {code, message, request_id?, details?}}`. Stabilny jest code; message można tłumaczyć. Details nie zawiera sekretów ani pełnych plików przypadkowo z innego projektu. Błędy walidacji wskazują pole i regułę. Przykłady są w `examples/requests`.

### Mutacje

Domenowe POST/PATCH/PUT wymagają `X-Request-ID` UUIDv7, `X-Command-Epoch` i przeglądarkowego `X-CSRF-Token`. Zmiana istniejącego dokumentu wymaga `If-Match`. Brak precondition → 428; niezgodna → 412. Zasób nieistniejący → 404. Stary epoch → 409. Zepsute źródło → 409 DOCUMENT_INVALID. Niedostępny projekt → 503. Zbyt duży payload → 413. Niepoprawne dane → 422. Request rate → 429. Utrata storage → 507 lub 503 z konkretnym code i bez fałszywego committed.

PATCH nie jest dowolnym JSON Patch. Używa `{set: {...}, clear: [pole], placement?: {...}}`. `set` wymienia tylko dozwolone mutowalne pola. Obiekt zagnieżdżony jest zastępowany jako całość. `clear` usuwa tylko pola opcjonalne. Pole nie może być jednocześnie set i clear. Null nie jest alternatywną składnią usuwania. ID, czasy serwera, schema_version i position nie są edytowalne bezpośrednio przez PATCH. Pole body jest wyraźną edycją tekstu.

Odpowiedź sukcesu komendy: `{api_version, request_id, status: committed|noop, result, warnings, replayed}`. Result zawiera typ i ID targetu, nową wersję i opcjonalną reprezentację. HTTP ETag do późniejszego If-Match pobieramy z zasobu/result.version; nie mylimy go z ETag wrappera komendy. Znane retry zwraca pierwotny rezultat z `replayed=true`; klient może potem odczytać nowszą wersję.

Operacje utrzymania mogą zwrócić 202 z job_id i endpointem statusu. Klient nie interpretuje 202 jako gotowego zapisu. Autoryzacja i pairing mają osobny cykl życia; nie używają arbitralnego edytowalnego dokumentu ani cudzych If-Match.

### Główne rodziny API

Projekty i rejestracja; karty; milestones; append-only updates; workspace/focus; potwierdzenia odczytu; projekcje board/calendar/gantt/attention; wyszukiwanie; historia i warunkowe undo; wyniki komend; pairing/sessions; diagnostics; strumień SSE. Nie ma endpointu dowolnego shell/SQL/download-path.

Rejestracja z HTTP ma dwa kroki: plan na zatwierdzonym root_id + relative_path, a potem commit planu. Plan ważny 5 min i zawiera hashe istniejących plików oraz zamiar zmian. Commit ponownie sprawdza plan; zmienione pliki → PLAN_STALE. Plan lokalny z CLI może używać dokładnej ścieżki dostępnej użytkownikowi, ale nie jest wystawiony na TCP.

Gdy GUI rozrejestrowuje projekt, zmienia tylko workspace. Nie usuwa plików. Relocate jest workflow z weryfikacją ID i wyłączności; nie zwykłym polem path w PATCH projektu.

### Kolekcje i filtrowanie

Domyślnie 50 rekordów, max 200 dla list ogólnych. Calendar max 400 dni i 1000 elementów strony; Gantt domyślnie 200 wierszy i max 500. Limit przekroczenia wymaga stronicowania, nie ucięcia bez informacji. Body nie jest na listach.

Filtry: project, status, priority, label, milestone, archived, due range, search. Sort ma określoną stabilność i tie-breaker ID. Opaque cursor wiąże query hash i revision projekcji. Gdy nie da się utrzymać spójności kolejnej strony po zmianie danych, zwróć `CURSOR_STALE` i odśwież, zamiast mieszać rekordy. Nie utrzymuj długich transakcji SQL przez interakcję użytkownika.

Search używa bezpiecznie związanych parametrów i jawnego składania zapytania FTS. Tekst użytkownika nie jest SQL ani dowolną komendą FTS. Limit długości 256 znaków; domyślnie literalne terminy/prefix, tytuł ważniejszy niż body, polskie znaki testowane. FTS5 dostarcza mechanizm, nie gotową semantykę produktu [S06].

Calendar zwraca item_id osobny od resource_id, ponieważ karta może mieć plan, deadline i przegląd. Typy: `card_schedule`, `card_due`, `card_review`, `milestone_due`, `project_review`. Każdy marker wskazuje źródło i version. Gest planu nie zmienia markera due. Zależności Gantta referują ID kart; hidden target jest opisany, nie pomijany bez wyjaśnienia.

### SSE bez zgubionej zmiany

Strumień `/events` jest jeden na otwartą kartę aplikacji, nie osobny perprojekt. Nie umieszczaj tokenu sesji w query string. Native EventSource używa cookie same-origin. SSE ma semantykę jednostronnego strumienia i Last-Event-ID [S10].

Cursor to `stream_epoch:sequence`. Epoch jest nowe przy starcie/rebuild streamu, odrębne od command_epoch. Sequence rośnie po **zatwierdzeniu projekcji**. Index writer zapisuje nową projekcję i jej sequence w jednej transakcji, a następnie pod krótką blokadą publikacji dopisuje event do bufora. Snapshot czyta dane i cursor z jednej transakcji. Nie wolno oznaczyć starych danych kursorem późniejszej zmiany.

Klient: bootstrap daje początek subskrypcji; uruchom stream z tym cursorem, buforuj invalidations, pobierz potrzebne snapshoty. Dla każdego widoku odrzuć zdarzenia <= jego cursor i zastosuj nowsze jako potrzebę odświeżenia. To usuwa wyścig snapshot-versus-subscription. Możliwy jest też snapshot-first + replay; oba muszą przejść test luki.

Event `changed`: target kind/IDs, version, reason, request_id opcjonalne. Bez pełnych body. `resync_required`: luka, przepełnienie bufora, restart, rebuild. `health_changed`: degradacja magazynu/projekcji. Na brakujące epoch albo zbyt stary cursor nie udawaj pełnej historii; jawny resync. Ograniczony bufor: 10 000 zdarzeń lub 10 min, cokolwiek wcześniej. Heartbeat komentarz co 20 s, nie zapis do bazy.

Auth jest sprawdzana przy otwarciu i odwołaniu sesji; revoke aktywnie zamyka jej stream. Sesja nie pozostaje żywa bez końca tylko dlatego, że SSE się nie rozłączyło. Proxy nie może buforować całego strumienia. Po powrocie z tła klient ponownie synchronizuje potrzebne widoki, nie zakłada ciągłego działania na telefonie.

Jeśli plik został committed, lecz indeksowanie zawiodło, nie emituj zwykłego changed z fikcyjną projekcją. Emituj degraded/resync. Szczegół zasobu może nadal dać poprawne źródło, a widoki oznaczają starość. Po odbudowie nowa generacja wymusza snapshot.

### API stalej karty po aktualizacji serwera

Build ID i contract version są jawne. Przy niezgodności zapisu UI zachowuje szkic i prosi o bezpieczny reload. Nie odświeżaj automatycznie strony nad wpisywanym tekstem. Stare lazy chunk URL muszą dawać rzeczywisty błąd, nie HTML 200. HTML: no-cache; prywatne API: no-store; hashowane zasoby: immutable. Nie ma service workera w v1.


*Plik źródłowy: `docs/05-API-AND-EVENTS.md`.*


---

<a id="chapter-06"></a>

## 06. CLI, lokalne IPC i współpraca z agentami

### Cel i transport

CLI jest pierwszorzędnym klientem, nie skryptem do bezpośredniego sklejania YAML. Normalne komendy idą do `projectd` przez HTTP/1.1 nad Unix-domain socket. Ten sam dispatcher i modele co dla HTTP, ale principal powstaje z peer UID, nie z dowolnego nagłówka. UDS jest w prywatnym katalogu runtime, socket 0600, akceptowany ten sam UID. TCP nigdy nie montuje routingu `/local/v1` i nie ufa `X-Local-User`.

Globalne flagi: `--project <exact-path>`, `--json`, `--socket <path>`, `--timeout <seconds>`, `--request-id <uuidv7>`, `--if-version <opaque-version>`. Dla normalnej zmiany agent podaje wersję uzyskaną przy odczycie, zamiast prosić klienta o automatyczne zastąpienie najnowszej. Nie ma force overwrite.

`--project .` oznacza dokładnie cwd. Nie wyszukuj projektu po rodzicach, remote czy worktree. `--project` jest wymagane przy operacjach projektowych; dla właściciela można dodać świadomy alias instancji później, nie automatyczny wybór według nazwy.

### Katalog poleceń

| Polecenie | Semantyka |
|---|---|
| `add PATH [--dry-run]` | Plan/inicjalizacja i rejestracja dokładnego folderu; resume-safe |
| `projects list` | Rejestr instancji, dostępność i ID |
| `remove PATH --if-version V` | Tylko rozrejestrowanie, nie usunięcie plików |
| `relocate OLD NEW --dry-run` | Jawny plan zmiany lokalizacji, kontrola ID i wyłączności |
| `context --json [--max-bytes N]` | Ograniczony kontekst jednego projektu |
| `cards list`, `card get ID` | Summary i szczegół z version |
| `card create --title T [--body-file F]` | Jedna karta, defaulty po stronie serwera |
| `card set ID --patch-file F --if-version V` | Dokładny typed patch, opcjonalne ergonomiczne flagi status/date |
| `card move ID --after ID --before ID --status S --if-version V` | Sąsiedztwo i docelowy status; null reprezentowane przez brak/krawędź |
| `milestone list/get/create/set` | Ten sam wzorzec kontroli wersji |
| `report add --kind K --target TYPE:ID --summary T --body-file F` | Append-only update; request ID pozwala retry |
| `reports list/get`, `report resolve ID --body-file F` | Resolution to nowy update, nie nadpisanie starego |
| `focus get/set --input F --if-version V` | Wspólna kolejność w workspace; nie algorytm agenta |
| `command status ID` | Rozstrzygnięcie niepewnego wyniku |
| `validate [--offline]` | Normalnie serwer; offline wyłącznie odczyt źródeł |
| `doctor [--json]` | Ścieżki konfiguracji, socket, lease, schema, index, recovery, sieć bez sekretów |
| `pairing list/approve/deny` | Lokalne zatwierdzenie urządzenia |
| `sessions list/revoke` | Unieważnienie dostępu przeglądarki |
| `roots list/add/remove` | Lokalna administracja dozwolonymi korzeniami rejestracji WWW |
| `backup create/verify`, `restore plan/apply` | Utrzymanie z wyłącznością i planem, bez arbitralnego remote restore |
| `index rebuild` | Odbudowa cache bez usunięcia focusu/sesji |
| `normalize --dry-run/apply`, `order rebalance` | Jawne workflow, nigdy ukryte w zwykłym zapisie |

To projektowany interfejs. Implementacja może dodać aliasy bez zmiany semantyki. Polecenia destrukcyjne nie mogą akceptować niejednoznacznej skróconej nazwy projektu.

### Kontrakt wyjścia

W `--json` stdout zawiera pojedynczy JSON (API version, ok, data/error, request_id), bez spinnerów, ANSI i tekstu diagnostycznego. stderr to diagnostyka. Sekrety parowania nigdy nie trafiają do logów ogólnych. Kody wyjścia: 0 sukces; 2 składnia/walidacja argumentów; 3 brak serwera/transport; 4 brak zasobu; 5 konflikt wersji/kolejności; 6 brak uprawnień; 7 invalid document/recovery required; 8 storage/internal; 9 niepewny wynik lub komenda w toku. Niepewny wynik wypisuje request_id do sprawdzenia.

Request ID bez flagi generuje klient przed wysłaniem i zachowuje co najmniej w wyjściu/diag. Automatyczne retry dopuszczalne wyłącznie z identycznym ID, epoch, payloadem i precondition. Nie odświeżaj precondition automatycznie po konflikcie. Czas komendy pochodzi z offsetu względem hello serwera.

### Lokalny kontrakt administracyjny

`GET /local/v1/hello`: instance_id, command_epoch, server_time, api_version. `POST /local/v1/registration-plans`: absolute_path. Zwykłe zasoby `/api/v1/...` działają także na UDS, z principal local. Dodatkowe `/local/v1/pairings/{id}/approve|deny`, `/roots`, `/maintenance/...` mają ten sam dispatcher audytowy i typowane payloady. Nie ma ogólnego routingu dowolnego polecenia CLI do shell.

### Kontekst agenta

Domyślny budżet 24 KiB, max 128 KiB. Zawiera: cel/fazę, aktywny milestone, wybrane aktywne/review karty, focus odnoszący się do tego projektu, blokady i ostatnie istotne raporty. Podaje version każdego zasobu, generated_at, limity, included/omitted counts oraz `next_reads` wskazujące zasoby do odczytu szczegółu; CLI może przedstawić je jako gotowe polecenia. Nie eksportuje innych projektów ani wszystkich historycznych opisów. API używa `ContextEntry` z jawnym `excerpt` i `truncated`; fragment nie udaje pełnej reprezentacji zasobu. Odczyt pełnego dokumentu jest osobną operacją. Budżet obejmuje również narzut JSON, a zbyt mały limit daje czytelny błąd zamiast niepoprawnego JSON.

Budżet jest liczony w bajtach UTF-8 i obiektach, nie fałszywie w „tokenach” bez tokenizera docelowego modelu. Treść ma etykietę project data; nie zastępuje systemowych instrukcji agenta. Utrzymuj oddzielenie instructions/data, aby raport zawierający tekst polecenia nie stawał się automatycznie instrukcją wykonania.

### Integracja AGENTS.md

`templates/managed-agents-block.md` to materiał generowany w cudzym repo. `templates/project-readme.md` wyjaśnia format. Nazwa standardowa to wielkie `AGENTS.md`; konwencja nie gwarantuje odczytu w każdym narzędziu [S13]. Na systemie rozróżniającym wielkość liter wykryj także istniejące agents.md, ale nie twórz dwóch sprzecznych plików bez diagnozy. Na case-insensitive macOS nie wykonuj ślepej zmiany nazwy.

Blok ma begin/end markers i template_version. Istniejąca treść poza nim musi pozostać nienaruszona. Hash zmienionego ręcznie bloku daje konflikt wymagający planu, nie overwrite. Instrukcja każe odczytać README i project, a stan pobierać CLI. Nie kopiujemy deadline'ów do AGENTS.

Agent domyślnie dopisuje tylko nowe istotne informacje. Zmiana zakresu, terminu, focusu lub akceptacja rezultatu wymaga wyraźnego polecenia użytkownika. Nie jest to sandbox dla procesu z pełnymi prawami użytkownika. Aplikacja nie potrafi dowieść tożsamości modelu po polu `author.label`.


*Plik źródłowy: `docs/06-CLI-AND-AGENTS.md`.*


---

<a id="chapter-07"></a>

## 07. Prywatna sieć i model bezpieczeństwa

### Zakres zagrożeń

Chronimy przed przypadkowym wystawieniem danych, niezaufaną stroną w przeglądarce, złośliwą treścią Markdown, nieuprawnionym klientem w prywatnej sieci, błędną ścieżką, wyciekiem cookie i retry po restore. Nie izolujemy użytkownika/agentów posiadających ten sam UID i pełny dostęp do dysku, przejętej przeglądarki lub skradzionego odblokowanego urządzenia z aktywną sesją.

Prywatny VPN to filtr osiągalności, nie zamiennik auth aplikacji. Pełna edycja telefonu wynika z zaufanej sesji, nie z User-Agent. Jeden właściciel i kilka urządzeń, bez RBAC organizacji.

### Wdrożenie

Backend bind wyłącznie `127.0.0.1`, domyślny port 47831. Zatwierdzony origin HTTPS obsługuje Tailscale Serve. Tailscale Serve jest prywatnym proxy, odrębnym od publicznego Funnel [S03]. Bez automatycznego bind `0.0.0.0`, UPnP, otwierania firewalla i publicznego tunnel. Program nie zarządza VPN.

Odbierz ruch jedynie dla skonfigurowanego Host. Origin operacji zmieniających stan musi dokładnie pasować do public_origin. Nie buduj origin z dowolnego X-Forwarded-Host. Nie korzystaj z Tailscale identity headers jako samodzielnego uwierzytelnienia; mogą być podszyte przy złej granicy proxy [S03]. CORS wyłączony. Origin null nie jest zaufany.

### Parowanie bez kont i haseł

1. Niesparowana przeglądarka prosi o pairing po JSON same-origin. Serwer tworzy losowy pairing ID, jednorazowy challenge i niezależny 256-bitowy pending secret w Secure/HttpOnly cookie; przechowuje hash.
2. UI pokazuje krótką frazę/kod do porównania i nazwę instancji. Pending ważny 5 min, limit 10 aktywnych i 5 nowych/min dla instancji. Kod nie jest bearer tokenem pełnego dostępu.
3. Lokalny CLI lub już sparowane urządzenie zatwierdza **konkretne** żądanie po porównaniu frazy. Sam fakt otwarcia strony nie oznacza zaufania.
4. Tylko posiadacz pending cookie może pobrać approved state i wykonać claim z pending CSRF. Przy claim nadaj nowy losowy sekret sesji, nie promuj znanego starego identyfikatora.
5. Utrata odpowiedzi na claim: krótki grace 60 s pozwala temu samemu pending secret ponowić claim; poprzednia wydana sesja zostaje odwołana, nowa zastępuje ją. Po grace wymagane nowe pairing. To osobny, testowany protokół, nie dowolna wielokrotna aktywacja kodu.

Podstawowe cookie `__Host-project_session`: Secure, HttpOnly, SameSite=Strict, Path=/, bez Domain. Sesja 30 dni bezczynności, maksymalnie 90 dni; parametry konfigurowalne. Bearer sekrety sesji i pending są generowane CSPRNG; w bazie wyłącznie ich hash, nie raw token. Odrębny sekret CSRF można przechowywać w chronionej state DB; sam nie uwierzytelnia sesji. CSRF token powiązany z sesją dostaje bootstrap i jest trzymany w RAM UI. OWASP opisuje te mechanizmy, ale wartości timeoutów to nasz baseline [S14][S15].

Revoke zamyka aktywny SSE i blokuje kolejne żądania. Nie cofnie już zatwierdzonej operacji ani nie usunie zrzutu danych z obcego urządzenia. Przy logout usuwaj bieżący stan UI i cookie. Odtworzenie backupu domyślnie odwołuje wszystkie sesje.

### Ochrona HTTP

Każda browserowa mutacja wymaga CSRF, poprawnego Origin i Content-Type JSON. Limit request body przed deserializacją. Endpointy GET nie wykonują zmiany domeny. Pairing ma własny pending token; nie zwalnia z Origin/rate limiting. UDS jest odrębnym uwierzytelnionym transportem i nie dziedziczy cookie.

CSP baseline: default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'. Style-src 'self' oraz selektywne dopuszczenie style attributes wymaganych przez bibliotekę layoutu po teście; nie dodawaj unsafe-eval ani inline scripts „żeby widget działał”. Własne ikony SVG nie pochodzą z treści użytkownika. API no-store, HTML no-cache, referrer-policy no-referrer, nosniff.

Skrypty, fonty i CSS nie pochodzą z CDN. Obrazy i preview linków z opisów nie są automatycznie ładowane. Markdown nie wykonuje HTML, javascript:, data:text/html ani file:. Linki http/https otwierane świadomie z noopener/noreferrer. Pojedyncza biblioteka sanitizacji ma mieć testy, nie ręczny regex jako filtr XSS.

### Ścieżki i repo

HTTP rejestruje tylko root_id + bezpieczną ścieżkę względną. Rooty ustawia lokalny właściciel. Odrzucamy `..`, NUL, ścieżki absolutne, traversal po dekodowaniu, symlinki uciekające poza root i specjalne pliki. Identyfikatory obiektów nie są ścieżkami. Bazujemy na otwartych deskryptorach katalogu i ponownej weryfikacji, nie na jednorazowym string-prefix compare.

`.project` nie może być symlinkiem. Pliki docelowe muszą być zwykłymi plikami, bez podążania za symlinkami. Hardlink count >1 przy modyfikacji daje diagnozę; nie zapisuj pliku współdzielonego z nieznanym miejscem. Nie otwieramy sieciowych filesystemów jako wspieranego trybu trwałości v1. Ścieżka UTF-8 jest baseline v1; niepoprawne bajty ścieżki dają czytelny błąd, nie lossy alias.

Zmiana AGENTS i info/exclude jest wyjątkiem inicjalizacji, pokazanym w planie. Serwer nie wykonuje kodu z repo. Obserwator Git ma timeout, ograniczony output, wyłączone fsmonitor/hook mechanism właściwe użytym poleceniom, bez fetch i bez terminala. Nie dodajemy ogólnego execute endpointu.

### Zależności i logi

Astra sprawdza utrzymanie, licencję i advisory przy przypinaniu zależności. Żadnej płatnej funkcji PRO bez decyzji właściciela. Lockfiles, SBOM i lista third-party notices w wydaniu. Nie zakładaj, że darmowa demonstracja widgetu oznacza darmowe wszystkie funkcje.

Logi zawierają request ID, czasy, code, logiczny target i statystyki, nie body dokumentów, cookies, pairing secret ani komendy z prywatną treścią. Local telemetry bez wysyłki. Endpoint diagnostics wymaga sesji; unauth health zwraca tylko gotowość bez listy projektów. Rozbudowany bundle diagnostyczny tworzy właściciel z podglądem zawartości.


*Plik źródłowy: `docs/07-SECURITY.md`.*


---

<a id="chapter-08"></a>

## 08. Specyfikacja UI, ruchu i estetyki

### Kierunek wizualny

Precyzyjne, spokojne narzędzie desktopowe adaptujące się do telefonu. Bez dekoracyjnych dashboardów, ciężkich gradientów, nadmiaru kart KPI i nieczytelnych przezroczystości. Wyróżniki: czytelny plan, bardzo dobra typografia, mały koszt obsługi i bezpośrednia reakcja.

Jedna warstwa design tokens: kolor tła/panelu/tekstu/border/accent i stanów; odstępy 4/8/12/16/24/32; font systemowy (bez pobierania), podstawowy rozmiar 14–16 px; rozsądne promienie 6–10 px; cienie tylko dla warstw. Jasny i ciemny motyw plus preferencja systemu. Semantyka koloru ma dodatkową ikonę lub tekst.

Początkowe tokeny w `templates/design-tokens.css` są punktem startowym, nie zatwierdzonym brandingiem. Liczy się jakość w zapełnionym widoku. Należy wykonać przegląd kontrastu i dostępności; sam dobór HEX nie jest dowodem zgodności.

### Układ

Desktop: nawigacja około 220 px (zwijalna), centralny widok, opcjonalny inspektor 320–420 px. Nazwa gospodarza stale widoczna. Otwieranie karty nie gubi scrolla ani filtrów. URL zawiera instancję poprzez origin oraz view/project/card i stan istotnych filtrów; nie zapisuje sekretów.

Tablet: zwijana nawigacja, overlay inspektora. Telefon: pełnoekranowy panel karty lub bottom sheet, wygodna nawigacja głównych widoków, horyzontalne przewijanie kanbana i Gantta tylko w kontrolowanej przestrzeni. Nie zakładamy hover. Wszystkie operacje mają alternatywę w panelu.

Breakpointy początkowe 720/1100 CSS px służą układowi, nie uprawnieniom ani detekcji typu urządzenia. Testuj narrow window na desktopie i szeroki telefon poziomo. Użyj safe-area i dynamic viewport; klawiatura ekranowa nie może zasłonić jedynego przycisku zapisu.

### Wspólny panel karty

Nagłówek: tytuł, status, zapis/conflict/unsaved, menu archiwizacji. Sekcje: rezultat/body, plan i deadline, milestone/zależności, blokada, aktualizacje/historia. Rzadkie pola stopniowo ujawniane. Body zwykły Markdown textarea + bezpieczny preview; nie WYSIWYG v1.

Pole tytułu ma Save/Cancel oraz skrót zatwierdzenia; pełny formularz zbiera intencję do jednego patcha. Nawigacja z brudnym formularzem ostrzega. Równoczesna zewnętrzna zmiana pokazuje niewymuszające ostrzeżenie, nie przepisuje body.

### Kanban

Kolumny mają licznik, małą część widocznych kart i możliwość wczytania reszty. Tytuł, priorytet, deadline, blokada i milestone są kompaktowe. Na starcie nie renderuj 10k kart. Dnd przekazuje status i sąsiadów, nie arbitralny numer pozycji. Filtr może ukryć pośrednie karty; w trybie ręcznego sortowania trzeba wyjaśnić zakres albo zablokować reorder przy filtrze ukrywającym sąsiadów. Zmiana statusu przez menu pozostaje dostępna.

### Kalendarz

Widoki miesiąc, tydzień całodniowy, agenda. Zakres planu to pasek; deadline to oznaczony marker; review to odmienna etykieta. Ten sam obiekt może mieć kilka elementów, wszystkie otwierają tę samą kartę. Klik pustego dnia może rozpocząć nową kartę z planem, bez automatycznego deadline'u.

Move planu zachowuje liczbę dni. Resize zmienia tylko chwytaną granicę, minimum 1 dzień. Przejście przez miesiąc i rok jest normalną operacją. Przeniesienie hard deadline wymaga wyraźnego potwierdzenia pola daty, nie dzieje się przez uchwyt planu. Na telefonie marker można wybrać i zmienić datę w panelu.

Nakładające się wydarzenia dostają czytelne ułożenie i licznik overflow. Nie tworzymy godzinowego week grid sugerującego blokadę czasu, gdy model jest całodniowy. Brak danych przez network error nie jest pustym dniem.

### Gantt

Wiersze kart i milestones, stała kolumna tytułu, wspólna pozioma oś czasu. Skale dni, tygodni, miesięcy. Nieistniejący plan jest w sekcji niezaplanowanych z akcją zaplanowania. Koniec planu i due mogą być różne. Zależności rysowane tylko dla widocznego kontekstu z oznaczeniem połączeń poza ekran; nie budujemy gigantycznego DOM dla każdej krawędzi całego archiwum.

Zależność dodawana przez panel z wyszukaniem karty jest obowiązkowa. Rysowanie krawędzi palcem może być dodatkową interakcją, nie jedynym sposobem. Weekend może być oznaczony, ale nie zmienia długości planu. Bez auto-schedulera i capacity planning.

### Maszyna stanów gestu

`idle → armed → dragging/resizing → committing → confirmed | conflict | uncertain`, z możliwością cancel do idle przed wysłaniem. Potwierdzony stan jest oddzielny od preview. Capture pointer na kontrolowanym elemencie. Aktualizacje ruchu agregowane do requestAnimationFrame; bez network i serializacji plików w loopie.

Pod kursorem ruch 1:1, bez spring opóźniającego palec. Przy osadzeniu przejście 120–180 ms. Panel 160–220 ms. Reduced motion: brak translacji/spring, możliwy krótki fade. Nie animuj masowego odtwarzania po reconnect. Długie operacje mają status, nie nieskończoną animację udającą pracę.

Touch: normalny scroll ma pierwszeństwo na treści; dnd zaczyna się z widocznego uchwytu lub po jawnie wybranym elemencie. Hitbox uchwytu co najmniej 44×44 CSS px, nawet gdy rysunek mniejszy (nasz cel ergonomiczny, nie twierdzenie o jedynym progu WCAG). `touch-action` ogranicz lokalnie, nie na całym dokumencie. `pointercancel`, utrata capture, drugi palec, orientation change i Escape anulują preview bez zapisu. Auto-scroll przy krawędzi ma ograniczoną prędkość i kończy się przy cancel. Pointer Events wspiera te mechanizmy, ale ergonomię trzeba przetestować [S16].

### Konflikt, pending i błąd

Conflict pokazuje: wersję bazową, aktualną wartość i proponowaną zmianę. Pozwala odczytać różnice, skopiować szkic, anulować lub świadomie złożyć nową intencję po aktualizacji. Brak globalnego „zawsze nadpisuj”.

Uncertain zachowuje request_id, blokuje drugi niezależny Save tej samej intencji i sprawdza status po reconnect. Nie pokazuj toast „nie zapisano” dla timeoutu bez wiedzy o wyniku. Po committed-indeks-degraded karta pokazuje zapisaną wersję i ostrzeżenie o reszcie widoku, nie rollback w UI.

### Dostępność i jakość

Kierunek WCAG 2.2 AA: kontrast, visible focus, semantyczne etykiety, brak keyboard trap, alternatywa dla drag i obsługa powiększenia. Jest to cel do testu, nie deklaracja gotowej zgodności [S17]. Elementy interaktywne nie znikają tylko po zmianie rozdzielczości. Przy wirtualizacji zachowaj stabilną kolejność focusu i opis liczby elementów. Screen reader musi dostać informację o wyniku zapisu i nowej dacie bez czytania całego widoku.

Nie przechwytuj przeglądarkowego find, edycji tekstu i systemowych skrótów. Command palette ma jedną przewidywalną kombinację Cmd/Ctrl+K poza polami tekstowymi; Escape zamyka warstwę, nie kasuje zapisanego obiektu. PL jako język początkowy, maszynowe klucze w EN, teksty wydzielone do prostych słowników.

### Dobór komponentów

Sprawdź EventCalendar oraz open-source SVAR Gantt [S04][S05]. Adapter bierze nasz ViewModel i emituje wyłącznie intencje; nie trzyma źródła danych w stanie widgetu. Wewnętrzne formularze widgetu nie obchodzą wspólnego panelu i ETag. Test licencji, rozmiaru bundle, CSP, keyboard i mobile przed adopcją. W przypadku dyskwalifikującego błędu wybierz mały własny komponent lub alternatywę i zapisz decyzję; nie zmieniaj całego stosu z powodu koloru kontrolki.


*Plik źródłowy: `docs/08-UI-AND-INTERACTIONS.md`.*


---

<a id="chapter-09"></a>

## 09. Wydajność, obserwacja i diagnostyka

### Budżety

Wszystkie liczby są **celami do zmierzenia**, nie wynikami. Dataset: 100 projektów, 10k kart, 50k krótkich raportów, lokalny SSD, release. Dodatkowe profile: mały 3/100/300 oraz przeciążenie 300/50k/250k. Raport zapamiętuje OS, CPU, RAM, dysk, browser/build, build produktu, rozmiar datasetu i metodę.

| Miara | Cel początkowy |
|---|---|
| Focus interaktywny przy działającym host i ciepłym indeksie, lokalnie | p95 <1 s |
| Lokalna reakcja UI, nie czas sieci | p95 <50 ms |
| Typowe query indeksu | p95 <50 ms |
| Potwierdzenie pojedynczego trwałego zapisu na hoście | p95 <150 ms |
| CLI → widoczne dane na otwartym lokalnym UI | p95 <1 s |
| Pakiet JS+CSS startu skompresowany, bez calendar/Gantt | <=300 KiB |
| Serwer RSS po rozgrzaniu | cel <=100 MiB, osobno peak |
| Drag/resize/scroll | stabilne 60 fps na uzgodnionych urządzeniach |

Raportuj także p50, p99, liczbę próbek, cold start i rebuild. Dla mutacji p95 potrzebne co najmniej 200 powtórzeń po warmup, przeplatanych create/read/update, nie wyłącznie no-op. Mierz lokalne SSD, a osobno transport VPN z opóźnieniem np. 50/150/500 ms. Budżet zapisu nie obejmuje sieci, budżet UX musi pokazać także odczuwany czas end-to-end.

Pamięć klienta mierzymy jako przyrost względem pustej tej samej przeglądarki oraz stan rzeczywisty procesu, nie fikcyjne 0, bo „browser już był otwarty”. Próg klienta ustala G1 po pomiarze, musi być wpisany do raportu. Nie wyłączaj sync/auth żeby przejść target.

### Ograniczanie pracy

Frontend route splitting: focus/list ładowane wcześnie, calendar/Gantt lazy. Summary bez body; detail/updates na żądanie. Minimalny normalized store per ID i wyliczenia tylko dla używanego widoku. Nie kopiuj 50k obiektów przy zmianie jednego pola. Wirtualizacja list i osi czasu, limit DOM, brak masowego animowania po reconnect.

Serwer indeksuje zmienione źródła; przy starcie nie czeka na Git. FTS jest dyskowe, nie kopiujemy całego archiwum do RAM. Parametry cache i liczba połączeń SQLite mają wspólny budżet. Worker pool bounded, queue bounded, backpressure z jawnym kodem, a nie nieograniczona liczba tokio tasks.

Watcher obserwuje `.project` i ignoruje `.local`, tmp własnego pisarza oraz nieznane pliki. Debounce około 100 ms, max wait 500 ms dla serii, retry częściowego zewnętrznego zapisu ograniczone. Po overflow skan kontrolny. Co 15 min kontrolny batch z ograniczeniem obciążenia, na powrocie klienta do aktywności odświeżenie aktywnego projektu z TTL 30 s. Parametry mierzone, nie bezwarunkowa pętla co sekundę [S12].

### Git

Opcjonalny obserwator: branch, ostatni commit, konflikty i zakres sprawdzonych zmian. Tylko rozpoznane powiązanie Git jawnie dodanego folderu. Nie zakładaj, że `.git` to katalog. Nie rejestruj innych repozytoriów znalezionych wyżej.

Kandydat odczytu: ograniczone `git status --porcelain=v2 -z --branch --untracked-files=no --ignore-submodules=all`, z `--no-optional-locks`, wyłączonym fsmonitor i niepotrzebną detekcją rename. Finalną komendę sprawdź z oficjalną dokumentacją i testami repo z nietypową konfiguracją [S18]. Nie używaj shell do sklejania ścieżki; ustaw cwd i argv. Timeout 2 s, max output 2 MiB, współbieżność 2; brak pętli kill/retry w tle. Untracked check tylko na żądanie lub osobny wolniejszy tryb. Nie fetch, nie testy, nie hooki, nie zewnętrzne diff drivers.

Zmiany pod `.project` nie są aktywnością kodu. Odczyt z katalogu podrzędnego może wymagać filtrowania ścieżek do wskazanego projektu. Wynik zawiera observed_at, scope, stale, error i `untracked_checked=false`; wtedy nie pokazujemy „całe repo czyste”. Git timeout nie blokuje tablicy.

### Widoczność działania

Lokale metryki: czas parse/write/sync/index/query, queue depth, request codes, index generation, SSE reconnect, pending recovery, liczba źródeł invalid, rozmiar historii. Bez treści i bez wysyłki. Log level info z rotacją, debug czasowy, JSON opcjonalny. Ekran diagnostyki ma przyczynę i zalecaną operację, nie surowy stacktrace jako jedyne wyjaśnienie.

Benchmark regresji jest częścią review zmiany warstwy danych, komponentu widoku lub dużej zależności. Każde odstępstwo od targetu opisuje pomiar, wpływ i decyzję; nie zmieniamy threshold po cichu na wartość właśnie zmierzoną.


*Plik źródłowy: `docs/09-PERFORMANCE.md`.*


---

<a id="chapter-10"></a>

## 10. Instalacja, aktualizacje, backup i utrzymanie

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

### Wydanie

Artefakt zawiera `projectd`, `projectctl`, wbudowane zasoby web, schematy i szablony, konfigurację przykładową, service templates, README, checksums i third-party notices/SBOM. Brak npm/Node/Docker w runtime. Binaria macOS aarch64 oraz Linux x86_64; jeśli docelowy Arch ma inną architekturę, dodaj właściwy target i test, nie oznaczaj go domyślnie jako wspieranego.

Wersje Rust, Node (tylko build), package manager i dependencies przypnij na początku G0 po sprawdzeniu utrzymania i kompatybilności. Bez `latest` w reproducible build. Wydanie używa lockfile. Nie obiecujemy całkowicie identycznego binarnego builda między toolchainami, dopóki tego nie zweryfikujemy.

### Konfiguracja hosta

Listen 127.0.0.1:47831. Public_origin to rzeczywisty prywatny adres HTTPS, nie przykład z tego pakietu. Prywatny reverse proxy zestawia właściciel. Tailscale Serve CLI służy do konfiguracji tej warstwy [S25]; agent ma sprawdzić aktualne `tailscale serve --help`, a nie nadpisać istniejących usług przez automatyczne reset.

Linux: config w XDG_CONFIG_HOME/local-projects, data w XDG_DATA_HOME/local-projects, cache w XDG_CACHE_HOME/local-projects, runtime w XDG_RUNTIME_DIR/local-projects. macOS: Application Support/LocalProjects dla config/data i Library/Caches/LocalProjects dla cache; UDS w krótkiej, prywatnej ścieżce bieżącego runtime. Uwzględnij limity długości Unix socket. Nie twórz socketu o przewidywalnym publicznie zapisywalnym path w /tmp bez prywatnego katalogu.

`ops/` zawiera szablony, nie gotową instalację na maszynie użytkownika. Installer ma generować ścieżki absolutne, nie liczyć na rozwijanie `~` i zmiennych przez launchd. Usługa po zalogowaniu, foreground do diagnostyki. Systemd i launchd mają własne cykle życia [S23][S24]. Uruchamianie przed loginem i włączanie linger pozostaw jako jawne działania właściciela, nie automatyczne.

Konfiguracja repo roots jest lokalna i nie rozszerza się przez odpowiedź HTTP. Serwer zaczyna bez żadnych projektów. Podczas `add` projekt może leżeć poza rootami web, jeśli wskazał go lokalny właściciel; przyszłe edycje jego danych przez web są normalnie dozwolone po rejestracji.

### Git integration

Nie istnieje auto-commit. Dla prywatnego `.project` plan pokazuje lokalną regułę w Git info/exclude. Gdy folder leży niżej niż root repo, reguła jest zakotwiczona do właściwej względnej ścieżki; nie zawsze to `/.project/`. Użyj Git do ustalenia ścieżki metadanych, nie założenia `.git/info/exclude`. Sprawdź, czy pliki są już śledzone — ignore ich nie odśledzi [S19]. AGENTS może pozostać śledzony i instrukcja musi obsłużyć brak prywatnego folderu po klonie.

### Aktualizacja

Przed zmianą wersji wykonaj backup, sprawdź kompatybilność plikowego schematu i state DB. Zatrzymaj przyjmowanie mutacji, dokończ lub zabezpiecz pending, podmień binaria, uruchom recovery i smoke test. CLI/API/build frontend mają jawne wersje. Stara karta przeglądarki dostaje kontrolowaną odmowę niezgodnego zapisu i możliwość zachowania szkicu.

Nie przeładowuj edytora siłą. Index można odbudować, stan użytkownika nie. Migracje źródeł: dry-run, backup, lista kroków, resume i walidacja po zakończeniu. Starszy program widzący nowszy schema nie robi downgrade'u. Rollback binariów nie jest bezpiecznym rollbackiem danych, jeśli migracja była nieodwracalna; wymagany zgodny backup.

### Backup

Źródła: `.project` bez `.local`, workspace, config, state DB i manifest. Index pomijany. Session secrets nie są przechowywane w formie jawnej, ale backup nadal zawiera prywatne dane. Domyślnie folder backupu 0700 i archiwum 0600. Kopia na tym samym dysku nie jest zabezpieczeniem od awarii dysku; produkt oferuje eksport, właściciel wybiera zewnętrzną politykę kopii.

Operacja: wejście w maintenance write barrier → wyciszenie pisarzy → dokończenie/recovery pending → stabilny zestaw źródeł → SQLite Backup API dla żywej state DB → manifest hash/size/schema/instance/created_at → weryfikacja kopii → publikacja gotowego archiwum → wyjście z barrier. Nie kopiuj samego pliku WAL DB przez zwykłe cp [S26]. Backup nie leży w obserwowanym `.project`.

Nie obiecujemy atomowego snapshotu wobec niewspółpracującego edytora. Hashe i lista plików przed/po wykrywają zmiany; w razie wykrycia abort/retry albo jawne inconsistent. Procedura zaleca zatrzymanie zewnętrznych zapisów. Nie nazywamy niespójnej kopii poprawnym backupem.

Verify sprawdza manifest, checksums, schema, referencje i brak niebezpiecznych ścieżek w archiwum. Restore najpierw rozpakowuje do staging bez symlink traversal, absolutnych ścieżek, hardlinków i zip-slip. Ogranicz liczbę/rozmiar plików i rozpakowaną objętość. Pokaż diff i mapping lokalizacji. Nie zapisuj według dowolnych ścieżek z archiwum bez zatwierdzenia.

Apply przy wyłączności, z backupem aktualnego stanu. Zmień command_epoch; sesje domyślnie odwołaj; wyczyść indeks i odbuduj go ze źródeł. Odtworzenie na nowym hoście nie scala automatycznie istniejących projektów i focusu. Restore + ponowne logowanie + zmiana karty jest testem wydania, nie tylko przyciskiem eksportu.

### Odzyskiwanie operatora

Doctor wskazuje nierozstrzygnięte commands bez ujawniania prywatnej treści w logach. Recovery plan pokazuje before/current/after i brakujące zasoby. Nie ma automatycznej komendy „napraw wszystko” kasującej pliki. Ręczna akceptacja jednej wersji musi być nową zapisaną decyzją utrzymania.

Nie usuwaj index.sqlite, gdy działa pisarz indeksu; użyj rebuild API/maintenance. Nie kasuj state.sqlite w ramach czyszczenia cache. Usunięcie state jest zdarzeniem odzyskiwania: nowe epoch, utrata sesji/history jawnie opisana, walidacja źródeł przed zapisem.


*Plik źródłowy: `docs/10-OPERATIONS.md`.*


---

<a id="chapter-11"></a>

## 11. Testy i definicja jakości

### Warstwy

Unit/property: LocalDate, rank, graf zależności, alerts, typed patch, parser i limity. Integration: filesystem, SQLite journal, locks, recovery, indeks, HTTP/UDS, auth i SSE. End-to-end: przeglądarka + prawdziwy serwer + tymczasowy folder, nie tylko mocki. Manual device: realny iPhone Safari przez prywatną sieć, desktop macOS i Arch. Performance: release na zapisanym środowisku.

Playwright Chromium/Firefox/WebKit jest kandydatem do automatyzacji przeglądarek [S27]. WebKit runner nie jest dowodem pełnej zgodności fizycznego iPhone'a. Brak urządzenia wpisuje się jako verification gap, nie PASS.

### Obowiązkowe klasy przypadków

Parser: duplicate keys, anchors/aliases, komentarze wymagające normalizacji, nieznane pola, x-extensions, body round-trip, BOM/CRLF, invalid UTF-8, depth/size limits, filename-ID mismatch i future schema.

Domena: leap year, koniec miesiąca, DST i różne timezone klientów; plan niezależny od due; cykle/self/dangling edges; milestone independent completion; rank collision/exhaustion; archiwizacja bez kasowania referencji; resolution vs read.

Mutacje: dwóch klientów na tej samej wersji; ten sam request z innym payloadem; retry po utracie odpowiedzi i restarcie; retry po retencji; stale epoch po restore; znany wynik przed If-Match; create collision; no-op; undo po późniejszej zmianie.

Awaria: proces zabity przed i po każdym kroku intent/temp/sync/rename/journal/index/event; ENOSPC, EACCES, I/O error, read-only volume, source removed, file replaced with symlink, external editor between steps; disk flush errors. Fault injection musi działać na kontrolowanych punktach, nie losowym sleep. Test kill procesu nie jest testem fizycznej utraty zasilania.

Events: zmiana między snapshot a subscribe, stream epoch reset, overflow, reconnect po długiej przerwie, nieaktualny cursor strony, slow client backpressure, odwołanie sesji podczas SSE, indeks degraded po committed.

Security: unauth read/write, CSRF i Origin, DNS rebinding Host, local-only route na TCP, cookie revoke, token w URL/logu, path traversal/symlink, skrypt Markdown, nieautoryzowany registration root, nadmiarowy YAML, złośliwy backup i niekontrolowana konfiguracja Git.

UI: keyboard-only, screen reader, 200% zoom, reduced motion, długi polski tytuł, dark/light, touch resize/move, scroll conflict, pointercancel, podgląd podczas incoming event, uncertain write, old frontend version i safe reload. Wszystkie siedem widoków z pełnym przepływem danych.

### Powiązanie z wykonaniem

`delivery/REQUIREMENTS.json` nadaje ID wymaganiom. `delivery/ACCEPTANCE.json` podaje kroki i wyniki. `delivery/BACKLOG.json` łączy zadania z wymaganiami oraz akceptacją. `tests/fault-matrix.json` jest tabelą oczekiwanego zachowania po awarii. `tests/vectors.json` i przykładowe pliki służą parserowi i domenie.

Skrypt `scripts/check_package.py` weryfikuje wewnętrzną spójność **handoffu**. Nie udowadnia działania serwera. Astra ma przenieść te wektory do realnych testów implementacji, nie zastąpić testowania wywołaniem walidatora dokumentów.

### CI

Na zmianę: Rust fmt/clippy/tests, TypeScript/Svelte check, lint, frontend tests, schema/OpenAPI drift, przykłady i kontrakty, podstawowy E2E z prawdziwym serwerem. Nightly/manual: fault matrix, większy dataset, browser matrix, backup/restore, dependency audit. Release: instalacja i upgrade obu systemów oraz manual iPhone.

Nie wymagamy konta zewnętrznej platformy CI do rozwoju; te same polecenia mają działać lokalnie. Nie wysyłaj rzeczywistych `.project` jako artefaktów CI. Fixtures są syntetyczne. Coverage % jest pomocnicze; najważniejsze są inwarianty i scenariusze utraty danych.

### Definicja ukończenia zadania

Kod zintegrowany, testy zmienionego obszaru uruchomione, kontrakty spójne, przykład odświeżony, brak niejawnej nowej zależności i brak nowego bypassu auth. Raport zawiera polecenie, wynik, commit/build i ograniczenia. Review musi sprawdzić semantykę, nie tylko green check. Brak testu urządzenia nie może zostać ukryty pod ogólnym „mobile tested”.

### Definicja v1

Wszystkie wymagania P0 i testy release blocker ukończone. Telefon i desktop edytują przez ten sam origin/prywatną sieć; agent przez CLI. Każdy widok działa na realnych plikach. Konflikt i niepewny wynik są obsłużone. Backup odtworzony. Wydania obu hostów instalowalne, zasady ograniczeń udokumentowane. Nie wolno zmieniać nazwy release na „v1” tylko dlatego, że część ekranów wygląda dobrze.


*Plik źródłowy: `docs/11-QUALITY-AND-TESTS.md`.*


---

<a id="chapter-12"></a>

## 12. Rejestr decyzji architektonicznych (baseline)

### ADR-001 — pliki źródłowe

**Decyzja:** stan projektów w `.project`, nie wyłącznie DB. **Powód:** jawność, dostęp agenta i niezależność od uruchomionej aplikacji. **Koszt:** kontrolowany parser, konflikty i protokół trwałości. **Odrzucono:** dwie równorzędne kopie Markdown/SQLite. Indeks jest odtwarzalny.

### ADR-002 — jeden serwer zapisujący

**Decyzja:** UI i CLI używają koordynatora. **Powód:** host jest zwykle stale dostępny, telefon pisze po sieci. **Koszt:** zwykłe CLI potrzebuje serwera. **Odrzucono:** cichy bezpośredni fallback oraz ukryte uruchamianie kolejnego pisarza.

### ADR-003 — webowy frontend

**Decyzja:** Svelte SPA + Rust API. **Powód:** wymagany browser na telefonie z pełną edycją i dwa hosty. **Koszt:** testy browser/device, narzut klienta web. **Odrzucono:** równoległe SwiftUI/AppKit i frontend Linux bez dowodu konieczności, obowiązkowy wrapper.

### ADR-004 — prywatne HTTPS i parowanie

**Decyzja:** loopback backend, prywatny proxy/VPN, proste sesje właściciela. **Powód:** ograniczona ekspozycja i możliwość odwołania urządzenia. **Koszt:** konfiguracja sieci pozostaje po stronie właściciela. **Odrzucono:** publiczne porty, niejawne zaufanie wszystkim klientom VPN, cloud account produktu.

### ADR-005 — jedna instancja jako workspace

**Decyzja:** focus i aggregate views perinstancja. **Powód:** brak replikacji źródeł i konfliktu gospodarzy. **Koszt:** przełączanie serwerów przy dwóch maszynach. **Odrzucono:** automatyczny globalny focus bez osobnego projektu agregacji.

### ADR-006 — plan != zobowiązanie

**Decyzja:** schedule, due i review_on rozdzielone; daty całodniowe. **Powód:** planner rezultatów, nie timesheet. **Koszt:** widget adaptery i różne markery. **Odrzucono:** drag paska zmienia deadline i algorytm automatycznie przesuwający plan.

### ADR-007 — request window i restore epoch

**Decyzja:** request UUIDv7, ograniczone okno nowej komendy, trwały rejestr i epoch. **Powód:** bezpieczne retry także po usunięciu starych wyników i restore. **Koszt:** kontrola zegara i jawny status uncertain. **Odrzucono:** „idempotencja” przez cache wyników bez polityki wygaśnięcia.

### ADR-008 — append-only raporty

**Decyzja:** correction/resolution jako nowe obiekty. **Powód:** brak nadpisywania historii i mały konflikt zapisów agentów. **Koszt:** projekcja otwartych decyzji. **Odrzucono:** wszystkie raporty w jednym wspólnym dzienniku, automatyczne stosowanie raportu jako patcha karty.

### ADR-009 — indeks i trwały state oddzielone

**Decyzja:** index.sqlite można odtworzyć, state.sqlite i workspace wymagają backupu. **Powód:** rebuild nie może usuwać sesji i focusu. **Koszt:** dwie małe bazy. **Optymalizacja:** read receipts w state, nie przepisywanie workspace na każde przeczytanie.

### ADR-010 — własne kontrakty, wymienne widgety

**Decyzja:** dane widgetu nigdy nie są formatem plików. **Powód:** możliwość wymiany biblioteki bez migracji projektów. **Koszt:** cienkie adaptery i testy round-trip dat. Wybór widgetów wymaga próby mobilnej i sprawdzenia licencji.

### ADR-011 — brak edycji offline

**Decyzja:** nowe komendy wymagają połączenia. **Powód:** wyłączony host jest akceptowanym stanem. **Koszt:** brak w pełni offline planera. **Odrzucono:** service worker/CRDT/replay queue jako obowiązkowy element v1. RAM szkicu i rozstrzyganie wysłanego requestu nie są sync offline.

### ADR-012 — jawna archiwizacja

**Decyzja:** UI używa archiwizacji i rozrejestrowania bez kasowania źródeł. **Powód:** bezpieczeństwo danych i referencji. **Koszt:** osobny proces późniejszego purge. Trwałe usuwanie nie jest skrótem do „naprawy” konfliktu.

Nowe ADR dodawaj do `progress/DECISION-LOG.md`: kontekst, decyzja, alternatywy, dowód, wpływ na kontrakty i testy. Nie traktuj rejestru jako miejsca na każdy drobny refactor.

### ADR-015 — expose shared report read state

The original API accepted read receipts but did not return their state. Add an
optional `read` boolean to update resources and update summaries. It comes from
state.sqlite, never from the Markdown source or disposable index. This additive
field enables the required unread UI without treating reading as resolution.
Ordinary document schemas remain unchanged; receipt commands and their results
commit together in one SQLite transaction. Tests verify source bytes are unchanged.

### ADR-016 — bounded workspace resource lists

Add `GET /api/v1/views/list` with a required resource type and optional project and
field filters. It returns the existing SummaryPage contract and stable index
cursors. This supports the cross-project list and update views without fetching
every project's entire archive or adding an unbounded bootstrap payload. The
per-project APIs retain their contracts. Search uses its documented `q` parameter.

### ADR-017 — Exact local CLI project resolution

The Unix-only POST `/local/v1/projects/resolve` reads the registry for an exact
absolute path. It never searches parents, Git remotes or folder names. Typed CLI
commands require `--project`; `.` is resolved explicitly by the client. This
read-only route is not mounted on TCP and does not register unknown folders.

### ADR-018 — Local maintenance and bounded retention

Local maintenance uses strict tagged JSON inputs and durable plan/apply jobs.
Normalization retains original bytes in the plan and exposes before/after previews;
rebalance preserves order, relocation verifies the project ID at its new explicit
path, and unregister removes only workspace registration/focus references. All
steps recheck their approved directory identities and source hashes. Plans expire
after five minutes and are limited to 32 MiB of before/after data.

A bounded retention pass preserves unresolved operations and at least seven days
of command results. Optional unpinned history expires after 30 days or under a
1 GiB content budget, with up to 500 rows processed per pass. Actual operational
SQLite layouts have a version guard; there is no future source-format converter.
Archive backup/restore remains deferred under the owner scope decision.

### ADR-019 — Bounded full-text resource pages

The global resource-list endpoint accepts optional `q` for full-text search within
one resource type. The list/report screens request bounded pages and replace the
current page instead of accumulating the entire archive in browser memory.
Title-only filters in board/date views remain explicitly scoped to loaded results.

### ADR-020 — Milestones in bounded timeline pages

The Gantt endpoint pages cards and milestones together, using the existing typed
Summary contract. Cards carry schedules and optional deadlines; milestone rows
carry deadlines only. Dependencies remain card-to-card finish-to-start edges.
Board pages continue to contain cards only. The combined page limit still applies.

### ADR-021 — CLI outcomes and read-only source validation

CLI stdout uses `api_version`, `ok`, `data` or `error`, and `request_id`; HTTP
responses also include `http_status`, and mutations preserve `command_epoch`.
Accepted/in-progress or uncertain mutations exit 9. Malformed or truncated replies
after a mutation preserve the same identity, because the write may have committed.
Syntax, transport, missing resources, conflicts and access failures use exits
2, 3, 4, 5 and 6; invalid documents/recovery use 7 and internal failures use 8.
The legacy `{http_status, body}` wrapper is replaced before the first release.

`validate --offline --project PATH` reads exactly PATH/.project without a socket,
writer lease, initialization, ancestor search or modification. Online validation
uses GET /projects/{project_id}/validation and the same parser. Validation covers
individual source documents and normalization needs, with at most 200 diagnostics;
it is explicitly not a claim of an atomic multi-file snapshot or graph audit.


*Plik źródłowy: `docs/12-ADRS.md`.*


---

<a id="chapter-13"></a>

## 13. Ryzyka, kontrole i decyzje delegowane

| Ryzyko | Dlaczego istotne | Wczesny dowód / kontrola |
|---|---|---|
| Journal SQLite + plik to nie jedna transakcja | Utrata lub podwójne wykonanie po awarii | Fault injection G1 na każdym kroku, jawne recovery |
| Widget wygląda dobrze tylko na desktopie | Phone ma pełną edycję | Fizyczny iPhone, touch scroll/resize i długie zakresy przed wyborem |
| Canonical YAML usuwa komentarze | Cicha utrata cudzej treści | Normalization-required, body round-trip, unknown-field tests |
| Retry po retencji lub restore | Stare kliknięcie może wykonać się ponownie | UUIDv7 admission window + epoch + test wygasania |
| Stary snapshot i SSE cursor | Widok gubi zmianę | Transakcyjny cursor projekcji i replay/resync |
| Ręczny edytor omija koordynatora | Granica gwarancji | Explicit diagnostics, preferencja CLI, brak fake CAS promise |
| Frontend zagarnia za dużo RAM | Użytkownik wymaga lekkości | Pomiar klienta i serwera osobno, lazy widgets, virtual lists |
| Root picker umożliwia zdalny dostęp do dysku | Same-origin nie oznacza dowolnych ścieżek | Allowlist roots, directory handles, traversal tests |
| Git uruchamia kosztowny mechanizm | Tło obciąża host lub wykonuje konfigurację | Ograniczone argv, wyłączenia, timeout/output cap |
| Backup ignoruje prywatne źródła | Git push nie zawiera `.project` | Restore test i instrukcja zewnętrznej kopii |
| Dwie maszyny udają jedną bazę | Sprzeczne focus i wersje | Widoczna instancja, jedna lokalizacja gospodarza |
| Repo id/nazwa się zmienia | Zagubienie kart po przeniesieniu | UUID, relocate plan, brak zgadywania |
| Integracja agentów zaśmieca tablicę | Produkt traci wartość | Krótkie raporty tylko przy istotnej zmianie, brak plan importera |

### Do samodzielnego rozstrzygnięcia przez Astrę

Wybór parsera YAML spełniającego kontrakt, podejście do bezpiecznych deskryptorów plikowych, adapter trwałości APFS/ext4, konkretne wersje dependency, mały router SPA, bibliotekę sanitizacji Markdown oraz widgety. Każdy wybór ma test/źródło i krótki ADR. Nie trzeba pytać właściciela o każdą bibliotekę.

Nazwa handlowa, publiczna licencja, kupno PRO i publikacja zewnętrzna nie są domyślnie autoryzowane. Robocza nazwa nie blokuje pierwszego przekroju. Zgoda na lokalne budowanie aplikacji nie jest zgodą na zmianę ustawień sieci użytkownika lub usuwanie danych.

### Optymalizacje warte wdrożenia od początku

Oddzielanie summary/body, leniwe ładowanie widoków, 1 gesture=1 command, read receipts poza workspace, warianty date-only, limitowany watcher i Git, gotowy statyczny UI w binarium, brak service workera, wspólny dispatcher HTTP/CLI. To upraszcza również testy.

### Optymalizacje dopiero po pomiarze

Własna struktura indeksu zamiast SQLite, dodatkowe pule i procesy, worker dla każdego widgetu, własne renderowanie canvas, custom network protocol, totalny rewrite frontendu lub agresywna pamięć cache wszystkich danych. Nie wprowadzaj ich na podstawie samego hasła „hiperszybko”.

### Granice bezpieczeństwa bez pozornej pewności

Nie obiecujemy działania przy uszkodzonym sprzęcie, izolacji od właściciela dysku, uniwersalnego exactly-once z ręczną edycją ani płynności bez pomiaru. Za to wymagamy precyzyjnych błędów, zachowania źródeł, testów odzyskiwania i dokumentacji realnych ograniczeń. Niesprawdzona hipoteza jest oznaczona jako hipoteza, nie jako przeszkoda „niemożliwa do rozwiązania”.


*Plik źródłowy: `docs/13-RISKS-AND-OPTIMIZATIONS.md`.*


---

<a id="chapter-14"></a>

## 14. Źródła techniczne

Sprawdzone na potrzeby pakietu 5 września 2026 r. To dokumentacja pierwotna. Potwierdza właściwości technologii/protokołów, nie nasze cele wydajności ani implementację. Wartości limitów, timeouts, zakres v1 i architektura są decyzjami projektowymi. Wersje bibliotek Astra przypina ponownie przy rozpoczęciu builda; strony „latest” mogą się zmienić.

| ID | Dokumentacja | Zastosowanie |
|---|---|---|
| S01 | https://docs.rs/axum/latest/axum/ | Serwer HTTP Rust/Axum; nie gwarancja wydajności |
| S02 | https://svelte.dev/docs/svelte/overview | Rola Svelte jako frameworka UI |
| S03 | https://tailscale.com/docs/features/tailscale-serve | Prywatne HTTPS/proxy i granica tożsamości |
| S04 | https://github.com/vkurko/calendar | Kandydat kalendarza, date conventions i API |
| S05 | https://docs.svar.dev/svelte/gantt/getting-started/installation/ | Kandydat Gantta, rozdział open-source/PRO |
| S06 | https://www.sqlite.org/fts5.html | Wyszukiwanie FTS5 |
| S07 | https://www.sqlite.org/atomiccommit.html | Zakres atomic commit SQLite |
| S08 | https://www.rfc-editor.org/rfc/rfc9110.html | HTTP validators, If-Match i preconditions |
| S09 | https://www.rfc-editor.org/rfc/rfc9562.html | UUIDv4/v7; okno retry jest naszym użyciem |
| S10 | https://html.spec.whatwg.org/multipage/server-sent-events.html | EventSource, SSE, reconnect/Last-Event-ID |
| S11 | https://doc.rust-lang.org/std/fs/fn.rename.html | Ograniczenia operacji rename |
| S12 | https://docs.rs/notify/latest/notify/ | Ograniczenia watcherów i różnice platform |
| S13 | https://agents.md/ | Konwencja instrukcji agentów, nie uprawnienia |
| S14 | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | Cookies, cykl życia sesji, sekrety |
| S15 | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html | CSRF/Origin; SameSite to nie wszystko |
| S16 | https://www.w3.org/TR/pointerevents/ | Mysz/dotyk, capture/cancel/touch-action |
| S17 | https://www.w3.org/TR/WCAG22/ | Kryteria dostępności, kierunek jakości |
| S18 | https://git-scm.com/docs/git-status | Porcelain, koszt untracked i background refresh |
| S19 | https://git-scm.com/docs/gitignore | Prywatne ignore i już śledzone pliki |
| S20 | https://www.sqlite.org/pragma.html | synchronous, fullfsync, konfiguracja DB |
| S21 | https://spec.openapis.org/oas/v3.1.1.html | Kontrakt maszynowy API |
| S22 | https://json-schema.org/draft/2020-12/json-schema-core | Kontrakt danych JSON Schema |
| S23 | https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html | Referencja do weryfikacji na hoście; strona nie została skutecznie pobrana w tej sesji |
| S24 | https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html | Archiwalna dokumentacja launchd; test konfiguracji na realnym OS obowiązkowy |
| S25 | https://tailscale.com/docs/reference/tailscale-cli/serve | Aktualna składnia konfiguracji Serve |
| S26 | https://www.sqlite.org/backup.html | Kopiowanie aktywnej SQLite przez Backup API |
| S27 | https://playwright.dev/docs/browsers | Browser test runner, różnice silników |

Nie kopiujemy demonstracyjnego bind `0.0.0.0` z przykładów bibliotek do naszego release. Prywatny bind jest wymaganiem produktu niezależnym od przykładu dokumentacji. Zgłoszenie błędu w repo widgetu nie jest dowodem występowania go w każdej wersji; rozstrzyga test przypiętej wersji.


*Plik źródłowy: `docs/14-SOURCES.md`.*


---

<a id="annex-01"></a>

## Instrukcja startowa dla Astry GPT6

Przejmujesz prowadzenie budowy Local Projects na podstawie tego pakietu. Odpowiadasz za implementację, integrację, testy, jakość UI, wydanie i uczciwy raport stanu. Wykorzystaj dostępnych agentów specjalistycznych, ale nie zakładaj, że takie narzędzia rzeczywiście są dostępne.

Przeczytaj `START_HERE.md`, `AGENTS.md` oraz rozdziały 00–05. Wersja 1.0 zastępuje wcześniejsze propozycje v0.1–v0.3 w punktach, które doprecyzowuje. Rozróżniaj wymagania użytkownika [U], domyślny baseline wykonawczy [B] i wybory wymagające próby [S]. Nie przedstawiaj [B] jako dosłownej wypowiedzi użytkownika.

Najpierw zinwentaryzuj repo i środowisko. Nie nadpisuj istniejących instrukcji, plików ani gałęzi. Zapisz stan i plan najbliższego przekroju. Nie zaczynaj od pełnej makiety z pozornymi danymi ani od własnego frameworka.

Kierunek: Rust/Axum, Svelte 5/TypeScript/Vite, pliki `.project`, jeden serwer zapisujący, CLI przez lokalne IPC, prywatne HTTPS, pełna edycja w przeglądarce także na iPhonie. Bez MCP, natywnego klienta, worktree-managera, chmury danych i zapisów offline. Każdy projekt to dokładnie wskazany folder, nie wynik zgadywania.

Zrealizuj najpierw G0–G2 z `delivery/PLAN.md`: kontrakty, minimalny przepływ end-to-end, test trwałości i prototyp interakcji. Potem rozwijaj pełny zakres v1. Zatwierdzaj bramki wyłącznie na podstawie istniejących wyników, wskazując polecenia, środowisko i artefakty.

Rób małe, reviewowalne zmiany. Jeżeli delegujesz, przekaż każdemu agentowi identyfikatory zadań, właściciela plików, kontrakt wejścia/wyjścia i kryteria odbioru. Nie pozwól kilku agentom równolegle zmieniać kontraktu danych bez integratora. Korzystanie z dodatkowego worktree w procesie developmentu nie może pozostawić wyniku poza gałęzią integracyjną; sama aplikacja nie ma nim zarządzać.

Przy błędzie specyfikacji popraw najpierw najmniejszy fragment kontraktu, dodaj ADR i test regresji, a potem implementację. Nie ukrywaj kompromisu za ogólnym „zoptymalizowano”. Podawaj wynik pomiaru i zakres, którego dotyczy.

Po każdej zakończonej sesji uaktualnij `progress/STATE.md`: co faktycznie działa, testy i commit, blokady, następny konkretny krok. Nie wypełniaj `.project` szczegółowym planem implementacyjnym agentów. Backlog wykonawczy tego pakietu nie jest automatycznym seedem tablicy użytkownika.

Zakończenie produkcji oznacza przejście `delivery/RELEASE-CHECKLIST.md`, działającą instalację, backup i przywracanie oraz udokumentowane testy mobilne i platformowe. Jeżeli nie da się czegoś sprawdzić w obecnym środowisku, wykonaj resztę i oznacz konkretny brak dowodu; nie fabrykuj testu ani zgodności z przyszłą wersją macOS.


*Plik źródłowy: `ASTRA-KICKOFF.md`.*


---

<a id="annex-02"></a>

## Plan wykonania dla Astry

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

Nie jest harmonogramem z datami ani obietnicą czasu. Bramki kończy wynik, nie liczba plików. Backlog JSON zawiera zadania i zależności; nie trzeba odczytywać całej specyfikacji w każdej sesji, ale trzeba przeczytać kontrakt danego modułu.

| Bramka | Co musi powstać | Warunek przejścia |
|---|---|---|
| G0 — kontrakt | Repo, pinned toolchain, schema/fixtures, wspólne typy, checks | Modele i przykłady są zgodne, zakres i środowisko zapisane |
| G1 — ryzyka | Durable store/retry/recovery oraz próby calendar/Gantt | Nie tracimy danych w kontrolowanych awariach; widgety mają decyzję i realny test wejścia |
| G2 — pionowy produkt | add folder, CLI context/create, jedna karta w UI, dwie przeglądarki | Rzeczywisty plik zmienia się i konflikt jest poprawnie pokazany |
| G3 — backend pełny | Index/SSE, auth, focus, reports, milestones, endpoints | Jeden dispatcher, pełny kontrakt i testy integracyjne |
| G4 — pełne UI | Wszystkie widoki, mobilna edycja, historia, reconnect | Bez funkcji v1 ukrytej za „coming soon”, bez mock data w produkcji |
| G5 — niezawodność | Backup/restore, pakowanie, security, device, benchmark, soak | Dowody obu hostów i telefonu; limitowane, jawne ryzyka |
| G6 — wydanie | Instalowalne paczki, instrukcja, checksums, lista ograniczeń | Release checklist podpisana dowodami, nie samymi deklaracjami |

### Krytyczna ścieżka

Parser → safe paths/lease → command journal → durable commit → recovery → add folder → API/CLI → prawdziwy UI. Równolegle można sprawdzić widgety i wizualny kierunek na syntetycznych danych, ale te makiety nie kończą bramki produktu.

Security rozpoczyna się z routerem, nie po dodaniu wszystkich endpointów. Fault harness powstaje razem z pisarzem, nie jako opcjonalny test na końcu. Nie uruchamiaj prywatnego serwera bez auth tylko dlatego, że „na razie VPN”.

### Tryb pracy

Jedno zadanie ma właściciela i ograniczony zakres plików. Astra integruje wyniki, nie zakłada poprawności przez sam opis agenta. Zmiany kontraktów przechodzą przez jednego integratora. Zanim agent zacznie UI, otrzymuje gotowy kontrakt i stabilny klient API lub jawny mock o identycznej strukturze.

Po każdym przekroju pokaż działający scenariusz i stan wymagań. Jeżeli nie ma fizycznego iPhone'a, kontynuuj możliwe testy, ale G5/device pozostaje niezaliczone. Nie utrzymuj fikcyjnego claimu pełnej mobilnej zgodności. Płatna biblioteka/nowa ekspozycja sieciowa wymaga decyzji właściciela.

### Nie rozszerzaj automatycznie

Plugin system, role zespołowe, sync, native app, CRDT, wspólny focus hostów i godziny pracy nie są rezerwą zadań do zrobienia „przy okazji”. Poprawa narzędzi developerskich też ma uzasadniać koszt w obecnym produkcie. Więcej kodu nie jest miarą postępu.


*Plik źródłowy: `delivery/PLAN.md`.*


---

<a id="annex-03"></a>

## Organizacja pracy agentów

Role są podziałem odpowiedzialności, nie twierdzeniem, że narzędzie uruchamiania subagentów jest dostępne. Gdy nie ma delegacji, Astra wykonuje role sekwencyjnie.

| Rola | Własność | Szczególna odpowiedzialność |
|---|---|---|
| lead / Astra | Kontrakty, integracja, release | Chroni zakres, rozstrzyga ADR, weryfikuje dowody |
| core | Domena, projekcje, focus/raporty | Jedna semantyka dat, zależności i stanu |
| store | Pliki, journal, recovery | Brak cichej utraty danych, awarie, lease |
| api | HTTP/IPC/CLI | Zgodność kontraktów i błędów, wersje, SSE |
| security | Auth, roots, render | Granice dostępu, brak zdalnego arbitralnego wykonania |
| ui | Widoki i interakcje | Mobile parity, estetyka, stan szkicu/gestu |
| qa | Testy i benchmarki | Próba obalenia założeń, nie potwierdzanie opisów |
| ops | Dystrybucja i backup | Instalacja, upgrade/restore obu hostów |

### Szablon delegacji

Zadanie/ID; cel; pliki do edycji; zakazane zmiany; kontrakty do przeczytania; wejście/wyjście; testy akceptacji; zależności; format wyniku; sposób integracji. Agent zwraca kod, testy, polecenia, ograniczenia i diff kontraktów. Nie zwraca samego planu jako ukończonej implementacji.

Nie deleguj równolegle sprzecznych zmian tych samych schema lub modułu pisarza. Testy krytyczne powinien przejrzeć agent inny niż autor implementacji albo Astra w oddzielnym przeglądzie. Wynik w osobnym worktree musi być zintegrowany i przetestowany w gałęzi głównej pracy; nie liczymy porzuconych branchy jako dostarczonego produktu.

### Format statusu

Completed z dowodem / In progress / Blocked z konkretną przyczyną / Not started. Nie używaj procentu „90% gotowe” bez kryteriów. Wyjaśniaj ryzyko i następny krok, nie zasypuj użytkownika logiem wszystkich drobnych komend.


*Plik źródłowy: `delivery/AGENT-ROLES.md`.*


---

<a id="annex-04"></a>

## Backlog wykonawczy

Źródło statusów: BACKLOG.json. T01–T03 ukończone w zakresie G0; T05 w toku. Dowody w progress/EVIDENCE.md. Scenariusze odbioru produktu pozostają niezaliczone.

| ID | Bramka | Rola | Zadanie | Zależności |
|---|---|---|---|---|
| T01 | G0 | lead | Inwentaryzacja i baseline | — |
| T02 | G0 | core | Schema i typed models | T01 |
| T03 | G0 | lead | Workspace build i lokalne CI | T01 |
| T04 | G1 | store | Parser i canonical serializer | T02, T03 |
| T05 | G1 | core | Daty, graf, rank i alerts | T02 |
| T06 | G1 | store | Path policy i leases | T03 |
| T07 | G1 | store | State journal i command epoch | T02, T06 |
| T08 | G1 | store | Durable one-file commit | T04, T07 |
| T09 | G1 | store | Recovery i uncertain state | T08 |
| T10 | G1 | api | Minimal HTTP i UDS | T02, T03 |
| T11 | G1 | ui | Próba kalendarza dotykowego | T03 |
| T12 | G1 | ui | Próba Gantta dotykowego | T03 |
| T13 | G1 | qa | Harness awarii | T06, T07 |
| T14 | G2 | core | Rejestracja i workspace | T04, T06, T09 |
| T15 | G2 | api | Pierwsze create/get/patch + CLI | T05, T09, T10, T14 |
| T16 | G2 | ui | Shell i jedna edytowalna karta | T11, T12, T15 |
| T17 | G2 | qa | Pionowy przepływ dwóch klientów | T13, T15, T16 |
| T18 | G3 | security | Parowanie, sesje i CSRF | T10, T07 |
| T19 | G3 | core | Index i FTS | T04, T05, T14 |
| T20 | G3 | core | Watcher i external edits | T19, T06 |
| T21 | G3 | api | SSE i snapshot cursors | T19, T18 |
| T22 | G3 | core | Milestones i zależności | T05, T15 |
| T23 | G3 | core | Raporty, resolutions i receipts | T15, T19 |
| T24 | G3 | core | Focus i attention | T14, T22, T23 |
| T25 | G3 | api | Pełny kontrakt HTTP/CLI | T21, T22, T23, T24 |
| T26 | G3 | security | Roots i bezpieczny Markdown | T14, T18, T16 |
| T27 | G4 | ui | Design system i adaptive shell | T16, T18 |
| T28 | G4 | ui | Focus, projekty i lista | T24, T25, T27 |
| T29 | G4 | ui | Kanban produkcyjny | T25, T27 |
| T30 | G4 | ui | Kalendarz produkcyjny | T11, T25, T27 |
| T31 | G4 | ui | Gantt produkcyjny | T12, T22, T25, T27 |
| T32 | G4 | ui | Aktualizacje i wspólna karta | T23, T25, T27 |
| T33 | G4 | ui | Reconnect, conflicts i app update | T21, T28, T29, T30, T31, T32 |
| T34 | G4 | core | Historia, undo i archiwizacja | T09, T25 |
| T35 | G5 | ops | Backup/verify/restore | T09, T14, T18, T23, T34 |
| T36 | G5 | core | Diagnostyka i obserwator Git | T19, T20 |
| T37 | G5 | ops | Pakowanie i usługi hostów | T25, T35, T36 |
| T38 | G5 | qa | Bezpieczeństwo i testy nadużyć | T18, T26, T35, T36 |
| T39 | G5 | qa | Testy realnych platform i iPhone | T28, T29, T30, T31, T32, T33, T37 |
| T40 | G5 | qa | Wydajność i optymalizacja | T28, T29, T30, T31, T33, T36 |
| T41 | G5 | qa | Upgrade, restore i soak | T35, T37, T38, T39, T40 |
| T42 | G6 | lead | Dokumentacja użytkownika i wydanie | T17, T25, T34, T41 |


*Plik źródłowy: `delivery/BACKLOG.md`.*


---

<a id="annex-05"></a>

## Testy akceptacyjne — czytelna lista

Każdy test ma status **not_run** dla aplikacji. Identyfikatory są zgodne z plikiem JSON.

### A01 — Rejestracja i ponowienie

Typ: integration. Wymagania: R01, R03.

**Kroki:** Dodaj pusty folder, potem powtórz tę samą operację i sprawdź pliki oraz profil.

**Oczekiwany wynik:** Jedno ID projektu, jeden blok AGENTS, bez resetu i duplikatu.

### A02 — Plan a cudze pliki

Typ: integration. Wymagania: R01, R16.

**Kroki:** Zaplanuj rejestrację, zmień istniejący AGENTS przed commit planu.

**Oczekiwany wynik:** PLAN_STALE lub konflikt; żadnego nadpisania cudzej treści.

### A03 — Dokładny cwd

Typ: integration. Wymagania: R01, R34.

**Kroki:** Wywołaj --project . w folderze podrzędnym bez .project, gdy rodzic ma projekt.

**Oczekiwany wynik:** Brak znalezionego projektu, brak inicjalizacji i brak zapisu w rodzicu.

### A04 — Usunięcie indeksu

Typ: integration. Wymagania: R02, R22.

**Kroki:** Po zapisaniu kart/focusu/sesji zatrzymaj usługę, usuń wyłącznie index, uruchom.

**Oczekiwany wynik:** Te same źródła i focus, sesja działa, widoki odbudowane.

### A05 — Dwa zapisy tej samej wersji

Typ: e2e. Wymagania: R18.

**Kroki:** Telefon i CLI dostają V1; oba edytują tę samą kartę.

**Oczekiwany wynik:** Jeden commit, drugi 412; obie intencje dostępne, brak cichego overwrite.

### A06 — Utracona odpowiedź

Typ: fault. Wymagania: R19, R24.

**Kroki:** Zapisz komendę, odetnij odpowiedź po commit, ponów identyczny request.

**Oczekiwany wynik:** Jeden skutek, wynik replayed; UI rozpoznaje committed.

### A07 — Ten sam ID inny payload

Typ: integration. Wymagania: R19.

**Kroki:** Po przyjęciu request ID wyślij z nim inny patch lub precondition.

**Oczekiwany wynik:** 409 IDEMPOTENCY_KEY_REUSED, bez drugiego zapisu.

### A08 — Retry po retencji

Typ: unit. Wymagania: R19.

**Kroki:** Przesuń zegar testowy poza 7 dni i usuń wynik zgodnie z polityką; ponów stary request.

**Oczekiwany wynik:** Nie jest wykonany jako nowy; expired window i wymóg nowej świadomej intencji.

### A09 — Restore i stary klient

Typ: integration. Wymagania: R19, R27.

**Kroki:** Wykonaj backup/restore, zachowując stary niepewny request w kliencie.

**Oczekiwany wynik:** Stary epoch odrzucony; sesje nie są automatycznie przywrócone.

### A10 — Awaria w punktach zapisu

Typ: fault. Wymagania: R20.

**Kroki:** Uruchom wszystkie punkty tests/fault-matrix.json z kill/fault injection.

**Oczekiwany wynik:** Before/after lub jawne needs_review; brak fałszywego sukcesu i duplikatu.

### A11 — Brak miejsca i uprawnień

Typ: fault. Wymagania: R20.

**Kroki:** Wstrzyknij ENOSPC/EACCES przed journal, temp, rename i commit.

**Oczekiwany wynik:** Nie ma uszkodzonego źródła ani sukcesu bez trwałego wyniku; stan niepewny izolowany.

### A12 — Zewnętrzny edytor podczas formularza

Typ: e2e. Wymagania: R21.

**Kroki:** Otwórz edytor, zmień plik z zewnątrz, potem zapisz szkic.

**Oczekiwany wynik:** Zmiana wykryta, szkic nie znika; zapis wymaga rozstrzygnięcia konfliktu.

### A13 — Błędny YAML

Typ: integration. Wymagania: R21, R26.

**Kroki:** Podmień nagłówek karty na duplicate key, alias lub konflikt merge.

**Oczekiwany wynik:** Diagnoza dokumentu, zwykły zapis zablokowany, inne zdrowe projekty działają.

### A14 — Round-trip i extensions

Typ: unit. Wymagania: R26.

**Kroki:** Zmień wyłącznie status pliku z nietypowym body i x-*; porównaj body bajtowo.

**Oczekiwany wynik:** Body identyczne, rozszerzenia zachowane, reszta nagłówka zgodna ze schema.

### A15 — Komentarz YAML

Typ: integration. Wymagania: R26.

**Kroki:** Spróbuj zwykłego patcha pliku z komentarzem, którego serializer by nie zachował.

**Oczekiwany wynik:** NORMALIZATION_REQUIRED; dopiero jawny plan/aplikacja normalizacji po If-Match.

### A16 — Daty graniczne

Typ: unit. Wymagania: R25.

**Kroki:** Wykonaj wektory leap year, zmiana miesiąca/roku, DST i inna strefa telefonu.

**Oczekiwany wynik:** Plan/date-only identyczny w pliku, liście, calendar i Gantt.

### A17 — Plan nie zmienia deadline

Typ: e2e. Wymagania: R08, R25.

**Kroki:** Rozciągnij pasek poza hard deadline.

**Oczekiwany wynik:** Zmienia się tylko schedule; ostrzeżenie, deadline nietknięty.

### A18 — Graf i brak autoschedulera

Typ: integration. Wymagania: R09, R12.

**Kroki:** Dodaj cykl/self-edge; następnie legalną krawędź ze sprzecznymi datami.

**Oczekiwany wynik:** Cykl odrzucony, konflikt dat ostrzega, następnik nie przesuwa się sam.

### A19 — Porządek i nieaktualni sąsiedzi

Typ: integration. Wymagania: R07.

**Kroki:** Przenieś kartę, równolegle zmień sąsiadów; powtórz z nieaktualnym placement.

**Oczekiwany wynik:** Deterministyczne sortowanie; ORDER_CHANGED zamiast losowej pozycji.

### A20 — Wyczerpany rank

Typ: fault. Wymagania: R07, R20.

**Kroki:** Utwórz sąsiadujące ranki bez luki, spróbuj move; wykonaj jawny rebalance z awarią.

**Oczekiwany wynik:** Brak ukrytej masowej zmiany; workflow wznawia się i kończy resync.

### A21 — Snapshot/subscribe race

Typ: integration. Wymagania: R23.

**Kroki:** Wstaw zmianę pomiędzy snapshot i nawiązaniem SSE.

**Oczekiwany wynik:** Zmiana widoczna przez replay lub resync; żadnej utraconej inwalidacji.

### A22 — Restart i overflow SSE

Typ: integration. Wymagania: R23.

**Kroki:** Przepełnij ring, odłącz klienta, zrestartuj serwer, podłącz stary cursor.

**Oczekiwany wynik:** resync_required; nowy snapshot, nie udawany pełny replay.

### A23 — SSE podczas drag

Typ: device. Wymagania: R23, R13.

**Kroki:** Podczas chwytania paska agent edytuje kartę.

**Oczekiwany wynik:** Pasek nie skacze, preview zachowany, commit pokazuje konflikt.

### A24 — Brak połączenia

Typ: e2e. Wymagania: R24.

**Kroki:** Wyłącz host podczas otwartego UI i spróbuj nowych zmian.

**Oczekiwany wynik:** Jawna niedostępność, brak offline queue; bieżący szkic możliwy do skopiowania.

### A25 — Parowanie

Typ: integration. Wymagania: R15.

**Kroki:** Niesparowany klient próbuje odczytu i zapisu; zatwierdź porównany pairing.

**Oczekiwany wynik:** Przed pairing brak danych; potem pełna edycja, poprawne Secure cookie.

### A26 — Revoke aktywnej sesji

Typ: integration. Wymagania: R15.

**Kroki:** Odwołaj urządzenie przy otwartym SSE i formularzu.

**Oczekiwany wynik:** SSE zamknięte, nowy zapis odrzucony, UI usuwa potwierdzony prywatny stan.

### A27 — Origin i CSRF

Typ: security. Wymagania: R14, R15.

**Kroki:** Wyślij mutacje cross-origin, bez tokenu, z obcym Host i origin null.

**Oczekiwany wynik:** Brak zmian, prawidłowy kod; localhost TCP nie staje się zaufanym IPC.

### A28 — Traversal i symlink

Typ: security. Wymagania: R16.

**Kroki:** Spróbuj rejestracji ../, absolutnej ścieżki w HTTP, symlink swap i specjalnego pliku.

**Oczekiwany wynik:** Brak wyjścia poza zatwierdzone korzenie; brak zapisu w innych miejscach.

### A29 — Złośliwy Markdown

Typ: security. Wymagania: R17.

**Kroki:** Karta z script, onerror, javascript URL i zewnętrznym obrazkiem.

**Oczekiwany wynik:** Żaden skrypt/auto-fetch nie działa; bezpieczne renderowanie i CSP.

### A30 — Payload/recursion bomb

Typ: security. Wymagania: R17.

**Kroki:** Przekrocz rozmiar HTTP, front matter, depth i node budget.

**Oczekiwany wynik:** Wczesne bounded odrzucenie, bez nieograniczonej pamięci i blokady procesu.

### A31 — Pełna mobilna edycja

Typ: device. Wymagania: R06, R13.

**Kroki:** Na realnym iPhonie zmień title/body/status/daty/focus/zależność i dodaj raport.

**Oczekiwany wynik:** Te same skutki co desktop, widoczne po drugiej stronie, brak readonly ograniczeń.

### A32 — Gesty mobilne

Typ: device. Wymagania: R08, R09, R13.

**Kroki:** Resize/move, scroll, edge auto-scroll, pointercancel, orientacja, drugi palec.

**Oczekiwany wynik:** Przewidywalny gest lub anulowanie bez zapisu; panel stanowi alternatywę.

### A33 — Dostępność

Typ: manual. Wymagania: R13.

**Kroki:** Keyboard-only, screen reader, 200% zoom, reduced motion, jasny/ciemny motyw.

**Oczekiwany wynik:** Brak trap, czytelny focus i pola; najważniejsze operacje bez drag.

### A34 — Focus wspólny i manualny

Typ: e2e. Wymagania: R10.

**Kroki:** Zmień focus z telefonu, przeczytaj raport z desktopu, wygeneruj alert.

**Oczekiwany wynik:** Focus wspólny, alert nie przestawia kolejności; read receipt wspólne.

### A35 — Raport != stan karty

Typ: integration. Wymagania: R05, R12.

**Kroki:** Dodaj blocker/result/decision_needed, oznacz read, potem resolution.

**Oczekiwany wynik:** Brak automatycznej zmiany karty; read nie rozwiązuje; resolution zamyka właściwy sygnał.

### A36 — Akceptacja milestone

Typ: integration. Wymagania: R12.

**Kroki:** Zamknij wszystkie jego karty; następnie świadomie zaakceptuj milestone.

**Oczekiwany wynik:** Przed akceptacją milestone nie staje się achieved sam.

### A37 — Wyszukiwanie i stronicowanie

Typ: integration. Wymagania: R11.

**Kroki:** Szukaj polskich znaków, wstrzyknij znaki SQL/FTS, zmień dane między stronami.

**Oczekiwany wynik:** Bezpieczne wyniki, brak injection, jawne CURSOR_STALE lub spójna strona.

### A38 — Benchmark referencyjny

Typ: benchmark. Wymagania: R30.

**Kroki:** Uruchom release na małym/referencyjnym/stress zbiorze; zmierz UI i host.

**Oczekiwany wynik:** Raport p50/p95/p99, RAM/bundle/latency, brak fałszywego spełnienia.

### A39 — Duże i nietypowe repo Git

Typ: security. Wymagania: R31.

**Kroki:** Repo z fsmonitor, untracked tree, submodules; timeout i brak Git.

**Oczekiwany wynik:** Brak testów/fetch/hook execution; bounded runtime, tablica działa, scope jawny.

### A40 — Backup i restore

Typ: integration. Wymagania: R27.

**Kroki:** Zrób kopię, verify, odtwórz do czystej instancji, sparuj i edytuj.

**Oczekiwany wynik:** Identyczne źródła/focus/read receipts, nowy epoch, odbudowany index i działający zapis.

### A41 — Złośliwe archiwum

Typ: security. Wymagania: R27, R16.

**Kroki:** Przywróć archiwum z ../, symlink, absurdalnym rozmiarem i złą checksum.

**Oczekiwany wynik:** Odrzucenie przed zmianą docelowych danych; brak traversal.

### A42 — Instalacja hostów

Typ: platform. Wymagania: R28, R36.

**Kroki:** Na macOS ARM64 i Arch zainstaluj release, uruchom usługę i foreground.

**Oczekiwany wynik:** Działa bez Node/Docker i roota, CLI trafia do jednej instancji.

### A43 — Stary frontend

Typ: e2e. Wymagania: R33.

**Kroki:** Otwórz edytor, zaktualizuj serwer do niezgodnego kontraktu/chunku, zapisz.

**Oczekiwany wynik:** Szkic zachowany, brak błędnego zapisu, kontrolowany reload.

### A44 — Drugi pisarz

Typ: integration. Wymagania: R29.

**Kroki:** Uruchom drugi server instancji i inną instancję na tym samym .project.

**Oczekiwany wynik:** Odmowa writer lease, brak dwóch aktywnych pisarzy.

### A45 — Dwie maszyny

Typ: e2e. Wymagania: R29.

**Kroki:** Otwórz dwie instancje o podobnych nazwach projektów.

**Oczekiwany wynik:** Wyraźny gospodarz, rozdzielny focus; brak cichego scalania.

### A46 — CLI bez serwera

Typ: integration. Wymagania: R04, R34.

**Kroki:** Zatrzymaj server i wywołaj card set; potem validate --offline.

**Oczekiwany wynik:** Brak fallback zapisu; offline validator tylko czyta.

### A47 — JSON kontrakt

Typ: integration. Wymagania: R04.

**Kroki:** Wywołaj sukces/błąd CLI w --json ze spacjami i Unicode w ścieżce.

**Oczekiwany wynik:** Pojedynczy JSON na stdout, stabilne code i exit, brak ANSI/logów w JSON.

### A48 — Undo po zmianie agenta

Typ: integration. Wymagania: R32.

**Kroki:** Zmień kartę, potem agent zmienia ją ponownie, wykonaj stare undo.

**Oczekiwany wynik:** Warunkowa odmowa/konflikt, nie utrata późniejszej zmiany.

### A49 — Archiwizacja i remove

Typ: integration. Wymagania: R01, R32.

**Kroki:** Archiwizuj kartę i rozrejestruj projekt, sprawdź pliki.

**Oczekiwany wynik:** Źródła nieusunięte, brak ukrytej kaskady referencji.

### A50 — Redakcja diagnostyki

Typ: security. Wymagania: R35.

**Kroki:** Wstaw sekret-like tekst w body i sprawdź logi błędu, pairing i bundle.

**Oczekiwany wynik:** Brak body/cookies/raw secrets; metryki tylko lokalne.

### A51 — Drift kontraktów

Typ: contract. Wymagania: R26, R33.

**Kroki:** Zmień nazwę pola tylko w jednym adapterze i uruchom test contract.

**Oczekiwany wynik:** CI wykrywa różnicę Rust/TS/schema/OpenAPI; brak cichej rozbieżności.

### A52 — Commit przy awarii indeksu

Typ: fault. Wymagania: R20, R22.

**Kroki:** Wstrzyknij błąd SQLite index po trwałym zapisie.

**Oczekiwany wynik:** Command committed, źródło poprawne, degraded/resync zamiast rollback.

### A53 — Brak prywatnego folderu po klonie

Typ: manual. Wymagania: R03.

**Kroki:** AGENTS istnieje, .project brak. Agent odczytuje instrukcje.

**Oczekiwany wynik:** Brak samowolnej inicjalizacji lub wyboru innego repo.

### A54 — Zegar hosta wstecz

Typ: unit. Wymagania: R19.

**Kroki:** Cofnij kontrolowany zegar za floor po cleanup starych requestów.

**Oczekiwany wynik:** Nowe mutacje wstrzymane do diagnozy; brak ponownego dopuszczenia wygasłej komendy.

### A55 — Lost pairing claim

Typ: integration. Wymagania: R15.

**Kroki:** Zgub Set-Cookie odpowiedzi claim, ponów z poprawnym pending secret w grace.

**Oczekiwany wynik:** Nowa sesja kontrolowanie wydana, poprzednia odwołana, po grace nowy pairing.

### A56 — Niedostępny folder

Typ: integration. Wymagania: R02, R21.

**Kroki:** Odłącz folder/mount, potem przywróć.

**Oczekiwany wynik:** Stan unavailable, brak masowego kasowania i odtwarzania z cache.

### A57 — No-op

Typ: unit. Wymagania: R18.

**Kroki:** Prześlij patch ustawiający te same wartości z poprawną wersją.

**Oczekiwany wynik:** No-op bez zmiany updated_at/hash, zapisany wynik requestu.

### A58 — Widget date round-trip

Typ: device. Wymagania: R08, R09, R25.

**Kroki:** Pokaż i przesuń jednodniowy plan, przełom roku oraz DST w obu widgetach.

**Oczekiwany wynik:** Te same LocalDate po wszystkich adapterach; bez błędu o jeden dzień.

### A59 — Dostęp prywatny

Typ: platform. Wymagania: R14.

**Kroki:** Wejdź przez prywatny HTTPS z telefonu poza domem; sprawdź listen i config proxy.

**Oczekiwany wynik:** Usługa dostępna wyłącznie zgodnie z prywatną konfiguracją; brak Funnel/public bind.

### A60 — Wznawialna inicjalizacja

Typ: fault. Wymagania: R20, R27.

**Kroki:** Przerwij add po każdym utworzonym pliku; zmień jeden z nich przed resume.

**Oczekiwany wynik:** Idempotentny resume bez resetu; cudza zmiana prowadzi do review, nie rollback delete.


*Plik źródłowy: `delivery/ACCEPTANCE.md`.*


---

<a id="annex-06"></a>

## Mapa wymagań → testy → zadania

| Wymaganie | Testy | Zadania |
|---|---|---|
| R01 — Dokładny folder i idempotentna rejestracja | A01, A02, A03, A49 | T14, T34, T42 |
| R02 — Jawne pliki .project jako jedyne źródło danych projektu | A04, A56 | T06, T19, T20, T36 |
| R03 — Niedestrukcyjny zarządzany blok AGENTS.md | A01, A53 | T14, T42 |
| R04 — CLI pełny klient serwera, JSON i błędy | A46, A47 | T10, T15, T25, T42 |
| R05 — Raporty rezultatów bez planów implementacyjnych agentów | A35 | T23, T32 |
| R06 — Jedno UI z pełną edycją na telefonie i desktopie | A31 | T27, T28, T29, T30, T32, T39, T42 |
| R07 — Kanban z porządkiem i zmianą statusu | A19, A20 | T05, T29 |
| R08 — Kalendarz z planem, deadline i przeglądem | A17, A32, A58 | T11, T12, T30, T31, T39 |
| R09 — Gantt z resize/move, milestones i zależnościami | A18, A32, A58 | T05, T11, T12, T22, T30, T31, T39 |
| R10 — Focus wspólny w instancji, ręczny i niezależny od statusu | A34 | T23, T24, T28 |
| R11 — Lista i wyszukiwanie, ograniczone projekcje | A37 | T19, T28 |
| R12 — Milestones, blokady, decyzje i wyjaśnione alerts | A18, A35, A36 | T05, T22, T23, T24, T31, T32 |
| R13 — Płynne gesty, spójny wygląd, dostępność | A23, A31, A32, A33 | T11, T12, T27, T28, T29, T30, T31, T32, T33, T39, T42 |
| R14 — Prywatne HTTPS, loopback i brak publicznego wystawienia | A27, A59 | T18, T37, T38, T39, T42 |
| R15 — Parowanie/sesje/CSRF/odwołanie urządzenia | A25, A26, A27, A55 | T18, T21, T38 |
| R16 — Bezpieczne ścieżki i brak arbitrary filesystem API | A02, A28, A41 | T06, T14, T26, T35, T38 |
| R17 — Bezpieczny Markdown i limity wejścia | A29, A30 | T26, T38 |
| R18 — Jeden koordynator zapisów i warunkowe mutacje | A05, A57 | T05, T08, T15, T16, T17 |
| R19 — Trwały request journal, ograniczone retry i epoch | A06, A07, A08, A09, A54 | T07, T09, T15, T17, T35, T41 |
| R20 — Testowany zapis, awarie i recovery | A10, A11, A20, A52, A60 | T05, T08, T09, T13, T14, T17, T19, T21 |
| R21 — Zewnętrzna edycja wykrywana bez cichej naprawy | A12, A13, A56 | T04, T06, T16, T20, T33, T36 |
| R22 — Indeks odtwarzalny bez utraty stanu użytkownika | A04, A52 | T09, T19, T21 |
| R23 — SSE/snapshot bez luk i bez nadpisania szkicu | A21, A22, A23 | T12, T20, T21, T31, T33 |
| R24 — Brak trybu offline; jawny niepewny wynik sieciowy | A06, A24 | T09, T15, T16, T17, T33 |
| R25 — Date-only, strefa workspace, plan != deadline | A16, A17, A58 | T02, T05, T11, T12, T30, T31, T39 |
| R26 — Kontrolowany YAML, extensions, body round-trip | A13, A14, A15, A51 | T01, T02, T03, T04, T20, T25 |
| R27 — Backup, restore, migracje i sesje po restore | A09, A40, A41, A60 | T07, T13, T14, T35, T38, T41, T42 |
| R28 — Wydania macOS ARM64 i Arch, bez runtime Node | A42 | T03, T37, T39, T42 |
| R29 — Wyłączność hosta i brak automatycznej federacji | A44, A45 | T06, T41 |
| R30 — Mierzalne budżety serwera i klienta | A38 | T40 |
| R31 — Ograniczony, bezpieczny obserwator Git | A39 | T36, T38 |
| R32 — Warunkowe undo i archiwizacja bez kasowania | A48, A49 | T34 |
| R33 — Zgodność kontraktów, ograniczone API i aktualizacje UI | A43, A51 | T01, T02, T03, T25, T33, T41 |
| R34 — Brak zarządzania worktree i zgadywania celu | A03, A46 | T10, T14, T42 |
| R35 — Lokalna diagnostyka, brak wycieku treści i sekretów | A50 | T36, T38 |
| R36 — Bezpieczne zarządzanie usługą i config użytkownika | A42 | T03, T37, T39, T42 |


*Plik źródłowy: `delivery/TRACEABILITY.md`.*


---

<a id="annex-07"></a>

## Kryteria wydania v1

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

Każdy punkt potrzebuje wskazania testu/artefaktu. Wszystkie pola na starcie są niezaliczone.

- [ ] Wymagania R01–R36 pokryte wdrożonym zakresem; żaden widok v1 nie został usunięty bez decyzji właściciela.
- [ ] Normalny zapis wyłącznie przez koordynatora; ETag, request retry, epoch i uncertain flow przechodzą testy.
- [ ] Fault matrix uruchomiona; brak nierozstrzygniętej klasy utraty danych.
- [ ] Rejestracja nie nadpisuje AGENTS ani .project, respektuje dokładny folder i allowlist z WWW.
- [ ] Telefon ma pełną edycję i realnie przetestowane touch move/resize/scroll; desktop iPhone widzą te same źródła.
- [ ] Kanban/calendar/Gantt/list/focus/projects/updates działają na realnym serwerze.
- [ ] Backend prywatny, HTTPS/VPN sprawdzony, parowanie i revoke oraz CSRF/Origin/Host działają.
- [ ] Markdown, path/backup parser i Git observer mają testy nadużyć.
- [ ] Backup odtworzony, epoch zmienione, sesje odwołane, focus i źródła odzyskane.
- [ ] Usunięcie indeksu nie usuwa trwałego stanu.
- [ ] Release performance raportuje cały koszt serwera i klienta; targety spełnione lub jawnie zaakceptowane odstępstwa.
- [ ] macOS ARM64 i Arch/Omarchy instalują się bez Node/Docker/root; wersje środowiska zapisane.
- [ ] Upgrade i old-client flow nie gubią szkicu ani nie zapisują niezgodnego kontraktu.
- [ ] Brak tokenów/prywatnych danych w logach, fixture i paczce wydania.
- [ ] Lockfiles, checksums, notices i lista licencji obecne; brak niezaakceptowanej płatnej zależności.
- [ ] Instrukcje użytkownika i agenta działają po wykonaniu krok po kroku.
- [ ] Lista znanych ograniczeń oddziela produkt od braków dowodów.
- [ ] Właściciel zatwierdził ewentualną publiczną publikację/licencję; domyślnie tylko przekazanie lokalnego wydania.


*Plik źródłowy: `delivery/RELEASE-CHECKLIST.md`.*
