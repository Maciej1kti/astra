# Przykłady kontraktów

`demo-repo/` jest syntetycznym projektem, nie kodem naszej aplikacji i nie miejscem
na backlog wykonawczy Astry. Jego `.project` zawiera projekt, dwie karty, kamień
milowy i raport. UUID/daty są stałe dla powtarzalnych testów.

Pliki JSON obok są reprezentacją parsera `{type, metadata, body}` zgodną z
`domain.schema.json`. `workspace.json` używa ścieżki EXAMPLE i trzeba ją świadomie
zastąpić przy realnym importowaniu. Nagłówki HTTP są ilustracyjne; nie są
aktualnymi sekretami/wersjami i starego request ID nie wolno kopiować do produkcji.

Testy mutacji potrzebują prawdziwego serwera. Samo przejście walidacji schema
nie dowodzi, że działa zapis, drag-and-drop, SSE ani backup.
