# 08. Specyfikacja UI, ruchu i estetyki

## Kierunek wizualny

Precyzyjne, spokojne narzędzie desktopowe adaptujące się do telefonu. Bez dekoracyjnych dashboardów, ciężkich gradientów, nadmiaru kart KPI i nieczytelnych przezroczystości. Wyróżniki: czytelny plan, bardzo dobra typografia, mały koszt obsługi i bezpośrednia reakcja.

Jedna warstwa design tokens: kolor tła/panelu/tekstu/border/accent i stanów; odstępy 4/8/12/16/24/32; font systemowy (bez pobierania), podstawowy rozmiar 14–16 px; rozsądne promienie 6–10 px; cienie tylko dla warstw. Jasny i ciemny motyw plus preferencja systemu. Semantyka koloru ma dodatkową ikonę lub tekst.

Początkowe tokeny w `templates/design-tokens.css` są punktem startowym, nie zatwierdzonym brandingiem. Liczy się jakość w zapełnionym widoku. Należy wykonać przegląd kontrastu i dostępności; sam dobór HEX nie jest dowodem zgodności.

## Układ

Desktop: nawigacja około 220 px (zwijalna), centralny widok, opcjonalny inspektor 320–420 px. Nazwa gospodarza stale widoczna. Otwieranie karty nie gubi scrolla ani filtrów. URL zawiera instancję poprzez origin oraz view/project/card i stan istotnych filtrów; nie zapisuje sekretów.

Tablet: zwijana nawigacja, overlay inspektora. Telefon: pełnoekranowy panel karty lub bottom sheet, wygodna nawigacja głównych widoków, horyzontalne przewijanie kanbana i Gantta tylko w kontrolowanej przestrzeni. Nie zakładamy hover. Wszystkie operacje mają alternatywę w panelu.

Breakpointy początkowe 720/1100 CSS px służą układowi, nie uprawnieniom ani detekcji typu urządzenia. Testuj narrow window na desktopie i szeroki telefon poziomo. Użyj safe-area i dynamic viewport; klawiatura ekranowa nie może zasłonić jedynego przycisku zapisu.

## Wspólny panel karty

Nagłówek: tytuł, status, zapis/conflict/unsaved, menu archiwizacji. Sekcje: rezultat/body, plan i deadline, milestone/zależności, blokada, aktualizacje/historia. Rzadkie pola stopniowo ujawniane. Body zwykły Markdown textarea + bezpieczny preview; nie WYSIWYG v1.

Pole tytułu ma Save/Cancel oraz skrót zatwierdzenia; pełny formularz zbiera intencję do jednego patcha. Nawigacja z brudnym formularzem ostrzega. Równoczesna zewnętrzna zmiana pokazuje niewymuszające ostrzeżenie, nie przepisuje body.

## Kanban

Kolumny mają licznik, małą część widocznych kart i możliwość wczytania reszty. Tytuł, priorytet, deadline, blokada i milestone są kompaktowe. Na starcie nie renderuj 10k kart. Dnd przekazuje status i sąsiadów, nie arbitralny numer pozycji. Filtr może ukryć pośrednie karty; w trybie ręcznego sortowania trzeba wyjaśnić zakres albo zablokować reorder przy filtrze ukrywającym sąsiadów. Zmiana statusu przez menu pozostaje dostępna.

## Kalendarz

Widoki miesiąc, tydzień całodniowy, agenda. Zakres planu to pasek; deadline to oznaczony marker; review to odmienna etykieta. Ten sam obiekt może mieć kilka elementów, wszystkie otwierają tę samą kartę. Klik pustego dnia może rozpocząć nową kartę z planem, bez automatycznego deadline'u.

Move planu zachowuje liczbę dni. Resize zmienia tylko chwytaną granicę, minimum 1 dzień. Przejście przez miesiąc i rok jest normalną operacją. Przeniesienie hard deadline wymaga wyraźnego potwierdzenia pola daty, nie dzieje się przez uchwyt planu. Na telefonie marker można wybrać i zmienić datę w panelu.

Nakładające się wydarzenia dostają czytelne ułożenie i licznik overflow. Nie tworzymy godzinowego week grid sugerującego blokadę czasu, gdy model jest całodniowy. Brak danych przez network error nie jest pustym dniem.

