# E022 — SVAR Kanban view adapter

> Historical evidence. Commands and bare artifact paths describe the original run.
> [Original record and artifacts](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/E022-svar-kanban.md) are preserved in the published checkpoint; see [current status](STATE.md) for maintained guidance.

Date: 2026-09-07

## Result

The per-project Board uses pinned `@svar-ui/svelte-kanban` 2.6.0 (MIT).
SVAR supplies the column layout, independent scrolling, collapse/expand and
column creation controls. Astra supplies card content, the accessible action
menu, the shared editor and versioned move proposals. Column creation opens
the existing editor with its status selected; Add update selects the card as
the report target. Focus membership remains editable in the existing editor.

Cards show priority, blocked state, labels, and separate schedule, deadline and
review dates. Date-only strings are not converted into JavaScript timestamps.
Themes use Astra's tokens and system fonts. Bundled upstream license notices
are available at `/third-party/SVAR.txt`.

The Board module loads on demand; Focus does not import SVAR. The aggregate
all-project board retains its existing read-only layout. No server, domain,
file-format or API contract changed.

## Data and gesture boundaries

SVAR's internal card mutations and editor are intercepted. Its native drag is
isolated from Astra's controls. The existing pointer-capture gesture handles
dragging, cancellation and bounded horizontal edge scrolling, then opens the
existing MoveChange confirmation. There is no optimistic committed card state.
Card controls have keyboard alternatives and content remains touch-scrollable.

Refreshes received during a gesture are deferred; the proposal retains the
captured resource version. The existing command path handles conflict and
uncertain results without replacing the request identity or overwriting a newer
version. The Board removes both gesture listeners on unmount.

Counts come from the server, not the library's filtered array. Each column loads
at most 50 cards and retains cursor pagination. Unknown predecessors at a page
boundary cannot be selected as placements. Filtering explicitly searches only
loaded titles; it disables dragging while leaving status selection available.
Library virtualization is disabled for these bounded pages; this is not a
claim of 10,000-card rendering performance.

## Validation and measurements

Environment: Arch Linux 7.1.9 x86_64, Intel Core i7-3720QM, Node 24.11.0,
Svelte 5.57.0, Vite 8.2.2, system Chromium 151.0.7922.173.

- `npm run check`: generated contracts match; zero Svelte errors or warnings.
- Production Vite build: 2.04 seconds on the final run. Earlier isolated runs
  took 1.86–1.98 seconds; a run competing with Rust compilation took 4.43 seconds.
  The earlier pre-integration baseline was approximately 1.1 seconds.
- Initial JS: 245.64 kB / 91.64 kB gzip (baseline 248.12 / 92.54).
  Initial CSS: 21.02 kB / 4.27 kB gzip.
- Lazy Board: 76.50 kB JS / 25.65 gzip; 54.90 kB CSS / 7.73 gzip.
  Shared lazy gesture helper: 1.93 kB JS / 0.76 gzip.
  These are Vite decimal kB, not measured network latency or memory consumption.
- Incremental Rust release build: 23.34 seconds. Embedded `projectd` binary:
  23,388,928 bytes; `projectctl`: 11,749,584 bytes. No cold-build claim.
- Real HTTPS browser tests cover column collapse, creating a card in Review,
  report target selection, drag and keyboard ordering, conflicting CLI changes
  during a held board gesture, and 51-card pagination (50 + 1) with guarded
  predecessor selection. Existing pairing, persistence, calendar, timeline,
  uncertain-command and session-revocation scenarios also run.

Reproduce browser verification after building the frontend and Rust release:

```sh
ASTRA_TEST_PROFILE=release ASTRA_TEST_CHROMIUM=/usr/bin/chromium \
  node scripts/browser-smoke.mjs
```

Omit `ASTRA_TEST_CHROMIUM` to use Playwright's downloaded browser. The default
binary profile remains debug. Screenshots: `screenshots/desktop-board.png`,
`screenshots/desktop-board-dark.png`, `screenshots/mobile-board.png`.
Mobile evidence is Chromium emulation/resizing, not physical iPhone or Safari.
macOS, large-dataset p95 latency, memory and sustained 60 fps remain unmeasured.

## References

- https://docs.svar.dev/svelte/kanban/
- https://github.com/svar-widgets/kanban
- Installed package sources, types and `license.txt`, version 2.6.0.

The published component types and source were checked because the documented
custom-card examples and actual `cardContent` component interface differed.
