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
