export const messages: Record<string, string> = {
  VERSION_CONFLICT:
    "Ten element zmienił się od otwarcia. Wersja robocza została zachowana.",
  UNDO_TARGET_CHANGED:
    "Późniejsza zmiana uniemożliwia cofnięcie. Zapisany element nie został zmieniony.",
  EPOCH_CHANGED:
    "Stan serwera się zmienił. Sprawdź aktualny element przed rozpoczęciem nowego polecenia.",
  VALIDATION_FAILED:
    "Niektóre pola są nieprawidłowe. Sprawdź wprowadzone wartości.",
  WORKSPACE_RECOVERY_REQUIRED:
    "Przestrzeń robocza ma nierozstrzygnięty zapis. Sprawdź diagnostykę przed ponowieniem.",
  SESSION_REQUIRED: "Sesja wygasła. Połącz tę przeglądarkę ponownie.",
  USER_NOT_FOUND:
    "Ten użytkownik jest niedostępny. Otwórz domyślnego użytkownika, aby kontynuować.",
  USER_LIMIT_REACHED: "Osiągnięto limit użytkowników tego serwera.",
  PROJECT_SHARED:
    "Ten projekt jest współdzielony. Wyrejestruj go u pozostałych użytkowników przed usunięciem lub przeniesieniem.",
  SERVER_BUSY: "Serwer jest zajęty. Spróbuj ponownie za chwilę.",
  REQUEST_TIMEOUT:
    "Upłynął czas żądania. Sprawdź wynik pierwotnego polecenia przed ponowieniem zapisu.",
  RESOURCE_NOT_FOUND: "Nie znaleziono elementu.",
  PROJECT_UNAVAILABLE:
    "Projekt jest niedostępny. Sprawdź jego folder na serwerze.",
  PROJECT_ARCHIVED: "Projekt jest zarchiwizowany. Przywróć go przed edycją.",
  PROJECT_TREE_CHANGED:
    "Pliki projektu się zmieniły. Sprawdź aktualny podgląd przed ponowieniem.",
  PROJECT_DELETION_PENDING: "Usunięcie projektu oczekuje na rozstrzygnięcie.",
  PROJECT_CONTAINS_SERVER_STATE:
    "Folder projektu zawiera stan serwera i nie może zostać usunięty.",
  PROJECT_CONTAINS_REGISTERED_PROJECT:
    "Ten folder zawiera inny zarejestrowany projekt.",
  PROJECT_NOT_REGISTERED: "Projekt nie jest zarejestrowany.",
  PROJECT_DOCUMENT_MISSING: "Brakuje pliku źródłowego projektu.",
  PROJECT_DOCUMENT_INVALID: "Plik źródłowy projektu jest nieprawidłowy.",
  PROJECT_RECOVERY_REQUIRED: "Projekt wymaga odzyskania. Sprawdź diagnostykę.",
  REGISTRATION_RECOVERY_REQUIRED:
    "Rejestracja wymaga odzyskania. Sprawdź diagnostykę.",
  RECOVERY_REQUIRED: "Stan wymaga odzyskania. Sprawdź diagnostykę.",
  RECOVERY_ABANDONED:
    "Przerwany zapis został porzucony na serwerze. Zachowano aktualny plik; sprawdź go i w razie potrzeby wprowadź zmianę ponownie.",
  RECOVERY_PENDING:
    "Trwa odzyskiwanie stanu. Sprawdź wynik oczekującej operacji.",
  DOCUMENT_INVALID: "Plik źródłowy jest nieprawidłowy. Sprawdź diagnostykę.",
  NORMALIZATION_REQUIRED: "Plik źródłowy wymaga normalizacji na serwerze.",
  SOURCE_UNAVAILABLE: "Plik źródłowy jest niedostępny.",
  SOURCE_MISSING: "Brakuje pliku źródłowego.",
  SOURCE_DISAPPEARED: "Plik źródłowy zniknął od czasu odczytu.",
  SOURCE_DIAGNOSTICS:
    "Niektóre pliki źródłowe wymagają sprawdzenia. Otwórz diagnostykę.",
  PROJECTION_RECONCILING:
    "Serwer odświeża dane projektów. Wyniki mogą być chwilowo niekompletne.",
  PROJECTION_DEGRADED:
    "Niektóre dane są niedostępne. Sprawdź diagnostykę źródeł.",
  FOCUS_TARGET_ARCHIVED:
    "Ta przypięta karta jest zarchiwizowana. Sprawdź aktualny Focus.",
  NOT_FOUND: "Nie znaleziono elementu.",
  WORKSPACE_MISSING:
    "Brakuje pliku przestrzeni roboczej. Zatrzymaj serwer i przywróć go z własnego poprawnego źródła.",
  WORKSPACE_INVALID:
    "Plik przestrzeni roboczej jest nieprawidłowy. Zatrzymaj serwer i napraw go przed zapisem.",
  CLOCK_ROLLBACK:
    "Zegar serwera cofnął się. Popraw czas przed kolejnym zapisem; wyniki znanych poleceń pozostają dostępne.",
  FOCUS_INCOMPLETE: "Niektóre przypięte karty są niedostępne.",
  FOCUS_SOURCE_LIMIT:
    "Osiągnięto limit odczytu kart Focus. Zawęź wybór projektów.",
  FOCUS_LIMIT: "Osiągnięto limit przypiętych kart.",
  FOCUS_REFERENCE_CHANGED:
    "Przypięta karta się zmieniła. Sprawdź aktualny Focus.",
  FOCUS_MEMBERSHIP_CHANGED:
    "Lista przypiętych kart się zmieniła. Sprawdź aktualny Focus.",
  REFERENCE_CHANGED: "Powiązany element się zmienił. Sprawdź aktualne dane.",
  WORKSPACE_SOURCE_CHANGED:
    "Źródło przestrzeni roboczej się zmieniło. Sprawdź aktualne dane.",
  ORDER_CHANGED:
    "Kolejność zmieniła się gdzie indziej. Sprawdź aktualną kolejność.",
  ORDER_REBALANCE_REQUIRED: "Kolejność wymaga uporządkowania na serwerze.",
  CURSOR_STALE: "Dane tej strony się zmieniły. Wczytaj aktualną stronę.",
  PAGE_STALE: "Dane tej strony się zmieniły. Wczytaj aktualną stronę.",
  HISTORY_UNAVAILABLE: "Historia zmian jest niedostępna.",
  HISTORY_NOT_FOUND: "Nie znaleziono wpisu historii.",
  UNDO_CREATE_NOT_SUPPORTED: "Nie można cofnąć utworzenia elementu.",
  UNDO_DELETE_NOT_SUPPORTED: "Nie można cofnąć trwałego usunięcia.",
  UNDO_COMMENT_NOT_SUPPORTED: "Nie można cofnąć dodania komentarza.",
  UNDO_COUNTER_NOT_SUPPORTED: "Nie można cofnąć zapisu licznika.",
  IDEMPOTENCY_KEY_REUSED:
    "Identyfikator żądania został już użyty z innymi danymi. Sprawdź pierwotne polecenie.",
  REQUEST_OUTSIDE_WINDOW:
    "Upłynął czas ponowienia polecenia. Sprawdź jego wynik przed nowym zapisem.",
  PRECONDITION_REQUIRED: "Zapis wymaga odczytanej wersji elementu.",
  COMMAND_NOT_FOUND:
    "Nie znaleziono polecenia. Nie oznacza to, że zapis się nie powiódł.",
  JOB_NOT_FOUND: "Nie znaleziono zadania.",
  COMMAND_REJECTED: "Polecenie zostało odrzucone.",
  COUNTER_NOT_FOUND: "Nie znaleziono licznika.",
  COUNTER_ARCHIVED: "Licznik jest ukryty. Przywróć go przed zapisem wyniku.",
  COUNTER_UNIT_HAS_HISTORY:
    "Licznik ma zapisaną historię. Nie można zmienić jednostki.",
  COUNTER_SOURCES_OMITTED:
    "Nie udało się odczytać części liczników. Wyświetlono dostępne wyniki.",
  INVALID_COUNTER_DATE: "Wybierz prawidłową datę wyniku licznika.",
  INVALID_DATE_RANGE: "Wybierz prawidłowy zakres dat.",
  INVALID_TIMEZONE:
    "Wpisz prawidłową strefę czasową, na przykład Europe/Warsaw.",
  INVALID_JSON: "Dane JSON są nieprawidłowe.",
  INVALID_INPUT: "Wprowadzone dane są nieprawidłowe.",
  INVALID_USER: "Nieprawidłowy użytkownik.",
  USER_ALREADY_EXISTS: "Użytkownik o tym identyfikatorze już istnieje.",
  TAG_NAME_INVALID: "Nazwa tagu jest nieprawidłowa.",
  TAG_NAME_WHITESPACE: "Usuń spacje na początku i końcu nazwy tagu.",
  TAG_NAMES_IDENTICAL: "Wybierz inną nazwę tagu.",
  TAG_NOT_FOUND: "Nie znaleziono tagu.",
  TAG_RENAME_TOO_LARGE:
    "Zmiana nazwy obejmuje zbyt wiele kart. Zawęź operację.",
  TAG_SOURCE_LIMIT: "Osiągnięto limit odczytu tagów. Zawęź wybór projektu.",
  TAG_SUGGESTIONS_STALE: "Podpowiedzi tagów mogą być nieaktualne.",
  FILES_RETAINED: "Istniejące pliki zostały zachowane.",
  MANAGED_BLOCK_CONFLICT:
    "Zarządzany blok AGENTS.md wymaga sprawdzenia przed rejestracją.",
  PATH_ALREADY_REGISTERED: "Ten folder jest już zarejestrowany.",
  FOLDER_UNAVAILABLE: "Folder jest niedostępny na serwerze.",
  ROOT_NOT_FOUND: "Nie znaleziono zatwierdzonego katalogu.",
  ROOT_CHANGED: "Zatwierdzony katalog się zmienił. Wybierz go ponownie.",
  PLAN_STALE: "Podgląd operacji jest nieaktualny. Sprawdź aktualne dane.",
  PLAN_EXPIRED: "Podgląd operacji wygasł. Przygotuj nowy podgląd.",
  WORKFLOW_NEEDS_REVIEW: "Operacja wymaga sprawdzenia. Otwórz diagnostykę.",
  WORKFLOW_SOURCE_CHANGED:
    "Źródła operacji się zmieniły. Sprawdź aktualne dane.",
  PAIRING_NOT_APPROVED:
    "Przeglądarka nie została jeszcze zatwierdzona na serwerze.",
  PAIRING_NOT_FOUND:
    "Prośba o parowanie wygasła lub jest niedostępna. Poproś o dostęp ponownie.",
  PAIRING_RATE_LIMIT:
    "Zbyt wiele próśb o parowanie. Spróbuj ponownie za chwilę.",
  CHALLENGE_MISMATCH:
    "Kod parowania nie pasuje. Porównaj go z przeglądarką proszącą o dostęp.",
  CSRF_MISMATCH:
    "Nie udało się potwierdzić sesji. Połącz tę przeglądarkę ponownie.",
  GIT_UNAVAILABLE: "Repozytorium Git jest niedostępne.",
  GIT_BUSY: "Repozytorium Git jest zajęte. Spróbuj ponownie za chwilę.",
  GIT_TIMEOUT: "Upłynął czas sprawdzania repozytorium Git.",
  PROJECT_ROOT_NOT_SET:
    "Nie wybrano katalogu nowych projektów. Wskaż go w Ustawieniach.",
  PROJECT_ROOT_NOT_FOUND:
    "Katalog nowych projektów nie jest już zatwierdzony. Wybierz inny w Ustawieniach.",
  PROJECT_FOLDER_NAME_EXHAUSTED:
    "Nie znaleziono wolnej nazwy folderu. Podaj inną nazwę projektu.",
  CREATION_ID_REUSED:
    "To tworzenie projektu zostało już użyte. Zamknij okno i zacznij od nowa.",
  PROJECT_CREATION_LIMIT:
    "Zbyt wiele rozpoczętych projektów. Spróbuj ponownie za chwilę.",
  GITHUB_DISABLED: "Publikowanie na GitHubie nie jest włączone na tym hoście.",
  GITHUB_UNAVAILABLE:
    "GitHub jest nieosiągalny z hosta. Projekt działa lokalnie; ponów publikację później.",
  GITHUB_AUTH_REQUIRED:
    "Host nie jest zalogowany do GitHuba. Zaloguj gh na hoście i ponów publikację.",
  GITHUB_CLI_UNAVAILABLE: "Na hoście nie udało się uruchomić polecenia gh.",
  GITHUB_TIMEOUT: "GitHub nie odpowiedział na czas. Ponów publikację.",
  GITHUB_CREATE_FAILED: "GitHub odmówił utworzenia repozytorium.",
  GITHUB_NAME_EXHAUSTED:
    "Nie znaleziono wolnej nazwy repozytorium na GitHubie.",
  GITHUB_PUSH_FAILED:
    "Repozytorium powstało, ale wysłanie plików nie powiodło się. Ponów publikację.",
  GITHUB_BUSY: "Trwa kilka publikacji naraz. Spróbuj ponownie za chwilę.",
  GIT_FAILED: "Git na hoście nie wykonał polecenia w folderze projektu.",
  AGENT_DISABLED: "Agent nie jest włączony na tym hoście.",
  AGENT_HOST_RESTARTED: "Host został uruchomiony ponownie.",
  AGENT_RUN_NOT_FOUND: "Host nie zna tej wiadomości.",
  AGENT_CONVERSATION_NOT_FOUND: "Host nie zna tej rozmowy.",
  AGENT_RUN_ID_REUSED: "Ten identyfikator wiadomości został już użyty.",
  AGENT_RUN_ACTIVE: "Agent jeszcze pracuje nad poprzednią wiadomością.",
  AGENT_BUSY: "Agent jest zajęty innymi zadaniami. Spróbuj za chwilę.",
  AGENT_PROVIDER_UNAVAILABLE:
    "Na hoście nie udało się uruchomić wybranego dostawcy agenta.",
  AGENT_CLI_UNAVAILABLE: "Na hoście brakuje polecenia projectctl obok demona.",
  AGENT_INSTRUCTIONS_MISSING: "W katalogu agenta brakuje pliku AGENTS.md.",
  AGENT_PROVIDER_FAILED: "Dostawca agenta zgłosił błąd.",
  AGENT_OUTPUT_INVALID: "Agent zakończył pracę bez odpowiedzi.",
};
