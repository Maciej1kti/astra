# Browser screenshot review — 2026-09-08

This is a review of actual rendered pixels, supported by the browser measurements in [settled-view-metrics.json](checks/settled-view-metrics.json). It covers all 28 final `verified-{light,dark}-{1440,390}-{focus,projects,board,calendar,gantt,list,updates}.png` images, plus the mobile editor, dark settings, and 320/768/1280 layout probes. No application or image content was changed during this review.

The final `verified-*` captures replace the first navigation captures as evidence of populated views. In particular, `dark-board.png`, `dark-calendar.png`, `dark-gantt.png`, `mobile-gantt.png`, and `mobile-updates.png` captured recovery/loading states. Their empty content is **not evidence of missing application data**. The final run waited for the connected event stream, two animation frames, and the absence of loading text. Full-page screenshots are taller than the physical viewport; scaled previews should not be used to judge text size.

Severity used here: **P1** = substantial impediment to a central workflow; **P2** = meaningful clarity, consistency, or efficiency problem; **P3** = polish. These are visual/product findings, not independent proof of interaction or persistence failures.

## Strongest findings

### V01 — P1: One crowded calendar week expands the entire month

**Pixels:** The populated September month has enormous equal-height weeks, including entirely empty first and last weeks. The first actual events appear well below the initial viewport. At desktop width the user initially sees a blank week rather than the work scheduled around September 7. At 390 px, the blank first week alone requires significant vertical travel before events can be seen.

**Measured:** The calendar is **3,234 px high at 1440 px width**, making the document 3,822 px tall. At 390 px, the calendar is **4,037 px high**, making the document 4,756 px tall. Both themes produce the same dimensions. The settled calendar has 56 rendered events, so this is a populated-state result, not a loading artifact.

**Evidence:** [Desktop light](screenshots/verified-light-1440-calendar.png), [desktop dark](screenshots/verified-dark-1440-calendar.png), [mobile light](screenshots/verified-light-390-calendar.png), [mobile dark](screenshots/verified-dark-390-calendar.png).

**Likely cause, separated from observation:** `CalendarView.svelte:62` configures `height: "auto"` and line 70 sets `dayMaxEvents: true`. The installed calendar's `plugins/day-grid/View.svelte:37` adds `ec-uniform` for that setting. Its `styles/index.css:32` sets uniform rows to `minmax(0, 1fr)`. With no bounded height, the crowded week can enlarge every fractional row. This source path is a strong explanation; a fix was not implemented or tested in this review.

**Plan:** Give month mode a bounded working height and a genuine visible event limit with a `+N more` drilldown. Preserve full event access in a day panel or agenda. Acceptance: empty weeks remain compact with this exact fixture; all scheduled work is still reachable; adding another 20 events on one day does not multiply the height of unrelated weeks.

### V02 — P1: Mobile planning views retain a desktop canvas without sufficient context

**Pixels:** In mobile month mode only Monday through part of Thursday are visible. In mobile Timeline only approximately three date columns are visible; the left card-name column is absent from the visible canvas. Rows whose bars lie outside those dates appear blank and have no visible identifier. Board shows one column and a narrow slice of the next, while the next column's heading is mostly invisible. These are contained scrolling regions, not evidence of whole-page horizontal overflow.

**Measured/source:** The mobile month calendar remains **640 px wide inside a 390 px viewport**, by `.month .ec { min-width: 640px; }` in `CalendarView.svelte:470`. The settled document itself remains 390 px wide. The original 320 and 768 probes demonstrate the same clipped canvas pattern, but populated 320/768 readiness was not independently recaptured.

**Evidence:** [Mobile calendar](screenshots/verified-light-390-calendar.png), [mobile Timeline](screenshots/verified-light-390-gantt.png), [mobile Board](screenshots/verified-light-390-board.png), [320 calendar](screenshots/layout-320-calendar.png), [768 calendar](screenshots/layout-768-calendar.png). Dark counterparts show the same layout.

