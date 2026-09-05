# Backlog wykonawczy

Źródło statusów: BACKLOG.json. T01–T03 ukończone w zakresie G0; T05 w toku. Dowody w progress/EVIDENCE.md. Scenariusze odbioru produktu pozostają niezaliczone.

| ID | Bramka | Rola | Zadanie | Zależności |
|---|---|---|---|---|
| T01 | G0 | lead | Inwentaryzacja i baseline | — |
| T02 | G0 | core | Schema i typed models | T01 |
| T03 | G0 | lead | Workspace build i lokalne CI | T01 |
| T04 | G1 | store | Parser i canonical serializer | T02, T03 |
| T05 | G1 | core | Daty, graf, rank i alerts | T02 |
| T06 | G1 | store | Path policy i leases | T03 |
| T07 | G1 | store | State journal i command epoch | T02, T06 |
| T08 | G1 | store | Durable one-file commit | T04, T07 |
| T09 | G1 | store | Recovery i uncertain state | T08 |
| T10 | G1 | api | Minimal HTTP i UDS | T02, T03 |
| T11 | G1 | ui | Próba kalendarza dotykowego | T03 |
| T12 | G1 | ui | Próba Gantta dotykowego | T03 |
| T13 | G1 | qa | Harness awarii | T06, T07 |
| T14 | G2 | core | Rejestracja i workspace | T04, T06, T09 |
| T15 | G2 | api | Pierwsze create/get/patch + CLI | T05, T09, T10, T14 |
| T16 | G2 | ui | Shell i jedna edytowalna karta | T11, T12, T15 |
| T17 | G2 | qa | Pionowy przepływ dwóch klientów | T13, T15, T16 |
| T18 | G3 | security | Parowanie, sesje i CSRF | T10, T07 |
| T19 | G3 | core | Index i FTS | T04, T05, T14 |
| T20 | G3 | core | Watcher i external edits | T19, T06 |
| T21 | G3 | api | SSE i snapshot cursors | T19, T18 |
| T22 | G3 | core | Milestones i zależności | T05, T15 |
| T23 | G3 | core | Raporty, resolutions i receipts | T15, T19 |
| T24 | G3 | core | Focus i attention | T14, T22, T23 |
| T25 | G3 | api | Pełny kontrakt HTTP/CLI | T21, T22, T23, T24 |
| T26 | G3 | security | Roots i bezpieczny Markdown | T14, T18, T16 |
| T27 | G4 | ui | Design system i adaptive shell | T16, T18 |
| T28 | G4 | ui | Focus, projekty i lista | T24, T25, T27 |
| T29 | G4 | ui | Kanban produkcyjny | T25, T27 |
| T30 | G4 | ui | Kalendarz produkcyjny | T11, T25, T27 |
| T31 | G4 | ui | Gantt produkcyjny | T12, T22, T25, T27 |
| T32 | G4 | ui | Aktualizacje i wspólna karta | T23, T25, T27 |
| T33 | G4 | ui | Reconnect, conflicts i app update | T21, T28, T29, T30, T31, T32 |
| T34 | G4 | core | Historia, undo i archiwizacja | T09, T25 |
| T35 | G5 | ops | Backup/verify/restore | T09, T14, T18, T23, T34 |
| T36 | G5 | core | Diagnostyka i obserwator Git | T19, T20 |
| T37 | G5 | ops | Pakowanie i usługi hostów | T25, T35, T36 |
| T38 | G5 | qa | Bezpieczeństwo i testy nadużyć | T18, T26, T35, T36 |
| T39 | G5 | qa | Testy realnych platform i iPhone | T28, T29, T30, T31, T32, T33, T37 |
| T40 | G5 | qa | Wydajność i optymalizacja | T28, T29, T30, T31, T33, T36 |
| T41 | G5 | qa | Upgrade, restore i soak | T35, T37, T38, T39, T40 |
| T42 | G6 | lead | Dokumentacja użytkownika i wydanie | T17, T25, T34, T41 |
