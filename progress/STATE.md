# Current implementation state

Updated 2026-10-06. The application is implemented and under verification;
full release acceptance remains open. [Scope decisions](SCOPE.md) supersede the
historical handoff. Use the [release checklist](../delivery/RELEASE-CHECKLIST.md)
for remaining acceptance, and [code structure](../docs/CODE-STRUCTURE.md) for ownership.

## Current work

The [Chart view redesign](2026-10-06-chart-redesign.md) puts the plot first on
every screen size, draws period totals as bars and running totals as stepped
lines, gives counters stable validated colours and merges statistics and rates
into one summary. Its [follow-up](2026-10-06-chart-phone-controls.md) removes
the scale choice and the per-plot data table and, on a phone, puts range,
grouping and totals in one row below the plots. The gate and the Chromium and
WebKit `charts` suites pass; acceptance of the layout is the owner's.

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

- **2026-10-06:** [Chart view redesign](2026-10-06-chart-redesign.md); [Chart phone controls and value-only plots](2026-10-06-chart-phone-controls.md); [Phone navigation bar alignment](2026-10-06-phone-dock-alignment.md); [Touched menu actions in WebKit dialogs](2026-10-06-touch-menu-actions.md); [One-step deletion of a pinned card](2026-10-06-pinned-card-deletion.md).
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
  ([widget reader](2026-10-01-widget-focus-reader.md)).

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
