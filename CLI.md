# Using the Astra CLI

`projectctl` reads and changes the same data as the browser through the local
daemon. It also exposes local maintenance operations. Follow
[Development](DEVELOPMENT.md) to build it; the examples assume `projectctl` is on
your PATH and the daemon is running.

## Connection and output

Select the daemon explicitly once in your shell:

```sh
export ASTRA_SOCKET="$HOME/.local-projects/projectd.sock"
projectctl hello
projectctl --project /absolute/project context
```

`--socket PATH` overrides `ASTRA_SOCKET`. Neither project folders nor a server
instance are discovered automatically. `--project .` means exactly the current
folder, which must be registered; parent folders are not searched. Socket paths
must fit the host's Unix socket path limit. `--timeout` defaults to 30 seconds.

JSON remains the default: stdout contains one result envelope; diagnostics and
the identity of a submitted command go to stderr. `--json` makes that default
explicit. Use `--output text` for readable lists, resources and errors:

```sh
projectctl --project /absolute/project --output text card list
projectctl --project /absolute/project --output text card get CARD_ID
projectctl --output text doctor
```

Text output retains versions, IDs, cursors, warnings and additional response
metadata. Unfamiliar structures remain visible as formatted JSON. It escapes
terminal control characters from source content. The JSON envelope is the stable
interface for scripts; text layout is intended for people. Do not combine
`--json` with `--output`. Argument parsing errors still use JSON.

## Create and edit

Simple creation and field edits use named flags:

```sh
projectctl --project /absolute/project card create --title 'Write contributor guide'
projectctl --project /absolute/project card get CARD_ID
projectctl --project /absolute/project card set CARD_ID --title 'Review contributor guide' --status active --if-version VERSION
projectctl --project /absolute/project card set CARD_ID --body-file guide.md --if-version VERSION
projectctl --project /absolute/project card schedule CARD_ID --start 2026-09-10 --end 2026-09-12 --if-version VERSION
projectctl --project /absolute/project card schedule CARD_ID --clear --if-version VERSION
```

Replace `VERSION` with the exact version from a fresh read, normally
`data.version` in JSON output. Re-read after each confirmed edit before preparing
a new change. Schedule dates are inclusive and do not change the independent
deadline. Date rules and allowed statuses are validated by the server.

For richer requests, provide a JSON file or use `-` for stdin. Input is bounded
to 1.1 MB; body files must be UTF-8. This works for existing `--json-file`,
`--patch-file`, `--body-file` and `--input` options:

```sh
projectctl --project /absolute/project card create --input - <<'JSON'
{
  "title": "Write contributor guide",
  "status": "active",
  "priority": "high",
  "labels": ["docs"],
  "expected_result": "A contributor can build and test the project",
  "owner": "Maintainer",
  "body": "Document setup and a small example change."
}
JSON

projectctl --project /absolute/project card set CARD_ID --patch-file - --if-version VERSION <<'JSON'
{"set":{"owner":"Reviewer","labels":["docs","review"]},"clear":["review_on"]}
JSON
```

`create --input` cannot be combined with `--title` or `--body-file`.
`set --patch-file` cannot be combined with field flags; this avoids ambiguous
merge precedence. Unmentioned fields are preserved. Source extensions and
advanced operations remain available through the existing JSON contracts.

`milestone` supports `list`, `get`, `create`, `set`, `move`, `history` and `undo`.
Its create/set input options follow the same pattern. Schedule editing is card-only.

## Search and planning reads

```sh
projectctl search 'contributor guide' --limit 20
projectctl --project /absolute/project search 'guide' --limit 20
projectctl --project /absolute/project view board
projectctl --project /absolute/project view gantt
projectctl view calendar --from 2026-09-01 --to 2026-09-30
projectctl --project /absolute/project view attention
```

Search, calendar and attention cover the selected instance unless `--project` is
provided. Board and Gantt require an explicitly selected project. These commands
read one bounded page; pass the returned cursor with the same filters and limit
to continue. Board cursors belong to individual columns. Stale cursors are
reported as errors; the CLI does not silently restart or combine different
snapshots. Forecasts are observations and do not rewrite source schedules.

## History, undo and background work

```sh
projectctl --project /absolute/project card history CARD_ID
projectctl --project /absolute/project card undo CARD_ID --history-entry HISTORY_ID --if-version VERSION
projectctl job JOB_ID
projectctl command-status REQUEST_ID --epoch ORIGINAL_EPOCH
```

Undo is a new conditional command. It can fail if later edits make that history
entry inapplicable. `job` reads workflow status once; it does not poll or rerun
the job. `command-status` reads the result of an original command using its
original epoch, without generating a new identity.

A valid command-status query can succeed while describing a rejected command:
inspect `data.state` and `data.error`. Pending status can include a planned
result; it does not mean the command committed. Job and command IDs are different.

## Uncertain results and safe retries

Before sending a durable command, the CLI prints its request ID and epoch to
stderr. Keep those, the original payload and the observed version. If a response
is lost, malformed or identifies another command, the CLI preserves that identity
and reports uncertainty. A server error (HTTP 5xx) on a durable operation also
remains uncertain: the server may have committed before that error. The original
server error is retained in `error.details.server_error`; see the
[JSON example](examples/cli-uncertain-output.json).
It never fetches a new version and overwrites a conflict.

Check status first. To retry the same intention, supply the identical arguments
or JSON together with `--request-id ORIGINAL_ID --epoch ORIGINAL_EPOCH` and the
original `--if-version`. Do not generate a new command merely because a status
lookup failed. When input came from stdin, save it if a later retry may be needed.
An unsuccessful command-status lookup also returns exit 9 and keeps the original
identity; its error does not establish the outcome of the earlier command.

Session actions and plan previews are not journaled source commands. They do not
receive a synthetic command identity or promise command-status recovery. Ordinary
resource edits, workflow submissions and status reads have distinct reply checks.

| Exit | Meaning |
| ---: | --- |
| 0 | Request succeeded; for status reads, inspect the returned operation state |
| 2 | Arguments or validation failed |
| 3 | Transport unavailable for a read or non-journaled action |
| 4 | Resource not found |
| 5 | Version/precondition conflict |
| 6 | Access denied |
| 7 | Source validation or recovery requires attention |
| 8 | Invalid read response or server/internal failure |
| 9 | Durable command result is uncertain, or operation is still pending |

## Other commands and scope

Use `report`, `focus`, `tags`, `sessions`, `pairings`, `approve`, `deny`,
`registration-plan` and `register` for their named workflows. `tags preview`
does not apply a batch: review returned changes and write each card with its
returned version. `focus set` replaces the explicitly supplied ordered list.

`add-root`/`remove-root` and `maintenance-plan`/`maintenance-apply` are local
administrative operations. Maintenance includes normalization, order rebalance,
relocation, unregistration and index rebuilding. See
[local maintenance inputs](contracts/local-ipc.json) and [recovery](ops/RECOVERY.md).
`validate --offline` is read-only and does not require a socket or create metadata.

`get /api/v1/...` and `command METHOD /api/v1/... --json-file FILE` remain available
for operations without dedicated aliases, including workspace preferences,
read receipts and project metadata. See [OpenAPI](contracts/openapi.yaml).
CLI does not currently implement streaming `watch`, automatic pagination,
browser-local appearance settings or a batch mutation transaction.

Run `projectctl --help` and `projectctl COMMAND --help` for the implemented command
tree. The [historical CLI requirements](docs/06-CLI-AND-AGENTS.md) retain outstanding
requirements and projected aliases; they are not a command reference.
