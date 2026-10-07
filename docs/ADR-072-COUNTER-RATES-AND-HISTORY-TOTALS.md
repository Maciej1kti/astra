# ADR-072 — Counter rates and whole-history totals

Status: accepted on the owner's 2026-10-07 direction.

The Chart view opens with a settlement: who owes whom how much, from counters
whose names end in a person and whose totals are multiplied by a rate. Two
things stood in its way. Rates were typed into the Chart summary and kept in
browser storage, so two devices could show two different debts and a new
device showed none. And the counter view returns at most 400 dates, so a debt
that runs from the first recording would lose its oldest days once the history
grew past that. The owner decided that a rate belongs to the counter and is
saved in the card, and that the debt must count the whole history.

## Decision

**A counter may store a rate.** `CardCounter.rate` is an optional exact decimal
string: an integer part of at most nine digits without leading zeros and at
most four decimals after a dot, for example `"1"` or `"0.25"`. A string keeps
the source file exact and readable; a JSON number would pass through binary
floating point. It is the value of one counted unit. The money unit is not
stored: one debt needs one unit, and the Chart keeps its browser-local output
label.

**`configure_counter` sets it.** The existing exclusive, conditional
operation gains an optional `rate`. A string stores it, `null` removes it and
an omitted field keeps the stored rate, so a client written before rates
existed cannot erase one while renaming or hiding a counter. A new counter
given `null` stores none. Admission, observed versions, the durable
prepare/write/commit sequence and replay are unchanged. Undo still cannot
change the counter collection.

**The counter view adds totals over the whole history.** Each `CounterSeries`
carries `rate`, when configured, and a required `history` object: `total`,
`recorded` and, once anything is saved, `first_date`. They are computed in the
same projection snapshot as the series, over every saved date, whatever
`from`/`to` name. The 400-date bound on returned values, the 100-series page
and the 2 MiB response bound stay as they are; three small fields per series
fit inside them. `total` is at most 3660 dates of 1,000,000,000.

**The browser stops storing rates.** The Chart summary shows a counter's rate
read-only and points to the counter's settings on its card, where the rate is
a field beside unit and step. The settlement multiplies `history.total` by
the rate. Rates saved in browser storage by earlier versions are ignored and
not migrated: they were per-browser values with no single owner to copy from.

## Consequences

- Every device, the CLI and an agent see the same rates and the same debt.
- A rate change is an ordinary versioned card write with history.
- A person and an activity are still read from a counter's name; nothing
  structured records them.
- Hosts older than this change reject `rate` and return no `history`; the
  browser then values the plotted range only.

## Verification

Engine regressions cover storing, keeping, replacing and clearing a rate,
rejected spellings, a null rate on creation, a restart, and history totals
that include dates outside the requested range. Browser suites set a rate in
the card editor and read rates and a 900-day-old recording in the Chart
settlement. Evidence:
[progress/2026-10-07-counter-rates.md](../progress/2026-10-07-counter-rates.md).
