# Astra browser audit — 2026-09-08

**Audited revision:** `c3b912fc122b58780f870ee4da27c2d29411725a`. **Result:** the main workflows work in the tested Chromium environment, but the application needs substantive workflow and presentation fixes before it meets the requested professional-product standard. The most important findings are lost unsaved content after pinning, unintended tag changes during unrelated edits, creation context leaking between views, missing archive retrieval, and an impractically tall month calendar.

This report includes real browser interactions against the freshly built release daemon, source/contract inspection, visual review of populated screenshots and an official-documentation comparison with Linear, Todoist, Trello and Asana. It is a bounded local audit, not complete release or physical-device acceptance. Application source and security configuration were not modified.

## Evidence map

| Document | Purpose |
|---|---|
| [Browser findings below](#reproduced-findings) | Reproduction, expected/actual behavior, priority and evidence |
| [Visual review](visual-review.md) | Actual screenshot findings, responsive/dark styling, density and planning readability |
| [UI inventory and consolidation plan](ui-inventory-and-plan.md) | All implemented surfaces, source findings, component/action standards and delivery phases |
| [Card model and tags](card-model-and-tags.md) | Two explicit owner-requested foundational gaps with concrete requirements and acceptance |
| [Competitive comparison](competitive-analysis.md) | Current official Linear/Todoist/Trello/Asana sources, present/partial/missing capabilities and scope limits |
| [Regression results](regression/SUMMARY.md) | Both existing browser suites passed with exit 0 |
| [Regression coverage and injections](checks/regression-coverage.md) | Exact tested flows and mocked boundaries |
| [Exploratory result interpretation](checks/RESULTS.md) | Raw run mapping, confirmed failures and corrected harness issues |

## Environment, data and method

- macOS 27.0 (26A5425a), Apple Silicon; Node 24.11.0; npm 11.6.1; Playwright 1.63.0; Chromium 153.0.8010.12.
- `npm ci`, frontend production build and locked Rust release build completed. `npm run check` passed with zero Svelte errors/warnings; seven Node tests passed. Initial dependency fetches required access outside the filesystem/network sandbox; they are setup events, not product failures.
- A separate real daemon, local HTTPS proxy and ordinary challenge pairing were used. The owner authorized accepting the self-signed certificate in isolated test contexts. SSL/authentication requirements in application code remained enabled. The Codex embedded browser's certificate rejection was an environment limitation, not an application outage.
- Initial exploratory fixture: **3 projects, 37 cards, 2 milestones and 4 updates**. Includes all card statuses/priorities, dated and undated work, dependencies, blockers, overdue/review signals, Unicode, a long title and an empty project. Additional cards and a milestone were created through the audited workflows. A separate regression fixture tests a 51-card column and page boundaries.
- Desktop 1440×1000 and narrow 390×844 were reviewed in light and dark after connection/data/widget readiness. Layout probes additionally used 320, 768 and 1280 px. The regression suite separately uses Chromium iPhone 13 emulation and CDP touch gestures. A Pacific/Honolulu browser context was used to test the workspace-date boundary.
- Mutations used the real browser UI or `projectctl` through the daemon. Persisted outcomes were checked through CLI/API reads. Runtime certificates, cookies and synthetic project state are outside the report and excluded from Git.
- Final visual authority: the **28 populated theme/viewport/view captures** named `screenshots/verified-{light,dark}-{1440,390}-{view}.png`. Earlier dark/mobile images containing loading/recovery states are superseded, not proof of missing data. Scenario-specific images and 18 isolated regression screenshots provide additional evidence.

## Reproduced findings

Priority: **P1** = data/draft integrity or a substantial impediment to a core workflow; **P2** = significant behavior, clarity or integration defect. Product gaps are distinguished from destructive failures. These priorities are recommendations, not changes to release acceptance records.

| ID / priority | Reproduction and actual result | Expected result / recommended fix | Evidence |
|---|---|---|---|
| A01 / P1 | Open `Draft-loss probe`, change title without saving, choose Pin to focus. Editor closes and the saved title remains unchanged; the typed draft disappears without the normal discard prompt. | A focus mutation must preserve the editor and dirty fields, or require an explicit save/discard decision. Separate resource-save completion from independent actions. | [explore.json](checks/explore.json), check 04; [capture](screenshots/bug-draft-lost-on-pin.png). Source path: Editor `toggleFocus → transmit → onsaved`, App `saved`. |
| A02 / P1 | Create a valid card through CLI with one label `Research, discovery`. Open it, edit only its title, Save. Labels become `Research` and `discovery`. | An unrelated edit must preserve existing label values exactly. Replace ambiguous comma serialization with real tag selection; preserve valid stored strings during transition. | [followup.json](checks/followup.json), check 32; [before](screenshots/comma-tag-before.png), [after](screenshots/comma-tag-after.png). Persisted metadata assertion proves the change. |
| A03 / P1 | In List select Milestones, then switch to Board. The primary button becomes Add milestone. | Create intent must derive from the current view/context; a stale List collection must not control Board/Calendar/Focus/Timeline creation. | [explore.json](checks/explore.json), check 05; [capture](screenshots/bug-board-add-milestone.png). Actual creation through the wrong button was not needed to establish the mislabeled/misbound action. |
| A04 / P1 workflow gap | Archive `Archive probe`, close and search for it. It disappears from normal List and search; no archive browser/filter/restore discovery route is exposed. The record remains stored with `archived:true`. | Add an archive browser with search and versioned Restore. A remembered deep link or CLI is not a normal retrieval flow. | [explore.json](checks/explore.json), check 09; [capture](screenshots/archive-no-retrieval.png). This is inaccessible workflow, not deleted source data. |
| A05 / P1 usability | Populate September with 56 calendar events. All month weeks become extremely tall, including empty weeks. Calendar height: 3234 px at 1440 width, 4037 px at 390 width; document height: 3822/4756 px. | Bound month height, use real `+N more` overflow and accessible day/agenda details. Keep empty weeks compact. Provide a suitable mobile default. | [metrics](checks/settled-view-metrics.json); [desktop](screenshots/verified-light-1440-calendar.png), [phone width](screenshots/verified-light-390-calendar.png); visual V01/V02. Likely cause: auto height + uniform calendar rows. |
| A06 / P2 | Select Calendar week layout and 2026-10-13, reload. Returns to month layout and 2026-09-01; URL never represented the chosen state. | Persist/share the active period and layout in route/display state. | [before/after](checks/calendar-persistence.json), check 06. |
| A07 / P2 | Navigate Focus → Board → Calendar, use browser Back. It returns to an older unrelated history entry (Updates in this run), not Board. | Intentional view/resource navigation should create meaningful history; reserve replaceState for transient changes such as typing. | [interactions.json](checks/interactions.json), check 26; [capture](screenshots/browser-back-state.png). |
| A08 / P2 | At width 390, Sign out is hidden with the sidebar bottom; no named mobile account/More route is exposed. | Provide direct mobile sign out and host/connection identity in an accessible account menu. Revoking the current session in technical settings should not be the standard exit route. | [interactions.json](checks/interactions.json), check 27; [mobile shell](screenshots/verified-light-390-board.png). |
| A09 / P2 | Pin `Separate project focus probe` in Personal lab; select Studio launch in Focus and filter `Design system`. The unrelated Personal lab pin remains visible. | Apply project/search scope consistently, or clearly separate workspace-wide pins from scoped attention with distinct labels/controls. | [focus-confirm.json](checks/focus-confirm.json), check 34; [capture](screenshots/verified-focus-scope-mismatch.png). Earlier checks 29/31 had a missing fixture precondition and are superseded. |
| A10 / P2 | Create with labels `qa, qa`. Save is rejected with “Some fields are not valid. Check the dates and additional fields.” | Prevent duplicates in the tag picker or identify Labels with actionable field-level feedback. | [followup.json](checks/followup.json), check 33; [capture](screenshots/duplicate-tags-generic-error.png). |
| A11 / P2 integration | Populated Board triggers a blocked `style-src-attr` inline-style violation in light/dark and desktop/narrow runs, sourced to the compiled main bundle. | Identify the adapter/style insertion and make it compatible with the current CSP. Do not disable CSP as a styling fix. | [settled metrics](checks/settled-view-metrics.json), Board records. No JavaScript exception or specific broken gesture is attributed to this warning without further proof. |
| A12 / P2 | With browser timezone Pacific/Honolulu, workspace header shows 2026-09-08; clicking Calendar Today selects 2026-09-07. | Derive all whole-day Today operations from the workspace timezone. | [completion.json](checks/completion.json), check 37; [capture](screenshots/timezone-today-mismatch.png). |

Other observed presentation problems: the mobile Timeline can show unlabeled rows while bars are outside the visible date range; repeated header/instruction blocks push useful work below the first screen; the selected mobile Updates tab can be offscreen; a long project name overflows the 320px header vertically; Focus repeats cards for multiple attention reasons; List omits priority/blockers/tags shown on Board; dark Board surfaces lose separation; Updates exposes `Decision_needed` wording and inconsistent icon geometry. See the [visual review](visual-review.md) for images and limits rather than treating these as unexecuted interaction failures.

## What worked in executed scenarios

| Area | Verified behavior |
|---|---|
| Connection and registration | Real browser challenge/approval/claim; approved-folder browsing and confirmed registration create actual project files. Native OS-picker responses were mocked in the regression fixture. |
| Cards and milestones | Browser create/edit and reload persistence; required-title and reversed-date validation; milestone creation and title lookup/attachment work (checks 35/38). The selected milestone still displays as an ID. |
| Drafts and concurrent editing | Explicit Close prompts before discarding a dirty draft. A competing browser Save is rejected, preserving the stale draft and first saved value. Raw JSON conflict presentation remains an ergonomics issue. This does not clear A01. |
| Real connection loss | Browser offline mode causes Save to fail; the draft and Retry same command remain. Reconnection plus explicit retry saves the intended title. This is not a simulated lost response after a durable commit. |
| History, Focus, Updates | Normal history undo, focus pin/order, report creation, read receipt, unread filtering and session-loss draft preservation pass their scenarios. Dirty Pin remains broken independently. |
| Board gestures | Whole-card drag, cross-status movement, same-column order, keyboard order, preview/drop indicator, immediate persistence, conflict, uncertain retry, collapse, quick title creation, per-project scroll restoration, vertical auto-scroll/cancel, 51-card page boundary, emulated hold-to-drag and ordinary touch scrolling. |
| Calendar and Timeline | Calendar day/week/month/agenda; move and both resize edges with exact persisted dates; cancellation; scheduled creation; Gantt bars/connectors; dependency addition/removal; cycle rejection; forecast dates/read-only behavior; gesture/SSE conflict and retry identity. |
| Search and safety signals | List full-text search matches body-only content; Markdown formatting renders with script/remote-image suppression. Planning regression records no external-origin requests or CSP violations. Board has the separate A11 warning. |
| Appearance | Populated views render in both themes; theme survives reload; Unicode/long titles render. Document-level width stays within viewport in measured layouts. Contained chart scrolling and poor density still require improvement. |

The existing regression suites passed because their scenarios differ from the newly found cases: they pin/undo clean editors, do not round-trip a comma-containing tag, and do not require archive retrieval or preserved calendar route state. Passing those suites is useful evidence, not proof that the new findings are false.

## Product gaps and implementation order

The owner specifically requires a mature **card model** and **tag system**. Card metadata and string labels exist; missing is a complete, coherent working experience. Treat both as core deliverables in the [detailed requirements](card-model-and-tags.md), not incidental styling changes.

1. **Protect work and restore basic navigation:** A01/A02 regression-first fixes; isolate creation intent; archive retrieval; workspace-date consistency; correct calendar route/history and Focus scope.
2. **Make planning usable with real data:** bounded populated month, overflow/day detail, readable mobile chart identity, compact controls and clear gesture feedback.
3. **Define one card and action system:** purpose/expected result/acceptance context, common properties, named relationships, related updates/history, safe draft states, archive/restore; compact creation and a consistent full inspector.
4. **Deliver tags end to end:** chips and suggestions, naming/scope rules, consistent display, full-scope filters, usage discovery and safe rename/merge. Fix existing tag round-trip corruption before expanding the model.
5. **Unify the shell and visual language:** semantic tokens and widget adapters; one type/spacing/control scale; common status/priority/date badges; meaningful success/error feedback; mobile navigation/account access; measured dark contrast.
6. **Add retrieval and efficiency:** structured filters, sorting/display columns, saved views, command palette, templates/duplicate and version-safe multiselect/bulk actions. The [competitive analysis](competitive-analysis.md) maps these to official comparison sources and explains scope constraints.

Frequent actions stay visible: current project/view, create, search/filter, status and the current resource's core planning fields. Infrequent actions belong in appropriately scoped Workspace/Project/View/Card menus: diagnostics, Git inspection, raw IDs/advanced extension fields, archive management, display configuration and secondary history tools. Avoid hiding warnings, unsaved state or the main action behind an overflow menu.

The six-phase [UI plan](ui-inventory-and-plan.md) gives components, action semantics, mobile/keyboard treatment and acceptance gates. After implementation, rerun the exact found cases plus existing drag/resize/conflict suites and the populated screenshots. No redesign should count as done merely because an empty Board looks cleaner.

## Limits and reproduction

Not verified: physical iPhone/Safari, Firefox/WebKit, screen reader, numerical contrast compliance, real software keyboard/rotation ergonomics, production TLS trust, actual OS folder-picker operation, successful Git-root observation, daemon restart/power-loss durability, prolonged performance/1000-card load, and a real response lost after commit. Injected 401/503 setup/retry messages in tests are classified in the regression coverage document. Source-only hypotheses remain labeled in the source audit; for example, dirty Undo needs its own reproduction rather than being assumed from dirty Pin.

`audit-host.mjs` recreates the exploratory fixture using normal daemon commands. `browser-audit.mjs` contains phases `explore`, `interactions`, `followup`, `focus-confirm`, `completion`, and `milestone-confirm`. These phases mutate their fixture and some depend on earlier state; rerunning arbitrary phases is not guaranteed idempotent. Start with a fresh fixture for a full reproduction, follow the documented result corrections, and retain raw failures. Purpose-built regression copies are isolated under `regression/` so previous repository screenshots are not overwritten.

This audit is delivered as evidence and a plan. It does not silently mark release tasks accepted, introduce new product schema, or publish runtime credentials or user project data.
