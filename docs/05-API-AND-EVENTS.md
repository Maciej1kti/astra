# 05. API HTTP, kontrakty i aktualizowanie widoków

## Unresolved single-resource commands — implementation clarification

A mutation that durably reached PREPARED but has no confirmed outcome returns
HTTP 202 with `CommandStatus` (`api_version: "1"`, `request_id`, `state`).
The state is `prepared`, `blocked`, or `needs_review` as observed in the journal.
It does not return `CommandResponse.status=committed` or a new job ID. Poll the
command status with the original request ID and epoch. A workflow returning
`Accepted` with a job ID remains a separate contract. See ADR-014 and
`examples/requests/command-pending-response.json`.

Pełna lista ścieżek, typów, nagłówków i podstawowych odpowiedzi jest w `contracts/openapi.yaml` (OpenAPI 3.1.1 [S21]). Kontrakt ma być sprawdzany w CI. Poniższy opis definiuje semantykę wykraczającą poza sam schemat.

## Wersja i format

Prefix `/api/v1`. JSON UTF-8. API i zasoby statyczne pochodzą z tego samego originu. `bootstrap` zawiera instance_id/name, build_id, api_version, command_epoch, server_time, timezone, capabilities i csrf_token. Nie zawiera wszystkich kart, ścieżek repo i raportów.

Reprezentacja pojedynczego obiektu: `{type, metadata, body, version}`. Wersja jest opaque dla klienta. Listy zwracają małe summary, nie pełne body. Dynamiczne warnings, freshness i cursors należą do projekcji widoku, nie do repr r1 z silnym ETag.

Błąd ma `{api_version, error: {code, message, request_id?, details?}}`. Stabilny jest code; message można tłumaczyć. Details nie zawiera sekretów ani pełnych plików przypadkowo z innego projektu. Błędy walidacji wskazują pole i regułę. Przykłady są w `examples/requests`.

## Mutacje

Domenowe POST/PATCH/PUT wymagają `X-Request-ID` UUIDv7, `X-Command-Epoch` i przeglądarkowego `X-CSRF-Token`. Zmiana istniejącego dokumentu wymaga `If-Match`. Brak precondition → 428; niezgodna → 412. Zasób nieistniejący → 404. Stary epoch → 409. Zepsute źródło → 409 DOCUMENT_INVALID. Niedostępny projekt → 503. Zbyt duży payload → 413. Niepoprawne dane → 422. Request rate → 429. Utrata storage → 507 lub 503 z konkretnym code i bez fałszywego committed.

PATCH nie jest dowolnym JSON Patch. Używa `{set: {...}, clear: [pole], placement?: {...}}`. `set` wymienia tylko dozwolone mutowalne pola. Obiekt zagnieżdżony jest zastępowany jako całość. `clear` usuwa tylko pola opcjonalne. Pole nie może być jednocześnie set i clear. Null nie jest alternatywną składnią usuwania. ID, czasy serwera, schema_version i position nie są edytowalne bezpośrednio przez PATCH. Pole body jest wyraźną edycją tekstu.

Odpowiedź sukcesu komendy: `{api_version, request_id, status: committed|noop, result, warnings, replayed}`. Result zawiera typ i ID targetu, nową wersję i opcjonalną reprezentację. HTTP ETag do późniejszego If-Match pobieramy z zasobu/result.version; nie mylimy go z ETag wrappera komendy. Znane retry zwraca pierwotny rezultat z `replayed=true`; klient może potem odczytać nowszą wersję.

Operacje utrzymania mogą zwrócić 202 z job_id i endpointem statusu. Klient nie interpretuje 202 jako gotowego zapisu. Autoryzacja i pairing mają osobny cykl życia; nie używają arbitralnego edytowalnego dokumentu ani cudzych If-Match.

## Główne rodziny API

Projekty i rejestracja; karty; milestones; append-only updates; workspace/focus; potwierdzenia odczytu; projekcje board/calendar/gantt/attention; wyszukiwanie; historia i warunkowe undo; wyniki komend; pairing/sessions; diagnostics; strumień SSE. Nie ma endpointu dowolnego shell/SQL/download-path.

Rejestracja z HTTP ma dwa kroki: plan na zatwierdzonym root_id + relative_path, a potem commit planu. Plan ważny 5 min i zawiera hashe istniejących plików oraz zamiar zmian. Commit ponownie sprawdza plan; zmienione pliki → PLAN_STALE. Plan lokalny z CLI może używać dokładnej ścieżki dostępnej użytkownikowi, ale nie jest wystawiony na TCP.

