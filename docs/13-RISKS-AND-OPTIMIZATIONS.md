# 13. Ryzyka, kontrole i decyzje delegowane

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

## Do samodzielnego rozstrzygnięcia przez Astrę

Wybór parsera YAML spełniającego kontrakt, podejście do bezpiecznych deskryptorów plikowych, adapter trwałości APFS/ext4, konkretne wersje dependency, mały router SPA, bibliotekę sanitizacji Markdown oraz widgety. Każdy wybór ma test/źródło i krótki ADR. Nie trzeba pytać właściciela o każdą bibliotekę.

Nazwa handlowa, publiczna licencja, kupno PRO i publikacja zewnętrzna nie są domyślnie autoryzowane. Robocza nazwa nie blokuje pierwszego przekroju. Zgoda na lokalne budowanie aplikacji nie jest zgodą na zmianę ustawień sieci użytkownika lub usuwanie danych.

## Optymalizacje warte wdrożenia od początku

Oddzielanie summary/body, leniwe ładowanie widoków, 1 gesture=1 command, read receipts poza workspace, warianty date-only, limitowany watcher i Git, gotowy statyczny UI w binarium, brak service workera, wspólny dispatcher HTTP/CLI. To upraszcza również testy.

## Optymalizacje dopiero po pomiarze

Własna struktura indeksu zamiast SQLite, dodatkowe pule i procesy, worker dla każdego widgetu, własne renderowanie canvas, custom network protocol, totalny rewrite frontendu lub agresywna pamięć cache wszystkich danych. Nie wprowadzaj ich na podstawie samego hasła „hiperszybko”.

## Granice bezpieczeństwa bez pozornej pewności

Nie obiecujemy działania przy uszkodzonym sprzęcie, izolacji od właściciela dysku, uniwersalnego exactly-once z ręczną edycją ani płynności bez pomiaru. Za to wymagamy precyzyjnych błędów, zachowania źródeł, testów odzyskiwania i dokumentacji realnych ograniczeń. Niesprawdzona hipoteza jest oznaczona jako hipoteza, nie jako przeszkoda „niemożliwa do rozwiązania”.
