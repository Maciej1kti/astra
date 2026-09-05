# Narzędzia kontroli handoffu

`check_package.py` sprawdza JSON, schema, lokalne referencje OpenAPI, parametry ścieżek, przykłady żądań i dokumentów, powiązania demo, 33 referencyjne wektory, pełność identyfikatorów requirement → test → task i acykliczność backlogu. Wykonuje początkowy SQL na pustych bazach w pamięci oraz parsuje TOML/plist. Nie instaluje usług i nie wysyła żądań sieciowych.

Parser w tym skrypcie jest niewielką implementacją referencyjną do dostarczonych fixtures, nie kompletnym parserem produkcyjnym. Nie używać go jako biblioteki backendu. Walidacja negatywnych danych nie jest fuzzingiem, a przejście powiązań testów nie dowodzi ich jakości.

`assemble_spec.py` składa rozdziały i materiały wykonawcze w `docs/MASTER-SPEC.md`. Nie ma zależności zewnętrznych.

Plik `requirements-validation.txt` przypina wersje użyte podczas przygotowania pakietu. Nie jest lockfile'em aplikacji ani gwarancją dostępności w przyszłości. W środowisku docelowym sprawdź politykę i utrzymanie tych zależności przed instalacją.

## Host packaging and continuous integration

`python3 scripts/package.py` assembles tested release binaries into a host archive
under ignored `dist/`. It does not create a GitHub release or start a service.
The generated installer is tested in a temporary prefix, including paths with spaces.
`.github/workflows/check.yml` runs the same checks and HTTPS browser smoke on
Ubuntu 24.04 and macOS 15. CI results are evidence only after a successful run;
Chromium mobile emulation never substitutes for a physical iPhone test.