Gdy GUI rozrejestrowuje projekt, zmienia tylko workspace. Nie usuwa plików. Relocate jest workflow z weryfikacją ID i wyłączności; nie zwykłym polem path w PATCH projektu.

## Kolekcje i filtrowanie

Domyślnie 50 rekordów, max 200 dla list ogólnych. Calendar max 400 dni i 1000 elementów strony; Gantt domyślnie 200 wierszy i max 500. Limit przekroczenia wymaga stronicowania, nie ucięcia bez informacji. Body nie jest na listach.

Filtry: project, status, priority, label, milestone, archived, due range, search. Sort ma określoną stabilność i tie-breaker ID. Opaque cursor wiąże query hash i revision projekcji. Gdy nie da się utrzymać spójności kolejnej strony po zmianie danych, zwróć `CURSOR_STALE` i odśwież, zamiast mieszać rekordy. Nie utrzymuj długich transakcji SQL przez interakcję użytkownika.

Search używa bezpiecznie związanych parametrów i jawnego składania zapytania FTS. Tekst użytkownika nie jest SQL ani dowolną komendą FTS. Limit długości 256 znaków; domyślnie literalne terminy/prefix, tytuł ważniejszy niż body, polskie znaki testowane. FTS5 dostarcza mechanizm, nie gotową semantykę produktu [S06].

Calendar zwraca item_id osobny od resource_id, ponieważ karta może mieć plan, deadline i przegląd. Typy: `card_schedule`, `card_due`, `card_review`, `milestone_due`, `project_review`. Każdy marker wskazuje źródło i version. Gest planu nie zmienia markera due. Zależności Gantta referują ID kart; hidden target jest opisany, nie pomijany bez wyjaśnienia.

## SSE bez zgubionej zmiany

Strumień `/events` jest jeden na otwartą kartę aplikacji, nie osobny perprojekt. Nie umieszczaj tokenu sesji w query string. Native EventSource używa cookie same-origin. SSE ma semantykę jednostronnego strumienia i Last-Event-ID [S10].

Cursor to `stream_epoch:sequence`. Epoch jest nowe przy starcie/rebuild streamu, odrębne od command_epoch. Sequence rośnie po **zatwierdzeniu projekcji**. Index writer zapisuje nową projekcję i jej sequence w jednej transakcji, a następnie pod krótką blokadą publikacji dopisuje event do bufora. Snapshot czyta dane i cursor z jednej transakcji. Nie wolno oznaczyć starych danych kursorem późniejszej zmiany.

Klient: bootstrap daje początek subskrypcji; uruchom stream z tym cursorem, buforuj invalidations, pobierz potrzebne snapshoty. Dla każdego widoku odrzuć zdarzenia <= jego cursor i zastosuj nowsze jako potrzebę odświeżenia. To usuwa wyścig snapshot-versus-subscription. Możliwy jest też snapshot-first + replay; oba muszą przejść test luki.

Event `changed`: target kind/IDs, version, reason, request_id opcjonalne. Bez pełnych body. `resync_required`: luka, przepełnienie bufora, restart, rebuild. `health_changed`: degradacja magazynu/projekcji. Na brakujące epoch albo zbyt stary cursor nie udawaj pełnej historii; jawny resync. Ograniczony bufor: 10 000 zdarzeń lub 10 min, cokolwiek wcześniej. Heartbeat komentarz co 20 s, nie zapis do bazy.

Auth jest sprawdzana przy otwarciu i odwołaniu sesji; revoke aktywnie zamyka jej stream. Sesja nie pozostaje żywa bez końca tylko dlatego, że SSE się nie rozłączyło. Proxy nie może buforować całego strumienia. Po powrocie z tła klient ponownie synchronizuje potrzebne widoki, nie zakłada ciągłego działania na telefonie.

Jeśli plik został committed, lecz indeksowanie zawiodło, nie emituj zwykłego changed z fikcyjną projekcją. Emituj degraded/resync. Szczegół zasobu może nadal dać poprawne źródło, a widoki oznaczają starość. Po odbudowie nowa generacja wymusza snapshot.

## API stalej karty po aktualizacji serwera

Build ID i contract version są jawne. Przy niezgodności zapisu UI zachowuje szkic i prosi o bezpieczny reload. Nie odświeżaj automatycznie strony nad wpisywanym tekstem. Stare lazy chunk URL muszą dawać rzeczywisty błąd, nie HTML 200. HTML: no-cache; prywatne API: no-store; hashowane zasoby: immutable. Nie ma service workera w v1.
