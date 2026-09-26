# 03. Format danych i inwarianty domeny

## Source contract

`contracts/domain.schema.json` is the JSON Schema 2020-12 contract [S22]. Every
source file uses the same `{type, metadata, body}` envelope. `type` is `project`,
`card`, `milestone` or `update`; metadata follows the corresponding schema and
`body` is a Markdown string. The schema and server domain rules jointly validate
dates, ranges and references. See [ADR-046](ADR-046-JSON-SOURCES.md).

Files contain one UTF-8 JSON object. Duplicate keys at any depth, trailing values,
comments, invalid UTF-8, NUL and excessive depth/node counts are rejected.
Dates, instants, UUIDs and positions remain strings. Canonical writes use sorted
keys, two-space indentation, LF and a final newline. BOM and CRLF sources remain
readable but require an explicit, versioned normalization before normal writes.
Unrelated edits preserve the exact decoded Markdown string, including whitespace
and newlines; the file's JSON escaping is transport syntax.

Unknown fields block writes. Only milestones and reports allow bounded `x-*`
metadata extensions. The shared parser checks document size before decoding and
bounds structure while parsing. Validation, resource versions and durable
prepare/write/commit behavior are unchanged.

## Source locations and identity

`.project/project.json` contains the project ID and `schema_version: 1`.
`cards/<id>.json`, `milestones/<id>.json` and `updates/<id>.json` contain matching
metadata IDs. The explicit type must match the location. Titles are not identity;
the server creates UUIDv4 resource IDs and UUIDv7 command IDs [S09].

Collection directories may be created lazily. README.md, AGENTS.md, .gitignore and
.local remain documentation/runtime files, not resources. Legacy Markdown/YAML
sources require the explicitly approved test-data conversion; normal reads and
writes never fall back to them or initialize over a nonempty legacy project.

## Pola

| Obiekt | Pola wymagane w poprawnym pliku | Opcjonalne |
|---|---|---|
| Project | schema_version, id, name, state, created_at, updated_at | folder |
| Card | id, title, status, priority, position, archived, created_at, updated_at | schedule or event, labels, acceptance, comments |
| Milestone | id, title, status, position, archived, created_at, updated_at | due, x-* |
| Update | id, kind, target, summary, author, recorded_at | observed_at, supersedes, resolves, evidence, x-* |

Project bodies describe the goal and context. Card and milestone bodies retain their Markdown description, including any existing result or acceptance headings. No headings are parsed or converted automatically. Card structured fields are independently optional. Update bodies contain result details, rather than a full agent transcript.

### Card comments

`comments` is an ordered history in the card's JSON metadata. Entries
contain `id`, `author`, `recorded_at` and Markdown `body`; the card description is
unchanged. Human and bot attribution reuses `author.kind: human | agent`.
Normal clients append with `CardPatch.append_comment`, using the observed card
version. Set/clear and undo cannot rewrite this history. List summaries expose
`comment_count`; full resources and bounded agent context provide the entries.
See [ADR-045](ADR-045-CARD-COMMENTS.md) for validation, limits and replay rules.

### Structured card content

`acceptance` is an optional ordered array of at most 100 objects, each containing
`id` (UUIDv4), `text` (nonblank, 1–500 characters) and `completed` (boolean).
Item IDs must be unique within the card. Clients retain an item's identity while
editing, reordering or toggling it; new items receive a new UUIDv4. Completion is
explicit and independent of card status. A complete checklist never marks a card
done, and a manually completed card may still contain incomplete criteria.

The checklist uses the ordinary versioned card create/patch API. `set` replaces
the ordered checklist as a whole; `clear` removes it. An empty array represents
an explicitly empty checklist. Existing cards without a checklist stay valid and
are not rewritten on read. Status changes and unrelated edits retain their
structured content and Markdown body. History and Undo retain the same
version/conflict rules as every other card edit.

List summaries expose `acceptance_progress: {total, completed}` when a checklist
exists. Progress is a compact projection, not an acceptance decision. Full-text
search includes criterion text as well as title and body. The existing aggregate
metadata limit of 64 KiB still applies even when individual field limits are
satisfied.

Tworzenie przez API potrzebuje tylko tytułu karty lub nazwy projektu; pola wymagane w pliku uzupełnia serwer. Czasy są RFC3339 UTC z `Z`. `created_at` jest niezmienne w zwykłych mutacjach; `updated_at` ustala serwer dopiero przy rzeczywistej zmianie. No-op nie zmienia czasu ani wersji. Zwykły zapis nie tworzy updated_at wcześniejszego od created_at; wykryty skok zegara obsługuje polityka admission/recovery zamiast fałszowania chronologii. Zewnętrzna edycja może pozostawić stary czas; świeżość źródła określa też hash i `observed_at` w indeksie, nie tylko nagłówek.

### Enumy

- Project state: `active | paused | archived`.
- Card status: `planned | active | review | done | cancelled`.
- Priority: `normal | high`.
- Milestone status: `planned | active | achieved | cancelled`.
- Update kind: `result | blocker | decision_needed | note | correction | resolution`.
- Author kind: `human | agent`; obserwacje Git nie udają raportów człowieka.

