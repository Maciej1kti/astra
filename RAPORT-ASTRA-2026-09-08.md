# Astra — audyt działania i plan dopracowania UI

**Data:** 8 września 2026. **Wersja:** `c3b912f`, świeży build produkcyjny frontendu i serwera.

**Ocena:** podstawowe mechanizmy aplikacji działają, ale produkt wymaga istotnych poprawek w spójności, organizacji informacji i bezpieczeństwie szkiców. Najpilniejsze są: utrata niezapisanej treści po przypięciu karty, zmiana tagów przy edycji innego pola, błędny kontekst tworzenia elementu, brak dostępu do archiwum i niepraktyczny kalendarz miesiąca. Samo ujednolicenie kolorów nie rozwiąże tych problemów.

Zgodnie z Twoją uwagą **brak pełnego modelu karty** i **brak sensownej obsługi tagów** są osobnymi, ważnymi pozycjami planu. Obecna struktura danych zawiera karty i etykiety, ale ich obecność nie oznacza jeszcze dopracowanej funkcji użytkowej.

## Zakres i wiarygodność testów

Testy wykonano w Chromium 153 przez Playwright 1.63 na macOS, na prawdziwym serwerze Astra i rzeczywistych zapisach przez UI oraz CLI. Użyto osobnej instancji z syntetycznymi danymi, zwykłego parowania przeglądarki i HTTPS. Certyfikat testowy zaakceptowano wyłącznie w sesjach testowych, zgodnie z Twoją zgodą. Nie wyłączano zabezpieczeń w kodzie aplikacji.

Początkowy zestaw danych obejmował **3 projekty, 37 kart, 2 kamienie milowe i 4 aktualizacje**. Były w nim wszystkie statusy i priorytety, zależności, blokady, terminy przekroczone, daty przeglądu, zadania bez planu, długi tytuł, polskie znaki i pusty projekt. Podczas testów dodano kolejne elementy. Osobny scenariusz regresji sprawdzał kolumnę z 51 kartami oraz granice stronicowania.

Sprawdzono siedem widoków: Focus, Projects, Board, Calendar, Timeline, List i Updates. Wersje jasną i ciemną oceniono na szerokościach 1440 i 390 px po zakończeniu ładowania danych; dodatkowe pomiary układu objęły 320, 768 i 1280 px. Testy dotyku korzystały z emulacji iPhone 13 w Chromium. To nie jest test fizycznego iPhone’a ani Safari.

| Weryfikacja | Wynik |
|---|---|
| Build frontendu i serwera release | Zakończony poprawnie |
| Kontrola typów i wygenerowanych kontraktów | 0 błędów i 0 ostrzeżeń Svelte |
| Testy pomocnicze Node | 7/7 zaliczonych |
| Pełny zestaw regresji UI | Zaliczony, kod zakończenia 0 |
| Pełny zestaw regresji planowania | Zaliczony, kod zakończenia 0 |
| Audyt dodatkowych scenariuszy i wyglądu | Wykryte problemy opisane poniżej |

Przejście regresji nie oznacza braku błędów. Dotychczasowe testy przypinają zapisaną kartę, nie sprawdzają etykiety zawierającej przecinek ani pełnego powrotu do archiwum. Nowe przypadki ujawniły luki poza zakresem tamtych testów. Nie podaję sztucznego procentu „sprawności”: część prób mierzyła działanie, część dokumentowała braki, a błędy przygotowania testu zostały wyraźnie oddzielone od błędów aplikacji.

## Najważniejsze odtworzone problemy

**P1** oznacza ryzyko dla danych/szkicu albo poważną przeszkodę w podstawowej pracy. **P2** oznacza istotny problem zachowania, zrozumiałości lub integracji.