**Plan:** Default a phone calendar to agenda/day with an explicit month option; keep a compact card identity available in Timeline during horizontal travel; add `Today`/fit controls and a selected-card summary near the canvas. Make Board's active column and horizontal navigation explicit. Confirm finger scrolling, drag initiation, edge resizing, and row identity on an actual phone; screenshots alone cannot establish that those gestures work.

### V03 — P2: Mobile navigation can hide the selected view and account controls

**Pixels:** On the settled Updates screen, the active navigation pill is visible only as a sliver at the far right. The selected view's label is outside the visible strip. At 320 px, Timeline is truncated and List/Updates are offscreen. In the 320 px header, the selected project wraps into four lines and extends below the topbar boundary. Sign out and connection status are present in desktop screenshots but absent from the mobile page shell.

**Evidence:** [Light Updates](screenshots/verified-light-390-updates.png), [dark Updates](screenshots/verified-dark-390-updates.png), [320 Board header](screenshots/layout-320-board.png), [desktop shell](screenshots/verified-light-1440-board.png).

**Source confirmation:** `App.svelte` hides `.asidebottom` below 700 px and changes `nav` to a horizontal overflow region. The header has a fixed 50 px height on mobile. This verifies the current responsive intent, but does not itself prove whether a separate sign-out path exists elsewhere; see the interaction audit for that check.

**Plan:** Use a compact mobile navigation with an explicit `More` destination and account menu. Always scroll the selected tab into view if a tab strip remains. Put the project name on a controlled line, with ellipsis and an accessible full label or picker.

### V04 — P2: Important content starts too far down the mobile screen

**Pixels:** The recurring eyebrow, large editorial heading, subtitle, standalone Add button, project/search row, and view-specific controls form a large stack. Board's working area begins around y=397; Calendar around y=613; populated Timeline requires a further forecast summary, warning, scale controls, and instruction paragraph before the chart begins. On a 390×844 viewport, the populated Timeline chart is below the initial screen. Focus places its actual attention queue below the statistics and pin section, close to the bottom of the first viewport.

**Evidence:** [Mobile Board](screenshots/verified-light-390-board.png), [mobile Timeline](screenshots/verified-light-390-gantt.png), [mobile Focus](screenshots/verified-light-390-focus.png), [mobile Calendar](screenshots/verified-light-390-calendar.png).

**Plan:** Use a single compact heading/action row in working views. Move explanations behind an information control, condense forecast data, and surface a concise actionable issue with details on demand. Keep the full introductory treatment for onboarding. Acceptance: real work is visible on the first screen at 390×844 without hiding necessary context or shrinking text.

## Cross-view consistency and card model

### V05 — P2: Focus repeats one card as several equally weighted attention rows

**Pixels:** `Design system foundations` appears separately as Overdue, Blocked, and Review Due. `QA work package 13` appears as Overdue and Review; `QA work package 33` as Review Due and Review. The interface says `18 items`, while a user can reasonably read that as 18 distinct tasks. Almost every row uses the same pale dot and neutral badge. The most urgent work has little visual separation from routine review work.

**Evidence:** [Mobile Focus](screenshots/verified-light-390-focus.png), [desktop Focus](screenshots/verified-light-1440-focus.png), [dark Focus](screenshots/verified-dark-390-focus.png).

**Plan:** Show one attention row per card with multiple reason badges, sort by the most severe reason, and define whether the count means cards or signals. Use restrained semantic treatment for overdue/blocking conditions. An explicitly pinned Cancelled card also remains in Focus in these screenshots; whether that is intended needs a lifecycle rule, not a styling assumption.

### V06 — P2: The same card has incompatible visible summaries across views

**Pixels:** Board exposes priority, blocked state, due date, planned range, review date, and labels as dense text. List exposes only title/project, status, and due date. Focus shows a title and one reason. Thus `Design system foundations` is visibly urgent and blocked on Board, but those attributes disappear from List. Dates and badges change placement and treatment between screens.

**Evidence:** [Board](screenshots/verified-light-1440-board.png), [List](screenshots/verified-light-1440-list.png), [Focus](screenshots/verified-light-1440-focus.png).

