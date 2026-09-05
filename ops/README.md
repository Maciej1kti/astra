# Wzorce uruchomienia — nie instalator

Te pliki opisują docelowy program, który Astra ma zbudować. Nie uruchamiają istniejącej
aplikacji. Wszystkie @@PLACEHOLDERS@@ trzeba zastąpić zweryfikowanymi ścieżkami/originem.
Nie ma automatycznego sudo, modyfikacji VPN, firewalla, linger, settings usypiania ani
publicznego udostępnienia.

Serwer działa jako użytkownik; ścieżki config/data/runtime prywatne. Na Linux sprawdź
XDG i krótki socket path. Na macOS plist musi mieć ścieżki absolutne, prawidłowo XML
escaped. Kontroluj długość socket path. Jeśli ścieżka binarium/config zawiera spacje,
installer systemd musi użyć poprawnego cytowania ExecStart; szablon nie jest bezpiecznym
string interpolation dla dowolnych bajtów ścieżki.

Tailscale Serve konfiguruj świadomie na hoście, po sprawdzeniu istniejącej konfiguracji
i aktualnego CLI. Nie używaj reset jako domyślnej operacji instalacji. Public origin
jest prywatnym HTTPS hosta. Backend TCP słucha tylko loopback. Klient mobilny potrzebuje
klienta prywatnej sieci, ale nie aplikacji naszego produktu.

Release test sprawdza first install, login-start, restart, stop, pending write during
shutdown, upgrade oraz rollback z kompatybilnym backupem. Wzorzec launchd nie zapewnia
rotacji plików logów sam w sobie — program/ops ma ograniczyć rozmiar, zamiast pozwolić
logom rosnąć bez końca. Żadnych sekretów w logach.