## Gantt

Wiersze kart i milestones, stała kolumna tytułu, wspólna pozioma oś czasu. Skale dni, tygodni, miesięcy. Nieistniejący plan jest w sekcji niezaplanowanych z akcją zaplanowania. Koniec planu i due mogą być różne. Zależności rysowane tylko dla widocznego kontekstu z oznaczeniem połączeń poza ekran; nie budujemy gigantycznego DOM dla każdej krawędzi całego archiwum.

Zależność dodawana przez panel z wyszukaniem karty jest obowiązkowa. Rysowanie krawędzi palcem może być dodatkową interakcją, nie jedynym sposobem. Weekend może być oznaczony, ale nie zmienia długości planu. Bez auto-schedulera i capacity planning.

## Maszyna stanów gestu

`idle → armed → dragging/resizing → committing → confirmed | conflict | uncertain`, z możliwością cancel do idle przed wysłaniem. Potwierdzony stan jest oddzielny od preview. Capture pointer na kontrolowanym elemencie. Aktualizacje ruchu agregowane do requestAnimationFrame; bez network i serializacji plików w loopie.

Pod kursorem ruch 1:1, bez spring opóźniającego palec. Przy osadzeniu przejście 120–180 ms. Panel 160–220 ms. Reduced motion: brak translacji/spring, możliwy krótki fade. Nie animuj masowego odtwarzania po reconnect. Długie operacje mają status, nie nieskończoną animację udającą pracę.

Touch: normalny scroll ma pierwszeństwo na treści; dnd zaczyna się z widocznego uchwytu lub po jawnie wybranym elemencie. Hitbox uchwytu co najmniej 44×44 CSS px, nawet gdy rysunek mniejszy (nasz cel ergonomiczny, nie twierdzenie o jedynym progu WCAG). `touch-action` ogranicz lokalnie, nie na całym dokumencie. `pointercancel`, utrata capture, drugi palec, orientation change i Escape anulują preview bez zapisu. Auto-scroll przy krawędzi ma ograniczoną prędkość i kończy się przy cancel. Pointer Events wspiera te mechanizmy, ale ergonomię trzeba przetestować [S16].

## Konflikt, pending i błąd

Conflict pokazuje: wersję bazową, aktualną wartość i proponowaną zmianę. Pozwala odczytać różnice, skopiować szkic, anulować lub świadomie złożyć nową intencję po aktualizacji. Brak globalnego „zawsze nadpisuj”.

Uncertain zachowuje request_id, blokuje drugi niezależny Save tej samej intencji i sprawdza status po reconnect. Nie pokazuj toast „nie zapisano” dla timeoutu bez wiedzy o wyniku. Po committed-indeks-degraded karta pokazuje zapisaną wersję i ostrzeżenie o reszcie widoku, nie rollback w UI.

## Dostępność i jakość

Kierunek WCAG 2.2 AA: kontrast, visible focus, semantyczne etykiety, brak keyboard trap, alternatywa dla drag i obsługa powiększenia. Jest to cel do testu, nie deklaracja gotowej zgodności [S17]. Elementy interaktywne nie znikają tylko po zmianie rozdzielczości. Przy wirtualizacji zachowaj stabilną kolejność focusu i opis liczby elementów. Screen reader musi dostać informację o wyniku zapisu i nowej dacie bez czytania całego widoku.

Nie przechwytuj przeglądarkowego find, edycji tekstu i systemowych skrótów. Command palette ma jedną przewidywalną kombinację Cmd/Ctrl+K poza polami tekstowymi; Escape zamyka warstwę, nie kasuje zapisanego obiektu. PL jako język początkowy, maszynowe klucze w EN, teksty wydzielone do prostych słowników.

## Dobór komponentów

Sprawdź EventCalendar oraz open-source SVAR Gantt [S04][S05]. Adapter bierze nasz ViewModel i emituje wyłącznie intencje; nie trzyma źródła danych w stanie widgetu. Wewnętrzne formularze widgetu nie obchodzą wspólnego panelu i ETag. Test licencji, rozmiaru bundle, CSP, keyboard i mobile przed adopcją. W przypadku dyskwalifikującego błędu wybierz mały własny komponent lub alternatywę i zapisz decyzję; nie zmieniaj całego stosu z powodu koloru kontrolki.
