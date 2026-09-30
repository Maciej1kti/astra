# ADR-054: Bounded calendar rendering work

Status: accepted implementation optimization, 2026-09-30.

Release month-grid profiling attributes substantial browser CPU time to repeated
geometry reads and optional date formatting inside the pinned EventCalendar
5.12.2 renderer. Its event accumulation also repeatedly copies an expanding
array. These are browser costs; changing Python tooling or the Rust request path
does not remove them.

Apply a narrow Vite transform before Svelte compilation. The repository owns
`apps/web/build/calendar-layout-plugin.ts`; npm files remain untouched. Exact
SHA-256 guards cover all five reviewed upstream source files. A changed source,
unexpected replacement shape or missing transformed module fails the production
build, requiring an explicit dependency review instead of silently omitting an
optimization. The plugin adds no runtime or build dependency.

Each synchronous month-grid reposition/hide pass gets its own geometry reader.
It measures an element once, including a zero-height footer. No geometry survives
the pass. ResizeObserver, subsequent hide passes and changed footer contents
therefore read current geometry. Event height, ordering, stack placement, popup
content, helper previews and default measurement behavior remain available.

Snippet arguments expose time text and view conversion through live getters.
Astra's event snippet reads its own event metadata, so unused vendor time text
does not invoke `Intl.formatRange`. Consumers that read optional fields still
subscribe to current values; default content, pointer time text and mount
callbacks keep their existing paths. No formatted value is cached across a
reactive update.

Day-grid accumulation appends each zero-or-one chunk instead of copying all
previous chunks for every event/week. It preserves traversal order, chunk IDs,
preparation, background events and interaction helpers.

This does not reduce the calendar's 1,000-item grid/time bound, its 200-item agenda
page size, DOM population, accessible popup membership or observed versions.
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

Unit tests cover pass-local geometry, resized cells and lazy current details.
The release browser regression uses 300 added source cards, including a plan
crossing a week boundary. It checks actual geometry-read counts, unused time
formatting, complete item membership, resize layout, popup contents and keyboard
opening with the original item version. Measurements and verification limits
live in [the rendering evidence](../progress/2026-09-30-calendar-rendering.md).