**Plan:** Define a shared card summary model: identity/title, lifecycle state, priority, blocking indicator, next relevant date, tag summary, and selection/action state. Each view can expose fewer fields, but shared fields must have the same meaning, vocabulary, icons, and formatting. Add optional List columns and filters before trying to solve this solely with colors. See [card-model-and-tags.md](card-model-and-tags.md) for the domain-level gap.

### V07 — P2: Tags are visually a comma-separated form value, with little information architecture

**Pixels:** The editor shows `Labels` as one plain text input containing `design, launch`. Board displays those values as small outline chips. No taxonomy, descriptions, colors, usage count, or tag picker is visible in the reviewed editor. List has no tag column or tag filter in its visible toolbar.

**Evidence:** [Mobile editor](screenshots/mobile-editor-top.png), [editor details](screenshots/mobile-editor-details.png), [Board chips](screenshots/verified-light-390-board.png), [List toolbar](screenshots/verified-light-390-list.png).

**Limit:** A screenshot proves the displayed input, not every available keyboard suggestion or tag parsing behavior. Tag mutation correctness is covered by the interaction audit.

**Plan:** A real token picker with suggestions, explicit creation/removal, duplicate normalization rules, and stable tag identity; shared multi-tag filtering; a management surface for rename/merge/archive. Render the same tags in the card drawer and every view where they are enabled.

### V08 — P2: Search and project controls lose clarity at narrow widths

**Pixels:** In mobile List and Updates, three controls share one row. The project selection reads only `Studio lau…` and the search hint is clipped (`Search conte…`). Board/Focus use `Filter loaded titles…`, while List/Updates use `Search content…`. The Projects screen retains the `Studio launch` selection while displaying all three projects, which communicates an ambiguous scope.

**Evidence:** [Mobile List](screenshots/verified-light-390-list.png), [mobile Updates](screenshots/verified-light-390-updates.png), [mobile Projects](screenshots/verified-light-390-projects.png).

**Plan:** Give search a full row on narrow screens or a clear expandable search control, show the active scope as a labeled filter, and define the distinction between global search and title filtering. The Projects inventory should not display a seemingly active project filter that does not constrain its cards. Functional filter semantics require the interaction results for confirmation.

### V09 — P2: Status and priority styling does not communicate urgency consistently

**Pixels:** Planned, Active, Review, Done, and Cancelled all use essentially the same neutral status badge in List. Urgent and Blocked on Board are plain small text next to dates. Overdue in Focus uses the same treatment as Review. Calendar distinguishes planned work, deadlines, and reviews with tinted blocks, but those colors are not visibly carried through to the other views.

**Evidence:** [List](screenshots/verified-light-390-list.png), [Board](screenshots/verified-light-1440-board.png), [Focus](screenshots/verified-light-390-focus.png), [Calendar](screenshots/verified-light-1440-calendar.png).

**Plan:** Use shared semantic tokens and a small family of badges/icons for state, priority, and attention. Preserve textual labels; do not make color the sole signal. Reserve stronger styling for urgent decisions and failed/blocked work, while completed/cancelled content recedes.

## Dark theme and editor details

### V10 — P2: Dark theme loses some component boundaries and icon visibility

**Pixels:** Dark Board card backgrounds nearly merge with column backgrounds, leaving text clusters and whitespace as the main separators. The app logo glyph is dark green on a muted green tile and is noticeably less distinct than in light mode. In dark Updates, the arrow icon becomes very faint against its oval background. Calendar event tints remain distinguishable, and form surfaces, body text, borders, and date fields are coherently themed.

**Evidence:** [Dark Board](screenshots/verified-dark-1440-board.png), [light Board comparison](screenshots/verified-light-1440-board.png), [dark Updates](screenshots/verified-dark-390-updates.png), [dark settings](screenshots/settings-dark.png).

**Plan:** Define separate dark surface/card/hover/selection and icon tokens, and ensure icons inherit an appropriate foreground. Retain subtle, visible card boundaries in Board. These are visual contrast concerns; no numerical contrast-ratio compliance claim is made from screenshots.

