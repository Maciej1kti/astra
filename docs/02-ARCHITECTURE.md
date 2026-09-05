# 02. Architektura i moduły

## Jednostka wdrożenia

`projectd` jest programem użytkownika, bez roota, obsługującym HTTP i lokalne IPC. Serwuje statyczny build SPA. `projectctl` jest klientem IPC i narzędziem diagnostycznym. Nie uruchamia ukrytego daemon'a przy każdej komendzie. Node jest narzędziem builda, nie runtime'em wydania.

Baseline Axum/Tokio jest zgodny z rolą serwera HTTP [S01]. Frontend Svelte jest SPA, bez SvelteKit/SSR; Vite tylko buduje i służy developmentowi [S02]. Nie implementujemy własnego systemu kontenerów, plug-inów ani event sourcingu całej domeny.

## Proponowany układ repo

```text
apps/web/                 # Svelte, UI, API client, adaptery widoków
crates/domain/            # typy, reguły, daty, graf, rank; bez Axum i dysku
crates/project-store/     # parser, walidacja, bezpieczne ścieżki, atomic replace
crates/application/       # komendy, locks, idempotencja, recovery, query service
crates/projectd/          # HTTP/UDS, auth, uruchomienie usług
crates/projectctl/        # parsowanie CLI, IPC, formatowanie wyjścia
contracts/                # schematy kontrolowane wraz z kodem
integration-tests/        # procesy, filesystem, IPC, awarie
ops/                      # pakowanie i konfiguracje
```

To punkty podziału; Astra może połączyć małe crate'y. Nie wolno rozdzielić reguł biznesowych między CLI i frontend. Frontend ma powtórną lekką walidację UX, ale o przyjęciu zmiany decyduje domena serwera.

## Źródła danych

`.project` jest źródłem kart i celów. `workspace.json` jest źródłem rejestru, focusu, strefy i preferencji globalnych. `state.sqlite` zawiera trwały stan sesji, potwierdzeń odczytu, command journal i odzyskiwania. `index.sqlite` jest tylko pochodną; FTS5 służy do wyszukiwania [S06].

Powiązania w focusie są `(project_id, card_id)`, bez kopii opisów. Dane lokalnego wyglądu, np. szerokość panelu, mogą być w localStorage. Token sesji, źródłowe karty i kolejka offline nie trafiają tam. Potwierdzenia przeczytania są wspólne dla jednego właściciela instancji, a nie pertelefon.

## Ruch żądań

HTTP/UDS → principal → limit/wersja kontraktu → typed command/query → application service → domena i magazyn → trwały wynik → projekcja indeksu → SSE. Mutacje są jawne i typowane. Nie ma uniwersalnego execute, filesystem download, shell ani SQL endpointu.

Blokujące operacje dysku/SQLite i Git pracują poza event loop; początkowo ograniczona pula workerów. Jedna kolejka pisarza `state.sqlite` eliminuje niekontrolowaną konkurencję. Sam Rust nie chroni przed blokowaniem handlerów długim parserem.

Serwer ma lock instancji i lease każdego `.project/.local/writer.lock`. Druga instancja nie może obsługiwać tego samego magazynu. Prawa katalogu runtime 0700, UDS 0600. Proces działający jako ten sam UID nie jest izolowany od danych.

## Odczyt i indeks

Listy i widoki czytają indeks. Szczegół do edycji potwierdza źródłowy plik i zwraca jego wersję. Mutacja zawsze odczytuje źródło pod lockiem. Indeks nie przywraca skasowanej karty.

Po starcie recovery jest pierwsze. Dopiero potem read/write dla zdrowych projektów. Przy istniejącym indeksie pokazujemy od razu oznaczony stan, podczas gdy skan aktualizuje świeżość. Bez indeksu budujemy go przyrostowo i pokazujemy postęp, nie pustą tablicę udającą brak kart.

Inwalidację wywołuje watcher `.project`, nie całego drzewa kodu. Zdarzenia agregujemy i sprawdzamy hash. Częściowy zapis z zewnętrznego edytora nie trafia do UI jako nowy poprawny stan. Ograniczenia watcherów są znane; kontrolny skan jest wymagany [S12].

## Topologia hostów

Instancja ma `instance_id`, nazwę i origin. Może działać jeden serwer na Archu i klienci na Macu/telefonie. Drugi serwer na Macu jest potrzebny dla jego lokalnych folderów. V1 nie agreguje danych obu serwerów; przełącznik to nawigacja do innego originu, nie CORS ani kopia danych. Sesje i focus są perinstancja.

Jeden projekt ma jednego gospodarza. Nie wspieramy zapisu do udziałów sieciowych ani do synchronizowanych aktywnie kopii. Przeniesienie: backup, wyrejestrowanie na starym gospodarzu, przeniesienie źródeł, jawna rejestracja na nowym. Nie dedukuj tożsamości z remote Git.

## Platformy i uruchomienie

Linux: usługa użytkownika systemd, macOS: LaunchAgent, plus foreground do developmentu. To tryb po zalogowaniu, nie gwarancja pracy przed pierwszym loginem. Program nie zmienia sam ustawień usypiania ani sieci. Host wyłączony oznacza niedostępność. Wzorce ops są do dostosowania i testu na docelowej maszynie [S23][S24].

## Granice błędów

Uszkodzony dokument jest izolowany. Błędny `project.md` blokuje zwykłe zapisy całego projektu, nie całej instancji. Problem indeksu oznacza degraded projections, nie cofnięcie zatwierdzonego zapisu. Niejasny stan recovery blokuje dany target/projekt. Brak serwera zwraca błąd CLI bez trybu awaryjnego pisania.
