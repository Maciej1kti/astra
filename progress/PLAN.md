# Plan wykonania po inwentaryzacji — 2026-09-05

Zakres v1 i bramki G0–G6 pozostają zgodne z `delivery/PLAN.md`.
Poniżej kolejność konkretnych przekrojów; nie są to szacunki czasu.

| Przekrój | Zadania | Wynik i warunek zakończenia |
|---|---|---|
| Fundament | T01–T03 | Lokalny build Rust i Svelte, schema gate, modele obu języków, przykłady oraz jedno polecenie kontroli. Pełna walidacja OpenAPI. |
| Bezpieczny magazyn | T04, T06 | Ograniczony parser YAML, canonical serializer zachowujący body, jawna normalizacja; bezpieczne deskryptory i wyłączny lease. Testy nieznanych pól, komentarzy, symlinków, rozmiarów i drugiego pisarza. |
| Próba trwałości | T07–T09, T13 | Journal PREPARED/COMMITTED, epoch, retry/admission, adapter zapisu APFS, recovery. Deterministyczne przerwania procesu przed/po każdym utrwaleniu, dwa zapisy tej samej wersji i utracona odpowiedź. |
| Próba interakcji | T11–T12 | Wybór małych komponentów calendar/Gantt na podstawie move/resize/scroll/pointercancel i dat całodniowych. Automatyzacja przeglądarek; osobno dowód fizycznego iPhone'a. Bez zakupu PRO i bez odkładania widoków poza v1. |
| Pierwszy produkt | T05, T10, T14–T18 | Domknięcie reguł domeny; jeden dispatcher, UDS/HTTP z ochroną od pierwszego endpointu; plan/commit rejestracji; create/get/patch przez CLI i UI, dwie przeglądarki, prawdziwy plik i konflikt. |
| Backend v1 | T19–T26 | Indeks i FTS, watcher, SSE, raporty/milestones/focus, pełne API, bezpieczny Markdown. Odtworzenie indeksu nie zmienia źródeł. |
| UI v1 | T27–T34 | Wszystkie widoki i wspólny panel, konflikty/reconnect/undo, pełna edycja mobilna. Brak pozornych funkcji. |
| Odporność i wydanie | T35–T42 | Backup i restore z nowym epoch, paczki obu platform, security/fault/soak, pomiary release, testy realnego iPhone'a i instrukcje. G5/G6 wymagają rzeczywistych dowodów. |

## Najbliższy konkretny krok

T04: wybrać utrzymywany parser oferujący kontrolę zdarzeń/tokenów i ograniczeń
przed materializacją drzewa. Przenieść sześć parser fixtures do testów Rust;
dołożyć body byte roundtrip, komentarze, BOM/CRLF, filename-ID, głębokość i limit
bajtów. Dopiero po tym T06 i zapis na dysk. Nie kopiować referencyjnego parsera Python.

## Faktyczne braki i ograniczenia

- Nie istnieją jeszcze project-store/application/projectd/projectctl, HTTP, UDS ani storage.
- Nie ma parowania, SQLite runtime, odzyskiwania, indeksu, SSE, backupu ani pakietów.
- Frontend jest szkieletem budowania, bez połączenia i danych; nie spełnia G2 ani G4.
- Reguły dat, rank i grafu są rozpoczęte; T05 wymaga jeszcze alerts i oceny relacji dat.
- Host dostępny: macOS ARM64. Brak dowodu testów Archa/ext4 i fizycznego iPhone'a.
- Zabicie procesu nie będzie przedstawiane jako dowód odporności na utratę zasilania.
- Aktualizacja zależności, audyt Rust i licencji oraz wybór parsera/widgetów wymagają
  sprawdzeń w odpowiednim przekroju, bez ponownego porównywania całego stosu.

## Oszczędna kontynuacja

Zacznij od `STATE.md`, tego planu i ostatniego wpisu w `EVIDENCE.md`. Czytaj tylko
kontrakty bieżącego zadania. Utrzymuj jedną integrację i małe zmiany. Uruchamiaj
testy adekwatne do zmiany, a pełne `scripts/check.py` na końcu przekroju.
Nie aktualizuj statusów acceptance na podstawie samych testów handoffu.