| ID | Priorytet | Jak odtworzyć i co się dzieje | Co powinno działać |
|---|---|---|---|
| A01 | P1 | Otwórz kartę, zmień tytuł bez zapisu, kliknij Pin to focus. Edytor zamyka się, wpisana treść znika, pozostaje stary zapis. | Przypięcie nie może usuwać szkicu ani sugerować, że zapisano jego pola. Edytor powinien zachować treść lub jawnie zapytać o zapis/odrzucenie. |
| A02 | P1 | Zapisz przez CLI jeden poprawny tag `Research, discovery`. W UI zmień tylko tytuł. Po zapisie powstają dwa tagi: `Research` i `discovery`. | Niezmieniane etykiety muszą pozostać identyczne. Potrzebna jest kontrolka tagów, która nie serializuje ich niejednoznacznie przez przecinki. |
| A03 | P1 | W Liście wybierz Milestones, potem przejdź na Board. Główna akcja zmienia się na Add milestone. | Typ tworzonego elementu ma wynikać z bieżącego widoku. Ustawienie kolekcji z Listy nie powinno sterować akcją Tablicy. |
| A04 | P1 | Zarchiwizuj kartę i spróbuj odnaleźć ją w Liście lub wyszukiwaniu. Nie ma widocznej drogi do archiwum. | Wyszukiwalne archiwum i Przywróć, dostępne bez CLI i bez zapamiętanego bezpośredniego linku. Dane nadal istnieją; problem dotyczy obsługi, nie usunięcia pliku. |
| A05 | P1 | Otwórz miesiąc z zatłoczonym tygodniem. Wszystkie tygodnie, również puste, stają się ogromne. | Ograniczona wysokość miesiąca, `+N więcej`, panel dnia/agenda i dostęp do wszystkich wpisów bez rozciągania pustych tygodni. |
| A06 | P2 | W kalendarzu wybierz tydzień i 13.10.2026, odśwież. Wraca miesiąc i 01.09.2026. | Zachowanie okresu i układu przy odświeżeniu, powrocie i udostępnianiu adresu. |
| A07 | P2 | Przejdź Focus → Board → Calendar i naciśnij Wstecz przeglądarki. Nie wraca do Board; w teście wrócił wcześniejszy Updates. | Nawigacja po widokach i kartach powinna tworzyć sensowną historię. |
| A08 | P2 | Zmniejsz szerokość do 390 px. Sign out znika razem ze stopką panelu bocznego. | Jawne menu konta/workspace z wylogowaniem i informacją o hoście na telefonie. |
| A09 | P2 | Przypnij kartę z drugiego projektu. W Focus wybierz pierwszy projekt i filtr innego tytułu. Obca przypięta karta nadal jest widoczna. | Jeden zrozumiały zakres filtrów albo wyraźny podział na globalny Focus i uwagę dotyczącą wybranego projektu. |
| A10 | P2 | Wpisz tagi `qa, qa`. Zapis jest odrzucony komunikatem o niepoprawnych datach i dodatkowych polach. | Zapobieganie duplikatom albo błąd bezpośrednio przy polu Tagi, wskazujący przyczynę. |
| A11 | P2 | Załaduj Board. W konsoli pojawia się blokada stylu inline przez CSP, również w obu motywach i szerokościach. | Naprawa zgodności komponentu ze style-src; nie wyłączanie CSP. Nie przypisuję temu ostrzeżeniu konkretnego błędu przeciągania bez dowodu. |
| A12 | P2 | Ustaw strefę przeglądarki Pacific/Honolulu. Workspace pokazuje 08.09, a Calendar Today wybiera 07.09. | Wszystkie operacje „Dzisiaj” powinny używać daty workspace. |

Dowody i pełne wyniki znajdują się w [raporcie technicznym](progress/audit-2026-09-08/README.md) oraz [opisie interpretacji testów](progress/audit-2026-09-08/checks/RESULTS.md). Błędu utraty szkicu nie należy utożsamiać z uszkodzeniem wcześniej zapisanej treści; w A01 znikają niezapisane zmiany. A02 dotyczy już niezamierzonej zmiany zapisanych tagów.

## Co faktycznie działa

