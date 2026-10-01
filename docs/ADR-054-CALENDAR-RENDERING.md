# ADR-054: Bounded calendar rendering work

Status: accepted implementation optimization, 2026-09-30.

Release month-grid profiling attributes substantial browser CPU time to repeated
geometry reads and optional date formatting inside the pinned EventCalendar
5.12.2 renderer. Its event accumulation also repeatedly copies an expanding
array. These are browser costs; changing Python tooling or the Rust request path
does not remove them.

Apply a narrow Vite transform before Svelte compilation. The repository owns
`apps/web/build/calendar-layout-plugin.ts`; npm files remain untouched. Exact
SHA-256 guards cover all ten reviewed upstream source files, including the native
chunk positioning algorithm used by the measured month layout. A changed source,
unexpected replacement shape or missing transformed module fails the production
build, requiring an explicit dependency review instead of silently omitting an
optimization. The plugin adds no runtime or build dependency.

Each synchronous month-grid reposition/hide pass gets its own geometry reader.
It measures an element once, including a zero-height footer. No geometry survives
the pass. Cell lookup and maximum footer height for a cell/span are also shared
within that same pass. The next reposition/hide gets a new reader and capacity
map; each chunk's current bottom is compared to the measured available space.
ResizeObserver, subsequent hide passes and changed footer contents therefore
read current geometry. Event height, ordering, stack placement, popup
content, helper previews and default measurement behavior remain available.

Snippet arguments expose time text and view conversion through live getters.
Astra's event snippet reads its own event metadata, so unused vendor time text
does not invoke `Intl.formatRange`. Consumers that read optional fields still
subscribe to current values; default content, pointer time text and mount
callbacks keep their existing paths. No formatted value is cached across a
reactive update.

The reviewed event intersection predicate reads each normalized Date's current
numeric timestamp instead of repeatedly invoking relational Date coercion. It
retains exclusive bounds, zero-duration behavior and the existing resource-ID
short circuit. Event/query dates are never cached: changing a Date during a
gesture is observed by the next check. This applies to the pinned renderer's
existing date-filtering callers, including time and list views. See the
[capacity/date evidence](../progress/2026-10-01-calendar-pass-work.md).

Day-grid accumulation appends each zero-or-one chunk instead of copying all
previous chunks for every event/week. It preserves traversal order, chunk IDs,
preparation, background events and interaction helpers.

Hidden lists also accumulate within one synchronous hide pass. A per-day set
retains chunk reference identity and insertion order; a changed list is copied
once and appended in place before its single publication. Unchanged lists keep
their original arrays and do not retrigger reactive writes. Existing entries
remain until the widget's ordinary reposition clear; the collector is discarded
after each pass, including when source objects change. Native geometry, footer
rechecks and fallback hide behavior remain intact. This replaces repeated
growing-array copies and linear duplicate checks with bounded linear collection,
without assuming a row height. See the
[hidden-list evidence](../progress/2026-10-01-calendar-hidden-lists.md).

The month grid retains every native chunk model while mounting native components
only for each reviewed shape and every visible event. Hidden events outside these
representatives have no main-grid DOM nodes or reactive child branches. The shape
includes grid row/column/span, item kind, clock format length,
short-event class and editability. Astra's month snippet has one explicitly sized, nonwrapping
title line and an optional time line. Contract clock values are fixed ASCII
`HH:mm` in tabular digits; they change text, not line geometry. Hidden detail text
does not affect its height. Changing this snippet or its CSS requires reviewing the grouping. Unknown
content, custom classes/styles or resources retain the full native renderer.

Each reposition pass measures its actual native representatives, headers, cells
and footers anew, then calls the unchanged native positioning algorithm for every
chunk in its original traversal order. Placement output is retained for rendering
and exact no-op publication checks, never as the next pass's measurement input.
The hidden-list collector and footer rechecks still see all chunks. The keyed
main-grid loop receives only visible chunks and measured representatives, carrying
their original full-array indices so representative references do not shift when
visible membership changes. Every chunk retains its item ID, current projection
version and grid span in the native model. Popups retain every row; backgrounds
and interaction previews use full native components. Popup ordering and source
reads before opening remain unchanged. See the
[sparse-grid evidence](../progress/2026-10-01-calendar-sparse-grid.md).

