# Kryteria wydania v1

Każdy punkt potrzebuje wskazania testu/artefaktu. Wszystkie pola na starcie są niezaliczone.

- [ ] Wymagania R01–R36 pokryte wdrożonym zakresem; żaden widok v1 nie został usunięty bez decyzji właściciela.
- [ ] Normalny zapis wyłącznie przez koordynatora; ETag, request retry, epoch i uncertain flow przechodzą testy.
- [ ] Fault matrix uruchomiona; brak nierozstrzygniętej klasy utraty danych.
- [ ] Rejestracja nie nadpisuje AGENTS ani .project, respektuje dokładny folder i allowlist z WWW.
- [ ] Telefon ma pełną edycję i realnie przetestowane touch move/resize/scroll; desktop iPhone widzą te same źródła.
- [ ] Kanban/calendar/Gantt/list/focus/projects/updates działają na realnym serwerze.
- [ ] Backend prywatny, HTTPS/VPN sprawdzony, parowanie i revoke oraz CSRF/Origin/Host działają.
- [ ] Markdown, path/backup parser i Git observer mają testy nadużyć.
- [ ] Backup odtworzony, epoch zmienione, sesje odwołane, focus i źródła odzyskane.
- [ ] Usunięcie indeksu nie usuwa trwałego stanu.
- [ ] Release performance raportuje cały koszt serwera i klienta; targety spełnione lub jawnie zaakceptowane odstępstwa.
- [ ] macOS ARM64 i Arch/Omarchy instalują się bez Node/Docker/root; wersje środowiska zapisane.
- [ ] Upgrade i old-client flow nie gubią szkicu ani nie zapisują niezgodnego kontraktu.
- [ ] Brak tokenów/prywatnych danych w logach, fixture i paczce wydania.
- [ ] Lockfiles, checksums, notices i lista licencji obecne; brak niezaakceptowanej płatnej zależności.
- [ ] Instrukcje użytkownika i agenta działają po wykonaniu krok po kroku.
- [ ] Lista znanych ograniczeń oddziela produkt od braków dowodów.
- [ ] Właściciel zatwierdził ewentualną publiczną publikację/licencję; domyślnie tylko przekazanie lokalnego wydania.