| Obszar | Potwierdzone działanie i istotne ograniczenie |
|---|---|
| Projekty i połączenie | Parowanie przeglądarki, przeglądanie zatwierdzonych folderów i rejestracja z zapisem plików. Natywne okno wyboru folderu było zastąpione kontrolowaną odpowiedzią w regresji. |
| Tworzenie i edycja | Utworzenie karty przez UI, zapis i odświeżenie. Wymagany tytuł i poprawność zakresu dat są pilnowane. Kamień milowy utworzony w UI da się wyszukać po nazwie i przypisać do karty. |
| Ochrona zmian | Zamknięcie zmienionego formularza wymaga jawnego odrzucenia. Konflikt dwóch kart przeglądarki chroni pierwszy zapis i zachowuje drugi szkic. Wyjątkiem jest A01. |
| Utrata połączenia | Rzeczywisty tryb offline przeglądarki blokuje zapis, ale pozostawia szkic i Retry same command. Po przywróceniu sieci jawne ponowienie zapisuje zmianę. |
| Tablica | Przeciąganie całej karty, przenoszenie między statusami, kolejność w kolumnie, skróty klawiaturowe, podgląd miejsca upuszczenia, szybkie tworzenie, zwijanie kolumn i pamięć przewijania. |
| Trudniejsze gesty | Konflikt podczas przeciągania, ponowienie tej samej komendy, automatyczne przewijanie przy krawędzi, anulowanie gestu, granice stron, emulowany długi dotyk i zwykłe przewijanie palcem. |
| Kalendarz | Dzień/tydzień/miesiąc/agenda, tworzenie z datą, przesuwanie planu, zmiana obu granic zakresu, klawiatura i anulowanie. Poprawność tych działań nie usuwa problemów układu i nawigacji. |
| Oś czasu | Zależności, łączenie/rozłączanie, odrzucenie cyklu, prognoza zakończenia, przesunięcia i zmiana długości planu. Prognoza nie zmienia zapisanych terminów. |
| Aktualizacje i historia | Tworzenie aktualizacji, oznaczanie przeczytania, filtr nieprzeczytanych, cofnięcie zwykłej zapisanej zmiany, przypinanie i układanie Focus. |
| Treść i motywy | Wyszukiwanie po opisie działa w Liście; Markdown formatuje tekst i blokuje wykonywanie skryptów oraz obrazy zdalne. Motyw ciemny zachowuje się po odświeżeniu. |

Nie było nieprzechwyconych wyjątków JavaScript w opisanych przebiegach. Ostrzeżenie CSP na Tablicy jest osobnym wynikiem. Początkowe odpowiedzi 401 podczas parowania oraz celowo wstrzyknięte 503 w testach ponawiania nie oznaczają przypadkowych awarii normalnej pracy.

## Wygląd, gęstość informacji i telefon

**Kalendarz jest najpilniejszym problemem wizualnym.** Dla 56 widocznych zdarzeń sam kalendarz ma 3234 px wysokości na desktopie i 4037 px przy szerokości 390 px. Cały dokument ma odpowiednio 3822 i 4756 px. Pusty pierwszy tydzień zajmuje ogromne miejsce przed właściwą pracą. Na telefonie miesiąc zachowuje płótno 640 px, więc użytkownik widzi tylko część dni tygodnia i musi przewijać również poziomo.

[Zobacz kalendarz desktop](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/audit-2026-09-08/screenshots/verified-light-1440-calendar.png) · [Zobacz kalendarz przy 390 px](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/audit-2026-09-08/screenshots/verified-light-390-calendar.png).

**Oś czasu na telefonie traci kontekst.** Kolumna nazw kart znika, a przy widocznym fragmencie kilku dni wiersze z paskami poza ekranem wyglądają jak puste. Podsumowania, ostrzeżenia i instrukcje spychają wykres poniżej pierwszego ekranu. Potrzebna jest stale dostępna nazwa wybranej karty i prosta nawigacja po czasie.

**Powtarzany nagłówek zajmuje za dużo miejsca.** Duży tytuł, hasło, opis, osobny przycisk dodawania, wybór projektu i kolejne kontrolki tworzą stos. Przy szerokości 390 px Tablica zaczyna się około y=397, kalendarz około y=613, a właściwy wykres Timeline jeszcze niżej. W codziennym narzędziu więcej miejsca powinny dostać dane i działania.

