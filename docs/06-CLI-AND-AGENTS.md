# 06. CLI, lokalne IPC i współpraca z agentami

## Cel i transport

CLI jest pierwszorzędnym klientem, nie skryptem do bezpośredniego sklejania YAML. Normalne komendy idą do `projectd` przez HTTP/1.1 nad Unix-domain socket. Ten sam dispatcher i modele co dla HTTP, ale principal powstaje z peer UID, nie z dowolnego nagłówka. UDS jest w prywatnym katalogu runtime, socket 0600, akceptowany ten sam UID. TCP nigdy nie montuje routingu `/local/v1` i nie ufa `X-Local-User`.

Globalne flagi: `--project <exact-path>`, `--json`, `--socket <path>`, `--timeout <seconds>`, `--request-id <uuidv7>`, `--if-version <opaque-version>`. Dla normalnej zmiany agent podaje wersję uzyskaną przy odczycie, zamiast prosić klienta o automatyczne zastąpienie najnowszej. Nie ma force overwrite.

`--project .` oznacza dokładnie cwd. Nie wyszukuj projektu po rodzicach, remote czy worktree. `--project` jest wymagane przy operacjach projektowych; dla właściciela można dodać świadomy alias instancji później, nie automatyczny wybór według nazwy.

## Katalog poleceń

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

## Kontrakt wyjścia

W `--json` stdout zawiera pojedynczy JSON (API version, ok, data/error, request_id), bez spinnerów, ANSI i tekstu diagnostycznego. stderr to diagnostyka. Sekrety parowania nigdy nie trafiają do logów ogólnych. Kody wyjścia: 0 sukces; 2 składnia/walidacja argumentów; 3 brak serwera/transport; 4 brak zasobu; 5 konflikt wersji/kolejności; 6 brak uprawnień; 7 invalid document/recovery required; 8 storage/internal; 9 niepewny wynik lub komenda w toku. Niepewny wynik wypisuje request_id do sprawdzenia.

Request ID bez flagi generuje klient przed wysłaniem i zachowuje co najmniej w wyjściu/diag. Automatyczne retry dopuszczalne wyłącznie z identycznym ID, epoch, payloadem i precondition. Nie odświeżaj precondition automatycznie po konflikcie. Czas komendy pochodzi z offsetu względem hello serwera.

## Lokalny kontrakt administracyjny

`GET /local/v1/hello`: instance_id, command_epoch, server_time, api_version. `POST /local/v1/registration-plans`: absolute_path. Zwykłe zasoby `/api/v1/...` działają także na UDS, z principal local. Dodatkowe `/local/v1/pairings/{id}/approve|deny`, `/roots`, `/maintenance/...` mają ten sam dispatcher audytowy i typowane payloady. Nie ma ogólnego routingu dowolnego polecenia CLI do shell.

## Kontekst agenta

Domyślny budżet 24 KiB, max 128 KiB. Zawiera: cel/fazę, aktywny milestone, wybrane aktywne/review karty, focus odnoszący się do tego projektu, blokady i ostatnie istotne raporty. Podaje version każdego zasobu, generated_at, limity, included/omitted counts oraz `next_reads` wskazujące zasoby do odczytu szczegółu; CLI może przedstawić je jako gotowe polecenia. Nie eksportuje innych projektów ani wszystkich historycznych opisów. API używa `ContextEntry` z jawnym `excerpt` i `truncated`; fragment nie udaje pełnej reprezentacji zasobu. Odczyt pełnego dokumentu jest osobną operacją. Budżet obejmuje również narzut JSON, a zbyt mały limit daje czytelny błąd zamiast niepoprawnego JSON.

Budżet jest liczony w bajtach UTF-8 i obiektach, nie fałszywie w „tokenach” bez tokenizera docelowego modelu. Treść ma etykietę project data; nie zastępuje systemowych instrukcji agenta. Utrzymuj oddzielenie instructions/data, aby raport zawierający tekst polecenia nie stawał się automatycznie instrukcją wykonania.

## Integracja AGENTS.md

`templates/managed-agents-block.md` to materiał generowany w cudzym repo. `templates/project-readme.md` wyjaśnia format. Nazwa standardowa to wielkie `AGENTS.md`; konwencja nie gwarantuje odczytu w każdym narzędziu [S13]. Na systemie rozróżniającym wielkość liter wykryj także istniejące agents.md, ale nie twórz dwóch sprzecznych plików bez diagnozy. Na case-insensitive macOS nie wykonuj ślepej zmiany nazwy.

Blok ma begin/end markers i template_version. Istniejąca treść poza nim musi pozostać nienaruszona. Hash zmienionego ręcznie bloku daje konflikt wymagający planu, nie overwrite. Instrukcja każe odczytać README i project, a stan pobierać CLI. Nie kopiujemy deadline'ów do AGENTS.

Agent domyślnie dopisuje tylko nowe istotne informacje. Zmiana zakresu, terminu, focusu lub akceptacja rezultatu wymaga wyraźnego polecenia użytkownika. Nie jest to sandbox dla procesu z pełnymi prawami użytkownika. Aplikacja nie potrafi dowieść tożsamości modelu po polu `author.label`.
