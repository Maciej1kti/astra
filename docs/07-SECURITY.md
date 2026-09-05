# 07. Prywatna sieć i model bezpieczeństwa

## Zakres zagrożeń

Chronimy przed przypadkowym wystawieniem danych, niezaufaną stroną w przeglądarce, złośliwą treścią Markdown, nieuprawnionym klientem w prywatnej sieci, błędną ścieżką, wyciekiem cookie i retry po restore. Nie izolujemy użytkownika/agentów posiadających ten sam UID i pełny dostęp do dysku, przejętej przeglądarki lub skradzionego odblokowanego urządzenia z aktywną sesją.

Prywatny VPN to filtr osiągalności, nie zamiennik auth aplikacji. Pełna edycja telefonu wynika z zaufanej sesji, nie z User-Agent. Jeden właściciel i kilka urządzeń, bez RBAC organizacji.

## Wdrożenie

Backend bind wyłącznie `127.0.0.1`, domyślny port 47831. Zatwierdzony origin HTTPS obsługuje Tailscale Serve. Tailscale Serve jest prywatnym proxy, odrębnym od publicznego Funnel [S03]. Bez automatycznego bind `0.0.0.0`, UPnP, otwierania firewalla i publicznego tunnel. Program nie zarządza VPN.

Odbierz ruch jedynie dla skonfigurowanego Host. Origin operacji zmieniających stan musi dokładnie pasować do public_origin. Nie buduj origin z dowolnego X-Forwarded-Host. Nie korzystaj z Tailscale identity headers jako samodzielnego uwierzytelnienia; mogą być podszyte przy złej granicy proxy [S03]. CORS wyłączony. Origin null nie jest zaufany.

## Parowanie bez kont i haseł

1. Niesparowana przeglądarka prosi o pairing po JSON same-origin. Serwer tworzy losowy pairing ID, jednorazowy challenge i niezależny 256-bitowy pending secret w Secure/HttpOnly cookie; przechowuje hash.
2. UI pokazuje krótką frazę/kod do porównania i nazwę instancji. Pending ważny 5 min, limit 10 aktywnych i 5 nowych/min dla instancji. Kod nie jest bearer tokenem pełnego dostępu.
3. Lokalny CLI lub już sparowane urządzenie zatwierdza **konkretne** żądanie po porównaniu frazy. Sam fakt otwarcia strony nie oznacza zaufania.
4. Tylko posiadacz pending cookie może pobrać approved state i wykonać claim z pending CSRF. Przy claim nadaj nowy losowy sekret sesji, nie promuj znanego starego identyfikatora.
5. Utrata odpowiedzi na claim: krótki grace 60 s pozwala temu samemu pending secret ponowić claim; poprzednia wydana sesja zostaje odwołana, nowa zastępuje ją. Po grace wymagane nowe pairing. To osobny, testowany protokół, nie dowolna wielokrotna aktywacja kodu.

Podstawowe cookie `__Host-project_session`: Secure, HttpOnly, SameSite=Strict, Path=/, bez Domain. Sesja 30 dni bezczynności, maksymalnie 90 dni; parametry konfigurowalne. Bearer sekrety sesji i pending są generowane CSPRNG; w bazie wyłącznie ich hash, nie raw token. Odrębny sekret CSRF można przechowywać w chronionej state DB; sam nie uwierzytelnia sesji. CSRF token powiązany z sesją dostaje bootstrap i jest trzymany w RAM UI. OWASP opisuje te mechanizmy, ale wartości timeoutów to nasz baseline [S14][S15].

Revoke zamyka aktywny SSE i blokuje kolejne żądania. Nie cofnie już zatwierdzonej operacji ani nie usunie zrzutu danych z obcego urządzenia. Przy logout usuwaj bieżący stan UI i cookie. Odtworzenie backupu domyślnie odwołuje wszystkie sesje.

## Ochrona HTTP

Każda browserowa mutacja wymaga CSRF, poprawnego Origin i Content-Type JSON. Limit request body przed deserializacją. Endpointy GET nie wykonują zmiany domeny. Pairing ma własny pending token; nie zwalnia z Origin/rate limiting. UDS jest odrębnym uwierzytelnionym transportem i nie dziedziczy cookie.

CSP baseline: default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'. Style-src 'self' oraz selektywne dopuszczenie style attributes wymaganych przez bibliotekę layoutu po teście; nie dodawaj unsafe-eval ani inline scripts „żeby widget działał”. Własne ikony SVG nie pochodzą z treści użytkownika. API no-store, HTML no-cache, referrer-policy no-referrer, nosniff.

Skrypty, fonty i CSS nie pochodzą z CDN. Obrazy i preview linków z opisów nie są automatycznie ładowane. Markdown nie wykonuje HTML, javascript:, data:text/html ani file:. Linki http/https otwierane świadomie z noopener/noreferrer. Pojedyncza biblioteka sanitizacji ma mieć testy, nie ręczny regex jako filtr XSS.

## Ścieżki i repo

HTTP rejestruje tylko root_id + bezpieczną ścieżkę względną. Rooty ustawia lokalny właściciel. Odrzucamy `..`, NUL, ścieżki absolutne, traversal po dekodowaniu, symlinki uciekające poza root i specjalne pliki. Identyfikatory obiektów nie są ścieżkami. Bazujemy na otwartych deskryptorach katalogu i ponownej weryfikacji, nie na jednorazowym string-prefix compare.

`.project` nie może być symlinkiem. Pliki docelowe muszą być zwykłymi plikami, bez podążania za symlinkami. Hardlink count >1 przy modyfikacji daje diagnozę; nie zapisuj pliku współdzielonego z nieznanym miejscem. Nie otwieramy sieciowych filesystemów jako wspieranego trybu trwałości v1. Ścieżka UTF-8 jest baseline v1; niepoprawne bajty ścieżki dają czytelny błąd, nie lossy alias.

Zmiana AGENTS i info/exclude jest wyjątkiem inicjalizacji, pokazanym w planie. Serwer nie wykonuje kodu z repo. Obserwator Git ma timeout, ograniczony output, wyłączone fsmonitor/hook mechanism właściwe użytym poleceniom, bez fetch i bez terminala. Nie dodajemy ogólnego execute endpointu.

## Zależności i logi

Astra sprawdza utrzymanie, licencję i advisory przy przypinaniu zależności. Żadnej płatnej funkcji PRO bez decyzji właściciela. Lockfiles, SBOM i lista third-party notices w wydaniu. Nie zakładaj, że darmowa demonstracja widgetu oznacza darmowe wszystkie funkcje.

Logi zawierają request ID, czasy, code, logiczny target i statystyki, nie body dokumentów, cookies, pairing secret ani komendy z prywatną treścią. Local telemetry bez wysyłki. Endpoint diagnostics wymaga sesji; unauth health zwraca tylko gotowość bez listy projektów. Rozbudowany bundle diagnostyczny tworzy właściciel z podglądem zawartości.
