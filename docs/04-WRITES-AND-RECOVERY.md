# 04. Trwały zapis, konflikty i odzyskiwanie

## Inwarianty

W1: istnieje jeden pisarz normalnych operacji na projekt. W2: zapis istniejącego dokumentu wymaga wersji, na której powstała intencja. W3: sukces nie jest zwracany przed końcem protokołu trwałości. W4: indeks nie jest źródłem naprawy plików. W5: ponowienie nie jest nową intencją. W6: niepewny wynik nie staje się porażką ani sukcesem przez zgadywanie.

Nie ma automatycznej transakcji SQLite + plik źródłowy. Opisujemy mały protokół z trwałym dziennikiem; SQLite ma własny model atomic commit, który nie obejmuje cudzych plików [S07]. Rename ma wymagania platformowe i nie wystarcza sam do gwarancji przetrwania utraty zasilania [S11].

## Tożsamość operacji i wersja

ID źródła to UUIDv4; wersja pliku to SHA-256 surowych bajtów. `version` dla edytowalnej reprezentacji API ma postać `r1.<64hex>`. Representation r1 zawiera tylko metadata, body, type i tę wersję — bez dynamicznych alerts, ścieżki, kursora SSE i czasu odczytu. HTTP ETag ma cudzysłowy: `"r1.<hash>"`. Nie kompresujemy tej pojedynczej reprezentacji w sposób łamiący silny validator. Zmiana formatu reprezentacji wymaga zmiany prefixu. `If-Match` musi wskazać konkretną silną wersję, nie `*` [S08].

Przy przechowaniu JSON błędów/wyników wersja zasobu nie jest ETag endpointu statusu komendy. Opisany validator dotyczy GET/PATCH konkretnego zasobu, nie dowolnego POST z cudzym ETag.

`request_id` to UUIDv7, czas z identyfikatora służy wyłącznie oknu retry, nie autoryzacji [S09]. Nowy, nieznany request jest przyjmowany od `now−24h` do `now+5min`. Klient używa czasu serwera z bootstrap do kompensacji zegara. Wyniki zostają przez co najmniej 7 dni od przyjęcia. Znany request jest sprawdzany przed ponowną oceną If-Match i okna nowej komendy, ale zawsze po auth i sprawdzeniu epoch.

Unikalność rejestru: `(command_epoch, request_id)`. Digest obejmuje metodę, logiczny target, API contract, payload po jednoznacznej kanonizacji i oryginalną precondition. Ten sam ID z inną treścią → `IDEMPOTENCY_KEY_REUSED`. CSRF, numer połączenia i cookie nie są częścią digest. Retry po zmianie sesji jednego właściciela nadal może odzyskać wynik.

`command_epoch` jest trwałym UUID. Zwykły restart go nie zmienia. Restore, utrata state DB lub inicjalizacja nowego stanu zmienia epoch. Żądanie starej epoki → `EPOCH_CHANGED`, bez auto-retry jako nowa komenda. To odcina niepewne stare intencje od odtworzonej historii.

Przy cofnięciu zegara hosta nie można przedłużać ważności usuniętych kluczy: zapisuj trwały floor czasu admission. Znaczny wykryty skok wstecz blokuje nowe mutacje do diagnozy; odczyt pozostaje. Nie implementuj własnego distributed clock.

## Kolejność normalnego zapisu jednego pliku

1. Auth/CSRF/limity/API epoch i lookup request. Znany committed → zwróć oryginalny wynik; rejected → oryginalny błąd; unresolved → status, nie drugi wykonawca.
2. Globalna bramka utrzymania w trybie shared, potem lock projektu, potem kolejka state DB. Nie trzymaj globalnego mutexa nad całym dyskiem przy zwykłym zapisie innego projektu.
3. Zweryfikuj lease, katalog i typ pliku. Odczytaj aktualne bajty. Waliduj front matter i oczekiwaną wersję. Odczytaj wymagane referencje i sprawdź domenę.
4. Wylicz wynik bez skutków ubocznych. No-op zapisuje wynik komendy bez zmiany dokumentu. Konflikt walidacji nie zmienia pliku.
5. Zapisz `PREPARED` w `state.sqlite`: target logiczny i bezpieczna lokalizacja, przed/po hash, pełne potrzebne bajty, rodzaj operacji, digest i rezultat planowany. Użyj trwałej transakcji. Nie wykonuj rename, jeśli ten krok się nie udał.
6. Utwórz unikalny plik tymczasowy obok celu, bez podążania za symlinkami, z odpowiednimi prawami. Zapisz całe bajty, sprawdź wynik i zsynchronizuj plik. Przy create wymagaj braku istniejącego targetu; nie stosuj zwykłego overwrite-rename do istniejącego obcego pliku.
7. Ponownie sprawdź obecny target oraz precondition, zachowując lock. Wykonaj platformowo bezpieczną podmianę/no-replace create i synchronizację katalogu. Sprawdź wynik; nie traktuj cache OS jako dowodu trwałości.
8. Zapisz `COMMITTED` i trwały wynik w state DB. Dopiero po tym można odpowiedzieć committed. Awaria po zmianie pliku, lecz przed potwierdzeniem state oznacza pending recovery, nie „zapis się nie udał”.
9. Aktualizuj indeks i opublikuj inwalidację z nową wersją. Przy błędzie indeksu wynik dokumentu pozostaje committed; odpowiedź/health ostrzega o degraded projection i planuje odbudowę.

