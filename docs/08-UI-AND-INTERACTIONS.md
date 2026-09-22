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

Header: title, status, save/conflict/unsaved state and archive menu. Sections:
outcome/body, schedule, checklist and updates/history. Body uses a plain Markdown
textarea with a safe preview; v1 is not WYSIWYG.

Pole tytułu ma Save/Cancel oraz skrót zatwierdzenia; pełny formularz zbiera intencję do jednego patcha. Nawigacja z brudnym formularzem ostrzega. Równoczesna zewnętrzna zmiana pokazuje niewymuszające ostrzeżenie, nie przepisuje body.

## Focus — current layout, 2026-09-22

Focus shows In focus, Needs my attention and In motion, in that order. Pinned
cards retain their explicit workspace order. A pinned card's attention reasons
appear on that card; the attention list omits it. In motion shows active cards
outside the pinned and current attention results. Each resource appears once
in the currently displayed sections. Active cards and attention have bounded
pages; the title filter applies to the loaded results.

Card attention uses schedule End and Review status. Undated active cards remain
eligible for In motion. Independent milestone dates and project/milestone
decision reports can still appear through the shared attention endpoint; Focus
does not fetch a separate milestone collection. The three summary counters and
the introductory hero copy are removed.

Add card is a floating button in the lower right, including on narrow screens.
It opens the existing centered card editor for the selected project. Autosave,
conditional command recovery and keyboard focus restoration remain unchanged.
The workspace/project/date/actions bar follows Focus content as its footer;
other views retain the bar at the top. The decorative source-of-truth slogan
footer is removed.

In focus uses one vertical stack of cards styled like Kanban cards. Hold the
primary mouse button on a card, drag up or down and release to save its order.
A short click opens the card; Alt+Up/Down provides keyboard reordering. Escape
cancels a gesture. There is no Arrange focus modal or separate Save action.
Filtered reordering changes visible slots in the complete pinned list while
preserving hidden pins. Reordering uses the observed workspace Focus version;
conflicts require review, and uncertain writes retain their original command.

## Kanban

Columns show a count, a small visible card page and an action to load more. Title,
priority and schedule stay compact. Do not render 10,000 cards at startup. DnD
passes status and neighbors rather than an arbitrary position. The menu always
offers a status change.

## Kalendarz

Views are month, all-day week and agenda. A card schedule is a bar and a
milestone due date is a marker. One resource can have several items and all open
the same resource. Clicking an empty day can start a new scheduled card.

Moving a schedule preserves its number of days. Resizing changes only the
selected boundary, with a one-day minimum. Crossing a month or year is ordinary.
On a phone, select a schedule or milestone due date and edit it in the panel.

Nakładające się wydarzenia dostają czytelne ułożenie i licznik overflow. Nie tworzymy godzinowego week grid sugerującego blokadę czasu, gdy model jest całodniowy. Brak danych przez network error nie jest pustym dniem.

## Gantt

Rows contain cards and milestones with a fixed title column and a shared
horizontal time axis. Scales cover days, weeks and months. Missing card
schedules appear in an unscheduled section with an action to schedule them. Card
bars use recorded schedules and milestone rows use their due date. Gantt renders
no card connections or inferred forecast.

Weekends may be marked but do not change schedule length. There is no automatic
scheduler or capacity planning.

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

## Adopted planning components — 2026-09-07

SVAR Svelte Gantt 2.7.2 and EventCalendar 5.12.2 are pinned MIT dependencies,
loaded separately when their view opens. All assets are served by the host.
The shared editor and versioned command transport own persistence. A pointer
gesture or keyboard move opens an explicit proposal; it does not silently save.

Each scheduled card is one Gantt bar. Milestone due dates remain distinct.
Gantt displays recorded schedules and does not draw card connections or infer a
project finish. A move or resize produces the ordinary conditional schedule
patch for that card.

The calendar supports day, all-day week, month and agenda views. Clicking an
empty date or selecting a range opens a scheduled card draft in the selected
project. Planned work can move or resize at either boundary; milestone due
dates open their resource editor. Overflow and loading/error states remain
visible. The model remains date-only, so there is no hourly time blocking.

On a focused planned calendar event or Gantt handle, Alt+Left/Right changes the
date by a day and Shift changes the step to a week. In the calendar region,
Alt+Left/Right navigates, Alt+T returns to today and Alt+1 through Alt+4 select
day/week/month/agenda. Text fields retain their normal shortcuts. Escape cancels
an active gesture. Touch and keyboard alternatives remain available through
the shared card editor; physical iPhone ergonomics still require device testing.