Brak sztucznego workflow przechodzenia przez wszystkie stany. Done/cancelled można ponownie otworzyć. `archived` ukrywa z bieżących widoków, nie zmienia historii rezultatu. Projekt archived jest widoczny w archiwum; zwykła edycja jego kart wymaga najpierw przywrócenia projektu. Projekt paused nie blokuje edycji.

## Daty

Daty całodniowe mają format `YYYY-MM-DD` i muszą istnieć w kalendarzu gregoriańskim. Sam regex nie odrzuci 30 lutego. `schedule` występuje z obiema granicami; `start <= end`, obie **włączne**. Jednodniowy plan ma tę samą datę start/end. Dodajemy dni kalendarzowe, nie stałe 86 400 000 ms. Nie wykonujemy `new Date('YYYY-MM-DD')` jako kanonicznego modelu daty.

Card `schedule` is the only card planning date range. Its inclusive `start` and
`end` dates are the source for card `overdue` and `due_soon` attention signals.
Milestone `due` is `{date}` and remains an independent commitment. A milestone
due date earlier than today is overdue; a date in the workspace's due soon
window produces `due_soon`. Phone timezone changes do not move dates. Timeline
library adapters must round-trip to identical LocalDate values.

Cards have no stored dependency graph or automatic scheduler. A card without a
schedule is simply unscheduled and does not produce a date based attention
signal. There is no work calendar, weekend blocking, lag, lead or automatic
date shifting.

## Relacje i raporty

Updates are append-only in the normal API. Report targets have type
`project|milestone` and the ID of an existing resource in the same project;
card targets are rejected. Corrections refer to earlier reports through
`supersedes`; resolutions refer to earlier reports through `resolves`.
References must stay within the project and cannot introduce cycles or
self-resolution. A blocker report is an append-only report kind and does not
add blocking metadata to a card.
Reading a report does not resolve a decision. Resolution explicitly closes a
signal; correction supersedes content without rewriting history.

`evidence` jest listą typowanych referencji: `url` (http/https, bez automatycznego pobierania), `commit` (hex OID jako tekst), `path` (względna ścieżka do opisu, nie uprawnienie do zdalnego czytania pliku). Author jest deklaracją, nie podpisem tożsamości.

## Kolejność

`position` to 32 małe cyfry hex kodujące unsigned 128-bit. Rezerwujemy 0 i 2^128−1 jako wirtualne granice. Porządek to `(position, id)` w obrębie statusu kart, a w milestones w obrębie projektu. Priorytet nie zmienia kolejności ręcznej. UI nie wylicza rank i nie wysyła floatów.

Komenda move wskazuje sąsiadów `after_id` i `before_id` w nowej kolumnie. Serwer pod lockiem odczytuje kolejność, usuwa przesuwaną kartę z rozważanego zbioru i sprawdza sąsiedztwo. Null oznacza krawędź kolumny; oba null są poprawne dla pustej kolumny. Nieaktualne sąsiedztwo → `ORDER_CHANGED`, nie nieoczekiwana pozycja.

Nowy rank = low + floor((high−low)/2), jeżeli istnieje przerwa. Tworzenie i zmiana statusu bez wskazania sąsiadów dopisuje na końcu. Gdy zabraknie miejsca albo ręcznie zdublowane ranki blokują wstawienie, zwracamy `ORDER_REBALANCE_REQUIRED`. Jawna wznawialna konserwacja rozkłada ranki równomiernie i emituje resync. Nie przepisujemy dziesiątek plików w ukryciu podczas każdego gestu.

## Limity baseline

The entire JSON document is at most 1 MiB; canonical metadata is at most 64 KiB;
the decoded body is at most 960 KiB. Titles are at most 240 characters, project
names 120, summaries 500, and labels 48 with at most 20 labels. Reports permit at
most 50 evidence entries and 100 resolutions. The parser bounds JSON depth at 12
and nodes at 10,000. JSON Schema does not replace byte limits.

Limit testowy 100 projektów/10k kart/50k raportów nie jest limitem danych. Lista i raporty są stronicowane. Nie podnosimy limitów bez pomiaru i testu nadużycia.

## Profil workspace

W `workspace.json`: format_version, instance_id, timezone, locale, projects (ID, ścieżka, data dodania), focus (referencje w kolejności), preferences. Sekrety i sesje nie są tu przechowywane. `focus` max 100 pozycji, rekomendacja UX 3–5, bez twardej blokady przy czwartej. Nieistniejąca referencja pozostaje oznaczona, dopóki użytkownik jej nie usunie. Root do rejestracji przez WWW jest konfiguracją hosta; nie wynika z dowolnej treści workspace.

The optional `tags` array stores at most 500 distinct reusable workspace tag
names, each 1–48 characters. Equality is exact, including case, punctuation and
spacing. Existing source labels remain unchanged; registering a name does not
rewrite any card. Card label arrays remain the source of truth for membership.
Older workspaces without a catalog remain valid and are not rewritten on read.

### Timed events

A card with `event: { start: "2026-09-30T09:30", duration_minutes: 90 }` is a
timed event. Its civil clock fields use the workspace timezone, and its end is
derived from 1–10080 wall-clock minutes. `event` and the inclusive date-only
`schedule` are mutually exclusive. Conversion sets one and clears the other in
one conditional patch. Milestones remain dated checkpoints. See
[ADR-044](ADR-044-TIMED-EVENTS.md) for timezone, DST and projection semantics.
