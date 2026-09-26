# ADR-049: Daily card counters

Date: 2026-09-26. Status: implemented from owner direction.

Cards may contain several named counters. Each has a stable server-generated UUID,
a unit of one to five characters, a positive integer step, an archive flag and a
map of calendar dates to nonnegative integer totals. The initial implementation
uses integers and one total per day. A missing date displays zero; midnight does
not delete or rewrite source history. Values live in the card's JSON metadata,
independently of comments, and travel with `.project/`.

The conditional CardPatch variants `configure_counter` and `record_counter` are
exclusive operations. Configuration omits the ID for creation and includes the
observed ID for updates. A recorded unit cannot change; hide a counter to retire
it without deleting history. Recording supplies counter ID, explicit date and
absolute total. Another OK updates that date only. The API permits corrections
for earlier dates; the browser starts with today in the workspace timezone.

Normal card creation/set/clear cannot replace counters. Undo cannot change the
counter collection. Configuration and recorded totals go through the existing
admission, observed-version checks, durable prepare/write/commit and replay.
Conflicts preserve the local proposal; no automatic rebase or overwrite occurs.
An uncertain retry retains request ID, epoch, version, payload and date.

The shared card modal owns configuration and value drafts alongside other editor
fields. +/- adjusts locally by the configured step, bounded at zero; only OK
submits a total. Valid ordinary autosaves flush before a counter command. Counter
drafts survive title edits, pin changes, unrelated confirmations, uncertain
responses and guarded navigation. A draft that crosses midnight retains its day
and shows that date until confirmed or reset. Saved rows switch to the new day's
value without a reload. A daily history table and hidden-counter toggle retain
access to earlier results. List/Board/Focus show the number of visible counters;
bounded agent context includes counter source data or a next-read hint.

Bounds remain explicit: at most 20 counters including hidden ones, 80-character
names, 1–5-character units, step 1–1,000,000,000, total 0–1,000,000,000, and at most
3660 dated totals per counter. The existing 64 KiB metadata, 1 MiB document and
structure limits still apply and can be reached first. A rejected write never
truncates history. This is a daily total history, not an immutable event ledger
of every OK; ordinary operational history is separate. Fractional quantities,
automatic resets/writes, charts and counter deletion are outside this iteration.
