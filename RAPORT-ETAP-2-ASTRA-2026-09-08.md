# Astra — raport etapu 2, 8 września 2026

Wdrożono kolejny pakiet po naprawach interfejsu: rozbudowany model karty i centralne zarządzanie tagami. Zmiany obejmują dane, walidację, API, CLI, wyszukiwanie i interfejs. Testy wykonano na prawdziwym serwerze aplikacji z izolowanymi danymi syntetycznymi.

Commit `1716637` został wypchnięty do `origin/main`. Po pushu lokalny HEAD i `origin/main` wskazują ten sam commit, a repozytorium jest czyste.

## Karta

- **Oczekiwany rezultat** jest osobnym polem, oddzielonym od opisu i materiałów pomocniczych.
- **Kryteria akceptacji** mają tekst, trwały identyfikator, kolejność i stan ukończenia. Można dodawać, poprawiać, odhaczać, usuwać i przestawiać pozycje. Walidacja wskazuje błędne pole.
- **Postęp** jest widoczny w szczegółach oraz wspólnych podsumowaniach kart. Ukończenie wszystkich kryteriów nie zmienia automatycznie statusu karty.
- **Osoba odpowiedzialna** jest opcjonalną etykietą tekstową. Nie wprowadzano kont zespołowych ani uprawnień organizacyjnych.
- **Raport z karty** można dodać bez opuszczania edytora: wynik, blokadę, potrzebną decyzję lub notatkę. Raport zapisuje się osobno, a niezapisane zmiany karty pozostają w edytorze.
- **Dwa szkice** są chronione przy zamknięciu, cofnięciu w przeglądarce, utracie sesji i niepewnym wyniku zapisu. Kopiowanie szkicu obejmuje identyfikatory nierozstrzygniętych komend.
- **Wyszukiwanie i CLI** uwzględniają rezultat, osobę odpowiedzialną i kryteria. Kontekst dla CLI nie obcina po cichu listy kryteriów — jeśli karta nie mieści się w limicie, wskazuje konieczność osobnego odczytu.

Najprostsze tworzenie karty nadal wymaga tylko tytułu. Istniejące karty nie zostały automatycznie przepisane do nowego formatu.

## Tagi

W ustawieniach obszaru roboczego dostępny jest przycisk **Manage tags**. Menedżer pozwala utworzyć wspólną nazwę, wyszukać tag, zobaczyć liczbę kart i użycie w poszczególnych projektach, włączyć zastany tag do katalogu oraz usunąć nieużywany wpis. Podpowiedzi w edytorze korzystają również z katalogu całego obszaru roboczego.

Zmiana i scalanie nazw mają następujący przebieg:

1. Wybór nazwy źródłowej i docelowej.
2. Podgląd konkretnych kart i wynikowych tagów.
3. Zapis każdej karty z wersją odczytaną podczas podglądu.
4. Osobne pokazanie zapisanych kart, konfliktów i niepewnych wyników.
5. Ponowny podgląd konfliktów jako jawna decyzja użytkownika.
6. Zakończenie zmiany katalogu dopiero po sprawdzeniu kompletności i braku pozostałych użyć starej nazwy.

Archiwalne karty są uwzględnione. Projekty archiwalne zachowują dotychczasową blokadę edycji; trzeba je przywrócić przed zmianą kart. Niedostępne i niepoprawne źródła są pokazywane jako ograniczenie kompletności.

Niepołączone etykiety, przecinki, wielkość liter i historyczny zapis Unicode są zachowane. Nowo wpisywane nazwy tracą zewnętrzne spacje, ale wybranie już istniejącej nazwy zachowuje jej dokładną pisownię, także spacje. Nie wprowadzono automatycznego scalania podobnych nazw.

Operacja obejmująca wiele kart nie jest jedną transakcją. Jeśli część kart zapisano, a późniejsza karta ma konflikt, wcześniejsze zapisy pozostają i mają własną historię. Ponowienie nierozstrzygniętego zapisu zachowuje tę samą komendę; nie wykonuje automatycznego nadpisania nowszych danych.

