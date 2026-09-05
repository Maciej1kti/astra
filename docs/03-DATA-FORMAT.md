# 03. Format danych i inwarianty domeny

## Kontrakt plikowy

`contracts/domain.schema.json` jest schematem JSON Schema 2020-12 [S22]. Waliduje reprezentację sparsowanego dokumentu `{type, metadata, body}`; na dysku `type` wynika z lokalizacji, metadata jest front matter, body to pozostałe bajty tekstu. Sam schema nie sprawdza cykli grafu, relacji, istnienia folderu ani poprawności wszystkich zakresów — reguły domenowe są dodatkowe.

Plik UTF-8 rozpoczyna się dokładnie delimitrem `---` w pierwszej linii i zamyka front matter następnym takim delimitem. Nagłówek MUSI być jedną mapą. Zakazane: duplicate keys, anchors, aliases, merge keys, własne tagi, wiele dokumentów YAML i tabulatory jako wcięcia. Daty, czasy, UUID i rank zapisujemy jako stringi; wartości bool jako bool. Żadnego automatycznego zamieniania dat na typ JS Date. UTF-8 BOM i CRLF można odczytać, ale normalizacja wymaga jawnego kontraktu; pisarz generuje UTF-8 bez BOM i LF.

Body zachowujemy bajt w bajt przy operacji niedotyczącej body, łącznie z pustymi liniami i końcowym newline. Wymiana body jest osobną świadomą zmianą. Pole tekstowe nie wykonuje skryptów ani komend. Parser MUSI odrzucać niepoprawny UTF-8, NUL i przekroczenie limitów zanim stworzy duży obiekt w pamięci.

Nagłówek jest formatowany kanonicznie. Nieznane pola poza `x-*` blokują zwykły zapis. Rozszerzenia `x-*` zachowujemy jako ograniczone JSON values. Komentarz YAML, który zniknąłby podczas serializacji, powoduje `NORMALIZATION_REQUIRED`; użytkownik dostaje podgląd i jawną operację normalizacji, z backupem i If-Match. Serwer nie „akceptuje” normalizacji po cichu przez flagę frontendu.

## Lokalizacje i tożsamość

`project.md` zawiera `schema_version: 1` i ID projektu. Karty, milestones i updates używają nazwy `<id>.md`; ID w nagłówku musi się zgadzać. Nazwa i tytuł nie są tożsamością. Serwer generuje UUIDv4 z CSPRNG; komendy używają UUIDv7 — odrębna rola [S09]. Import nie zmienia ID bez jawnej migracji.

Puste katalogi można tworzyć leniwie. Inne pliki są ignorowane z diagnostyką, nie automatycznie kasowane. `README.md`, `.gitignore` i `.local` nie są kartami. Dane `.local` nigdy nie wchodzą do indeksu treści ani właściwego backupu źródeł.

## Pola

| Obiekt | Pola wymagane w poprawnym pliku | Opcjonalne |
|---|---|---|
| Project | schema_version, id, name, state, created_at, updated_at | phase, review_on, x-* |
| Card | id, title, kind, status, priority, position, archived, created_at, updated_at | schedule, due, review_on, milestone_id, blocked, depends_on, labels, x-* |
| Milestone | id, title, status, position, archived, created_at, updated_at | due, x-* |
| Update | id, kind, target, summary, author, recorded_at | observed_at, supersedes, resolves, evidence, x-* |

Body projektu opisuje cel i kontekst. Body karty/milestone opisuje rezultat i warunki akceptacji; nie wymagamy konkretnych nagłówków do parsowania. Body raportu zawiera szczegóły, nie pełną transkrypcję agenta.

Tworzenie przez API potrzebuje tylko tytułu karty lub nazwy projektu; pola wymagane w pliku uzupełnia serwer. Czasy są RFC3339 UTC z `Z`. `created_at` jest niezmienne w zwykłych mutacjach; `updated_at` ustala serwer dopiero przy rzeczywistej zmianie. No-op nie zmienia czasu ani wersji. Zwykły zapis nie tworzy updated_at wcześniejszego od created_at; wykryty skok zegara obsługuje polityka admission/recovery zamiast fałszowania chronologii. Zewnętrzna edycja może pozostawić stary czas; świeżość źródła określa też hash i `observed_at` w indeksie, nie tylko nagłówek.

### Enumy

- Project state: `active | paused | archived`.
- Card kind: `outcome | decision`.
- Card status: `planned | active | review | done | cancelled`.
- Priority: `low | normal | high | urgent`.
- Milestone status: `planned | active | achieved | cancelled`.
- Update kind: `result | blocker | decision_needed | note | correction | resolution`.
- Author kind: `human | agent`; obserwacje Git nie udają raportów człowieka.

Brak sztucznego workflow przechodzenia przez wszystkie stany. Done/cancelled można ponownie otworzyć. `archived` ukrywa z bieżących widoków, nie zmienia historii rezultatu. Projekt archived jest widoczny w archiwum; zwykła edycja jego kart wymaga najpierw przywrócenia projektu. Projekt paused nie blokuje edycji.

## Daty

