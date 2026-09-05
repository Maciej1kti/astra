# 10. Instalacja, aktualizacje, backup i utrzymanie

## Wydanie

Artefakt zawiera `projectd`, `projectctl`, wbudowane zasoby web, schematy i szablony, konfigurację przykładową, service templates, README, checksums i third-party notices/SBOM. Brak npm/Node/Docker w runtime. Binaria macOS aarch64 oraz Linux x86_64; jeśli docelowy Arch ma inną architekturę, dodaj właściwy target i test, nie oznaczaj go domyślnie jako wspieranego.

Wersje Rust, Node (tylko build), package manager i dependencies przypnij na początku G0 po sprawdzeniu utrzymania i kompatybilności. Bez `latest` w reproducible build. Wydanie używa lockfile. Nie obiecujemy całkowicie identycznego binarnego builda między toolchainami, dopóki tego nie zweryfikujemy.

## Konfiguracja hosta

Listen 127.0.0.1:47831. Public_origin to rzeczywisty prywatny adres HTTPS, nie przykład z tego pakietu. Prywatny reverse proxy zestawia właściciel. Tailscale Serve CLI służy do konfiguracji tej warstwy [S25]; agent ma sprawdzić aktualne `tailscale serve --help`, a nie nadpisać istniejących usług przez automatyczne reset.

Linux: config w XDG_CONFIG_HOME/local-projects, data w XDG_DATA_HOME/local-projects, cache w XDG_CACHE_HOME/local-projects, runtime w XDG_RUNTIME_DIR/local-projects. macOS: Application Support/LocalProjects dla config/data i Library/Caches/LocalProjects dla cache; UDS w krótkiej, prywatnej ścieżce bieżącego runtime. Uwzględnij limity długości Unix socket. Nie twórz socketu o przewidywalnym publicznie zapisywalnym path w /tmp bez prywatnego katalogu.

`ops/` zawiera szablony, nie gotową instalację na maszynie użytkownika. Installer ma generować ścieżki absolutne, nie liczyć na rozwijanie `~` i zmiennych przez launchd. Usługa po zalogowaniu, foreground do diagnostyki. Systemd i launchd mają własne cykle życia [S23][S24]. Uruchamianie przed loginem i włączanie linger pozostaw jako jawne działania właściciela, nie automatyczne.

Konfiguracja repo roots jest lokalna i nie rozszerza się przez odpowiedź HTTP. Serwer zaczyna bez żadnych projektów. Podczas `add` projekt może leżeć poza rootami web, jeśli wskazał go lokalny właściciel; przyszłe edycje jego danych przez web są normalnie dozwolone po rejestracji.

## Git integration

Nie istnieje auto-commit. Dla prywatnego `.project` plan pokazuje lokalną regułę w Git info/exclude. Gdy folder leży niżej niż root repo, reguła jest zakotwiczona do właściwej względnej ścieżki; nie zawsze to `/.project/`. Użyj Git do ustalenia ścieżki metadanych, nie założenia `.git/info/exclude`. Sprawdź, czy pliki są już śledzone — ignore ich nie odśledzi [S19]. AGENTS może pozostać śledzony i instrukcja musi obsłużyć brak prywatnego folderu po klonie.

## Aktualizacja

Przed zmianą wersji wykonaj backup, sprawdź kompatybilność plikowego schematu i state DB. Zatrzymaj przyjmowanie mutacji, dokończ lub zabezpiecz pending, podmień binaria, uruchom recovery i smoke test. CLI/API/build frontend mają jawne wersje. Stara karta przeglądarki dostaje kontrolowaną odmowę niezgodnego zapisu i możliwość zachowania szkicu.

Nie przeładowuj edytora siłą. Index można odbudować, stan użytkownika nie. Migracje źródeł: dry-run, backup, lista kroków, resume i walidacja po zakończeniu. Starszy program widzący nowszy schema nie robi downgrade'u. Rollback binariów nie jest bezpiecznym rollbackiem danych, jeśli migracja była nieodwracalna; wymagany zgodny backup.

## Backup

Źródła: `.project` bez `.local`, workspace, config, state DB i manifest. Index pomijany. Session secrets nie są przechowywane w formie jawnej, ale backup nadal zawiera prywatne dane. Domyślnie folder backupu 0700 i archiwum 0600. Kopia na tym samym dysku nie jest zabezpieczeniem od awarii dysku; produkt oferuje eksport, właściciel wybiera zewnętrzną politykę kopii.

Operacja: wejście w maintenance write barrier → wyciszenie pisarzy → dokończenie/recovery pending → stabilny zestaw źródeł → SQLite Backup API dla żywej state DB → manifest hash/size/schema/instance/created_at → weryfikacja kopii → publikacja gotowego archiwum → wyjście z barrier. Nie kopiuj samego pliku WAL DB przez zwykłe cp [S26]. Backup nie leży w obserwowanym `.project`.

Nie obiecujemy atomowego snapshotu wobec niewspółpracującego edytora. Hashe i lista plików przed/po wykrywają zmiany; w razie wykrycia abort/retry albo jawne inconsistent. Procedura zaleca zatrzymanie zewnętrznych zapisów. Nie nazywamy niespójnej kopii poprawnym backupem.

Verify sprawdza manifest, checksums, schema, referencje i brak niebezpiecznych ścieżek w archiwum. Restore najpierw rozpakowuje do staging bez symlink traversal, absolutnych ścieżek, hardlinków i zip-slip. Ogranicz liczbę/rozmiar plików i rozpakowaną objętość. Pokaż diff i mapping lokalizacji. Nie zapisuj według dowolnych ścieżek z archiwum bez zatwierdzenia.

Apply przy wyłączności, z backupem aktualnego stanu. Zmień command_epoch; sesje domyślnie odwołaj; wyczyść indeks i odbuduj go ze źródeł. Odtworzenie na nowym hoście nie scala automatycznie istniejących projektów i focusu. Restore + ponowne logowanie + zmiana karty jest testem wydania, nie tylko przyciskiem eksportu.

## Odzyskiwanie operatora

Doctor wskazuje nierozstrzygnięte commands bez ujawniania prywatnej treści w logach. Recovery plan pokazuje before/current/after i brakujące zasoby. Nie ma automatycznej komendy „napraw wszystko” kasującej pliki. Ręczna akceptacja jednej wersji musi być nową zapisaną decyzją utrzymania.

Nie usuwaj index.sqlite, gdy działa pisarz indeksu; użyj rebuild API/maintenance. Nie kasuj state.sqlite w ramach czyszczenia cache. Usunięcie state jest zdarzeniem odzyskiwania: nowe epoch, utrata sesji/history jawnie opisana, walidacja źródeł przed zapisem.