### V11 — P2: Card editor is a long metadata form rather than a task workspace

**Pixels:** The initial mobile editor contains Title, Status, Priority, Kind, planned dates, Labels, and deadline fields. Description and relationships require scrolling. Description is a raw Markdown textarea with a separate Preview button; relationships expose `Milestone ID`. The UI uses `Edit details` as its heading rather than the task identity. `Pin to focus` appears before the basic fields.

**Positive observation:** The editor fits the 390 px width, date pairs and dropdowns fit without visible horizontal clipping, field labels are explicit, and Cancel/Save remain fixed at the bottom in both captured scroll positions. The close button is clearly visible in the initial position.

**Evidence:** [Editor top](screenshots/mobile-editor-top.png), [editor scrolled](screenshots/mobile-editor-details.png).

**Plan:** A shared card drawer with title and state first; editable description, checklist/subtasks, tags, dates, relationships, and activity in deliberate sections. Replace raw relationship IDs with searchable resource selection. Move secondary actions to a stable action menu. Preserve unsaved content across all actions. Full-page screenshots include the background list below the viewport-sized drawer; that fact alone is not evidence of background scroll leakage or a broken focus trap.

### V12 — P3: Updates exposes internal wording and a distorted decorative icon

**Pixels:** Updates renders the type as `Decision_needed`, while Focus shows `Decision Needed`. Each update has a tall narrow oval around a small arrow; the arrow sits near the top instead of appearing as a centered, consistently sized icon. This shape consumes width on the phone without conveying additional information.

**Evidence:** [Light mobile Updates](screenshots/verified-light-390-updates.png), [desktop Updates](screenshots/verified-light-1440-updates.png), [Focus terminology](screenshots/verified-light-390-focus.png).

**Plan:** Map enum values through one shared human-readable label table, use a fixed-size centered icon, and apply a standard update row layout. Use `Decision needed` consistently.

## What the screenshots show working

- The same seven views render in light and dark themes after data settles; populated states are present in the verified evidence.
- The document does not have whole-page horizontal overflow at 390 or 1440 px. Earlier layout measurements also recorded equality between viewport and document width at 320, 768, and 1280 px, though internal surfaces still scroll.
- Long card titles wrap in Board and List; Polish diacritics and the test emoji render. The long-title row becomes considerably taller, which is a density decision to standardize, not lost text.
- Mobile List keeps title, status, and due date aligned; Focus rows and project cards have generous clickable-looking surfaces. Actual target behavior is evaluated separately.
- Calendar planned work/deadline/review distinctions and Timeline dependency connectors are visible after loading. The forecast warning visibly discloses incomplete coverage.
- Mobile editor fields, fixed Save/Cancel controls, and dark settings have no obvious clipping in the reviewed positions.

## Acceptance gates for the UI unification plan

1. **Repair planning legibility:** reproduce the same crowded-month fixture and constrain row growth; make mobile date navigation and card identity explicit.
2. **Unify the work model:** shared card identity, metadata, tag picker, lifecycle actions, and date semantics across Board/List/Focus/Calendar/Timeline.
3. **Compress the shell:** a compact common toolbar, predictable search/filter scope, mobile navigation/account access, and fewer introductory elements in repeated daily work.
4. **Apply semantic styling:** state, urgency, tag, selected/hover/focus, disabled, loading/empty/error, and light/dark surface tokens. Verify real data, long labels, and boundary sizes.
5. **Retest interactions after visual changes:** keyboard navigation, focus restoration, save/cancel, drag/resize, touch scroll, scroll-position retention, and populated loading transitions. A screenshot pass is not functional acceptance.

## Remaining limits

No physical iPhone/Safari, Android device, assistive-technology session, reduced-motion preference, browser text enlargement, or numerical color contrast measurement was performed by this visual review. Actual touch drag ergonomics, sticky behavior during continuous scrolling, cursor affordances, tooltips, keyboard focus order, and persistence cannot be certified from static images. The main browser audit owns the executed interaction evidence and distinguishes confirmed failures from gaps. Do not represent this visual review as an accessibility certification or complete device acceptance.