Daty całodniowe mają format `YYYY-MM-DD` i muszą istnieć w kalendarzu gregoriańskim. Sam regex nie odrzuci 30 lutego. `schedule` występuje z obiema granicami; `start <= end`, obie **włączne**. Jednodniowy plan ma tę samą datę start/end. Dodajemy dni kalendarzowe, nie stałe 86 400 000 ms. Nie wykonujemy `new Date('YYYY-MM-DD')` jako kanonicznego modelu daty.

`due` to `{date, kind: hard|target}`. `review_on` jest niezależne. Gdy plan kończy się po due, zwracamy ostrzeżenie; nie odrzucamy realnego planu ani nie przesuwamy deadline'u. `due_today` to date == dziś w strefie workspace; overdue to date < dziś dla niezamkniętej karty. Telefon za granicą nie przesuwa dat. Oś czasu może użyć adaptera ze sztuczną reprezentacją biblioteki, ale musi wrócić do identycznych LocalDate.

Finish-to-start: poprzednik zaplanowany do 18 września wymaga startu następcy co najmniej 19 września, jeśli przyjmujemy rozłączne dni. Nie ma kalendarza roboczego, weekendów jako blokad, lagów, leadów ani auto-schedulera. Brak planu którejkolwiek strony to stan nieoceniony, nie konflikt.

## Relacje i raporty

`milestone_id` odnosi się do milestone tego samego projektu. `depends_on` zawiera unikalne ID kart tego projektu, bez self-edge i bez cykli. Wprowadzenie cyklu jest błędem. Naruszenie dat zależności jest ostrzeżeniem. Zmiana statusu nie wykonuje kaskady. Archiwizacja zależnej karty nie kasuje krawędzi; UI pokazuje ukryty cel. Przy ręcznym usunięciu referencji oznaczamy broken reference, nie usuwamy jej cicho.

Update jest append-only w normalnym API. `target` to typ `project|card|milestone` i ID istniejącego obiektu z tego projektu. Korekta wskazuje wcześniejszy raport przez `supersedes`; rozwiązanie wskazuje wcześniejsze raporty przez `resolves`. Referencje muszą należeć do tego samego projektu, resolution nie wskazuje siebie i nie tworzy cyklu. Nowy raport `blocker` nie ustawia automatycznie `card.blocked`. Odczyt raportu nie rozwiązuje decyzji. `resolution` jawnie zamyka sygnał; korekta oznacza zastąpienie treści, nie tajne przepisanie historii.

`evidence` jest listą typowanych referencji: `url` (http/https, bez automatycznego pobierania), `commit` (hex OID jako tekst), `path` (względna ścieżka do opisu, nie uprawnienie do zdalnego czytania pliku). Author jest deklaracją, nie podpisem tożsamości.

## Kolejność

`position` to 32 małe cyfry hex kodujące unsigned 128-bit. Rezerwujemy 0 i 2^128−1 jako wirtualne granice. Porządek to `(position, id)` w obrębie statusu kart, a w milestones w obrębie projektu. Priorytet nie zmienia kolejności ręcznej. UI nie wylicza rank i nie wysyła floatów.

Komenda move wskazuje sąsiadów `after_id` i `before_id` w nowej kolumnie. Serwer pod lockiem odczytuje kolejność, usuwa przesuwaną kartę z rozważanego zbioru i sprawdza sąsiedztwo. Null oznacza krawędź kolumny; oba null są poprawne dla pustej kolumny. Nieaktualne sąsiedztwo → `ORDER_CHANGED`, nie nieoczekiwana pozycja.

Nowy rank = low + floor((high−low)/2), jeżeli istnieje przerwa. Tworzenie i zmiana statusu bez wskazania sąsiadów dopisuje na końcu. Gdy zabraknie miejsca albo ręcznie zdublowane ranki blokują wstawienie, zwracamy `ORDER_REBALANCE_REQUIRED`. Jawna wznawialna konserwacja rozkłada ranki równomiernie i emituje resync. Nie przepisujemy dziesiątek plików w ukryciu podczas każdego gestu.

## Limity baseline

Cały dokument <= 1 MiB; nagłówek <= 64 KiB; body <= 960 KiB. Title <= 240 znaków, project name <= 120, summary <= 500, label <= 48 i max 20 etykiet. Max 100 zależności na kartę, 50 evidence na raport, 100 resolves. Max depth JSON/YAML 12 i 10 000 węzłów. Limits działają w parserze i HTTP; JSON Schema nie zastępuje limitu bajtowego.

Limit testowy 100 projektów/10k kart/50k raportów nie jest limitem danych. Lista i raporty są stronicowane. Nie podnosimy limitów bez pomiaru i testu nadużycia.

## Profil workspace

W `workspace.json`: format_version, instance_id, timezone, locale, projects (ID, ścieżka, data dodania), focus (referencje w kolejności), preferences. Sekrety i sesje nie są tu przechowywane. `focus` max 100 pozycji, rekomendacja UX 3–5, bez twardej blokady przy czwartej. Nieistniejąca referencja pozostaje oznaczona, dopóki użytkownik jej nie usunie. Root do rejestracji przez WWW jest konfiguracją hosta; nie wynika z dowolnej treści workspace.
