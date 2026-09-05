# Dane prowadzenia projektu

Ten folder jest źródłem prawdy o rezultatach, etapach i terminach projektu.
Nie jest magazynem całej pracy agentów ani zależnością od otwartego UI.

`project.md`: trwałe ID, nazwa, stan, faza i kontekst. `cards/<uuid>.md`:
rezultat lub decyzja. `milestones/<uuid>.md`: kamień milowy. `updates/<uuid>.md`:
istotny raport. Jedna karta to jeden plik. `.local` jest tylko wykonawcze.

Pliki są UTF-8 z ograniczonym YAML front matter i body Markdown. Wersja
schematu jest w project.md. Nie ma aliasów, duplicate keys i custom tags.
ID/nazwa pliku są trwałe. Body nie jest parsowane jako status lub deadline.

Normalny zapis wykonuje CLI przez lokalny serwer. Odczytuj zasób wraz z version
przed edycją. Przy konflikcie nie pobieraj nowej version tylko po to, żeby
nadpisać cudzą zmianę. Timeout nie dowodzi niepowodzenia; sprawdź request ID.

Plan `schedule.start/end` ma obie daty włączne. Deadline `due` jest odrębny.
`review_on` oznacza ponowne zajęcie się tematem. Zmiana planu nie przesuwa
terminu. Daty są całodniowe i nie przesuwają się w strefie telefonu.

Agent dodaje tylko nowy istotny rezultat/przeszkodę/decyzję. Korekta albo
rozwiązanie jest nowym raportem odwołującym się do wcześniejszego. Odczyt
raportu nie jest rozwiązaniem decyzji. Plany implementacji zostają poza tym
folderem. Zmiany zakresu i zobowiązań wymagają polecenia człowieka.

Szerszy kontrakt jest dostarczany lokalnie z aplikacją; `projectctl validate`
sprawdza dane. Jeśli `.project` nie jest obsługiwane albo plik jest błędny,
zgłoś problem zamiast inicjalizować nową tablicę czy przepisywać zawartość.
Nie usuwaj danych na podstawie starego indeksu.

Backup tego folderu jest potrzebny także wtedy, gdy Git go ignoruje.
