# ADR-048: Daily Focus sections

Date: 2026-09-26. Status: accepted by owner direction.

Focus presents In focus, Needs my attention, In motion and Events in that order.
Source pins retain every status and archive state; ordinary folder/title filters
still apply. Pinned cards outrank attention and daily lists.

`GET /api/v1/views/focus-cards?section=motion|events` returns a bounded SummaryPage.
The server derives today and the current minute from the workspace timezone.
Motion includes inclusive date-only schedules containing today, with Planned
and Active both eligible. Events includes timed cards starting today whose end
is later than the current minute, sorted by start time. Neither list includes
review, completed, cancelled or archived cards, archived projects or source pins.
Filtering occurs before pagination; each section has an independent cursor.
Cursors bind section, folder, projection revision and clock minute. The browser
refreshes attention and both daily pages every visible minute and handles stale
cursors through the existing explicit first-page recovery.

`GET /api/v1/views/attention?focus=true` removes due-soon reminders and adds unread
non-decision reports. Overdue plans/events, milestone attention and review cards
remain; unresolved decisions stay even after reading. General attention reads
retain their prior due-soon behavior. Read receipts remain durable operational
state. Their deterministic identity is included in the Focus attention cursor,
and the journal read finishes before acquiring the index lock. SQL applies all
attention eligibility before pagination. The browser retains grouped reasons
and pin precedence, including badges on loaded pinned attention rows.

No resource schema, write protocol or stored schedule changes. Existing conditional
writes, receipts, pin membership and local pin order remain unchanged. The new
read endpoint works through both authenticated HTTP and the CLI generic GET.

Examples: `examples/requests/focus-daily.http`. Regression coverage includes
workspace-local midnight, inclusive endpoints, planned status, exclusions,
folder filtering before pagination, cursor expiry, chronological events, unread
receipt changes, section ordering and archived/completed pin visibility.

## Decision-history reads

Decision attention preserves direct closure: a resolution's `resolves` entries
or a correction's `supersedes` value close matching decisions in the same project.
Correcting a resolution does not reopen its earlier decisions. The query builds
this membership once within its existing projection snapshot, selecting the
already installed report-kind index, instead of rescanning report history for
each decision. Canonical UUID identities include both project and report; missing
or NULL edges do not match or suppress unrelated decisions. Project scope applies
before page materialization. General and Focus attention use the same closure;
durable read receipts only affect unread non-decision reports.

Eligible decisions share their weight, date and reason, so their sorted project/ID
prefix of `offset + limit + 1` is sufficient for the same final page, saturating at
SQLite's signed limit. The statement materializes that prefix once. If it fills
the requested prefix, lower-priority unread reports cannot enter the page and
that branch receives a zero limit before scanning reports. Overdue rows still
precede decisions; unread reports,
general due-soon reminders and review rows retain their final ordering. When
fewer decisions qualify, ordinary unread eligibility and receipt membership run
before their existing sufficient prefix. No eligible page item is omitted.

This changes the read algorithm, not source/API schemas, cursor scope, projection
authority, locks, write durability or retained caches. Startup and ordinary rebuild
coverage include the required existing index. Exact paged results are checked
against independently expected report identities, subjects and scope, including
cross-project repeated IDs and maximum-size resolution arrays.

## Unread receipt membership

Focus keeps its exact durable ordered receipt serialization and cursor hash.
After the journal read finishes, a private Rust scalar predicate on the serialized
index connection answers membership for the current request. A nested project/report
hash set replaces per-row concatenation and SQLite's temporary membership tree.
It is built only on first use, so a full decision prefix or no unread rows avoids
the allocation. Canonical UUID pairs allow borrowed JSON decoding; row identities
are borrowed as well. The builder retains only owned project/report keys.

The predicate cannot run from stored views or triggers and performs no I/O, SQL
or nested locking. Statements and results are dropped before explicit removal;
removal is required before returning success. A drop guard also handles early
unwinding. Each request owns a fresh durable snapshot; there is no receipt cache
between requests, receipt source in the disposable index, or changed source/API
schema. Regressions cover current read/unread transitions, repeated IDs, concurrent
scoped/general reads, invalid cursors, projection mapping errors, cleanup,
unchanged source bytes/versions and reopening.

An ordered partial index on non-decision reports provides the project/report
prefix directly. Without it, the report-kind access path sorts an entire large
project before yielding the first eligible unread rows. The unread branch selects
this index explicitly; `Index::open` installs it for older disposable projections
before reads. Ordinary report writes and rebuild maintain it. Source bytes,
receipts and versions remain authoritative elsewhere. Reopen/rebuild coverage
removes the index and verifies its restoration through actual attention reads.
