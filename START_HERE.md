# Astra — pakiet budowy lokalnego panelu projektów

**Odbiorca:** Astra GPT6, agent prowadzący wykonanie i integrację projektu.  
**Wersja pakietu:** 1.0, 5 września 2026 r.  
**Status:** specyfikacja wykonawcza i materiały startowe; nie gotowa aplikacja.  
**Nazwy robocze:** Local Projects, `projectd`, `projectctl`. Nazwa handlowa nie jest rozstrzygnięta.

## Misja

Zbuduj lekki, szybki i dopracowany osobisty planer projektów powiązanych z **jawnie wskazanymi folderami**. Stan projektu jest w `.project/`. Człowiek używa jednego webowego UI z pełną edycją na desktopie i telefonie, agenci CLI. Serwer pracuje na macOS Apple Silicon lub Arch Linux/Omarchy i jest dostępny przez prywatną sieć HTTPS. Komputer wyłączony oznacza usługę niedostępną.

Nie buduj orkiestratora agentów, natywnego klienta iOS, MCP, synchronizacji offline ani systemu zarządzania worktree. Zbuduj produkt, nie demonstrację samych ekranów.

## Pierwszy odczyt

1. `docs/00-DECISIONS.md`: ustalenia użytkownika, domyślne decyzje wykonawcze, zakres autonomii.
2. `docs/01-PRODUCT.md` i `docs/02-ARCHITECTURE.md`: produkt, granice modułów i zależności.
3. `docs/03-DATA-FORMAT.md`, `docs/04-WRITES-AND-RECOVERY.md`, `docs/05-API-AND-EVENTS.md`: kontrakty, które muszą być spójne przed równoległą implementacją.
4. `delivery/PLAN.md`, `delivery/BACKLOG.json`, `delivery/ACCEPTANCE.json`: kolejność pracy, konkretne zadania, dowody ukończenia.
5. Pozostałe rozdziały czytaj przed pracą w danym obszarze. `docs/MASTER-SPEC.md` to wygodna scalona kopia rozdziałów, nie odrębne źródło wymagań.

## Co jest gotowe w tym pakiecie

Opis zachowania produktu, model danych i JSON Schema, kontrakt OpenAPI, katalog CLI/IPC, opis trwałości i awarii, strategia bezpieczeństwa, specyfikacja widoków i gestów, przykładowy projekt, konfiguracje usług, zadania z zależnościami, testy akceptacyjne i skrypt weryfikujący spójność pakietu.

Schematy i przykłady są kontraktem wejściowym do implementacji. Skrypty kontroli pakietu **nie są testami gotowego produktu**. Nie ma tu implementacji serwera, UI ani CLI; polecenia `projectctl` są projektowanym interfejsem.

## Pierwsza sesja Astry

Sprawdź istniejące pliki repo docelowego, zachowaj cudze zmiany i instrukcje. Nie inicjalizuj repo w przypadkowym folderze użytkownika. Zapisz krótkie podsumowanie przyjętego zakresu i rzeczywistych ograniczeń środowiska w `progress/STATE.md`. Uruchom walidator pakietu. Przygotuj szkielet workspace Rust i frontend Svelte, przypnij zweryfikowane wersje zależności i uruchom dwie próby najwyższego ryzyka: trwały zapis z konfliktem oraz dotykowy kalendarz/Gantt. Dalej realizuj plan przyrostowo.

Nie wracaj do porównywania Tauri, Fluttera i Swifta bez dowodu blokującego przyjęty kierunek. Nie odkładaj kalendarza, Gantta ani mobilnej edycji poza v1. Nie nazywaj zakończonym etapu, którego testów nie uruchomiono.

## Granice samodzielnych decyzji

Możesz dobierać małe biblioteki, układ kodu, szczegóły wizualne i poprawiać błędy kontraktów, dokumentując zmianę i test. Zmiana źródła prawdy, publiczne udostępnienie, płatna zależność, usuwanie danych, porzucenie platformy lub funkcji v1 wymaga osobnej decyzji właściciela. Brak urządzenia testowego jest blokadą weryfikacji, nie powodem do fikcyjnego zaliczenia testu.

## Orientacja w pakiecie

| Ścieżka | Zastosowanie |
|---|---|
| `ASTRA-KICKOFF.md` | Gotowa instrukcja przekazania pracy agentowi |
| `AGENTS.md` | Reguły pracy nad kodem produktu, **nie** szablon integracji użytkownika |
| `docs/` | Normatywne specyfikacje i źródła |
| `contracts/` | JSON Schema, OpenAPI, pomocniczy schemat stanu SQLite |
| `examples/` | Przykładowe dane i żądania |
| `templates/` | Materiały generowane przez produkt w cudzych projektach |
| `delivery/` | Backlog, wymagania, testy i organizacja wykonania |
| `tests/` | Wektory danych poprawnych/błędnych, scenariusze awarii |
| `scripts/` | Walidacja i składanie dokumentu zbiorczego |
| `ops/` | Wzorce konfiguracji i usług do dostosowania, nie automatyczne instalatory |
| `progress/` | Rejestry rozpoczęcia pracy, decyzji i dowodów |

Źródła zewnętrzne potwierdzają właściwości technologii, nie wyniki wydajności tego niezaimplementowanego produktu. Rejestr znajduje się w `docs/14-SOURCES.md`.
