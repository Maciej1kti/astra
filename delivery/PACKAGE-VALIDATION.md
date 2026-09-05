# Weryfikacja pakietu wykonawczego

**Data:** 5 września 2026 r.  
**Przedmiot:** pliki pakietu `astra-project-handoff-v1.0`, nie aplikacja.  
**Wynik:** kontrole opisane niżej przeszły; zapis szczegółowy w `package-validation.json`.

## Co rzeczywiście sprawdzono

- Poprawność składni plików JSON; poprawność JSON Schema draft 2020-12 oraz rozwiązywanie lokalnych referencji schematów i OpenAPI.
- Sześć przykładów danych względem schematu. Pięć dokumentów Markdown odpowiada bajtowo zachowanej treści i metadanym reprezentacji JSON; zgodne ID plików i referencje demonstracyjnego projektu/focusu.
- Trzydzieści trzy wektory referencyjne: poprawne/błędne dokumenty, daty, grafy, klucze kolejności i ograniczone fixtures parsera. Są to testy materiałów wejściowych, nie przyszłej implementacji Rust.
- Strukturalne kontrole OpenAPI 3.1.1: 39 ścieżek, 49 operacji, 80 schematów, unikalność operationId, kompletność parametrów ścieżek, lokalne referencje, nazwy mechanizmów security i przykłady pięciu typów żądań.
- Powiązanie 36 wymagań, 60 scenariuszy odbioru i 42 zadań. Każde wymaganie ma test i zadanie; każdy test przypisano do zadania. Graf zależności zadań jest acykliczny. Dostarczono też 16 scenariuszy fault injection.
- Składnię obu początkowych schematów SQL przez inicjalizację pustych SQLite w pamięci, w tym utworzenie FTS5. To nie test transakcyjnej poprawności przyszłego serwera.
- Parsowanie TOML i plist. Dla jednostki systemd tylko podstawową strukturę tekstową; nie instalację ani analizę na docelowym systemie.
- Wewnętrzne odsyłacze Markdown oraz, przy końcowym pakowaniu, sumy SHA-256 i poprawność ZIP.

## Czego nie sprawdzono i czego nie wolno wywnioskować

Nie uruchomiono osobnego kompletnego walidatora zgodności specyfikacji OpenAPI. Dołączony skrypt sprawdza wymieniony podzbiór strukturalny i schematy. Zależność do pełnego walidatora nie była dostępna w środowisku przygotowania; Astra powinna dodać taki krok do G0.

Nie istnieje tu implementacja produktu, więc nie wykonano buildów aplikacji, testów jednostkowych ani integracyjnych serwera/UI/CLI. Wszystkie scenariusze produktu pozostają `not_run`, a zadania `not_started`. Żadnego acceptance test nie uznano za zaliczony na podstawie walidacji dokumentacji.

Nie wykonano instalacji na Archu/macOS, testów fizycznego iPhone'a, awarii zasilania, fault injection w serwerze, testów penetracyjnych ani benchmarków. Budżety wydajności są celami. Szablony usług wymagają dostosowania. Licencje i wersje zależności trzeba sprawdzić przy przypięciu rzeczywistych bibliotek.

## Jak powtórzyć

Instrukcja w głównym `README.md` oraz `scripts/README.md`. Polecenie `python scripts/check_package.py` nie potrzebuje sieci po zainstalowaniu zależności. Manifest dotyczy oryginalnego pakietu; podczas świadomego edytowania używaj `--skip-manifest` i generuj nowy manifest do własnego wydania.

Raport można zapisać poza pakietem. Nadpisanie dołączonego raportu zmienia jego sumę i słusznie powoduje różnicę względem pierwotnego manifestu. Sumy nie są podpisem cyfrowym ani potwierdzeniem autorstwa.
