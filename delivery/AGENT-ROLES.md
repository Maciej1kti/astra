# Organizacja pracy agentów

Role są podziałem odpowiedzialności, nie twierdzeniem, że narzędzie uruchamiania subagentów jest dostępne. Gdy nie ma delegacji, Astra wykonuje role sekwencyjnie.

| Rola | Własność | Szczególna odpowiedzialność |
|---|---|---|
| lead / Astra | Kontrakty, integracja, release | Chroni zakres, rozstrzyga ADR, weryfikuje dowody |
| core | Domena, projekcje, focus/raporty | Jedna semantyka dat, zależności i stanu |
| store | Pliki, journal, recovery | Brak cichej utraty danych, awarie, lease |
| api | HTTP/IPC/CLI | Zgodność kontraktów i błędów, wersje, SSE |
| security | Auth, roots, render | Granice dostępu, brak zdalnego arbitralnego wykonania |
| ui | Widoki i interakcje | Mobile parity, estetyka, stan szkicu/gestu |
| qa | Testy i benchmarki | Próba obalenia założeń, nie potwierdzanie opisów |
| ops | Dystrybucja i backup | Instalacja, upgrade/restore obu hostów |

## Szablon delegacji

Zadanie/ID; cel; pliki do edycji; zakazane zmiany; kontrakty do przeczytania; wejście/wyjście; testy akceptacji; zależności; format wyniku; sposób integracji. Agent zwraca kod, testy, polecenia, ograniczenia i diff kontraktów. Nie zwraca samego planu jako ukończonej implementacji.

Nie deleguj równolegle sprzecznych zmian tych samych schema lub modułu pisarza. Testy krytyczne powinien przejrzeć agent inny niż autor implementacji albo Astra w oddzielnym przeglądzie. Wynik w osobnym worktree musi być zintegrowany i przetestowany w gałęzi głównej pracy; nie liczymy porzuconych branchy jako dostarczonego produktu.

## Format statusu

Completed z dowodem / In progress / Blocked z konkretną przyczyną / Not started. Nie używaj procentu „90% gotowe” bez kryteriów. Wyjaśniaj ryzyko i następny krok, nie zasypuj użytkownika logiem wszystkich drobnych komend.
