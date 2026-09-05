# Instrukcja startowa dla Astry GPT6

Przejmujesz prowadzenie budowy Local Projects na podstawie tego pakietu. Odpowiadasz za implementację, integrację, testy, jakość UI, wydanie i uczciwy raport stanu. Wykorzystaj dostępnych agentów specjalistycznych, ale nie zakładaj, że takie narzędzia rzeczywiście są dostępne.

Przeczytaj `START_HERE.md`, `AGENTS.md` oraz rozdziały 00–05. Wersja 1.0 zastępuje wcześniejsze propozycje v0.1–v0.3 w punktach, które doprecyzowuje. Rozróżniaj wymagania użytkownika [U], domyślny baseline wykonawczy [B] i wybory wymagające próby [S]. Nie przedstawiaj [B] jako dosłownej wypowiedzi użytkownika.

Najpierw zinwentaryzuj repo i środowisko. Nie nadpisuj istniejących instrukcji, plików ani gałęzi. Zapisz stan i plan najbliższego przekroju. Nie zaczynaj od pełnej makiety z pozornymi danymi ani od własnego frameworka.

Kierunek: Rust/Axum, Svelte 5/TypeScript/Vite, pliki `.project`, jeden serwer zapisujący, CLI przez lokalne IPC, prywatne HTTPS, pełna edycja w przeglądarce także na iPhonie. Bez MCP, natywnego klienta, worktree-managera, chmury danych i zapisów offline. Każdy projekt to dokładnie wskazany folder, nie wynik zgadywania.

Zrealizuj najpierw G0–G2 z `delivery/PLAN.md`: kontrakty, minimalny przepływ end-to-end, test trwałości i prototyp interakcji. Potem rozwijaj pełny zakres v1. Zatwierdzaj bramki wyłącznie na podstawie istniejących wyników, wskazując polecenia, środowisko i artefakty.

Rób małe, reviewowalne zmiany. Jeżeli delegujesz, przekaż każdemu agentowi identyfikatory zadań, właściciela plików, kontrakt wejścia/wyjścia i kryteria odbioru. Nie pozwól kilku agentom równolegle zmieniać kontraktu danych bez integratora. Korzystanie z dodatkowego worktree w procesie developmentu nie może pozostawić wyniku poza gałęzią integracyjną; sama aplikacja nie ma nim zarządzać.

Przy błędzie specyfikacji popraw najpierw najmniejszy fragment kontraktu, dodaj ADR i test regresji, a potem implementację. Nie ukrywaj kompromisu za ogólnym „zoptymalizowano”. Podawaj wynik pomiaru i zakres, którego dotyczy.

Po każdej zakończonej sesji uaktualnij `progress/STATE.md`: co faktycznie działa, testy i commit, blokady, następny konkretny krok. Nie wypełniaj `.project` szczegółowym planem implementacyjnym agentów. Backlog wykonawczy tego pakietu nie jest automatycznym seedem tablicy użytkownika.

Zakończenie produkcji oznacza przejście `delivery/RELEASE-CHECKLIST.md`, działającą instalację, backup i przywracanie oraz udokumentowane testy mobilne i platformowe. Jeżeli nie da się czegoś sprawdzić w obecnym środowisku, wykonaj resztę i oznacz konkretny brak dowodu; nie fabrykuj testu ani zgodności z przyszłą wersją macOS.
