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

[Counter series](counter-series-page.json) illustrates a saved zero, an omitted
unrecorded date and an empty counter. The [HTTP example](requests/counter-series.http)
reads one bounded range/page and demonstrates archived inclusion and cursor
continuation; see [ADR-062](../docs/ADR-062-COUNTER-CHART-DASHBOARD.md).

[Projects default view](requests/projects-view-default.json) selects the project status
board as the profile's workspace default. Its [HTTP example](requests/projects-status-board.http)
also shows the existing conditional project state patch used to change columns;
see [ADR-064](../docs/ADR-064-PROJECTS-STATUS-BOARD.md).

[Recovery review](requests/local-recovery-review.http) lists unresolved source
writes and abandons one reviewed intent over the local socket; see
[ADR-067](../docs/ADR-067-REVIEWED-INTENT-RESOLUTION.md).

[Agent run request](requests/agent-run.json) starts a chat message for the profile's
selected provider. The client generates `run_id` and copies `boot_id` from the
[agent status](agent-status.json), so repeating the request cannot start the agent
twice and a request sent after a daemon restart is refused. The result is an
[agent run](agent-run.json) that the client polls until it reaches a final state.
The [provider preference](requests/agent-provider-preference.json) is an ordinary
conditional preferences patch. Runs live in daemon memory only.