SQLite state: WAL, foreign_keys=ON, bounded busy_timeout i `synchronous=FULL`; na macOS sprawdź potrzebę `fullfsync` z modelem trwałości i testem [S20]. Dla plików użyj platformowego adaptera z fsync/directory sync oraz oceną APFS F_FULLFSYNC. Nie zadeklaruj odporności na utratę zasilania tylko dlatego, że unit test zabił proces.

Jeżeli journal nie przyjmuje zapisu, nie modyfikuj źródła. Jeśli rename już nastąpił, a kolejne utrwalenie zawiedzie, odetnij nowe mutacje tego targetu i zachowaj stan niepewny. Szeregowanie komend tego samego projektu nie może omijać nierozstrzygniętego zamiaru.

## Macierz recovery po PREPARED

| Stan targetu | Wynik |
|---|---|
| Hash == after | Utrwal/zweryfikuj doc i katalog, dokończ COMMITTED, odbuduj projekcję |
| Hash == before | Dla zwykłej edycji wznowienie zapisanej intencji, o ile precondition i zależności nadal poprawne; w przeciwnym razie konflikt recovery |
| Brak, a before był absent (create) | Wznów no-replace create |
| Inne bajty, błędny plik, nowy symlink lub nieoczekiwany brak | NEEDS_REVIEW; nie nadpisuj i nie przywracaj automatycznie |
| Niedostępny katalog/dysk | BLOCKED; zachowaj journal do powrotu zasobu |

Nie usuwaj nierozstrzygniętych zamiarów przez zwykłą retencję. Recovery wykonuje się przed dostępem do zapisu, według kolejności w obrębie projektu. Wznowienie nie ignoruje zewnętrznej zmiany zależności tylko dlatego, że target ma stary hash.

## Zewnętrzny edytor i granice gwarancji

Watcher wykrywa zmiany i emituje external update. Uszkodzony dokument ma ostatnią poprawną projekcję oznaczoną jako nieaktualna, ale zwykły zapis jest zablokowany. Wersje z błędnego pliku nigdy nie są pretekstem do jego nadpisania dawnym cache.

Hash pod własnym lockiem chroni współpracujące UI/CLI. Nie jest atomowym compare-and-swap względem niewspółpracującego procesu piszącego w ostatniej chwili. Mamy ograniczenia systemu plików i advisory locks. Pełny lokalny agent z tym samym UID jest poza granicą izolacji. Zalecany kanał automatycznego zapisu to CLI.

## Operacje wieloplikowe

Rejestracja, normalizacja wielu dokumentów, renumeracja ranków, restore i migracje to jawne workflow z listą kroków i preconditions. Zapisujemy stan przed/po każdego kroku. Po awarii resume/review, bez obietnicy atomowości całego drzewa. Rejestr workspace aktualizujemy dopiero po poprawnym przygotowaniu `.project` i świadomie rozstrzygniętym bloku AGENTS.

W razie częściowego wykonania nie usuwaj w rollbacku pliku, który użytkownik zdążył zmienić. Automatyczne sprzątanie obejmuje wyłącznie pliki nadal identyczne z utworzonymi przez operację. W API workflow ma job/status, nie fałszywy pojedynczy sukces.

## Undo, historia, retencja

Undo to nowa intencja z aktualną oczekiwaną wersją. Może odwrócić pojedynczą własną zmianę, ale jeżeli zasób się później zmienił, pokazuje konflikt. Nie cofamy update do nieistnienia jako zwykłej operacji; dodajemy correction/resolution. No-op nie dodaje kolejnej treści do historii.

Retencja wyników 7 dni jest minimalnym gwarantowanym oknem. Historia treści: docelowo 30 dni, do 1 GiB, z jawnym wskaźnikiem i możliwym wcześniejszym usunięciem starej opcjonalnej historii. Dane wymagane przez retry i unresolved recovery nie podlegają takiemu usuwaniu. Przy presji dysku odmawiamy nowych zapisów, zamiast osłabiać gwarancję. Nie logujemy treści dokumentów ani sekretów do zwykłych logów.

Stare nieznane request ID poza oknem przyjęcia są odrzucane. Klient nie tworzy automatycznie nowego ID po wygaśnięciu wyniku; najpierw odczyt aktualnego stanu i świadoma nowa decyzja. Po restore nowe epoch oraz sesje zapobiegają niezamierzonemu odtworzeniu starych kliknięć.
