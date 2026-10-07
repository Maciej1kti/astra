# ADR-073 — Plugins and Chart tile values

Status: accepted on the owner's 2026-10-07 direction.

The application is meant for every user, but the Chart view had grown a
settlement between two named people that only its owner needs. The owner asked
to separate the two: the core shows what the cards record, and calculations
across counters, the settlement and the Razem totals, become plugins. The
owner also asked for each summary tile to open a dialog choosing which values
it shows, possibly more than before.

Asked how, the owner chose: a plugin is a module built into the application
and switched on; the choice is stored in the user's profile on the server; and
tile values are chosen per counter.

## Decision

**A plugin is a built-in module a profile switches on.** Plugin code ships
with the application and goes through the same review, build and tests as the
rest. The invariant that no script is loaded from project data, a document or
the network stands unchanged; a plugin loaded at run time would need a new
decision and a sandbox. Every plugin starts off.

**The profile stores which plugins are on.** `Preferences.plugins` is an
optional array of at most 32 unique identifiers matching
`^[a-z][a-z0-9-]{1,39}$`. The server validates the shape, not the names:
identifiers a build does not know are kept and ignored, so a profile shared by
an older and a newer client loses nothing. It is written by the existing
conditional `PATCH /api/v1/workspace/preferences`, replaces the whole list and
leaves other preferences alone.

**A plugin fills named places and reads only what it is given.** The first
extension point is the Chart view. A `ChartPlugin` has an identifier and
optional components for `panel`, above the counter list, and `summary`, below
the tiles. Each receives the selected counters with their range statistics,
stored rate and whole-history totals, and the output unit. A plugin has no API
access, stores nothing and cannot change a card. `chart-settlement` and
`chart-totals` are the first two; their logic lives beside their components
and is unit-tested apart from the view.

**Summary tiles are core and configurable per counter.** A tile shows values
derived from one counter. `Preferences.chart_tiles` maps a
`project/card/counter` identifier to an ordered-by-catalogue list of at most
16 unique value identifiers, for at most 200 counters; a counter without an
entry shows the default values, and choosing the defaults removes its entry.
The browser saves a choice against the preferences version it read. A conflict
is shown and resolved by reading the current settings; an uncertain outcome
keeps the request identity for a status check or an identical retry.

## Consequences

- A profile that has not switched the plugins on no longer sees the settlement
  or the Razem tile; this includes existing profiles.
- Adding a plugin means adding a module and a registry entry in a release.
- The summary is a grid of tiles at every width; the table form is gone.
- Chart is no longer a pure read: it writes the profile's preferences, never a
  source.

## Verification

An engine regression covers storing, keeping, replacing and clearing both
preferences, nine rejected shapes and a restart. Unit tests cover the tile
catalogue and stored choice, the two plugins' calculations and the registry.
The `charts` browser suite checks that plugins are off by default, switches
them on through the profile and off in Settings, chooses a tile's values and
reads them back from the stored preferences. Evidence:
[progress/2026-10-07-plugins-and-tiles.md](../progress/2026-10-07-plugins-and-tiles.md).
