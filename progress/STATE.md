# Current implementation state

Updated 2026-09-25. The application is implemented and under verification;
full release acceptance remains open. See [scope decisions](SCOPE.md) and the
[release checklist](../delivery/RELEASE-CHECKLIST.md).

## Current work and verification

[Shared Astra UI system](2026-09-25-ui-system.md) applies common visual tokens
and small components across all views and dialogs, with a compact card checklist
and responsive navigation. The broad HTTPS smoke, planning browser check and all
11 Chromium regression suites pass. The updated manual app was reviewed at
1440px, 390px and 320px. Validation follows the owner's E2E-focused direction;
this does not establish physical-device or full release acceptance.

[Resolve decision action](2026-09-24-decision-resolution-action.md) opens a
prefilled resolution from the update record; the full local gate and all 11
release Chromium regression suites pass.

[Update details and Focus decision navigation](2026-09-24-update-details.md)
render existing Updates as readable records and open decision reports directly
from Needs my attention. The full local gate, all 11 release Chromium regression
suites, broad HTTPS smoke on retry and planning browser test pass.
The release build runs on Linux and Mac Mini; both HTTPS endpoints and the
decision attention response were checked after restart.

[Source-backed Focus and project tags](2026-09-24-source-backed-content.md)
move pin membership into card source files and derive each project's tag catalog
from card labels. Rename/merge is one recoverable project job. The local gate,
broad HTTPS smoke, planning browser check and all 11 release Chromium regression
suites pass. The three former host-local pins are committed in card source;
Linux and Mac Mini show identical Focus membership and project tag catalogs.

[Cross-host project source sync](2026-09-24-cross-host-project-sync.md) tracks the
shared `loai` project data in Git on Linux and Mac Mini. Both daemons validate
the same project source and report healthy indexes. Its original Focus pin
lists differed across hosts; their union is now in source cards as tracked above.

[Manual tailnet access](2026-09-23-manual-tailnet-access.md) lets the test
launcher bind HTTPS to this Mac's verified Tailscale IPv4 address for phone
testing. Mac-side HTTPS and CLI checks pass; phone access is not yet verified.
The full gate reaches Clippy but stops at an existing macOS `mkfifoat` test
compile error.

[Inline Focus ordering](2026-09-22-focus-inline-order.md) replaces Arrange focus
with a vertical card stack, direct drag/drop saving and Alt+Up/Down ordering.
Hidden pins, observed versions and uncertain commands are preserved. The full
local gate passes 212 Rust, 98 JavaScript and 12 Python tests; Focus, dialogs,
autosave and broad HTTPS smoke pass. The updated manual runtime retains existing
source versions and Focus order, and both projects validate cleanly.

[Priority simplification and Focus footer](2026-09-22-priority-simplification.md)
keeps only Normal and High throughout UI, source/API contracts, shared CLI rules
and filters. All six existing cards were already Normal. Focus workspace actions
now follow its content as a footer, with the old slogan removed. The full local
gate passes 212 Rust, 97 JavaScript and 12 Python tests; four relevant release
browser suites pass. The updated manual runtime preserves source versions and
Focus, with both projects validating cleanly. The evidence records the corrected
local build sequencing error and browser/device coverage limits.

[Focus layout](2026-09-22-focus-layout.md) removes the hero copy and counters,
orders In focus, Needs my attention and In motion, and displays cards once per
visible page with attention badges retained on pinned cards. Focus reads bounded
active-card pages and no separate milestone collection. Add card floats at the
lower right while its editor remains centered. The full local gate passes
209 Rust, 97 JavaScript and 12 Python tests; five relevant release browser suites
and the broad HTTPS smoke pass. The updated manual runtime preserves source
versions and the focus list. The evidence records the Board smoke setup correction
and browser/device coverage limits.

[Card planning simplification](2026-09-22-card-planning-simplification.md) removes
Connections and blockers, card deadlines/review dates and deadline types across
UI, CLI, source/API contracts and derived views. Cards retain Start and End;
milestones retain a single date. Conditional CLI writes removed obsolete fields
from all five existing cards while preserving schedules and content. The full
local gate passes 209 Rust, 93 JavaScript and 12 Python tests; all ten release
browser suites pass across the documented runs, along with the broad HTTPS
smoke and native planning gestures. Description clicks preserve their target
while Markdown rendering changes layout. The updated manual runtime validates
both projects cleanly and preserves existing source versions.

[Compact checklist and card report removal](2026-09-22-card-checklist.md) replaces
checklist arrows and verbose controls with one row per item and a drag grip.
Record progress, Card updates and card Additional fields are removed with their
code; source/API contracts and CLI reject card extensions and card report
targets. Project and milestone reports remain. Both existing projects have no
matching data to remove. The full local gate passes 218 Rust, 94 JavaScript and
12 Python tests; all ten browser suites and the broad HTTPS smoke pass across
the documented runs. The updated manual runtime preserves existing source
versions and validates cleanly. The evidence record includes corrected drag
regressions and the initial test failures.

[Card editor simplification](2026-09-22-card-editor-simplification.md) removes
card kind, expected result and owner throughout the source/API contracts, CLI,
projections and UI. Five existing cards, including one archived card, were cleaned
through conditional CLI writes with bodies and retained metadata preserved.
Card descriptions now share direct click editing, Markdown rendering, autosave
and centered layout with project descriptions; both modals omit Change history.
The full local gate passes 216 Rust, 95 JavaScript and 12 Python tests. All ten
release browser suites and the broad HTTPS smoke pass. The existing manual runtime
serves the verified build; both registered projects validate cleanly.

