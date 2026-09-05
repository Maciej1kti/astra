# Testy akceptacyjne — czytelna lista

Każdy test ma status **not_run** dla aplikacji. Identyfikatory są zgodne z plikiem JSON.

## A01 — Rejestracja i ponowienie

Typ: integration. Wymagania: R01, R03.

**Kroki:** Dodaj pusty folder, potem powtórz tę samą operację i sprawdź pliki oraz profil.

**Oczekiwany wynik:** Jedno ID projektu, jeden blok AGENTS, bez resetu i duplikatu.

## A02 — Plan a cudze pliki

Typ: integration. Wymagania: R01, R16.

**Kroki:** Zaplanuj rejestrację, zmień istniejący AGENTS przed commit planu.

**Oczekiwany wynik:** PLAN_STALE lub konflikt; żadnego nadpisania cudzej treści.

## A03 — Dokładny cwd

Typ: integration. Wymagania: R01, R34.

**Kroki:** Wywołaj --project . w folderze podrzędnym bez .project, gdy rodzic ma projekt.

**Oczekiwany wynik:** Brak znalezionego projektu, brak inicjalizacji i brak zapisu w rodzicu.

## A04 — Usunięcie indeksu

Typ: integration. Wymagania: R02, R22.

**Kroki:** Po zapisaniu kart/focusu/sesji zatrzymaj usługę, usuń wyłącznie index, uruchom.

**Oczekiwany wynik:** Te same źródła i focus, sesja działa, widoki odbudowane.

## A05 — Dwa zapisy tej samej wersji

Typ: e2e. Wymagania: R18.

**Kroki:** Telefon i CLI dostają V1; oba edytują tę samą kartę.

**Oczekiwany wynik:** Jeden commit, drugi 412; obie intencje dostępne, brak cichego overwrite.

## A06 — Utracona odpowiedź

Typ: fault. Wymagania: R19, R24.

**Kroki:** Zapisz komendę, odetnij odpowiedź po commit, ponów identyczny request.

**Oczekiwany wynik:** Jeden skutek, wynik replayed; UI rozpoznaje committed.

## A07 — Ten sam ID inny payload

Typ: integration. Wymagania: R19.

**Kroki:** Po przyjęciu request ID wyślij z nim inny patch lub precondition.

**Oczekiwany wynik:** 409 IDEMPOTENCY_KEY_REUSED, bez drugiego zapisu.

## A08 — Retry po retencji

Typ: unit. Wymagania: R19.

**Kroki:** Przesuń zegar testowy poza 7 dni i usuń wynik zgodnie z polityką; ponów stary request.

**Oczekiwany wynik:** Nie jest wykonany jako nowy; expired window i wymóg nowej świadomej intencji.

## A09 — Restore i stary klient

Typ: integration. Wymagania: R19, R27.

**Kroki:** Wykonaj backup/restore, zachowując stary niepewny request w kliencie.

**Oczekiwany wynik:** Stary epoch odrzucony; sesje nie są automatycznie przywrócone.

## A10 — Awaria w punktach zapisu

Typ: fault. Wymagania: R20.

**Kroki:** Uruchom wszystkie punkty tests/fault-matrix.json z kill/fault injection.

**Oczekiwany wynik:** Before/after lub jawne needs_review; brak fałszywego sukcesu i duplikatu.

## A11 — Brak miejsca i uprawnień

Typ: fault. Wymagania: R20.

**Kroki:** Wstrzyknij ENOSPC/EACCES przed journal, temp, rename i commit.

**Oczekiwany wynik:** Nie ma uszkodzonego źródła ani sukcesu bez trwałego wyniku; stan niepewny izolowany.

## A12 — Zewnętrzny edytor podczas formularza

Typ: e2e. Wymagania: R21.

**Kroki:** Otwórz edytor, zmień plik z zewnątrz, potem zapisz szkic.

**Oczekiwany wynik:** Zmiana wykryta, szkic nie znika; zapis wymaga rozstrzygnięcia konfliktu.

## A13 — Błędny YAML

Typ: integration. Wymagania: R21, R26.

**Kroki:** Podmień nagłówek karty na duplicate key, alias lub konflikt merge.

**Oczekiwany wynik:** Diagnoza dokumentu, zwykły zapis zablokowany, inne zdrowe projekty działają.

## A14 — Round-trip i extensions

Typ: unit. Wymagania: R26.

**Kroki:** Zmień wyłącznie status pliku z nietypowym body i x-*; porównaj body bajtowo.

**Oczekiwany wynik:** Body identyczne, rozszerzenia zachowane, reszta nagłówka zgodna ze schema.

## A15 — Komentarz YAML

