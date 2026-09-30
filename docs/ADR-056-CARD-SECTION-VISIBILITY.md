# ADR-056: Card section visibility across devices

Date: 2026-09-30. Status: accepted by owner direction.

The owner requested six-dot handles in Card layout and an eye toggle that hides
a section for that specific card on every device. The existing section order
remains a browser presentation preference; visibility belongs to the card.

## Contract

Card metadata gains optional `hidden_sections`, an array of at most six unique
identifiers: `description`, `checklist`, `counters`, `comments`, `schedule`,
`labels`. Missing and empty arrays both show every section. All six may be hidden;
the header and layout controls remain reachable. Unknown values, duplicates,
null and non-array values are rejected. Existing card sources remain valid.

`CardCreate` accepts this field. A normal versioned `CardPatch.set` replaces it;
`clear: ["hidden_sections"]` restores default visibility. Browser autosave and CLI
use the same validated command path, observed version, request identity and epoch.
Ordinary durability, replay, history and conflict rules apply without an exception.
No source migration, schema-version bump or new workspace state is introduced.

Visibility never deletes content or changes scheduling, tags, checklist results,
counter totals, Focus previews or other projections' behavior. Resource reads
carry the field to every device. An already-open editor retains its observed
source and conflict handling instead of silently overwriting another device's work.

## Browser behavior

The layout menu always lists all six sections. Its eye toggles an owned field in
the existing editor draft; autosave persists it with other ordinary edits. Hidden
section controls remain mounted, inert and excluded from the accessibility tree,
so unfinished comments, counters, checklist entries and tag input survive toggles.
Only visible sections determine spacing and dividers. Collapsing respects reduced
motion. Reset restores the browser order and shows all sections on this card.

The six-dot handle previews placement while dragging and saves the browser order
only on drop. Escape, pointer cancellation, an extra pointer, loss of focus and
session loss cancel the gesture. Arrow keys, Home and End reorder the focused
handle; position changes are announced. A native popover keeps the menu and drag
preview above the dialog's clipping boundary, including when every section is
hidden. Short panels scroll during dragging.

See the [request example](../examples/requests/card-sections.json) and
[HTTP example](../examples/requests/card-sections.http). Domain/application tests
cover bounds, persistence, replay, conflicts and retained content; browser coverage
checks gestures, mounted drafts, per-card scope and independent browser contexts.