[Project editor simplification](2026-09-22-project-editor.md) centers the project
modal and renders descriptions as Markdown after editing. Project phase, review
date and extensions are removed across source/API contracts, CLI validation and
projections; both registered projects were checked and the one legacy phase was
cleared through a conditional CLI write. The local gate passes 213 Rust,
95 JavaScript and 12 Python tests, with five relevant release browser suites.
The existing manual runtime now serves the verified build. A verified
[interaction follow-up](2026-09-22-project-description-interaction.md) makes the
description directly clickable, ends editing on outside clicks and removes the
project modal's Change history section.

[Editor autosave](2026-09-22-editor-autosave.md) removes Save changes and Cancel
from card/project editors, with serialized conditional writes, guarded close,
stable recovery and preserved drafts. Its local gate passes 210 Rust, 93 JavaScript
and 12 Python tests. See the evidence record for browser coverage and limits.

[Permanent deletion](2026-09-22-permanent-deletion.md) implements physical card-file
and `.project/` removal through the browser and CLI, with conditional confirmation,
durable recovery and stable retries. There is no restore. The local gate passes
210 Rust, 85 JavaScript and 12 Python tests; the evidence record contains coverage
and platform limits. The owner subsequently requested the local service restart;
the deletion feedback fix is recorded in
[its follow-up](2026-09-22-deletion-feedback.md).

The earlier 2026-09-08 checkpoint includes the completed
[maintainability cleanup](maintainability-cleanup-2026-09-08/README.md), CLI work
and important audit fixes. The owner authorized committing and pushing the
verified work to `origin/main` on 2026-09-08. The earlier safety checkpoint
`2a5530a8bb83eec0c3f6f289cac8587aa9d66898` preserves historical artifacts removed
during cleanup. No service deployment is included. Use `git log` and `git status`
to inspect revision and local change state.

The [CLI improvements](cli-improvements-2026-09-08/README.md) are complete:
explicit confirmation semantics, named search/planning
reads, conditional editing/undo, bounded stdin and optional terminal output.
The [CLI guide](../CLI.md) documents the implemented command tree and safe retries.

The [important audit fixes](audit-fixes-2026-09-08/README.md) are complete.
Q02–Q07 address conflict outcomes, journal ownership, typed saved
plans, safe failure diagnostics, maintenance projection repair and workspace
screen/navigation ownership. Q08's typed timeline and Q09's shared browser runtime
are complete; additional named frontend endpoints, smoke scenario separation and
Q10's vendor assumptions remain follow-up work. See
[ADR-033](../docs/ADR-033-AUDIT-OWNERSHIP-AND-RECOVERY.md).

The 2026-09-08 local gate passed 174 Rust, 82 JavaScript and 12 Python tests,
contracts/examples, frontend typing, import boundaries, formatters, Clippy and
release builds. Release HTTPS/CLI smoke, planning tests and all eight browser
regression suites pass, including 14 new direct/status conflict cases. The audit
fix record contains current commands, results and artifact locations. Dedicated
CLI workflows passed in the preceding CLI task. A packaged installation/restart/
stopped-copy recovery smoke passed for the preceding cleanup on this macOS ARM64
host; see its record. Remote CI results are not claimed by this local record.

The cleanup removes obsolete artifacts while preserving immutable historical
proof and all delivery requirements. Planning reads, vendor adapters and tag
review have explicit owners; application mutations have named preparation steps,
typed command/workflow identities and useful diagnostic errors. Documentation now
has a maintained user/contributor entry point. The owner deferred licensing.

## Implemented product

- Shared Rust domain, strict source parsing and generated browser contracts.
- Conditional durable writes, stable retries, recovery and resource history.
- Explicit folder registration, host-native selection, pairing and sessions.
- Shared HTTP/Unix application engine, CLI and rebuildable search projections.
- Projects, focus, board, calendar, Gantt, lists and reports against real sources.
- Structured card acceptance, relations, targeted updates and workspace tags.
- Versioned settings/focus, read receipts, undo, diagnostics and Git observation.
- Maintenance workflows, packaging and documented stopped-server copy recovery.

Use [Development](../DEVELOPMENT.md) for setup and [Manual testing](../MANUAL-TESTING.md)
for `npm run try`, pairing and the walkthrough. Existing manual runtime data is
not modified by the cleanup or isolated verification fixtures.

## Outstanding release obligations

Remaining product/acceptance work is governed by the release checklist, not old
implementation narratives. Physical iPhone/Safari, Arch/ext4, physical power-loss,
login-start and complete performance/reliability acceptance are not established
by this local run. Chromium phone emulation is not a physical-device test.

The owner must choose the project license and the supported-release security
reporting channel. Retained requirement chapters remain until unresolved
obligations can be retired. Built-in backup archives and source-file migration
frameworks stay deferred; stopped-copy recovery and operational compatibility
remain required. Preserve the Kanban feature freeze from the scope decisions.

[Historical evidence](README.md) applies to its recorded revisions. Older CI or
benchmark results are not automatically evidence for this working tree. No
acceptance scenario was marked passed by this cleanup.
