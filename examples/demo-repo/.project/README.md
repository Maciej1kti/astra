# Dane prowadzenia projektu

Ten folder jest źródłem prawdy o pracy projektu, etapach i terminach.
Nie jest magazynem całej pracy agentów ani zależnością od otwartego UI.

`project.md` contains the stable ID, name, state and context.
`cards/<uuid>.md` describes a card work item; `milestones/<uuid>.md`
a milestone; `updates/<uuid>.md` a meaningful report. Each card has its own
file. `.local` contains runtime state only.

Pliki są UTF-8 z ograniczonym YAML front matter i body Markdown. Wersja
schematu jest w project.md. Nie ma aliasów, duplicate keys i custom tags.
ID/nazwa pliku są trwałe. Body nie jest parsowane jako status lub deadline.

Normalny zapis wykonuje CLI przez lokalny serwer. Odczytuj zasób wraz z version
przed edycją. Przy konflikcie nie pobieraj nowej version tylko po to, żeby
nadpisać cudzą zmianę. Timeout nie dowodzi niepowodzenia; sprawdź request ID.

Schedule start/end dates are inclusive. Deadlines and card review dates
are independent of the schedule. Moving a schedule does not move the deadline.
All-day dates do not shift with the phone timezone.

Agent dodaje tylko nowy istotny rezultat/przeszkodę/decyzję. Korekta albo
rozwiązanie jest nowym raportem odwołującym się do wcześniejszego. Odczyt
raportu nie jest rozwiązaniem decyzji. Plany implementacji zostają poza tym
folderem. Zmiany zakresu i zobowiązań wymagają polecenia człowieka.

Szerszy kontrakt jest dostarczany lokalnie z aplikacją; `projectctl validate`
sprawdza dane. Jeśli `.project` nie jest obsługiwane albo plik jest błędny,
zgłoś problem zamiast inicjalizować nową tablicę czy przepisywać zawartość.
Nie usuwaj danych na podstawie starego indeksu.

Backup tego folderu jest potrzebny także wtedy, gdy Git go ignoruje.
