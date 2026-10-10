# Current implementation state

Updated 2026-10-10. The application is implemented and under verification;
full release acceptance remains open. [Scope decisions](SCOPE.md) supersede the
historical handoff. Use the [release checklist](../delivery/RELEASE-CHECKLIST.md)
for remaining acceptance, and [code structure](../docs/CODE-STRUCTURE.md) for ownership.

## Current work

The browser calls projects [goals](2026-10-10-goals.md) since the owner's
2026-10-10 direction, which limits the current round to the web interface. A
goal opens in a dialog built like a card's, with description, comments and
folder; it shows the range of its cards' dates, which the server derives on
each read, and Calendar and Timeline have a **Karty | Cele** switch whose goal
side is read-only ([ADR-079](../docs/ADR-079-GOAL-COMMENTS-AND-SPAN.md)).
Project comments are a protocol addition with a CLI command. The Rust gate, the web
checks and the browser scripts pass; of the 45 regression suites 42 passed in
the full run, two were updated for the new design, and `projects` failed once
on an unfinished read that 19 later runs did not show. The
iOS and Mac apps were not touched; their interface tests still look for
**Projekty**. The look awaits the owner's judgement.

[Settings save themselves](2026-10-10-settings-autosave.md) since the owner's
2026-10-10 direction: every preference change is saved at once through the
card editor's autosave engine, the header shows **Zapisano** instead of a Save
button, and the dialog stays open ([ADR-078](../docs/ADR-078-SETTINGS-AUTOSAVE.md)).
Conflicts and unknown outcomes stay explicit. All 44 browser suites and the
smoke test pass; the Rust part of the gate was not run, as no Rust changed.

The first report from the phones was [fixed](2026-10-10-dialog-safe-area.md):
in the iOS app every shared dialog, Settings among them, opened under the
status bar. The shared dialog rule now starts below the top safe area. A second
reported symptom, Settings showing only their header on one iPhone 13 mini,
could not be reproduced on the installed iOS 27 runtime; a photo of that phone
showed the part below the header at zero height, and its zero flex basis was
replaced by a content-sized one. Whether that phone now shows Settings is the
tester's to confirm.

The iOS and Mac apps are [closed source](2026-10-10-closed-source-apps.md)
since the owner's 2026-10-10 direction: their code, build scripts and decision
records moved with their history to a private repository, and this repository
ignores their folders. Their unit tests and scratch host pass from the new
place. The commits that published them here remain in this repository's
history until the owner decides otherwise.

A [Mac app](2026-10-09-mac-app.md) was added to the iOS project on the owner's
direction: the host's web interface in a window, the same four widgets, and
dictation in a panel opened from the menu bar or Control-Option-Space
(ADR-077). It builds, is signed for development
and passed its check on the build machine. It is not distributed, was never
paired, and its widgets were not seen on a desktop.

An [iOS app with widgets](2026-10-09-ios-app-widgets.md) was started on the
owner's direction: a native shell around the host's own web interface, four
widgets (Focus, Dziś, Licznik with a step button, Agent) and dictation to the
agent that sends only on a tap (ADR-076).
No server change was needed. It builds for a device and passed its checks in a
simulator against a real daemon, including pairing and a counter step from the
home screen. A first build was signed and uploaded to TestFlight for internal
testing. On the owner's word the manual instance was switched to its
Tailscale name and the certificate issued for it; the app reached its pairing
page from a simulator with the system's trust alone. Nothing has run on a
physical phone yet, and browsers have to pair again under the new address. In
the windowless simulator a screenshot of the counter widget showed the total
from before the last tap although the widget's value and the server agreed;
the cause is not established.

[Oś czasu was rebuilt](2026-10-08-timeline-redesign.md) on the owner's
direction: Astra draws it itself instead of the SVAR Gantt widget, the
selection bar is gone, cards without dates stand above the axis, weekends are
shaded, a bar opens its card, and a move or stretch is saved on release with no
dialog unless the save needs a decision
([ADR-075](../docs/ADR-075-TIMELINE-RENDERER.md)). It was then
[moved onto the shared system](2026-10-08-timeline-shared-system.md): Calendar
and Timeline use one toolbar, Chart, Calendar and Timeline one segmented
control, and a bar is drawn from the tokens of a Calendar item, so palettes,
characters and spacings change it with the rest. Verified in Chromium and
WebKit; not on a physical phone, and its look awaits the owner's judgement.
The other views have not been audited for elements outside the shared pool.

