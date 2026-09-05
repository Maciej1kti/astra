# Mapa wymagań → testy → zadania

| Wymaganie | Testy | Zadania |
|---|---|---|
| R01 — Dokładny folder i idempotentna rejestracja | A01, A02, A03, A49 | T14, T34, T42 |
| R02 — Jawne pliki .project jako jedyne źródło danych projektu | A04, A56 | T06, T19, T20, T36 |
| R03 — Niedestrukcyjny zarządzany blok AGENTS.md | A01, A53 | T14, T42 |
| R04 — CLI pełny klient serwera, JSON i błędy | A46, A47 | T10, T15, T25, T42 |
| R05 — Raporty rezultatów bez planów implementacyjnych agentów | A35 | T23, T32 |
| R06 — Jedno UI z pełną edycją na telefonie i desktopie | A31 | T27, T28, T29, T30, T32, T39, T42 |
| R07 — Kanban z porządkiem i zmianą statusu | A19, A20 | T05, T29 |
| R08 — Kalendarz z planem, deadline i przeglądem | A17, A32, A58 | T11, T12, T30, T31, T39 |
| R09 — Gantt z resize/move, milestones i zależnościami | A18, A32, A58 | T05, T11, T12, T22, T30, T31, T39 |
| R10 — Focus wspólny w instancji, ręczny i niezależny od statusu | A34 | T23, T24, T28 |
| R11 — Lista i wyszukiwanie, ograniczone projekcje | A37 | T19, T28 |
| R12 — Milestones, blokady, decyzje i wyjaśnione alerts | A18, A35, A36 | T05, T22, T23, T24, T31, T32 |
| R13 — Płynne gesty, spójny wygląd, dostępność | A23, A31, A32, A33 | T11, T12, T27, T28, T29, T30, T31, T32, T33, T39, T42 |
| R14 — Prywatne HTTPS, loopback i brak publicznego wystawienia | A27, A59 | T18, T37, T38, T39, T42 |
| R15 — Parowanie/sesje/CSRF/odwołanie urządzenia | A25, A26, A27, A55 | T18, T21, T38 |
| R16 — Bezpieczne ścieżki i brak arbitrary filesystem API | A02, A28, A41 | T06, T14, T26, T35, T38 |
| R17 — Bezpieczny Markdown i limity wejścia | A29, A30 | T26, T38 |
| R18 — Jeden koordynator zapisów i warunkowe mutacje | A05, A57 | T05, T08, T15, T16, T17 |
| R19 — Trwały request journal, ograniczone retry i epoch | A06, A07, A08, A09, A54 | T07, T09, T15, T17, T35, T41 |
| R20 — Testowany zapis, awarie i recovery | A10, A11, A20, A52, A60 | T05, T08, T09, T13, T14, T17, T19, T21 |
| R21 — Zewnętrzna edycja wykrywana bez cichej naprawy | A12, A13, A56 | T04, T06, T16, T20, T33, T36 |
| R22 — Indeks odtwarzalny bez utraty stanu użytkownika | A04, A52 | T09, T19, T21 |
| R23 — SSE/snapshot bez luk i bez nadpisania szkicu | A21, A22, A23 | T12, T20, T21, T31, T33 |
| R24 — Brak trybu offline; jawny niepewny wynik sieciowy | A06, A24 | T09, T15, T16, T17, T33 |
| R25 — Date-only, strefa workspace, plan != deadline | A16, A17, A58 | T02, T05, T11, T12, T30, T31, T39 |
| R26 — Kontrolowany YAML, extensions, body round-trip | A13, A14, A15, A51 | T01, T02, T03, T04, T20, T25 |
| R27 — Backup, restore, migracje i sesje po restore | A09, A40, A41, A60 | T07, T13, T14, T35, T38, T41, T42 |
| R28 — Wydania macOS ARM64 i Arch, bez runtime Node | A42 | T03, T37, T39, T42 |
| R29 — Wyłączność hosta i brak automatycznej federacji | A44, A45 | T06, T41 |
| R30 — Mierzalne budżety serwera i klienta | A38 | T40 |
| R31 — Ograniczony, bezpieczny obserwator Git | A39 | T36, T38 |
| R32 — Warunkowe undo i archiwizacja bez kasowania | A48, A49 | T34 |
| R33 — Zgodność kontraktów, ograniczone API i aktualizacje UI | A43, A51 | T01, T02, T03, T25, T33, T41 |
| R34 — Brak zarządzania worktree i zgadywania celu | A03, A46 | T10, T14, T42 |
| R35 — Lokalna diagnostyka, brak wycieku treści i sekretów | A50 | T36, T38 |
| R36 — Bezpieczne zarządzanie usługą i config użytkownika | A42 | T03, T37, T39, T42 |