Representative ResizeObservers compare current CSS border-box sizes to their
last notification size; this only filters unchanged initial notifications.
The initial computed-style value is restored to the reviewed engines' 1/64 px
layout units to remove CSS serialization rounding. This notification comparison
never supplies or rounds the actual geometry used for positioning.
Changed sizes schedule one shared animation-frame reposition, whose geometry
reader measures current elements again. Pending frames and observers are disposed
with the view/components. Identical measured placements avoid clearing and
republishing an unchanged hidden list. Leaving this path clears retained placements.

Ordinary Astra popup rows use one application-owned `CalendarPopupEntry` instead
of the native Event, InteractableEvent and BaseEvent component stack. This
retains the existing Astra content snippet, natural wrapping geometry, clipping
classes, interaction classes, local-date conversion, pointer arguments and native
Resizer component. The private build alias reexports the pinned native helpers;
the original Event component remains the fallback. Custom styles/classes,
resources, content/lifecycle/mouse hooks, helper/background events and unknown
content shapes retain that fallback. There is no popup row grouping, partial DOM,
remembered geometry or source cache. All rows retain their current item metadata
and version. Hash guards also cover the popup, copied interaction wrapper/date
semantics and retained resizer. Quiet release comparisons and native popup
gesture checks are recorded in the [popup rendering evidence](../progress/2026-10-01-calendar-popup-rendering.md).

The popup's block-axis dialog margins are explicitly zero. WebKit's native
automatic margins otherwise shift the dialog outside the currently measured
calendar grid. The existing native positioning, measured size and scrollable
list remain; no viewport height is guessed or retained. The list reserves
inline-end padding so an overlaid WebKit scrollbar cannot intercept the native
end-resize handle. Titles wrap to the actual available width; rows remain complete.

This does not reduce the calendar's 1,000-item grid/time bound, its 200-item agenda
page size, accessible popup membership or observed versions.
Authentication, source reads, API/protocol, command identity and durable writes
are unchanged. Further DOM and overlap work requires new measurements and
behavioral evidence rather than assuming these optimizations make rendering
constant-time.

An additional measured refresh optimization retains widget event inputs only for
the currently displayed page. Identical fresh reads keep the same event objects
and array; any changed source version, projection field, timed-event field,
editability, order or membership is published explicitly. Exhaustive typed field
sets make a contract extension require adapter review. Owned metadata snapshots
avoid silently changing retained events through caller mutation. Removed or
filtered events are evicted; this is not a multi-page or source-response cache.
Normal reads, request cancellation, gesture publication, freshness notices and
current-source reads before opening remain unchanged. See
[the refresh evidence](../progress/2026-09-30-calendar-refresh.md).

Unit tests cover pass-local geometry, resized cells, lazy current details,
reviewed sample grouping and native fallback. The release browser regression uses
330 added source cards, including timed events, cross-week and whole-month plans.
It checks actual geometry-read counts, exact hidden counts, unused time formatting,
complete item membership, changed versions, resize layout, popup contents and
keyboard opening. It independently reconstructs every API-projected chunk from
its full native
representative and compares natural heights, including large text and 390/320 px
screens. Each checkpoint also opens every populated day popup and verifies complete
API membership, titles and observed versions; days without a popup must contain
all their items visibly. Separate release comparisons retain exact footer counts,
popup order and visible native geometry before and after the sparse main-grid
loop. Measurements and verification limits
live in [the rendering evidence](../progress/2026-09-30-calendar-rendering.md).
The separate `calendar-popup` regression checks full API membership/current
versions, native movement and both resize handles, Escape cancellation, long
wrapping titles and fresh keyboard source opening at 1440, 390 and 320 px.
