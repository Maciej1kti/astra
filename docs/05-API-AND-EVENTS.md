# 05. API HTTP, kontrakty i aktualizowanie widoków

## Unresolved single-resource commands — implementation clarification

A mutation that durably reached PREPARED but has no confirmed outcome returns
HTTP 202 with `CommandStatus` (`api_version: "1"`, `request_id`, `state`).
The state is `prepared`, `blocked`, or `needs_review` as observed in the journal.
It does not return `CommandResponse.status=committed` or a new job ID. Poll the
command status with the original request ID and epoch using
`GET /api/v1/commands/{request_id}?epoch={original_epoch}`. A different epoch
returns `EPOCH_CHANGED`; a missing command is never proof of a failed write.
See [ADR-031](ADR-031-COMMAND-IDENTITY-AND-PAGE-RECOVERY.md). A workflow returning
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

Report collections support `target_type` and `target_id` as an optional pair.
Use `/api/v1/projects/{project_id}/updates?target_type=project&target_id={project_id}`
or `target_type=milestone` for bounded report history, or the same pair with
`/api/v1/views/list?type=update`. Report targets are `project` or `milestone`;
card-targeted reports are rejected. The identifier is a canonical UUIDv4.
Incomplete/invalid pairs and target filters on other resource kinds return 422
`INVALID_TARGET_FILTER`.
Both fields are applied before pagination and are bound into the cursor identity.
Report bodies remain detail-only. See [ADR-029](ADR-029-BOUNDED-REPORT-HISTORY.md).

Domyślnie 50 rekordów, max 200 dla list ogólnych. Calendar max 400 dni i 1000 elementów strony; Gantt domyślnie 200 wierszy i max 500. Limit przekroczenia wymaga stronicowania, nie ucięcia bez informacji. Body nie jest na listach.

Filters are project, status, priority, label, archived and search. Priority accepts
only `normal` and `high`; other values return `422 INVALID_PRIORITY_FILTER`. Sorting has
defined stability and an ID tie-breaker. An opaque cursor binds the query hash
and projection revision. If a later page cannot remain consistent after a data
change, return `CURSOR_STALE` and refresh instead of mixing rows. Do not hold
long SQL transactions across user interaction.

Search używa bezpiecznie związanych parametrów i jawnego składania zapytania FTS. Tekst użytkownika nie jest SQL ani dowolną komendą FTS. Limit długości 256 znaków; domyślnie literalne terminy/prefix, tytuł ważniejszy niż body, polskie znaki testowane. FTS5 dostarcza mechanizm, nie gotową semantykę produktu [S06].

Calendar returns an item_id separate from resource_id because a resource can
have a card schedule or milestone due date. Marker kinds are `card_schedule` and
`milestone_due`; each marker identifies its source and version. Moving a card
schedule updates its recorded schedule. Gantt exposes explicit schedule rows;
it has no dependency edges or forecast projection.

## SSE bez zgubionej zmiany

Ordinary request admission is bounded, including body receipt. A body that is not
fully received within 10 seconds returns 408 `REQUEST_TIMEOUT` before domain
command admission. Retrying the same intention preserves its request ID, epoch
and payload. This deadline does not cancel a command after PREPARED or turn an
uncertain mutation into a rejection.

Strumień `/events` jest jeden na otwartą kartę aplikacji, nie osobny perprojekt. Nie umieszczaj tokenu sesji w query string. Native EventSource używa cookie same-origin. SSE ma semantykę jednostronnego strumienia i Last-Event-ID [S10].

Cursor to `stream_epoch:sequence`. Epoch jest nowe przy starcie/rebuild streamu, odrębne od command_epoch. Sequence rośnie po **zatwierdzeniu projekcji**. Index writer zapisuje nową projekcję i jej sequence w jednej transakcji, a następnie pod krótką blokadą publikacji dopisuje event do bufora. Snapshot czyta dane i cursor z jednej transakcji. Nie wolno oznaczyć starych danych kursorem późniejszej zmiany.

Klient: bootstrap daje początek subskrypcji; uruchom stream z tym cursorem, buforuj invalidations, pobierz potrzebne snapshoty. Dla każdego widoku odrzuć zdarzenia <= jego cursor i zastosuj nowsze jako potrzebę odświeżenia. To usuwa wyścig snapshot-versus-subscription. Możliwy jest też snapshot-first + replay; oba muszą przejść test luki.

Event `changed`: target kind/IDs, version, reason, request_id opcjonalne. Bez pełnych body. `resync_required`: luka, przepełnienie bufora, restart, rebuild. `health_changed`: degradacja magazynu/projekcji. Na brakujące epoch albo zbyt stary cursor nie udawaj pełnej historii; jawny resync. Ograniczony bufor: 10 000 zdarzeń lub 10 min, cokolwiek wcześniej. Heartbeat komentarz co 20 s, nie zapis do bazy.

Auth jest sprawdzana przy otwarciu i odwołaniu sesji; revoke aktywnie zamyka jej stream. Sesja nie pozostaje żywa bez końca tylko dlatego, że SSE się nie rozłączyło. Proxy nie może buforować całego strumienia. Po powrocie z tła klient ponownie synchronizuje potrzebne widoki, nie zakłada ciągłego działania na telefonie.

Jeśli plik został committed, lecz indeksowanie zawiodło, nie emituj zwykłego changed z fikcyjną projekcją. Emituj degraded/resync. Szczegół zasobu może nadal dać poprawne źródło, a widoki oznaczają starość. Po odbudowie nowa generacja wymusza snapshot.

## API stalej karty po aktualizacji serwera

Build ID i contract version są jawne. Przy niezgodności zapisu UI zachowuje szkic i prosi o bezpieczny reload. Nie odświeżaj automatycznie strony nad wpisywanym tekstem. Stare lazy chunk URL muszą dawać rzeczywisty błąd, nie HTML 200. HTML: no-cache; prywatne API: no-store; hashowane zasoby: immutable. Nie ma service workera w v1.

## Explicit Gantt schedules

`GET /api/v1/views/gantt` returns bounded rows containing recorded card
schedules and milestone due dates, together with page metadata and warnings.
Rows with no card schedule remain available to the list view but are not drawn as
bars. The endpoint does not infer dates, connect cards, or calculate a project
finish forecast. A move or resize submits a conditional card schedule patch.
