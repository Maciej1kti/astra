# Plan wykonania dla Astry

> Owner scope override (2026-09-05): built-in backup/restore and source-file migration tooling are deferred beyond v1. See [scope decision](../progress/SCOPE.md). All other work remains in scope.

Nie jest harmonogramem z datami ani obietnicą czasu. Bramki kończy wynik, nie liczba plików. Backlog JSON zawiera zadania i zależności; nie trzeba odczytywać całej specyfikacji w każdej sesji, ale trzeba przeczytać kontrakt danego modułu.

| Bramka | Co musi powstać | Warunek przejścia |
|---|---|---|
| G0 — kontrakt | Repo, pinned toolchain, schema/fixtures, wspólne typy, checks | Modele i przykłady są zgodne, zakres i środowisko zapisane |
| G1 — ryzyka | Durable store/retry/recovery oraz próby calendar/Gantt | Nie tracimy danych w kontrolowanych awariach; widgety mają decyzję i realny test wejścia |
| G2 — pionowy produkt | add folder, CLI context/create, jedna karta w UI, dwie przeglądarki | Rzeczywisty plik zmienia się i konflikt jest poprawnie pokazany |
| G3 — backend pełny | Index/SSE, auth, focus, reports, milestones, endpoints | Jeden dispatcher, pełny kontrakt i testy integracyjne |
| G4 — pełne UI | Wszystkie widoki, mobilna edycja, historia, reconnect | Bez funkcji v1 ukrytej za „coming soon”, bez mock data w produkcji |
| G5 — niezawodność | Backup/restore, pakowanie, security, device, benchmark, soak | Dowody obu hostów i telefonu; limitowane, jawne ryzyka |
| G6 — wydanie | Instalowalne paczki, instrukcja, checksums, lista ograniczeń | Release checklist podpisana dowodami, nie samymi deklaracjami |

## Krytyczna ścieżka

Parser → safe paths/lease → command journal → durable commit → recovery → add folder → API/CLI → prawdziwy UI. Równolegle można sprawdzić widgety i wizualny kierunek na syntetycznych danych, ale te makiety nie kończą bramki produktu.

Security rozpoczyna się z routerem, nie po dodaniu wszystkich endpointów. Fault harness powstaje razem z pisarzem, nie jako opcjonalny test na końcu. Nie uruchamiaj prywatnego serwera bez auth tylko dlatego, że „na razie VPN”.

## Tryb pracy

Jedno zadanie ma właściciela i ograniczony zakres plików. Astra integruje wyniki, nie zakłada poprawności przez sam opis agenta. Zmiany kontraktów przechodzą przez jednego integratora. Zanim agent zacznie UI, otrzymuje gotowy kontrakt i stabilny klient API lub jawny mock o identycznej strukturze.

Po każdym przekroju pokaż działający scenariusz i stan wymagań. Jeżeli nie ma fizycznego iPhone'a, kontynuuj możliwe testy, ale G5/device pozostaje niezaliczone. Nie utrzymuj fikcyjnego claimu pełnej mobilnej zgodności. Płatna biblioteka/nowa ekspozycja sieciowa wymaga decyzji właściciela.

## Nie rozszerzaj automatycznie

Plugin system, role zespołowe, sync, native app, CRDT, wspólny focus hostów i godziny pracy nie są rezerwą zadań do zrobienia „przy okazji”. Poprawa narzędzi developerskich też ma uzasadniać koszt w obecnym produkcie. Więcej kodu nie jest miarą postępu.