**Widoki nie pokazują tej samej karty w spójny sposób.** Board pokazuje pilność, blokadę i tagi; List głównie tytuł, status i termin. Focus powtarza tę samą kartę osobno dla opóźnienia, blokady i przeglądu. Warto grupować powody uwagi pod jedną kartą i jasno rozróżnić liczbę kart od liczby sygnałów.

**Nawigacja mobilna wymaga zmiany.** Aktywny Updates może pozostawać poza widoczną częścią paska. Przy 320 px długa nazwa projektu wychodzi pionowo poza nagłówek. Brak wylogowania opisano w A08. Sam brak poziomego przepełnienia całego dokumentu nie oznacza jeszcze dobrego UI telefonu.

**Motyw ciemny jest funkcjonalny, ale nie w pełni dopracowany.** Część granic kart na Board słabo oddziela się od kolumn, a niektóre ikony tracą czytelność. Statusy i priorytety mają zbyt podobny wygląd, również w jasnym motywie. Potrzebne są wspólne semantyczne kolory, ikony i pomiary kontrastu, nie arbitralne kolorowanie każdej sekcji.

Pełny [przegląd wizualny](progress/audit-2026-09-08/visual-review.md) zawiera odnośniki do wszystkich istotnych zrzutów. Rozstrzygające są pliki `verified-*`, zrobione po zakończeniu ładowania; wcześniejsze puste kadry podczas ładowania nie są dowodem braku danych.

## Brak pełnego modelu karty

Karta powinna być podstawowym miejscem pracy nad rezultatem lub decyzją. Obecnie przypomina przede wszystkim rozbudowany formularz metadanych. Docelowy model powinien obejmować:

- **Treść:** tytuł, cel/oczekiwany rezultat, opis i warunki akceptacji. Przy tworzeniu wystarczy tytuł; reszta ma być dostępna stopniowo.
- **Właściwości:** status, priorytet, tagi i czytelny stan blokady, obsługiwane tymi samymi kontrolkami w całej aplikacji.
- **Planowanie:** jednoznaczne rozróżnienie zakresu pracy, terminu docelowego, twardego deadline’u i daty przeglądu.
- **Relacje:** kamień milowy, poprzednicy i następcy z nazwami oraz możliwością przejścia do powiązanego elementu.
- **Kontekst pracy:** aktualizacje dotyczące tej karty, wyniki, nierozstrzygnięte decyzje, rozwiązania i historia zmian.
- **Działania:** spójne przypinanie, zmiana statusu, planowanie, dodanie aktualizacji, kopiowanie linku, archiwizacja i przywracanie. Duplikowanie i szablony jako kolejne rozszerzenia.
- **Cykl życia:** jasne rozróżnienie szkicu, zapisywania, zapisu potwierdzonego, niepewnego wyniku i konfliktu. Działanie poboczne nie usuwa wpisanej treści.

Interaktywna checklista akceptacyjna wymaga zaprojektowania modelu; nie należy udawać jej samym tekstem Markdown ani automatycznie uznawać wyniku za przyjęty po odhaczeniu pozycji. Hierarchia podzadań i współpraca zespołowa nie powinny pojawić się przypadkiem jako warunek dopracowania karty.

**Kryterium odbioru:** użytkownik tworzy kartę, opisuje oczekiwany rezultat, ustawia właściwości, wiąże element po nazwie, dodaje aktualizację, przypina bez utraty szkicu i później odnajduje/przywraca archiwum. Nie potrzebuje kopiowania UUID ani edycji JSON.

## Brak sensownej obsługi tagów

Pole z tekstem oddzielanym przecinkami nie jest wystarczającą obsługą tagów. Docelowo potrzebne są:

