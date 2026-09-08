# Audit repair batch — 2026-09-08

> Historical evidence. Commands and bare artifact paths describe the original run.
> [Original record and artifacts](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/README.md) are preserved in the published checkpoint; see [current status](../STATE.md) for maintained guidance.

This batch implements the confirmed findings in the [browser audit](../audit-2026-09-08/README.md) and its immediate UI consistency work. The owner requested implementation in a broad batch, followed by integrated verification. Historical audit evidence is retained unchanged.

## Implemented scope

| Audit finding | Repair |
| --- | --- |
| A01: pin action discards a draft | Focus and read-receipt commands preserve the inspector and draft; form saves and auxiliary commands have separate completion behavior. |
| A02: unrelated save splits comma-containing tags | Tags remain exact strings, with separate chips, explicit entry and project suggestions. |
| A03: List type leaks into Board creation | Creation type follows the active view; only List can use its milestone collection. |
| A04: archived cards disappear from the UI | List exposes active/archived selection, exact tag/status/priority filters, and a shareable URL. The inspector exposes the existing archive lifecycle and restoration. |
| A05: month grid grows several screens tall | Calendar month has bounded height and accessible overflow; small screens default to a bounded month agenda with an explicit grid option. |
| A06: calendar date/layout reset on reload | Date and layout are controlled by the application route and restored on reload/history navigation. |
| A07: browser Back fails to navigate | Semantic navigation creates history entries, text search updates the current entry, and Back/Forward protect open drafts. Concurrent resource loads cannot overwrite newer navigation. |
| A08: mobile sign-out unavailable | The mobile top bar exposes Sign out alongside host/settings controls. |
| A09: Focus ignores project/search scope | Pinned cards obey project/title filters and archived visibility. Attention reasons are grouped by resource. |
| A10: duplicate tags cause unrelated validation feedback | Duplicate, empty, overlong and excessive tags receive field-specific messages. |
| A11: Board violates its style CSP | Willow supplies its theme without the child wrapper that writes an inline style; the board owns its CSS wrapper. CSP is unchanged. |
| A12: Calendar Today differs from workspace date | Calendar uses the workspace date; the shell's date ticks in the configured timezone while the tab stays open. |

Additional changes include a shared noninteractive metadata presentation in Board, List and Focus; distinct hard/target/planned/review dates; priority text and blocker reasons; tighter shell spacing; readable update kinds; mobile title containment and active-tab scrolling; a visible Gantt selection/name column; explicit stale timeline page recovery; and inspector sections for description, named relationships, lifecycle, related updates and technical details.

Settings and Focus ordering receive consistent loading, pending-command, keyboard and mobile behavior. Writes continue through the daemon with existing version, epoch and request identity checks. No source schema or protocol extension is introduced.

## Verification

The repair batch passed integrated verification on the release build in Chromium 153.0.8010.12. All normal writes went through the paired browser or versioned CLI to the real daemon and synthetic source files.

| Check | Final result | Evidence |
| --- | --- | --- |
| Contracts and Svelte/TypeScript | 0 errors, 0 warnings | [Static check](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/static-check.txt) |
| Frontend and embedded release binaries | Passed | [Frontend](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/frontend-build.txt), [release](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/release-build.txt) |
| Node regression helpers | 25/25 passed | [Helper test inventory](verification.md) |
| Editor, tags, archive, filters and navigation | 15/15 passed, no page errors | [Results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/editor-browser/results.json) |
| Calendar and timeline repair checks | Passed; 7 checkpoints, no page errors or CSP violations | [Results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/planning-browser/results.json) |
| Board, Settings, Focus and mobile sign-out | 6/6 passed, no page errors | [Results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/board-dialog-browser/results.json) |
| Maintained end-to-end browser regression | Passed | [Log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/browser-smoke.txt) |
| Maintained planning/gesture regression | Passed | [Log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/planning-smoke.txt) |

The final checks include a genuinely committed focus command with its response lost, stale-version conflicts, dirty and clean Undo, dirty Back followed by Save, delayed resource responses after changing view/project, exact tags with commas and outer spaces, archive restoration, keyboard ordering, touch scrolling, gesture cancellation, source-file updates, pagination and session revocation with preserved drafts. Test-only 401 pairing probes and deliberately injected 503 responses are expected; they are not unexplained application errors.

The crowded desktop calendar fell from 3,234 px to 742 px (same 56 dated items; document height from 3,822 px to 1,182 px). At 390 px wide, month agenda is 606 px high and the optional grid is 742 px high, with no horizontal document overflow. The agenda test checks real unobscured event targets and internal scrolling to the last event, not only DOM presence. Workspace Today also passes when the browser date is the previous day in Honolulu.

Implementation and visual records:

- [Editor and tags](editor-changes.md)
- [Board and shared metadata](board-presentation.md)
- [Calendar and timeline](planning-implementation.md), [visual verification](planning-visual-review.md)
- [Settings and Focus dialogs](board-settings-focus-dialogs.md), [visual verification](board-visual-verification.md)
- [Test scope and corrected harness assumptions](verification.md)
- [Screenshot inventory and hashes](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/fixes-2026-09-08/screenshots.json)

## Remaining product work

The audit's product roadmap remains separate from these repairs: a richer card domain (structured checklists, assignees/ownership, templates and typed custom fields), centrally managed tag identities with rename/merge operations, saved cross-view filters, and broader workflow/reporting capabilities require explicit domain and protocol design. The current tag picker and card inspector improve the existing model without pretending those capabilities exist.

Physical iPhone/Safari acceptance, multi-device behavior and full release acceptance require their respective environments. Browser automation uses synthetic projects and the existing normal pairing flow; any self-signed certificate exception is confined to test browser contexts.
