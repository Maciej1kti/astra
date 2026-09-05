# 14. Źródła techniczne

Sprawdzone na potrzeby pakietu 5 września 2026 r. To dokumentacja pierwotna. Potwierdza właściwości technologii/protokołów, nie nasze cele wydajności ani implementację. Wartości limitów, timeouts, zakres v1 i architektura są decyzjami projektowymi. Wersje bibliotek Astra przypina ponownie przy rozpoczęciu builda; strony „latest” mogą się zmienić.

| ID | Dokumentacja | Zastosowanie |
|---|---|---|
| S01 | https://docs.rs/axum/latest/axum/ | Serwer HTTP Rust/Axum; nie gwarancja wydajności |
| S02 | https://svelte.dev/docs/svelte/overview | Rola Svelte jako frameworka UI |
| S03 | https://tailscale.com/docs/features/tailscale-serve | Prywatne HTTPS/proxy i granica tożsamości |
| S04 | https://github.com/vkurko/calendar | Kandydat kalendarza, date conventions i API |
| S05 | https://docs.svar.dev/svelte/gantt/getting-started/installation/ | Kandydat Gantta, rozdział open-source/PRO |
| S06 | https://www.sqlite.org/fts5.html | Wyszukiwanie FTS5 |
| S07 | https://www.sqlite.org/atomiccommit.html | Zakres atomic commit SQLite |
| S08 | https://www.rfc-editor.org/rfc/rfc9110.html | HTTP validators, If-Match i preconditions |
| S09 | https://www.rfc-editor.org/rfc/rfc9562.html | UUIDv4/v7; okno retry jest naszym użyciem |
| S10 | https://html.spec.whatwg.org/multipage/server-sent-events.html | EventSource, SSE, reconnect/Last-Event-ID |
| S11 | https://doc.rust-lang.org/std/fs/fn.rename.html | Ograniczenia operacji rename |
| S12 | https://docs.rs/notify/latest/notify/ | Ograniczenia watcherów i różnice platform |
| S13 | https://agents.md/ | Konwencja instrukcji agentów, nie uprawnienia |
| S14 | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | Cookies, cykl życia sesji, sekrety |
| S15 | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html | CSRF/Origin; SameSite to nie wszystko |
| S16 | https://www.w3.org/TR/pointerevents/ | Mysz/dotyk, capture/cancel/touch-action |
| S17 | https://www.w3.org/TR/WCAG22/ | Kryteria dostępności, kierunek jakości |
| S18 | https://git-scm.com/docs/git-status | Porcelain, koszt untracked i background refresh |
| S19 | https://git-scm.com/docs/gitignore | Prywatne ignore i już śledzone pliki |
| S20 | https://www.sqlite.org/pragma.html | synchronous, fullfsync, konfiguracja DB |
| S21 | https://spec.openapis.org/oas/v3.1.1.html | Kontrakt maszynowy API |
| S22 | https://json-schema.org/draft/2020-12/json-schema-core | Kontrakt danych JSON Schema |
| S23 | https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html | Referencja do weryfikacji na hoście; strona nie została skutecznie pobrana w tej sesji |
| S24 | https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html | Archiwalna dokumentacja launchd; test konfiguracji na realnym OS obowiązkowy |
| S25 | https://tailscale.com/docs/reference/tailscale-cli/serve | Aktualna składnia konfiguracji Serve |
| S26 | https://www.sqlite.org/backup.html | Kopiowanie aktywnej SQLite przez Backup API |
| S27 | https://playwright.dev/docs/browsers | Browser test runner, różnice silników |

Nie kopiujemy demonstracyjnego bind `0.0.0.0` z przykładów bibliotek do naszego release. Prywatny bind jest wymaganiem produktu niezależnym od przykładu dokumentacji. Zgłoszenie błędu w repo widgetu nie jest dowodem występowania go w każdej wersji; rozstrzyga test przypiętej wersji.