Typ: integration. Wymagania: R26.

**Kroki:** Spróbuj zwykłego patcha pliku z komentarzem, którego serializer by nie zachował.

**Oczekiwany wynik:** NORMALIZATION_REQUIRED; dopiero jawny plan/aplikacja normalizacji po If-Match.

## A16 — Daty graniczne

Typ: unit. Wymagania: R25.

**Kroki:** Wykonaj wektory leap year, zmiana miesiąca/roku, DST i inna strefa telefonu.

**Oczekiwany wynik:** Plan/date-only identyczny w pliku, liście, calendar i Gantt.

## A17 — Plan nie zmienia deadline

Typ: e2e. Wymagania: R08, R25.

**Kroki:** Rozciągnij pasek poza hard deadline.

**Oczekiwany wynik:** Zmienia się tylko schedule; ostrzeżenie, deadline nietknięty.

## A18 — Graf i brak autoschedulera

Typ: integration. Wymagania: R09, R12.

**Kroki:** Dodaj cykl/self-edge; następnie legalną krawędź ze sprzecznymi datami.

**Oczekiwany wynik:** Cykl odrzucony, konflikt dat ostrzega, następnik nie przesuwa się sam.

## A19 — Porządek i nieaktualni sąsiedzi

Typ: integration. Wymagania: R07.

**Kroki:** Przenieś kartę, równolegle zmień sąsiadów; powtórz z nieaktualnym placement.

**Oczekiwany wynik:** Deterministyczne sortowanie; ORDER_CHANGED zamiast losowej pozycji.

## A20 — Wyczerpany rank

Typ: fault. Wymagania: R07, R20.

**Kroki:** Utwórz sąsiadujące ranki bez luki, spróbuj move; wykonaj jawny rebalance z awarią.

**Oczekiwany wynik:** Brak ukrytej masowej zmiany; workflow wznawia się i kończy resync.

## A21 — Snapshot/subscribe race

Typ: integration. Wymagania: R23.

**Kroki:** Wstaw zmianę pomiędzy snapshot i nawiązaniem SSE.

**Oczekiwany wynik:** Zmiana widoczna przez replay lub resync; żadnej utraconej inwalidacji.

## A22 — Restart i overflow SSE

Typ: integration. Wymagania: R23.

**Kroki:** Przepełnij ring, odłącz klienta, zrestartuj serwer, podłącz stary cursor.

**Oczekiwany wynik:** resync_required; nowy snapshot, nie udawany pełny replay.

## A23 — SSE podczas drag

Typ: device. Wymagania: R23, R13.

**Kroki:** Podczas chwytania paska agent edytuje kartę.

**Oczekiwany wynik:** Pasek nie skacze, preview zachowany, commit pokazuje konflikt.

## A24 — Brak połączenia

Typ: e2e. Wymagania: R24.

**Kroki:** Wyłącz host podczas otwartego UI i spróbuj nowych zmian.

**Oczekiwany wynik:** Jawna niedostępność, brak offline queue; bieżący szkic możliwy do skopiowania.

## A25 — Parowanie

Typ: integration. Wymagania: R15.

**Kroki:** Niesparowany klient próbuje odczytu i zapisu; zatwierdź porównany pairing.

**Oczekiwany wynik:** Przed pairing brak danych; potem pełna edycja, poprawne Secure cookie.

## A26 — Revoke aktywnej sesji

Typ: integration. Wymagania: R15.

**Kroki:** Odwołaj urządzenie przy otwartym SSE i formularzu.

**Oczekiwany wynik:** SSE zamknięte, nowy zapis odrzucony, UI usuwa potwierdzony prywatny stan.

## A27 — Origin i CSRF

Typ: security. Wymagania: R14, R15.

**Kroki:** Wyślij mutacje cross-origin, bez tokenu, z obcym Host i origin null.

**Oczekiwany wynik:** Brak zmian, prawidłowy kod; localhost TCP nie staje się zaufanym IPC.

## A28 — Traversal i symlink

Typ: security. Wymagania: R16.

**Kroki:** Spróbuj rejestracji ../, absolutnej ścieżki w HTTP, symlink swap i specjalnego pliku.

**Oczekiwany wynik:** Brak wyjścia poza zatwierdzone korzenie; brak zapisu w innych miejscach.

## A29 — Złośliwy Markdown

Typ: security. Wymagania: R17.

**Kroki:** Karta z script, onerror, javascript URL i zewnętrznym obrazkiem.

**Oczekiwany wynik:** Żaden skrypt/auto-fetch nie działa; bezpieczne renderowanie i CSP.

## A30 — Payload/recursion bomb

Typ: security. Wymagania: R17.