## Wyniki testów

| Zakres | Wynik |
| --- | --- |
| Schematy, OpenAPI, przykłady, specyfikacja | Poprawne |
| Testy Rust, w tym trwałość i odzyskiwanie zapisu | 92 zaliczone |
| Testy JavaScript | 32 zaliczone |
| Testy pomocnicze Python | 4 zaliczone |
| Kontrola Svelte i TypeScript | 0 błędów, 0 ostrzeżeń |
| Formatowanie Rust i Clippy | Poprawne |
| Build produkcyjny WWW i release serwera | Poprawne |
| Nowe scenariusze przeglądarkowe kart | 9/9 |
| Nowe scenariusze przeglądarkowe tagów | 6/6 |
| Pełny dotychczasowy test przeglądarkowy | Zaliczone |
| Regresja kalendarza i osi czasu | Zaliczone |

Testy sprawdziły m.in. zachowanie trwałych identyfikatorów po przestawieniu kryteriów, brak automatycznego zamykania karty, usuwanie opcjonalnych pól, zapis raportu przy niezapisanej karcie, ochronę szkicu przy cofnięciu, utratę odpowiedzi po rzeczywistym zapisie oraz brak zduplikowanych raportów i historii po ponowieniu.

Dla tagów sprawdzono podpowiedź między projektami, scalanie kart aktywnych i archiwalnych, zachowanie innych etykiet, zmianę karty przez drugiego klienta pomiędzy podglądem a zapisem, częściowy wynik, odzyskanie komendy oraz konflikt wersji katalogu. Backend sprawdza również źródła poza pierwszą stroną wyników i ograniczenie podglądu do 500 zmian.

Pierwszy test przeglądarkowy wykrył niejednoznaczną nazwę dostępności pola rodzaju raportu. Poprawiono ją i ponownie zaliczono cały zestaw. Pierwszy przebieg testów backendu skorygował także błędne oczekiwanie nowego testu dotyczące odpowiedzi po ponowieniu konfliktu — nie zmieniano zasad zapisu w celu przejścia testu.

Testowano Chromium 153.0.8010.12 na macOS Apple Silicon, także przy szerokości 390 px i w ciemnym motywie. Nowe scenariusze nie zgłosiły błędów JavaScript. Test kart nie wykazał naruszeń CSP ani poziomego przepełnienia strony na telefonicznym widoku. Przeprowadzono również oględziny reprezentatywnych zrzutów. Nie jest to test fizycznego iPhone’a ani Safari.

HTTPS pozostał wymagany. Wyjątek dla samopodpisanego certyfikatu istniał tylko w kontekście testowej przeglądarki. Cookies, dane połączenia i robocze wejścia komend pozostały poza repozytorium.

## Co zostało na późniejsze etapy

1. Filtrowanie po wielu tagach z jasnym wyborem „dowolny” lub „wszystkie” oraz zapisane widoki.
2. Dostępne kolory tagów i dalsze dopracowanie pracy z dużym katalogiem.
3. Szablony i duplikowanie kart oraz lepsza prezentacja załączników i dowodów wykonania.
4. Szybkie dodawanie sprostowania lub rozwiązania konkretnego raportu bezpośrednio z karty; obecnie dostępne przez istniejący edytor Updates.
5. Odbiór na fizycznym iPhonie/Safari, test pakietu po aktualizacji i szersze pomiary na dużych obszarach roboczych.

Pełne dowody i anglojęzyczny raport wersjonowany: [progress/stage2-2026-09-08/README.md](progress/stage2-2026-09-08/README.md). Ten etap zamyka konkretny zakres modelu karty i zarządzania tagami, ale nie oznacza realizacji każdej funkcji z porównania konkurencyjnych narzędzi.
