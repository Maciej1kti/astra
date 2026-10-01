# ADR-058: Exact incremental context byte accounting

Status: accepted implementation optimization, 2026-10-01.

Agent context selects current source-backed entries under a compact JSON byte
budget. Re-serializing the growing response for every candidate repeatedly
visits previously accepted metadata. Large checklists/comments amplify this
work even when a later card cannot fit.

The assembler serializes the initial envelope once and tracks its exact size
within that request. Appending an entry adds that entry's ordinary compact JSON
length and one comma when its array is nonempty. Empty array brackets already
belong to the initial size. Included/omitted counters adjust the total by the
change in their unsigned decimal widths, including zero and saturated omission
counts. An append checks the same budget before count updates as previously;
rejection and array caps leave both output and size unchanged.

Every value still uses the existing JSON serializer, accounting for UTF-8,
escaping and nested structured metadata. Source observations and their versions
are neither cached nor skipped. Source pin discovery, candidate ordering, all
guarded reads, complete acceptance/comments/counters, excerpt boundaries,
warnings, the 100/200-item caps and next-read references remain. The existing
512-byte reserve and Focus half-budget check retain their exact original order.

Entry construction borrows the full body from the already validated typed source,
instead of copying it into a temporary JSON envelope before selecting an excerpt.
Only metadata is serialized to a temporary object, and selected values move into
the entry without another structured-metadata copy. The existing kind/title/project
state mapping, optional fields, complete acceptance/comments/counters and UTF-8
excerpt limits remain. All source parsing, validation and original byte versions
still precede this projection; it creates no new source authority.

After setting the final truncation flag, the ordinary complete serialization
still checks the requested maximum and retains `CONTEXT_BUDGET_TOO_SMALL`.
The tracker exists only while assembling this response; it grants no source
authority or durable state. Locks, authorization, commands, fsync and protocol
schemas remain unchanged.

Tests compare incremental decisions and lengths with actual complete compact
serialization at adjacent byte budgets, escaping and decimal transitions, and
cover each array cap/rejected state. Engine tests retain current bytes, structured
metadata and unavailable-source warnings/hints across cards, milestones and
reports. Normally paired protocol checks compare full HTTP and CLI context at
minimum/default/maximum budgets and reject out-of-range requests. Release output
equivalence, measurements and verification limits are recorded in
[the context budget evidence](../progress/2026-10-01-context-budget.md).
