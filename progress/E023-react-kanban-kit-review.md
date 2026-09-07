# E023 — React Kanban Kit review

Date: 2026-09-07. Review requested after the SVAR integration.
Reviewed source commit: `8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b`.
No upstream scripts were executed and no dependency was installed.

## Recommendation

Keep the current Svelte/SVAR adapter. Borrow interaction ideas before considering
another component or gesture-engine migration. This is a recommendation, not
an accepted backlog or scope change.

| Idea observed in upstream source | Application to Astra |
| --- | --- |
| Separate drag preview and insertion indicator; top/bottom edge detection | Highest-value follow-up: display the whole card under the pointer and the exact legal insertion point. Current Astra moves its handle and confirms placement in the dialog. |
| Auto-scroll at board and column boundaries | Add bounded vertical scrolling for long columns, retaining cancellation and the captured version. Astra currently preserves horizontal edge scrolling. |
| Separate loaded child IDs and total child count | Already preserved in Astra's server-backed column counts; do not regress to loaded-array counts. |
| Virtualized lists, skeleton placeholders and `loadMore(columnId)` | Useful if measurements justify continuous scrolling. Start with SVAR's existing virtualization capability. Keep bounded loading, cursor rules, explicit errors and request deduplication. |
| Custom column/list footers | Move pagination and Add card closer to their column when the layout warrants it. |
| `onCardMove` reports the IDs above and below the destination | Fits Astra's neighbor-based placement. Preserve the server's versioned command adapter rather than calling the local optimistic `dropHandler`. |
| Column dragging | Lower priority: Astra columns encode a fixed status workflow; any visual ordering should remain a view preference. |

The source uses React hooks and portals, `virtua`, and Atlassian's Pragmatic
Drag and Drop. Atlassian's core is framework-independent and explicitly supports
Svelte; its optional React visual packages need not be used. `virtua` also has
a Svelte adapter. Neither is needed solely to reproduce the first two visual
improvements. Adding a second virtualization layer to SVAR would be redundant.

The infinite-scroll helper scans rendered skeleton elements and compares their
vertical bounds with the window. It is not a ready-made Astra cursor/concurrency
adapter. The host application still needs loading/error state and protections
against repeated requests and hidden neighbors. No comparative runtime or bundle
benchmark was performed, and README mobile claims are not physical-device proof.

## Package observations

The checked source declares version `0.0.2-beta.7` and requires React and
React DOM >=18. Its `package.json` declares MIT, while the repository `LICENSE`
contains an Apache-2.0 notice (copyright 2024 Hazem braiek). Resolve that
discrepancy before directly incorporating source; this review copies no code.

## Sources

- [Repository and examples](https://github.com/braiekhazem/react-kanban-kit/tree/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b)
- [Card gesture and preview](https://github.com/braiekhazem/react-kanban-kit/blob/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b/src/global/dnd/useCardDnd.tsx)
- [Virtualized column content](https://github.com/braiekhazem/react-kanban-kit/blob/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b/src/components/ColumnContent/ColumnContent.tsx)
- [Drop and neighbor calculation](https://github.com/braiekhazem/react-kanban-kit/blob/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b/src/global/dnd/dropManager.ts)
- [Package manifest](https://github.com/braiekhazem/react-kanban-kit/blob/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b/package.json), [license file](https://github.com/braiekhazem/react-kanban-kit/blob/8a6aeaeb2c16a23999c20f0d10aefdbb7d201f1b/LICENSE)
- [Atlassian's framework-independent core](https://github.com/atlassian/pragmatic-drag-and-drop)
- [virtua framework support](https://github.com/inokawa/virtua)