**Kroki:** Przekrocz rozmiar HTTP, front matter, depth i node budget.

**Oczekiwany wynik:** Wczesne bounded odrzucenie, bez nieograniczonej pamięci i blokady procesu.

## A31 — Pełna mobilna edycja

Typ: device. Wymagania: R06, R13.

**Kroki:** Na realnym iPhonie zmień title/body/status/daty/focus/zależność i dodaj raport.

**Oczekiwany wynik:** Te same skutki co desktop, widoczne po drugiej stronie, brak readonly ograniczeń.

## A32 — Gesty mobilne

Typ: device. Wymagania: R08, R09, R13.

**Kroki:** Resize/move, scroll, edge auto-scroll, pointercancel, orientacja, drugi palec.

**Oczekiwany wynik:** Przewidywalny gest lub anulowanie bez zapisu; panel stanowi alternatywę.

## A33 — Dostępność

Typ: manual. Wymagania: R13.

**Kroki:** Keyboard-only, screen reader, 200% zoom, reduced motion, jasny/ciemny motyw.

**Oczekiwany wynik:** Brak trap, czytelny focus i pola; najważniejsze operacje bez drag.

## A34 — Focus wspólny i manualny

Typ: e2e. Wymagania: R10.

**Kroki:** Zmień focus z telefonu, przeczytaj raport z desktopu, wygeneruj alert.

**Oczekiwany wynik:** Focus wspólny, alert nie przestawia kolejności; read receipt wspólne.

## A35 — Raport != stan karty

Typ: integration. Wymagania: R05, R12.

**Kroki:** Dodaj blocker/result/decision_needed, oznacz read, potem resolution.

**Oczekiwany wynik:** Brak automatycznej zmiany karty; read nie rozwiązuje; resolution zamyka właściwy sygnał.

## A36 — Akceptacja milestone

Typ: integration. Wymagania: R12.

**Kroki:** Zamknij wszystkie jego karty; następnie świadomie zaakceptuj milestone.

**Oczekiwany wynik:** Przed akceptacją milestone nie staje się achieved sam.

## A37 — Wyszukiwanie i stronicowanie

Typ: integration. Wymagania: R11.

**Kroki:** Szukaj polskich znaków, wstrzyknij znaki SQL/FTS, zmień dane między stronami.

**Oczekiwany wynik:** Bezpieczne wyniki, brak injection, jawne CURSOR_STALE lub spójna strona.

## A38 — Benchmark referencyjny

Typ: benchmark. Wymagania: R30.

**Kroki:** Uruchom release na małym/referencyjnym/stress zbiorze; zmierz UI i host.

**Oczekiwany wynik:** Raport p50/p95/p99, RAM/bundle/latency, brak fałszywego spełnienia.

## A39 — Duże i nietypowe repo Git

Typ: security. Wymagania: R31.

**Kroki:** Repo z fsmonitor, untracked tree, submodules; timeout i brak Git.

**Oczekiwany wynik:** Brak testów/fetch/hook execution; bounded runtime, tablica działa, scope jawny.

## A40 — Backup i restore

Typ: integration. Wymagania: R27.

**Kroki:** Zrób kopię, verify, odtwórz do czystej instancji, sparuj i edytuj.

**Oczekiwany wynik:** Identyczne źródła/focus/read receipts, nowy epoch, odbudowany index i działający zapis.

## A41 — Złośliwe archiwum

Typ: security. Wymagania: R27, R16.

**Kroki:** Przywróć archiwum z ../, symlink, absurdalnym rozmiarem i złą checksum.

**Oczekiwany wynik:** Odrzucenie przed zmianą docelowych danych; brak traversal.

## A42 — Instalacja hostów

Typ: platform. Wymagania: R28, R36.

**Kroki:** Na macOS ARM64 i Arch zainstaluj release, uruchom usługę i foreground.

**Oczekiwany wynik:** Działa bez Node/Docker i roota, CLI trafia do jednej instancji.

## A43 — Stary frontend

Typ: e2e. Wymagania: R33.

**Kroki:** Otwórz edytor, zaktualizuj serwer do niezgodnego kontraktu/chunku, zapisz.

**Oczekiwany wynik:** Szkic zachowany, brak błędnego zapisu, kontrolowany reload.

## A44 — Drugi pisarz

Typ: integration. Wymagania: R29.

**Kroki:** Uruchom drugi server instancji i inną instancję na tym samym .project.

**Oczekiwany wynik:** Odmowa writer lease, brak dwóch aktywnych pisarzy.

## A45 — Dwie maszyny

Typ: e2e. Wymagania: R29.

**Kroki:** Otwórz dwie instancje o podobnych nazwach projektów.