| Element | Wymaganie |
|---|---|
| Wybór | Wielokrotny wybór z wyszukiwaniem, podpowiedziami i usuwalnymi znacznikami; jawne Utwórz tag. |
| Nazwy | Spójne reguły pustych nazw, spacji, duplikatów, wielkości liter i Unicode; istniejące dane nie mogą zmieniać się przy edycji tytułu. |
| Zakres | Jasna decyzja, czy słownik jest wspólny dla workspace czy projektowy. Proponuję wspólny słownik z widokiem użycia w projektach; sposób zapisu i referencji wymaga odrębnego kontraktu. |
| Wygląd | Te same nazwy i znaczniki w edytorze, Tablicy i opcjonalnych kolumnach Listy; kolor pomocniczy, nigdy jedyny nośnik znaczenia. |
| Wyszukiwanie | Filtry tagów działające w całym wybranym zakresie, z czytelnym „dowolny z” / „wszystkie”, również dla kart poza pierwszą stroną. |
| Zarządzanie | Wyszukanie tagu, liczba użyć, zmiana nazwy i łączenie z podglądem skutków. Usunięcie z jednej karty musi różnić się od zmiany całego słownika. |
| Bezpieczne operacje | Zachowanie pozostałych tagów i wersji kart, raport konfliktów oraz częściowych wyników przy zmianach obejmujących wiele zasobów. |

**Kryterium odbioru:** dodanie istniejącego i nowego tagu, pojedyncze usunięcie, kontrola duplikatów, polskie znaki, filtrowanie pojedyncze i wielokrotne, odnalezienie karty poza pierwszą stroną oraz bezpieczna zmiana nazwy/łączenie. Obecne limity 20 tagów na kartę i 48 znaków nazwy powinny być jasno komunikowane, dopóki nie zostaną świadomie zmienione.

## Plan ujednolicenia UI

Przyjmuję zasadę: częste działania pod ręką, rzadkie w sensownych menu kontekstowych. Menu powinno odpowiadać zakresowi: workspace, projekt, widok albo karta. Nie powinno być jednego przeładowanego menu na wszystko.

| Etap | Zmiana | Warunek ukończenia |
|---|---|---|
| 0. Ochrona pracy | Naprawa szkiców i tagów, poprawny typ dodawania, dostęp do archiwum, spójność dat i zakresów. | Odtworzone przypadki A01–A04 mają regresje; nowe zachowanie nie omija kontroli wersji ani tożsamości ponawianej komendy. |
| 1. Czytelne planowanie | Ograniczenie wzrostu miesiąca, panel dnia/więcej wydarzeń, zachowanie okresu, widoczna tożsamość karty na osi czasu. | Zatłoczony zestaw testowy pozostaje używalny na 1440 i 390 px; wszystkie wpisy są dostępne. |
| 2. Wspólny model karty | Jeden edytor/inspektor, działania, relacje po nazwach, treść i akceptacja, powiązane aktualizacje. | Pełna zwykła praca z kartą bez JSON/UUID i bez utraty szkicu. |
| 3. Tagi i znajdowanie | Kontrolka tagów, słownik i reguły, filtry, archiwum, sortowanie, prawdziwy zakres wyszukiwania. | Ta sama karta jest znajdowana niezależnie od stronicowania; filtry mają takie samo znaczenie między zgodnymi widokami. |
| 4. Wspólny wygląd i nawigacja | Semantyczne kolory, typografia, odstępy, przyciski, formularze, komunikaty i menu; kompaktowy nagłówek i dostępne konto na telefonie. | Jasny/ciemny motyw oraz 390/768/1280/1440 px bez ukrytych działań; spójne badge’e i mierzalna czytelność. |
| 5. Wydajna praca i odbiór | Zapisane widoki, komendy klawiaturowe, szablony/duplikowanie, operacje zbiorcze; ponowne testy interakcji i urządzeń. | Te same gesty, konflikty, klawiatura i przywracanie kontekstu nadal działają po przebudowie UI. Osobny test fizycznego telefonu. |

Na widoku pozostawić: projekt, tytuł widoku, podstawowe dodawanie, wyszukiwanie/filtry oraz potrzebne sterowanie datami. W karcie: tytuł, status, istotny termin, blokadę i podstawowe właściwości. Do menu/sekcji szczegółowych przenieść: diagnostykę, Git, surowe ID, rozszerzenia JSON, rzadkie ustawienia widoku i zarządzanie słownikiem. Zapis, błąd, konflikt i niezapisany szkic muszą pozostać widoczne.

