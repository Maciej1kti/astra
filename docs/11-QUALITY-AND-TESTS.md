# 11. Testy i definicja jakości

## Warstwy

Unit/property: LocalDate, rank, graf zależności, alerts, typed patch, parser i limity. Integration: filesystem, SQLite journal, locks, recovery, indeks, HTTP/UDS, auth i SSE. End-to-end: przeglądarka + prawdziwy serwer + tymczasowy folder, nie tylko mocki. Manual device: realny iPhone Safari przez prywatną sieć, desktop macOS i Arch. Performance: release na zapisanym środowisku.

Playwright Chromium/Firefox/WebKit jest kandydatem do automatyzacji przeglądarek [S27]. WebKit runner nie jest dowodem pełnej zgodności fizycznego iPhone'a. Brak urządzenia wpisuje się jako verification gap, nie PASS.

## Obowiązkowe klasy przypadków

Parser: duplicate keys, anchors/aliases, komentarze wymagające normalizacji, nieznane pola, x-extensions, body round-trip, BOM/CRLF, invalid UTF-8, depth/size limits, filename-ID mismatch i future schema.

Domena: leap year, koniec miesiąca, DST i różne timezone klientów; plan niezależny od due; cykle/self/dangling edges; milestone independent completion; rank collision/exhaustion; archiwizacja bez kasowania referencji; resolution vs read.

Mutacje: dwóch klientów na tej samej wersji; ten sam request z innym payloadem; retry po utracie odpowiedzi i restarcie; retry po retencji; stale epoch po restore; znany wynik przed If-Match; create collision; no-op; undo po późniejszej zmianie.

Awaria: proces zabity przed i po każdym kroku intent/temp/sync/rename/journal/index/event; ENOSPC, EACCES, I/O error, read-only volume, source removed, file replaced with symlink, external editor between steps; disk flush errors. Fault injection musi działać na kontrolowanych punktach, nie losowym sleep. Test kill procesu nie jest testem fizycznej utraty zasilania.

Events: zmiana między snapshot a subscribe, stream epoch reset, overflow, reconnect po długiej przerwie, nieaktualny cursor strony, slow client backpressure, odwołanie sesji podczas SSE, indeks degraded po committed.

Security: unauth read/write, CSRF i Origin, DNS rebinding Host, local-only route na TCP, cookie revoke, token w URL/logu, path traversal/symlink, skrypt Markdown, nieautoryzowany registration root, nadmiarowy YAML, złośliwy backup i niekontrolowana konfiguracja Git.

UI: keyboard-only, screen reader, 200% zoom, reduced motion, długi polski tytuł, dark/light, touch resize/move, scroll conflict, pointercancel, podgląd podczas incoming event, uncertain write, old frontend version i safe reload. Wszystkie siedem widoków z pełnym przepływem danych.

## Powiązanie z wykonaniem

`delivery/REQUIREMENTS.json` nadaje ID wymaganiom. `delivery/ACCEPTANCE.json` podaje kroki i wyniki. `delivery/BACKLOG.json` łączy zadania z wymaganiami oraz akceptacją. `tests/fault-matrix.json` jest tabelą oczekiwanego zachowania po awarii. `tests/vectors.json` i przykładowe pliki służą parserowi i domenie.

Skrypt `scripts/check_package.py` weryfikuje wewnętrzną spójność **handoffu**. Nie udowadnia działania serwera. Astra ma przenieść te wektory do realnych testów implementacji, nie zastąpić testowania wywołaniem walidatora dokumentów.

## CI

Na zmianę: Rust fmt/clippy/tests, TypeScript/Svelte check, lint, frontend tests, schema/OpenAPI drift, przykłady i kontrakty, podstawowy E2E z prawdziwym serwerem. Nightly/manual: fault matrix, większy dataset, browser matrix, backup/restore, dependency audit. Release: instalacja i upgrade obu systemów oraz manual iPhone.

Nie wymagamy konta zewnętrznej platformy CI do rozwoju; te same polecenia mają działać lokalnie. Nie wysyłaj rzeczywistych `.project` jako artefaktów CI. Fixtures są syntetyczne. Coverage % jest pomocnicze; najważniejsze są inwarianty i scenariusze utraty danych.

## Definicja ukończenia zadania

Kod zintegrowany, testy zmienionego obszaru uruchomione, kontrakty spójne, przykład odświeżony, brak niejawnej nowej zależności i brak nowego bypassu auth. Raport zawiera polecenie, wynik, commit/build i ograniczenia. Review musi sprawdzić semantykę, nie tylko green check. Brak testu urządzenia nie może zostać ukryty pod ogólnym „mobile tested”.

## Definicja v1

Wszystkie wymagania P0 i testy release blocker ukończone. Telefon i desktop edytują przez ten sam origin/prywatną sieć; agent przez CLI. Każdy widok działa na realnych plikach. Konflikt i niepewny wynik są obsłużone. Backup odtworzony. Wydania obu hostów instalowalne, zasady ograniczeń udokumentowane. Nie wolno zmieniać nazwy release na „v1” tylko dlatego, że część ekranów wygląda dobrze.
