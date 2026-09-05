# 09. Wydajność, obserwacja i diagnostyka

## Budżety

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

## Ograniczanie pracy

Frontend route splitting: focus/list ładowane wcześnie, calendar/Gantt lazy. Summary bez body; detail/updates na żądanie. Minimalny normalized store per ID i wyliczenia tylko dla używanego widoku. Nie kopiuj 50k obiektów przy zmianie jednego pola. Wirtualizacja list i osi czasu, limit DOM, brak masowego animowania po reconnect.

Serwer indeksuje zmienione źródła; przy starcie nie czeka na Git. FTS jest dyskowe, nie kopiujemy całego archiwum do RAM. Parametry cache i liczba połączeń SQLite mają wspólny budżet. Worker pool bounded, queue bounded, backpressure z jawnym kodem, a nie nieograniczona liczba tokio tasks.

Watcher obserwuje `.project` i ignoruje `.local`, tmp własnego pisarza oraz nieznane pliki. Debounce około 100 ms, max wait 500 ms dla serii, retry częściowego zewnętrznego zapisu ograniczone. Po overflow skan kontrolny. Co 15 min kontrolny batch z ograniczeniem obciążenia, na powrocie klienta do aktywności odświeżenie aktywnego projektu z TTL 30 s. Parametry mierzone, nie bezwarunkowa pętla co sekundę [S12].

## Git

Opcjonalny obserwator: branch, ostatni commit, konflikty i zakres sprawdzonych zmian. Tylko rozpoznane powiązanie Git jawnie dodanego folderu. Nie zakładaj, że `.git` to katalog. Nie rejestruj innych repozytoriów znalezionych wyżej.

Kandydat odczytu: ograniczone `git status --porcelain=v2 -z --branch --untracked-files=no --ignore-submodules=all`, z `--no-optional-locks`, wyłączonym fsmonitor i niepotrzebną detekcją rename. Finalną komendę sprawdź z oficjalną dokumentacją i testami repo z nietypową konfiguracją [S18]. Nie używaj shell do sklejania ścieżki; ustaw cwd i argv. Timeout 2 s, max output 2 MiB, współbieżność 2; brak pętli kill/retry w tle. Untracked check tylko na żądanie lub osobny wolniejszy tryb. Nie fetch, nie testy, nie hooki, nie zewnętrzne diff drivers.

Zmiany pod `.project` nie są aktywnością kodu. Odczyt z katalogu podrzędnego może wymagać filtrowania ścieżek do wskazanego projektu. Wynik zawiera observed_at, scope, stale, error i `untracked_checked=false`; wtedy nie pokazujemy „całe repo czyste”. Git timeout nie blokuje tablicy.

## Widoczność działania

Lokale metryki: czas parse/write/sync/index/query, queue depth, request codes, index generation, SSE reconnect, pending recovery, liczba źródeł invalid, rozmiar historii. Bez treści i bez wysyłki. Log level info z rotacją, debug czasowy, JSON opcjonalny. Ekran diagnostyki ma przyczynę i zalecaną operację, nie surowy stacktrace jako jedyne wyjaśnienie.

Benchmark regresji jest częścią review zmiany warstwy danych, komponentu widoku lub dużej zależności. Każde odstępstwo od targetu opisuje pomiar, wpływ i decyzję; nie zmieniamy threshold po cichu na wartość właśnie zmierzoną.