Appearance now offers [sets](2026-10-07-appearance-sets.md): four light
palettes, four dark palettes and four characters (corners, shadows and heading
typeface), chosen separately in Settings beside the theme, and since
2026-10-08 a [spacing](2026-10-08-appearance-spacing.md) (default, compact or
roomy). The sets load on demand, so the initial download stays within its
budget, with 93 bytes to spare. Verified in Chromium and WebKit; not on a
physical phone, and the look of each set awaits the owner's judgement.

[Boards, the calendar and Settings were corrected](2026-10-07-boards-calendar-settings.md)
after the owner's review: columns are as long as their cards and every list is
named, the workspace Board uses the shared board, calendar items are compact
and week and day open at 08:00, and Settings has sections, a timezone map and
no footer. The band below a page's content was reduced, not removed, to keep
the floating button clear of content; removing it is the owner's decision.

[A project's place can be chosen by clicking](2026-10-07-project-places.md),
with folders added in the dialog; GitHub publication is a profile setting that
is on by default; and `projectctl project create` gives the CLI and the in-app
agent the same creation steps as the browser. The agent's use of it was not
run against a real provider.

[Projects are added by name](2026-10-07-project-creation.md): the server
creates the folder in the profile's default approved root, with a suffix when
the name is taken, and a host started with `--github` creates a private
repository and pushes the planning data. No step needs the host's desktop; the
browser no longer opens its folder dialog. Verified with a scripted GitHub CLI
and real Git; against GitHub only read-only calls were run, so the first real
repository is the owner's to create. The owner's wider
[product direction](SCOPE.md#product-direction--owner-statement-2026-10-07) is
recorded and not started.

Projects and the card Board now run on [one board engine](2026-10-07-shared-board-engine.md)
with one card style, and its movement was reviewed and rebuilt: cards part
around a slot, the preview lands or returns, a move is shown at once and saves
without a dialog, phone columns page. The gate, smoke and the Chromium suites
pass, after a follow-up fixed three failures inherited from the add-menu work;
the initial bundle is 5 bytes under its budget. Touch feel on a physical phone
and acceptance are the owner's.

The Omarchy bar widget [lists Astra hosts](2026-10-07-omarchy-hosts-widget.md)
instead of the local Focus preview: pasted addresses, one selected host in the
bar, a reachability check and switching. Parser tests and plugin validation
pass; the QML has not yet run in the shell, which refuses a restart while the
session is locked.

On a phone the Agent dialog [stays a rounded card above the keyboard](2026-10-07-agent-dialog-phone.md)
with an even gap, and its composer is one field. The `agent` suite passes in
Chromium and WebKit with an emulated keyboard; the physical iPhone is the
owner's to confirm.

The [in-app agent](2026-10-06-agent-chat.md) adds an Agent choice in the floating **+** menu and a chat
dialog backed by Claude Code or Codex. A host started with `--agent-dir` runs
the selected provider for one message and shows only its final answer; the
agent changes cards through `projectctl`. The gate and all 41 Chromium suites
pass, and both real providers completed four turns against a temporary host.
Runs live in memory, and the agent has the daemon user's full rights by the
owner's direction; acceptance and a physical-device check are the owner's.

The [interface refinement](2026-10-06-ui-refinement.md) corrects the findings
of the [visual review](2026-10-06-ui-review.md): nine visible defects, three
motion durations without staged entrances, one card and one board dialect, one
create action per view, a single palette definition, six type sizes and static
guards for those rules. The gate and all 39 Chromium suites pass; WebKit passes
38, with the existing `responsive` failure. The single short fades were not
accepted: the owner asked for the soft, layered entrances back, and they are
[restored](2026-10-06-layered-motion-restored.md) with their original structure
and timing, and now [cover every view](2026-10-06-motion-everywhere.md): Chart
with rising marks, counter trends, reports, List filters, Timeline's
unscheduled cards, the pairing page and the sidebar. [Inside menus, dialogs and
disclosures](2026-10-06-inner-layers.md) the fields, items and rows now enter
one by one. Acceptance of the merged controls is the owner's.

The [Chart view redesign](2026-10-06-chart-redesign.md) puts the plot first on
every screen size, gives counters stable validated colours and merges statistics and rates
into one summary. Its [follow-up](2026-10-06-chart-phone-controls.md) removes
the scale choice and the per-plot data table and, on a phone, puts range,
grouping and totals in one row below the plots. The gate and the Chromium and
WebKit `charts` suites pass; acceptance of the layout is the owner's.
Since 2026-10-07 every plot there draws
[dots joined by lines only](2026-10-07-line-only-charts.md), with no bars; the
card counter preview keeps its bars. The view now opens with a
[settlement](2026-10-07-chart-settlement.md) that says who owes whom how much
from the counters' rates; the rule and the phone layout await the owner.
Rates are now [stored with each counter](2026-10-07-counter-rates.md) and the
debt counts every saved date ([ADR-072](../docs/ADR-072-COUNTER-RATES-AND-HISTORY-TOTALS.md)).
The settlement and the Razem totals are now [plugins](2026-10-07-plugins-and-tiles.md)
a profile switches on, and each summary tile chooses its values
([ADR-073](../docs/ADR-073-PLUGINS-AND-CHART-TILES.md)).

The [repository review completion](2026-10-05-review-completion.md) finishes what
the [first pass](2026-10-05-repository-review-fixes.md) left open. A reviewed
`needs_review` write can be settled from the host CLI; refused uploads no longer
reset a proxy's connections; listeners bound their connections; background
recovery, receipt pruning and watcher supervision run per profile; the browser
gains accessible description and confirmation controls, a lint gate and stricter
types. The 16-step gate passes 846 tests; Chromium passes all 40 suites and the
broad HTTPS/planning chain. The rebuilt existing HTTPS app preserves
identity/epoch, both profiles, 44 resource versions, three pins, settings, roots
and certificate; all 65 served assets match and a paired read-only visit of all
eight views is clean. Remote CI is green on both systems at `250dc97`. Open items, including the WebKit `responsive` failure, are listed
in the record; physical-device and full release acceptance remain open.

## Dated evidence

Each record describes its own revision, checks, measurements and limits; this
page does not repeat them. The
[complete status narrative through 2026-10-04](https://github.com/Maciej1kti/astra/blob/0073d7f6cc42f2544412f1b31b9136ccad5fddf9/progress/STATE.md)
is preserved at its immutable revision. No requirement or acceptance result was
removed or changed by this consolidation.

- **2026-10-07:** [One board engine and its movement](2026-10-07-shared-board-engine.md); [Chart view: dots joined by lines only](2026-10-07-line-only-charts.md); [Chart settlement and uniform phone cards](2026-10-07-chart-settlement.md); [Counter rates and whole-history totals](2026-10-07-counter-rates.md); [Plugins and Chart tile values](2026-10-07-plugins-and-tiles.md).
- **2026-10-06:** [Chart view redesign](2026-10-06-chart-redesign.md); [Chart phone controls and value-only plots](2026-10-06-chart-phone-controls.md); [Phone navigation bar alignment](2026-10-06-phone-dock-alignment.md); [Touched menu actions in WebKit dialogs](2026-10-06-touch-menu-actions.md); [One-step deletion of a pinned card](2026-10-06-pinned-card-deletion.md); [Visual review of the interface](2026-10-06-ui-review.md); [Interface refinement](2026-10-06-ui-refinement.md); [Layered motion restored](2026-10-06-layered-motion-restored.md); [Layered entrances in every view](2026-10-06-motion-everywhere.md); [Layers inside menus, dialogs and disclosures](2026-10-06-inner-layers.md); [In-app agent](2026-10-06-agent-chat.md).
- **2026-10-05:** [Repository review fixes](2026-10-05-repository-review-fixes.md); [Repository review completion](2026-10-05-review-completion.md).
- **2026-10-04:** [Definition and API cleanup](2026-10-04-definition-usage-cleanup.md); [Polish browser interface](2026-10-04-polish-ui.md); [Navigation selector correction](2026-10-04-navigation-section-selector.md); [Projects status board consolidation](2026-10-04-projects-status-board.md); [Definition and consumer audit](2026-10-04-definition-usage-audit.md); [Main project status board](2026-10-04-main-project-board.md); [UI component audit](2026-10-04-ui-component-audit.md); [Counter Chart dashboard](2026-10-04-counter-chart.md); [Shared exercise project implementation](2026-10-04-shared-exercise-project.md); [Compact navigation feature](2026-10-04-compact-navigation.md); [Trusted user profiles implementation](2026-10-04-trusted-user-profiles.md); [Folder review](2026-10-04-multi-user-folder-review.md).
- **2026-10-03:** [Deleted-project diagnostics correction](2026-10-03-deleted-project-diagnostics.md).
- **2026-10-01:** [Soft-motion refinement](2026-10-01-soft-motion.md); [Context entry allocation iteration](2026-10-01-context-entry-allocation.md); [Bounded JSON map probe](2026-10-01-source-map-probe.md); [Focus counter footer correction](2026-10-01-focus-section-counters.md); [Motion choreography follow-up](2026-10-01-motion-choreography.md); [Canonical metadata-counter iteration](2026-10-01-source-metadata-budget.md); [Scoped context-read iteration](2026-10-01-context-candidate-reads.md); [Shared motion system](2026-10-01-motion-system.md); [Owner-directed UI corrections](2026-10-01-ui-corrections.md); [Context byte-accounting iteration](2026-10-01-context-budget.md); [Source pin-read iteration](2026-10-01-source-focus-stream.md); [CLI runtime probe](2026-10-01-cli-runtime-probe.md); [Focus widget Rust reader](2026-10-01-widget-focus-reader.md); [Tag-source cost probes](2026-10-01-tag-source-cost-probes.md); [Editor source-overlap iteration](2026-10-01-editor-source-overlap.md); [Complete Calendar popup renderer](2026-10-01-calendar-popup-rendering.md); [Calendar popup probes](2026-10-01-calendar-popup-probes.md); [Editor read-overlap iteration](2026-10-01-editor-read-overlap.md); [Calendar pass-work iteration](2026-10-01-calendar-pass-work.md); [Calendar main-grid DOM iteration](2026-10-01-calendar-sparse-grid.md); [Planning read-scope iteration](2026-10-01-planning-read-scopes.md); [Measured Calendar month renderer](2026-10-01-calendar-measured-rendering.md); [Calendar hidden-list iteration](2026-10-01-calendar-hidden-lists.md); [Calendar geometry/query probes](2026-10-01-calendar-probes.md).
- **2026-09-30:** [Request-local receipt iteration](2026-09-30-focus-rust-receipts.md); [Decision-history iteration](2026-09-30-focus-decision-histories.md); [Ordered tag-read iteration](2026-09-30-tag-parallel-reads.md); [Dense Calendar probes](2026-09-30-calendar-initial-probes.md); [Focus eligibility/index iteration](2026-09-30-focus-eligibility-indexes.md); [Card layout controls](2026-09-30-card-layout-controls.md); [Agent workflow guidance](2026-09-30-agent-workflow-guidance.md); [Tag source-read iteration](2026-09-30-tag-source-reads.md); [Focus receipt/prefix iteration](2026-09-30-focus-attention-prefix.md); [Attention eligibility iteration](2026-09-30-attention-filters.md); [Empty counter action](2026-09-30-empty-counter-action.md); [Bounded source-read iteration](2026-09-30-parallel-source.md); [Calendar presentation update](2026-09-30-calendar-design.md); [Source lease path iteration](2026-09-30-source-paths.md); [Counter footer follow-up](2026-09-30-counter-footer-spacing.md#divider-correction); [Counter actions menu](2026-09-30-counter-actions-menu.md); [Minimal card sections](2026-09-30-minimal-card-sections.md); [Calendar refresh iteration](2026-09-30-calendar-refresh.md); [Remaining-cost ranking](2026-09-30-performance-ranking.md); [Calendar rendering follow-up](2026-09-30-calendar-followup.md); [Compact card counters](2026-09-30-compact-card-counters.md); [Unified card section order](2026-09-30-unified-card-sections.md); [Focus cards and calendar follow-up](2026-09-30-focus-counters-calendar.md); [Deeper performance work](2026-09-30-deep-performance.md); [Responsive card modal](2026-09-30-card-modal-layout.md); [Card usage follow-up](2026-09-30-card-usage-layout.md); [Calendar rendering iteration](2026-09-30-calendar-rendering.md).
- **2026-09-29:** [Repository audit](2026-09-29-repository-audit.md); [Three-pass remediation](2026-09-29-three-pass-plan.md); [Stability follow-up](2026-09-29-stability-followup.md); [Loading profile](2026-09-29-loading-profile.md); [Iterative performance optimization](2026-09-29-performance-optimization.md).

## Open findings carried by dated evidence

These specific results remain unresolved in addition to the obligations below.

- Durable card creation with 1,000 cards measured 116–117 ms median and
  119–135 ms p95 after the [bounded source reads](2026-09-30-parallel-source.md),
  inside its 150 ms target, but an earlier run's 1,266 ms maximum remains
  recorded and the target is not claimed unconditionally.
- An all-read 50k-receipt Focus history, note-only receipt tails and further
  history distributions keep outliers
  ([receipts](2026-09-30-focus-rust-receipts.md), [prefix](2026-09-30-focus-attention-prefix.md)).
- Dense Calendar initial rendering, native DOM/layout cost, transfer cost and
  desktop planning rendering remain performance candidates
  ([ranking](2026-09-30-performance-ranking.md), [popup probes](2026-10-01-calendar-popup-probes.md)).
- Context body materialization and candidate-read cost, and the optional Omarchy
  helper's read fan-out, are the next recorded investigations
  ([context budget](2026-10-01-context-budget.md), [tag probes](2026-10-01-tag-source-cost-probes.md)).
- One crash-test child failed once with an unknown cause; later failures retain
  child diagnostics ([stability follow-up](2026-09-29-stability-followup.md)).
- WebKit suite startup is blocked by its unsupported clipboard permission for the
  deletion scenarios, and broader WebKit dialog/header/screenshot limits are
  recorded ([deletion diagnostics](2026-10-03-deleted-project-diagnostics.md),
  [card usage](2026-09-30-card-usage-layout.md)).
- A combined responsive-suite attempt was blocked by the profile header's 320px
  picker width ([compact navigation](2026-10-04-compact-navigation.md)).
- Python remains in the Omarchy window helper; Linux shell/QML coverage is open
  ([widget reader](2026-10-01-widget-focus-reader.md),
  [hosts widget](2026-10-07-omarchy-hosts-widget.md)).

## Implemented product

- Shared Rust domain/application rules, strict JSON sources and generated browser
  contracts; conditional durable writes, unchanged retries, recovery and history.
- Explicit folder registration, host-native selection, pairing and sessions;
  shared HTTP/Unix engine, CLI and disposable search projections.
- Projects, source-backed Focus pins, project folders/tags, board, card lists,
  calendar and timeline; inclusive plans and timed events.
- Card checklists, human/bot comments, daily counters and protected autosave drafts.
  Reports target projects or milestones; reports support explicit permanent deletion.
- Versioned workspace preferences and pin ordering, read receipts, undo,
  diagnostics, Git observation, maintenance workflows and packaging.
- Milestones and legacy workspace tag APIs remain supported; their retirement
  requires an owner decision. Card relations/blockers and separate card deadlines
  were removed by later scope decisions. Kanban remains under its feature freeze.

Use [Development](../DEVELOPMENT.md) for setup, [CLI](../CLI.md) for commands and
[Manual testing](../MANUAL-TESTING.md) for the existing manual app and walkthrough.
After verified application changes, rebuild and restart that manual app preserving
its data, HTTPS address, certificates and settings, then verify the address.

## Outstanding obligations

Physical iPhone/Safari, Arch/ext4, physical power-loss, login-start and complete
performance/reliability acceptance remain open. Browser emulation is not a device
test. Local checks do not establish remote CI or packaged release acceptance.
The owner must choose the license and supported-release security-reporting channel.
Built-in backup archives and source migration frameworks remain deferred;
stopped-copy recovery and operational compatibility remain required.

Earlier audit follow-ups for additional named frontend endpoints, smoke-suite
separation and Q10 vendor assumptions remain recorded in
[the earlier audit](audit-fixes-2026-09-08/README.md). Apply them when justified;
they are not permission for a broad rewrite or additional product scope.

## Evidence navigation

- [Audit baseline and limitations](2026-09-29-repository-audit.md).
- [Daily counters](2026-09-26-daily-card-counters.md),
  [card header feedback](2026-09-26-card-header-feedback.md),
  [daily Focus](2026-09-26-focus-daily-sections.md).
- [JSON sources](2026-09-26-json-sources.md),
  [comments](2026-09-26-card-comments.md),
  [timed events](2026-09-26-timed-events.md),
  [report deletion](2026-09-26-report-deletion-api.md).
- [Earlier evidence guidance](README.md),
  [complete previous status with dated feature records](https://github.com/Maciej1kti/astra/blob/1a8f6503be280fb2cbaf101022f8ec01487c42d2/progress/STATE.md).

Historical evidence applies only to its recorded revision. The immutable status
reference preserves the previous narrative; no requirement or acceptance result
was removed or changed by this consolidation.
