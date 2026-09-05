# 00. Decyzje, status i reguły interpretacji

Pakiet jest specyfikacją wykonawczą. **MUSI** określa wymóg, **POWINIEN** preferencję wymagającą uzasadnienia odstępstwa, **MOŻE** element fakultatywny. [U] to ustalenie użytkownika; [B] to przyjęty baseline projektowy dla Astry; [S] to wybór po próbie. Odmienne znaczenie etykiet UI nie może zmieniać wartości maszynowych.

## Zamrożone wymagania [U]

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

## Baseline wykonawczy [B]

Rust/Axum + Svelte 5/TypeScript/Vite; jeden proces i koordynator zapisów; dokładny format w Markdown/YAML; SQLite jako indeks oraz osobna baza stanu; CLI przez Unix socket; Tailscale Serve jako rekomendowany transport prywatnego HTTPS. Pełna edycja po sparowaniu przeglądarki, jeden właściciel, bez ról organizacyjnych.

Wersja 1 operuje na dniach, nie godzinach. Jedna instancja jest zakresem focusu, wyszukiwarki i kalendarza zbiorczego. Każdy projekt ma jednego gospodarza. `.project` domyślnie prywatne i ignorowane przez Git. Nagłówek YAML jest kontrolowanym formatem, nie dowolnym dokumentem do edycji bez zmiany białych znaków.

Są to decyzje projektowe wynikające z finalnego kierunku rozmowy, nie wszystkie były osobno literalnie potwierdzane. Astra ma na nich rozpocząć wykonanie, zamiast otwierać całą dyskusję ponownie. Jeśli baseline koliduje z nowym jawnym wymaganiem użytkownika, należy wskazać konkretną różnicę i ADR.

## Próby przed wyborem [S]

Konkretne widgety kalendarza/Gantta, biblioteka ograniczonego YAML, trwałość plików na APFS/ext4, docelowe wersje toolchain, budżet RAM klienta i ergonomia na fizycznym iPhonie. Nie są luką pozwalającą odłożyć funkcję poza v1. Próba ma dać wynik, test i decyzję, nie niekończący się research.

## Świadome doprecyzowania względem v0.3

- `request_id` komend to UUIDv7 z oknem przyjmowania, aby usunięcie starych wyników nie pozwalało automatycznie wykonać starej komendy na nowo. ID obiektów to UUIDv4.
- `command_epoch` przetrwa restart, ale zmieni się po restore/utracie stanu operacyjnego; stare niepewne komendy nie przechodzą przez granicę odtworzenia.
- Potwierdzenia odczytu aktualizacji trafiają do `state.sqlite`, a nie rosnącego `workspace.json`. To trwały stan użytkownika, objęty backupem, nie cache.
- Klucz kolejności zostaje zdefiniowany jako 128-bitowy nieprzezroczysty rank, zamiast przykładowego nieokreślonego `aM`.
- UI nie obiecuje twardego usuwania wszystkich obiektów w v1. Standardem jest archiwizacja; niebezpieczne purge należy do jawnego utrzymania poza podstawowym UI.
- Wydanie przeglądarkowe nie wymaga service workera. Brak edycji offline i obowiązkowego cache danych projektu na telefonie.

## Reguły zmian

Przy sprzeczności respektuj nowszą jawną decyzję użytkownika. Następnie rozstrzygaj intencją tego rozdziału i inwariantami bezpieczeństwa danych. Niezgodność prozy i schema/OpenAPI to błąd pakietu: napraw oba, dodaj test i ADR, nie wybieraj po cichu wygodniejszego wariantu.

Samo ulepszenie układu modułów nie wymaga zgody użytkownika. Zmiana topologii na chmurę, źródła prawdy na DB, obowiązkowe opłaty, usunięcie mobilnej edycji lub zmiana zakresu v1 wymaga decyzji właściciela. Licencja własnego produktu i publiczna publikacja pozostają decyzją właściciela; nie zakładaj, że produkt musi być open source.

Nie podajemy dat ukończenia. Etapy kończą się dowodami. Zgodność z przyszłym macOS 28 nie jest potwierdzona; dokumentujemy rzeczywiście testowane systemy i przeglądarki.
