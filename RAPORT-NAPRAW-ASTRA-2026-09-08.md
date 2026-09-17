# Astra — raport zbiorczych napraw po audycie

Pakiet napraw jest zaimplementowany i sprawdzony na wersji release, z prawdziwym serwerem aplikacji, plikami projektów oraz danymi syntetycznymi. Najpierw powstały zmiany w całej aplikacji, następnie wykonano testy integracyjne i przegląd wizualny.

## Naprawione usterki

| Problem z audytu | Obecne zachowanie |
| --- | --- |
| A01: przypinanie usuwa niezapisany szkic | Przypięcie i odpięcie zachowuje otwarty edytor, tytuł i opis. Dane karty zapisują się po wybraniu zapisu. |
| A02: zapis tytułu zmienia tag z przecinkiem | Tagi są osobnymi ciągami znaków. Przecinek, Unicode oraz istniejące spacje pozostają zachowane. |
| A03: typ z Listy przenosi się do innych widoków | Tablica, kalendarz i oś czasu dodają karty. Wybór kamieni milowych obowiązuje w Liście. |
| A04: brak dostępu do archiwum | Lista ma wybór kart aktywnych/archiwalnych oraz filtry statusu, priorytetu i dokładnego tagu. Kartę można otworzyć i przywrócić. |
| A05: kalendarz rozciąga się na kilka ekranów | Miesiąc ma ograniczoną wysokość i listę nadmiarowych wydarzeń. Telefon domyślnie pokazuje przewijaną agendę; siatka pozostaje dostępna. |
| A06: odświeżenie resetuje datę i układ | Data i układ kalendarza są zapisane w adresie i odtwarzane po odświeżeniu. |
| A07: Wstecz nie odtwarza widoku | Historia przeglądarki obsługuje widoki i zasoby. Niezapisany szkic jest chroniony, również gdy po Wstecz użytkownik wybierze zapis. |
| A08: brak wylogowania na telefonie | Przycisk jest dostępny w górnym pasku; test potwierdził rzeczywiste zakończenie sesji. |
| A09: Focus ignoruje projekt i wyszukiwanie | Przypięte karty respektują wybór projektu i tytułu. Powody wymagające uwagi są grupowane dla jednej karty. |
| A10: nieczytelna walidacja tagów | Duplikaty, przekroczenie liczby lub długości tagów wyświetlają komunikat przy właściwym polu. |
| A11: naruszenie polityki stylów tablicy | Usunięto problematyczny wrapper motywu. Polityka CSP pozostaje bez osłabienia. |
| A12: rozbieżne „Dzisiaj” | Kalendarz korzysta z daty i strefy przestrzeni roboczej; data aktualizuje się również w stale otwartej aplikacji. |

## Ujednolicenie interfejsu i dodatkowe poprawki

Tablica, Lista i Focus korzystają ze wspólnej prezentacji metadanych. Priorytet ma nazwę, blokada pokazuje powód, a termin twardy, termin docelowy, zaplanowany zakres i przegląd są rozróżnione. Poprawiono odstępy, kontrast i granice kart w ciemnym motywie oraz zawijanie długich tagów i tytułów.

Edytor ma czytelniejszą strukturę: opis, planowanie, powiązania z nazwami zasobów, cykl życia i wpisy dotyczące karty. Tagi mają osobne elementy z usuwaniem, podpowiedziami z projektu oraz obsługą klawiatury. Identyfikatory techniczne są schowane w dodatkowych szczegółach.

Na telefonie aktywna zakładka pozostaje widoczna po wejściu przez link i zmianie szerokości. Oś czasu zachowuje widoczną informację o wybranej karcie podczas przewijania. Ustawienia i kolejność Focus otrzymały czytelne stany ładowania, zapisu i niepewnego wyniku, ochronę szkicu, skróty klawiaturowe oraz mieszczące się w ekranie przyciski.

Podczas integracji poprawiono też zasłanianie wydarzeń w mobilnej agendzie, dostępną nazwę zamknięcia listy nadmiarowych wydarzeń, wyszukiwanie tagów z istniejącymi spacjami oraz opóźnione odpowiedzi serwera otwierające kartę już po zmianie widoku/projektu.

## Wyniki sprawdzenia

- Kontrola kontraktów, Svelte i TypeScript: **0 błędów, 0 ostrzeżeń**.
- Kompilacja frontendu i wersji release: **zaliczona**.
- Testy pomocnicze: **25/25**.
- Edytor, tagi, archiwum, filtry i nawigacja: **15/15**.
- Tablica, ustawienia, Focus i mobilne wylogowanie: **6/6**.
- Kontrole kalendarza i osi czasu: **zaliczone**, 7 punktów kontrolnych ze zrzutami.
- Obie utrzymywane regresje przeglądarkowe: **zaliczone**.

Sprawdzono rzeczywiste zapisy, konflikty wersji, utratę odpowiedzi już po zatwierdzonym zapisie, bezpieczne ponowienie tej samej komendy, cofanie, przeciąganie, zmianę obu granic planu, anulowanie gestów, przewijanie dotykowe, kolejność z klawiatury, paginację, aktualizacje plików oraz utratę sesji z zachowaniem szkiców. W końcowych kontrolach tablicy i planowania nie wystąpiły błędy JavaScript ani naruszenia CSP.

Przy tych samych 56 elementach kalendarz na komputerze zmalał z **3234 px do 742 px**, a dokument z 3822 do 1182 px. Mobilna agenda ma **606 px** wysokości, opcjonalna siatka 742 px. Sprawdzono nie tylko obecność wydarzeń, ale również widoczność, klikalność i przewinięcie do ostatniego wydarzenia. Zrzuty tablicy obejmują szerokości 1440, 390 i 320 px oraz jasny i ciemny motyw.

## Co pozostaje osobnym etapem

To jest rozbudowany pakiet napraw i uspójnień istniejącej aplikacji. Nadal potrzebny jest projekt pełniejszego modelu karty: m.in. strukturalne checklisty, odpowiedzialność/wykonawcy, szablony i pola własne. Obecny edytor tagów nie jest jeszcze centralnym słownikiem z trwałymi identyfikatorami, scalaniem i globalnym zmienianiem nazw. Te braki pozostają w planie z audytu; nie są oznaczone jako zrealizowane przez samą poprawę wyglądu.

Testy wykonano w Chromium, także z emulacją telefonu. Nie zastępuje to odbioru na fizycznym iPhonie ani w Safari. Wyjątek dla certyfikatu samopodpisanego dotyczył wyłącznie odizolowanych przeglądarek testowych; wymagania SSL aplikacji nie zostały wyłączone.

Pełna dokumentacja techniczna, wyniki JSON, scenariusze i **52 zrzuty** znajdują się w [raporcie w repozytorium](progress/fixes-2026-09-08/README.md).

Commit: `52c40f4` — wysłany do `origin/main`. Repozytorium po zapisie i wysłaniu jest czyste.
