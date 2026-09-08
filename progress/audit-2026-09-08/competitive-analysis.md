# Astra competitive capability analysis — 2026-09-08

**Repository inspected:** `c3b912f`. **Evidence:** source and contract inspection plus current official product documentation. This supplement does not claim browser execution or competitor account testing. Browser results belong to the main audit.

The strongest opportunity is to turn Astra's existing planning data into a coherent daily product experience. The owner explicitly identified two important gaps on 2026-09-08: **a fully developed card model and experience**, and **sensible tag handling**. Card metadata and labels already exist; their presence does not establish a mature card workflow or tag system. These foundations, retrieval, and consistent editing should precede adding more product categories.

## Scope and interpretation

Astra is a personal planner associated with explicitly selected local folders, with `.project/` as the source of truth and a coordinating server. Here, “local” does **not** mean the browser supports offline mutation. The product explicitly rejects silent offline write queues.

The comparison uses Linear for interaction efficiency, Todoist for personal task capture and filtering, Trello for repeatable card workflows, and Asana for timeline communication. It is not a feature-count contest with enterprise suites. Competitor features may be subject to plan restrictions; this report does not compare subscription prices or claim every feature is available on a free plan.

Evidence labels used below:

- **Present in source:** implemented UI/API path identified; not an end-to-end pass by this research alone.
- **UI gap:** underlying data or API capability exists, but a normal control or discovery path is absent in the inspected UI.
- **Absent from inspected native feature surface:** no corresponding first-class model, operation, or UI was found. This does not claim a user cannot approximate it in free text or an external tool.
- **Not verified:** available evidence is insufficient for a behavioral conclusion.
- **Deferred by scope:** explicitly beyond v1; absence is not a defect.

Normative references: [product scope](../../docs/01-PRODUCT.md), [owner scope decisions](../SCOPE.md), [data model](../../docs/03-DATA-FORMAT.md), [API contract](../../contracts/openapi.yaml).

## Capabilities Astra already has

The following should not appear in a missing-features list:

- Focus pins with independent manual order and deterministic attention reasons.
- Project, card, milestone, and append-only update records; outcome and decision cards.
- Five card states, four priorities, labels, explicit blockers, archive flag, and review dates.
- Planned date ranges distinct from target dates and hard deadlines.
- Per-project Kanban drag/reorder, title-only creation, and saved board position/scroll state.
- Calendar planning with day/week/month/agenda layouts, move/resize, and keyboard alternatives.
- Gantt milestones and dependencies, dependency editing, and read-only finish forecasting with a driving chain and incomplete-forecast warnings.
- Full-text search in List and Updates; title filtering of loaded data in several other views.
- Shared resource editor, Markdown preview, change history, version-checked undo, draft-copy and conflict handling.
- Deep-link query parameters for view/project/resource, browser theme selection, timezone/week-start preferences, pairing and session revocation.

Source: [App.svelte](../../apps/web/src/App.svelte), [Editor.svelte](../../apps/web/src/features/editor/Editor.svelte), [Board.svelte](../../apps/web/src/features/board/Board.svelte), [CalendarView.svelte](../../apps/web/src/features/planning/CalendarView.svelte), [GanttView.svelte](../../apps/web/src/features/planning/GanttView.svelte), [Settings.svelte](../../apps/web/src/features/settings/Settings.svelte).

## Owner-identified foundational gaps

These two gaps are explicit owner feedback, supported by source inspection where stated. They are product-design findings, not browser-confirmed failures. The [card model and tag specification](card-model-and-tags.md) is the canonical detailed proposal; the priorities below are audit recommendations rather than a change to release scope or authorization to implement new contracts.

1. **A fully developed card model and experience is missing.** The existing domain has identity, title, Markdown body, outcome/decision kind, state, priority, dates, labels, relationships, and linked update records. The missing layer is a coherent product definition: what a card represents, how an outcome or decision is expressed, how acceptance is recorded by a person, and how properties and related updates support that work. A shared form alone does not answer those questions. Define one card-details experience with a clear title/body hierarchy, outcome or decision context, visible acceptance criteria, related updates, and progressively disclosed properties. Use the same action names, eligibility rules, and saved/conflict feedback in every layout. Include safe creation/editing drafts, intentional close/discard, recovery after failed saves, and return to the previous view context. Structured acceptance fields or other schema changes are proposals; they must not be assumed to exist today.
2. **Sensible tag handling is missing.** Cards already store `labels` as a list of strings. The inspected editor joins that list into a text input and splits it on commas when saving; it trims whitespace and removes empty entries. That is basic text entry, not a coherent tag selection, discovery, and maintenance workflow. Provide chips with multi-select, autocomplete from existing labels, explicit creation, consistent display and filtering, and accessible keyboard/touch removal. Define tag scope, identity, case/whitespace handling, duplicate prevention, and the behavior of identically named tags across projects before building rename/merge operations. Rename and merge must preview their scope and affected records, preserve unrelated data, and report version conflicts instead of silently overwriting changes. These management operations were not identified as first-class workflows in the inspected feature surface.