**Oczekiwany wynik:** Wyraźny gospodarz, rozdzielny focus; brak cichego scalania.

## A46 — CLI bez serwera

Typ: integration. Wymagania: R04, R34.

**Kroki:** Zatrzymaj server i wywołaj card set; potem validate --offline.

**Oczekiwany wynik:** Brak fallback zapisu; offline validator tylko czyta.

## A47 — JSON kontrakt

Typ: integration. Wymagania: R04.

**Kroki:** Wywołaj sukces/błąd CLI w --json ze spacjami i Unicode w ścieżce.

**Oczekiwany wynik:** Pojedynczy JSON na stdout, stabilne code i exit, brak ANSI/logów w JSON.

## A48 — Undo po zmianie agenta

Typ: integration. Wymagania: R32.

**Kroki:** Zmień kartę, potem agent zmienia ją ponownie, wykonaj stare undo.

**Oczekiwany wynik:** Warunkowa odmowa/konflikt, nie utrata późniejszej zmiany.

## A49 — Archiwizacja i remove

Typ: integration. Wymagania: R01, R32.

**Kroki:** Archiwizuj kartę i rozrejestruj projekt, sprawdź pliki.

**Oczekiwany wynik:** Źródła nieusunięte, brak ukrytej kaskady referencji.

## A50 — Redakcja diagnostyki

Typ: security. Wymagania: R35.

**Kroki:** Wstaw sekret-like tekst w body i sprawdź logi błędu, pairing i bundle.

**Oczekiwany wynik:** Brak body/cookies/raw secrets; metryki tylko lokalne.

## A51 — Drift kontraktów

Typ: contract. Wymagania: R26, R33.

**Kroki:** Zmień nazwę pola tylko w jednym adapterze i uruchom test contract.

**Oczekiwany wynik:** CI wykrywa różnicę Rust/TS/schema/OpenAPI; brak cichej rozbieżności.

## A52 — Commit przy awarii indeksu

Typ: fault. Wymagania: R20, R22.

**Kroki:** Wstrzyknij błąd SQLite index po trwałym zapisie.

**Oczekiwany wynik:** Command committed, źródło poprawne, degraded/resync zamiast rollback.

## A53 — Brak prywatnego folderu po klonie

Typ: manual. Wymagania: R03.

**Kroki:** AGENTS istnieje, .project brak. Agent odczytuje instrukcje.

**Oczekiwany wynik:** Brak samowolnej inicjalizacji lub wyboru innego repo.

## A54 — Zegar hosta wstecz

Typ: unit. Wymagania: R19.

**Kroki:** Cofnij kontrolowany zegar za floor po cleanup starych requestów.

**Oczekiwany wynik:** Nowe mutacje wstrzymane do diagnozy; brak ponownego dopuszczenia wygasłej komendy.

## A55 — Lost pairing claim

Typ: integration. Wymagania: R15.

**Kroki:** Zgub Set-Cookie odpowiedzi claim, ponów z poprawnym pending secret w grace.

**Oczekiwany wynik:** Nowa sesja kontrolowanie wydana, poprzednia odwołana, po grace nowy pairing.

## A56 — Niedostępny folder

Typ: integration. Wymagania: R02, R21.

**Kroki:** Odłącz folder/mount, potem przywróć.

**Oczekiwany wynik:** Stan unavailable, brak masowego kasowania i odtwarzania z cache.

## A57 — No-op

Typ: unit. Wymagania: R18.

**Kroki:** Prześlij patch ustawiający te same wartości z poprawną wersją.

**Oczekiwany wynik:** No-op bez zmiany updated_at/hash, zapisany wynik requestu.

## A58 — Widget date round-trip

Typ: device. Wymagania: R08, R09, R25.

**Kroki:** Pokaż i przesuń jednodniowy plan, przełom roku oraz DST w obu widgetach.

**Oczekiwany wynik:** Te same LocalDate po wszystkich adapterach; bez błędu o jeden dzień.

## A59 — Dostęp prywatny

Typ: platform. Wymagania: R14.

**Kroki:** Wejdź przez prywatny HTTPS z telefonu poza domem; sprawdź listen i config proxy.

**Oczekiwany wynik:** Usługa dostępna wyłącznie zgodnie z prywatną konfiguracją; brak Funnel/public bind.

## A60 — Wznawialna inicjalizacja

Typ: fault. Wymagania: R20, R27.

**Kroki:** Przerwij add po każdym utworzonym pliku; zmień jeden z nich przed resume.

**Oczekiwany wynik:** Idempotentny resume bez resetu; cudza zmiana prowadzi do review, nie rollback delete.
