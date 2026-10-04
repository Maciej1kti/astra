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

[Card comment source](card-comments.json)
show both human and bot comments retained in a card. The matching
[append request](requests/card-comment.json) uses a versioned CardPatch; see the
[HTTP example](requests/card-comment.http).

`card-counters.json` shows source-owned daily totals; `requests/card-counter.http`
shows conditional configuration and recording. See [ADR-049](../docs/ADR-049-DAILY-CARD-COUNTERS.md).

[Summary compression](requests/summary-compression.http) illustrates optional
gzip, identity compatibility and the source-resource boundary in
[ADR-052](../docs/ADR-052-BOUNDED-SUMMARY-COMPRESSION.md).

[Card section visibility](requests/card-sections.json) hides sections across
devices without removing their content. The [HTTP example](requests/card-sections.http)
uses an ordinary conditional card patch; see
[ADR-056](../docs/ADR-056-CARD-SECTION-VISIBILITY.md).

[CLI Focus preview](cli-focus-preview.json) illustrates ordered compact desktop
rows and an unavailable retained pin. It is a read-only client result; see
[ADR-057](../docs/ADR-057-FOCUS-WIDGET-READER.md).

[Daily Focus page](focus-daily-page.json) shows the bounded active counter
preview in In motion or Events, observed with its card version and workspace date.

[Trusted users](users.json) shows the global profile list and current selection.
The [creation payload](requests/user-create.json) retains its chosen UUID on retry;
the [HTTP examples](requests/users.http) show profile-scoped reads/events and
creation/status calls using the default Owner's command journal. All paired
devices may switch profiles; profile selection assumes trusted users.
The [rename payload](requests/user-rename.json) uses the observed registry version
from the list in `If-Match`; the HTTP example retains the root command scope.
Profiles can share a project's existing exact folder by registering it in each
workspace. They edit the same sources and counter totals through one host writer;
preferences, Focus order, receipts and each profile's command/history records
remain separate. The CLI walkthrough is in [Trusted user profiles](../CLI.md#trusted-user-profiles).