Source basis: [card fields and limits](../../docs/03-DATA-FORMAT.md), [current label input and serialization](../../apps/web/src/features/editor/Editor.svelte), [list filter API](../../contracts/openapi.yaml). Existing label limits remain relevant: at most 20 labels per card and 48 characters per label. A future tag design must either respect these limits or deliberately revise the shared contracts; a frontend-only divergence is not acceptable.

## Comparison and practical gaps

| Capability | Official comparison evidence | Astra evidence and classification | Practical consequence / recommendation |
|---|---|---|---|
| Structured filtering | Linear combines field filters and reflects main filters in URLs. Todoist has saved criteria for dates, labels, priority, and projects. [Linear filters](https://linear.app/docs/filters), [Todoist filters](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH) | **UI gap.** The list API already accepts `status`, `priority`, `label`, `milestone_id`, and `archived`; the main toolbar exposes project, text, resource type, and unread-only. | First expose the existing fields through compact filter chips. Later add explicit date/review/blocker filters. Avoid forcing people to remember title words. |
| Saved views | Linear saves filtered issue/project views; Asana saves search parameters that update as work changes. [Linear custom views](https://linear.app/docs/custom-views), [Asana search views](https://help.asana.com/s/article/search-and-search-views?language=en_US) | **Absent from inspected native feature surface.** Board restoration and default-view preference are present, but they are not named reusable filters. | Add personal views such as “Decisions”, “This week”, and “No plan”. Keep them compact in navigation and backed by explicit criteria. |
| Reliable retrieval across screens | Todoist filtering operates on task criteria; Linear applies filters consistently to issue views. [Todoist filters](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH), [Linear filters](https://linear.app/docs/filters) | **Partial.** List/Updates use server content search. Board explicitly filters only loaded pages and disables reorder during filtering. Calendar/Gantt filter loaded titles. | A card can appear absent solely because it is outside the loaded set. Provide one workspace search and make local-view filtering visually distinct. Do not pretend the current implementation has no search. |
| Sorting, grouping, and visible columns | Linear offers grouping, ordering, property visibility, and persistent display preferences. [Linear display options](https://linear.app/docs/display-options) | **UI gap / new view configuration.** List uses fixed Title/project, Status, Due date columns; no sort/group control was identified. Manual board order exists. | Add Sort and Display controls, beginning with deadline, priority, updated date, and milestone. Keep manual rank distinct from temporary sort order. |
| Multi-select and bulk actions | Linear supports mouse/keyboard multi-selection, common bulk actions, and command/context menus. [Linear selection](https://linear.app/docs/select-issues) | **Absent from inspected native feature surface.** Current card operations are single-item. | Batch priority, labels, review date, milestone, and archive greatly reduce repetitive editing. Every item must retain its version/conflict result; a batch must not silently overwrite newer edits. |
| Global command/search entry | Linear operates selected issues through a command bar and keyboard shortcuts. Todoist Quick Add has a keyboard entry and parses task properties. [Linear selection](https://linear.app/docs/select-issues), [Todoist Quick Add](https://www.todoist.com/help/todoist/features/use-task-quick-add-in-todoist-va4Lhpzz) | **Partial.** Local board/calendar keyboard gestures exist; no global command palette or app-wide quick-create shortcut was found. | Add one discoverable command/search entry and a shortcut guide. Support create, navigate, focus, status, dates, and search before adding numerous single-letter shortcuts. |
| Compact capture | Todoist Quick Add captures dates, labels, priority, and other task details from one entry point. [Todoist Quick Add](https://www.todoist.com/help/todoist/features/use-task-quick-add-in-todoist-va4Lhpzz) | **Present foundation, partial experience.** Title-only creation exists in Kanban and the product contract requires only title. The general editor exposes many fields immediately. | Use a compact title-first composer with optional property chips and expand-to-details. Natural-language date parsing is optional; explicit date chips can deliver most of the benefit. |
| Reusable templates / duplicate | Trello creates cards from card templates; Linear templates preset properties and descriptions. [Trello templates](https://support.atlassian.com/trello/docs/creating-template-cards/), [Linear templates](https://linear.app/docs/issue-templates) | **Absent from inspected native feature surface.** No user-facing duplicate/template flow was found. Gantt's widget copy action is deliberately intercepted, so a library feature is not an Astra feature. | Add a small set of local outcome/decision templates and “Duplicate as draft”. Default to resetting identity, history, completion, focus, and dates; make copied relationships explicit. |
| Archive retrieval and restore | Trello exposes searchable archived items and a restore action. [Trello archive](https://support.atlassian.com/trello/docs/archiving-and-deleting-cards/) | **UI gap.** Card archive checkbox and list API `archived` filter exist. Main card rendering excludes archived cards, and no archive view/toggle was identified. | Treat browse-and-restore as a completion of the existing archive workflow, not an optional expansion. Deep-link reopening is not an adequate discovery path. |
| Checklist / parent-child decomposition | Trello supports reorderable checked items, checklist progress, and conversion of an item into a card. [Trello checklists](https://support.atlassian.com/trello/docs/adding-checklists-to-cards/) | **Absent from inspected native feature surface.** Card metadata has dependencies and milestone membership, not parent/subtask or checklist fields. Plain Markdown renderer has no task-list plugin. | Consider a small acceptance checklist only if real usage needs it. Avoid turning every agent's detailed implementation plan into planner cards. Completing checklist items must not automatically accept the outcome. |
| Dependency clarity | Asana's timeline draws dependencies and distinguishes conflicting overlaps. [Asana timeline dependencies](https://help.asana.com/s/article/managing-tasks-and-dependencies-with-timeline?language=en_US) | **Present foundation.** Astra draws/edits dependencies and computes a read-only forecast. The editor still renders relationship IDs and exposes manual ID fields alongside title search. | Improve title/status chips, predecessor/successor explanations, and “why this finish date?” disclosure. Do not label dependencies or forecasting missing. Automatic successor rescheduling conflicts with the current product rule. |
| Recurrence | Todoist provides recurring task dates. [Todoist recurrence](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV) | **Deferred by scope.** Recurrence is explicitly beyond v1. | Record as a future personal-planning differentiator, especially reviews. Do not add a placeholder control or treat absence as a v1 defect. |
| Cross-project overview | Asana documents portfolios, status updates, milestones, and dashboards. [Asana feature overview](https://help.asana.com/s/article/all-asana-features) | **Present but shallow UI.** Projects are shown with loaded-card/update counts and availability; richer project goal, phase, next milestone, and significant update are product requirements. | Improve existing project summaries before introducing portfolio objects, executive dashboards, or company goals. Count summaries must disclose pagination or use server totals. |
| User-defined structured fields | Trello supports custom fields as structured card data. [Trello card capabilities](https://support.atlassian.com/trello/docs/add-and-customize-cards-and-lists/) | **Partial technical extension, absent polished product feature.** Astra allows extensions and an advanced JSON area, but no normal schema/field management UI was identified. | Defer a generic custom-field builder until built-in filters, relationship pickers, and field consistency work well. Raw JSON is not an end-user custom-field experience. |

## Recommended order

These are product recommendations, not implementation authorization or changes to the recorded release scope. The Kanban feature freeze remains relevant; bug fixes and existing workflow completion should be separated from new Kanban features in a later implementation plan.

### P1 — complete everyday workflows

1. **Complete the card model and details experience — owner-identified foundation:** define the card's purpose, title/body structure, outcome/decision content, human acceptance, related updates, common properties, and safe draft lifecycle before proliferating new card controls. Acceptance: an outcome and a decision can each be created, understood, edited, and reviewed through the same details experience; acceptance is explicit and is never inferred from reports or checklist progress; equivalent actions behave consistently from List, Board, Calendar, and Gantt; failed/conflicting saves retain recoverable work and never claim success or overwrite newer data; closing details restores the user's view context. This does not introduce a new persisted `draft` status without a contract decision.
2. **Coherent tag selection, discovery, and management — owner-identified foundation:** replace the comma-separated editor interaction with chips, autocomplete, and multi-select; define scope and normalization; connect tags to consistent display and retrieval. Acceptance: a user can discover and reuse an existing tag, explicitly create a valid new one, add/remove several tags by keyboard or touch, and find matching cards beyond the first loaded page; ambiguous tag scope is visible; duplicate prevention follows a documented rule; rename/merge previews the affected scope and records, preserves unrelated properties, and reports per-record conflicts. Specify single-tag and multi-tag filter semantics before release. Any new management API or identity model requires coordinated domain, schema, API, CLI, and UI work.
3. **Archive browser and restore:** add an Archived filter/view with search, clear status, and Restore. Acceptance: a user can archive, close the editor, find the item again without remembering its link, and restore it without changing its outcome status.
4. **Unified filtering and search:** expose the already-supported list filters, distinguish workspace content search from loaded-title filtering, and preserve active filters when changing compatible layouts. Acceptance: an item beyond the first page can be found; zero results differ from no data or unavailable data.
5. **Common card properties and named relationships:** implement the shared controls established by the card/tag foundations for status, priority, tags, dates, milestone, dependency, and archive. Acceptance: selecting a milestone or resolving a decision never requires copying an opaque ID.
6. **Sort and display controls in List:** make priority, planned dates, deadlines, review date, labels, and milestone visible when useful. Acceptance: the same card facts use the same labels and meanings in List, Board, Calendar, and details; sorting does not rewrite manual order.

### P2 — reduce repeated work

7. **Faster contextual capture:** refine the foundational title-first creation and common action menu with fewer steps and useful property chips. Creation keeps context (selected project, board column, calendar range) and makes those defaults visible; consistent basic actions and safe drafts belong to P1.
8. **Saved personal views:** begin with named criteria and layout, avoiding a full enterprise view builder. Store dynamic date predicates rather than freezing today's date into “This week”.
9. **Multi-select and batch operations:** start in List. Show selected count, exact scope, per-item failures, and a clear route to recover from conflicts. “Select all loaded” and “select all matching” must be separate decisions.
10. **Command palette and shortcut help:** reuse the same action implementation as visible buttons, suppress shortcuts while typing, and keep touch equivalents. Add discoverable shortcuts only after the action vocabulary is stable.
11. **Duplicate as draft and small templates:** reduce repeated outcome/decision entry. Templates should insert useful structure without requiring configuration before the first card.

### P3 — decide after real usage

12. **Interactive acceptance checklist:** consider checkable structured items only after the P1 card model makes acceptance criteria and human acceptance clear. A checklist widget is optional; a comprehensible card outcome and acceptance workflow are foundational. Prefer this over arbitrary subtask hierarchies and automatic progress percentages.
13. **Optional export for a selected view:** a portable Markdown/CSV snapshot could help reporting, but is not backup/restore and must be designed separately from the owner's deferred built-in backup scope.
14. **Recurrence and reminders:** revisit after v1 and explicitly account for host availability, missed runs, recurrence semantics, and the distinction between a review date and a push notification.

## Interaction principles worth borrowing

The useful pattern in mature tools is consistency and control over density, not simply a larger feature menu.

- Keep frequent actions visible: add, search, filter, select view, and the current project. Put infrequent actions into a consistent overflow menu and disclose connection/history/advanced details when relevant.
- Show title, status, and the next meaningful date first. Let people reveal extra properties without changing the underlying record.
- Use the same field control and mutation feedback everywhere. A date edit should communicate the same pending, saved, conflict, and undo states whether initiated by dragging or a form.
- Preserve view context after closing details or following a relationship: filter, selection, scroll, period, and visible columns.
- Keep a normal non-gesture path for every mutation. A hover-only affordance or unexplained keyboard shortcut is insufficient for the required phone experience.
- Present schedules, target dates, hard deadlines, and review dates as distinct concepts. Astra's existing distinction is valuable and should remain visible when the UI becomes more compact.

These are recommendations inferred from the competitor capabilities and Astra's own product requirements. They are not measured comparative usability results.

## Features intentionally excluded from parity targets

Do not add team roles, assignments, public sharing, payments, cloud synchronization, offline browser writes, resource capacity planning, native mobile clients, agent orchestration, worktree management, or binary attachments just because larger products have them. They do not follow from Astra's accepted personal/local scope.

Do not copy automatic successor rescheduling into the saved plan: Astra explicitly keeps dependency forecasting read-only and requires deliberate date changes. Do not replace human acceptance with checklist completion, commit counts, or AI scoring. Rich-text/WYSIWYG, working hours, recurrence, and push notifications are recorded beyond v1. Built-in backup archives/restore and a general source migration framework are separately deferred by the owner.

## Verification limits and follow-up evidence

- This source inventory does not establish that existing drag/resize, mobile, theme, search, history, or conflict behavior works. The browser audit must provide that evidence.
- Competitor documentation establishes described features, not comparative speed, visual quality, reliability, or accessibility conformance. Asana's rendered help pages returned a minimal shell; its capability statements here rely on the official search-indexed text for those exact pages, making that evidence less complete than Linear/Todoist/Trello page reads.
- Physical iPhone/touch behavior, screen-reader behavior, production network recovery, scale, and persistence across server restarts are not verified by this research.
- No absent feature has been inferred solely from an unimplemented library toolbar: Astra intentionally intercepts several Gantt widget actions to preserve its own mutation contract.
- Local evidence for this supplement was read without changing application code, starting services, or altering project data. The original supplement has been updated to include the owner's card-model and tag feedback; the linked audit documents contain the detailed proposals. No new browser evidence is implied by this revision.