## Braki na tle innych rozwiązań

Porównanie dotyczy oficjalnie opisanych możliwości produktów, nie testów zalogowanych kont ani konkretnych planów cenowych.

| Wzorzec | Wniosek dla Astry |
|---|---|
| [Filtry Linear](https://linear.app/docs/filters) i [Todoist](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH) | Wykorzystać istniejące parametry API w normalnym UI: status, priorytet, tag, milestone i archiwum. Ujednolicić zakres wyszukiwania. |
| [Widoki Linear](https://linear.app/docs/custom-views) i [opcje prezentacji](https://linear.app/docs/display-options) | Dodać zapisane kryteria, sortowanie, grupowanie i wybór kolumn. „Ten tydzień” powinien być dynamicznym warunkiem. |
| [Wielokrotny wybór Linear](https://linear.app/docs/select-issues) | Przyspieszyć zmianę priorytetu, tagów, przeglądu i archiwizacji wielu kart z osobnymi wynikami konfliktów. |
| [Szablony Trello](https://support.atlassian.com/trello/docs/creating-template-cards/) i [Linear](https://linear.app/docs/issue-templates) | Dodać duplikowanie do szkicu i proste szablony wyniku/decyzji po uporządkowaniu modelu karty. |
| [Archiwum Trello](https://support.atlassian.com/trello/docs/archiving-and-deleting-cards/) | Dokończyć istniejący cykl archiwizacji przez odnalezienie i przywrócenie. |
| [Zależności Asana](https://help.asana.com/s/article/managing-tasks-and-dependencies-with-timeline?language=en_US) | Poprawić czytelność relacji i wyjaśnienie prognozy; zależności i prognozowanie już są w Astrze. |

Nie należy przepisywać całych pakietów enterprise. Powtarzalność, time blocking, role zespołowe, załączniki, synchronizacja offline i powiadomienia push pozostają poza obecnym zakresem produktu. Wbudowane kopie/restore i ogólne migracje również są odłożone. Ich brak nie jest błędem aktualnej implementacji. Priorytetem są obecne codzienne działania i wyróżniki Astry: lokalny folder, wspólny model człowieka/CLI, świadome decyzje i bezpieczne zapisy.

## Granice audytu i materiały

Nie wykonano fizycznych testów iPhone/Safari, Firefox/WebKit, czytnika ekranu, numerycznego audytu kontrastu, klawiatury ekranowej, produkcyjnego TLS, rzeczywistego natywnego okna folderów, poprawnego repozytorium Git w widoku obserwacji, restartu/utraty zasilania ani długotrwałych testów dużej skali. Nie symulowano rzeczywistej utraty odpowiedzi już po trwałym zapisie. Część testów regresji celowo podstawia odpowiedź błędu; granice są opisane w dokumentacji dowodowej.

Najważniejszy następny krok to naprawa wykazanych przypadków i realizacja wspólnego modelu karty/tagów, a następnie ponowny odbiór na tym samym zatłoczonym zestawie danych. Na tym etapie wykonano audyt i plan; wskazane błędy nie zostały jeszcze naprawione w aplikacji.

- [Pełny raport techniczny i odtworzenia](progress/audit-2026-09-08/README.md)
- [Przegląd wizualny z dowodami](progress/audit-2026-09-08/visual-review.md)
- [Szczegółowy plan komponentów i interakcji](progress/audit-2026-09-08/ui-inventory-and-plan.md)
- [Wymagania modelu karty i tagów](progress/audit-2026-09-08/card-model-and-tags.md)
- [Pełne porównanie z konkurencją](progress/audit-2026-09-08/competitive-analysis.md)
- [Wyniki regresji](progress/audit-2026-09-08/regression/SUMMARY.md) i [rzeczywisty zakres testów](progress/audit-2026-09-08/checks/regression-coverage.md)
