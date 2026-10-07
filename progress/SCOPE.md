# Owner-approved v1 scope adjustment — 2026-09-05

This decision supersedes backup/restore and source migration requirements in the
original handoff, backlog, acceptance scenarios and release checklist.

Deferred beyond v1:
- Built-in backup archives, archive verification and restore plan/apply workflows.
- A general migration framework for project source files and hypothetical future formats.

Still required for v1:
- Document and test a stopped-server copy and recovery procedure for project sources,
  workspace, configuration and operational state. Rebuild the disposable index.
- Version operational SQLite state and apply actual required database upgrades.
- Reject unsupported source schema versions without rewriting them.
- Preserve command epoch and retry protections when operational state is lost or replaced.
- Complete all other product, maintenance, reliability and release work.

Deferred acceptance portions are not passes. T35 and the archive/source-migration
portions of R27, A40, T41 and related release checks move beyond v1; remaining
recovery, compatibility and soak obligations stay in scope.

## Manual-test milestone — owner steering, 2026-09-05

Prioritize a working version the owner can test now. Stop expanding pre-release
hardening and feature polishing before that feedback. Finish and verify changes
already in progress, provide a simple local launch, then hand over for manual use.
Outstanding full-release requirements remain recorded; they are not blockers to
this manual-test milestone and are not silently marked passed.

## Kanban feature freeze — owner decision, 2026-09-07

Finish title-only column creation and per-project view restoration, then freeze
new Kanban features. E024 whole-card dragging and E025 final polish define this
iteration. Further feature expansion or new Kanban dependencies require renewed
owner direction. Bug fixes and remaining platform, accessibility and performance
verification stay in scope. This freeze does not mark outstanding release
acceptance checks as passed or waive the physical-device requirements.

## Permanent deletion — owner decision, 2026-09-22

Implement card and project deletion without trash or restoration. Deleting a
card physically removes its source file from `.project/cards/`. Deleting a
project physically removes its `.project/` directory and its workspace/focus
registration, preserving the enclosing repository and all files outside that
directory. The owner explicitly confirmed the singular `.project/` spelling.

This supersedes the recoverable-trash proposal in the 2026-09-22 deletion review
and the earlier restriction to archive/unregistration for these user actions.
Existing archive and local administrative unregistration remain distinct.
Conditional writes, durable recovery, dependency validation, authentication and
the other architectural invariants still apply. No deletion is authorized against
the owner's remaining live projects as part of implementation verification.

## Project field simplification — owner decision, 2026-09-22

Remove project `phase`, `review_on` and `x-*` extensions throughout the product,
including source schemas, API, CLI, projections and editor drafts. The owner
explicitly authorized clearing these fields in the two registered projects
through conditional server writes. Project folders and unrelated content remain
intact. Card review dates and card/milestone/report extensions remain supported.

Project descriptions render Markdown automatically after editing; project
editors are centered with a dimmed, blurred backdrop. Card and project autosave
continues to apply. See [ADR-036](../docs/ADR-036-PROJECT-FIELD-REMOVAL.md).

## Card field simplification — owner decision, 2026-09-22

Remove card `kind`, `expected_result` and `owner` across the editor, source/API
contracts, CLI, projections and existing card sources. Keep card acceptance,
scheduling, review dates and extensions. Report kinds and nested deadline/author
kinds remain separate concepts. The owner requested the same direct description
editing behavior as the project modal.

Because card `kind` was required, a bounded compatibility build permits its
explicit removal through ordinary conditional server writes before the final
strict release. It accepts old source fields for the cleanup and prevents new
writes from introducing them. No general source migration framework or direct
source-file editing is introduced. Archived cards are included in cleanup.

## Compact card checklist and report removal — owner decision, 2026-09-22

Use a simple Checklist in the card modal, with each item occupying one row:
checkbox, text, remove icon and reorder handle. Remove explanatory prose,
per-row counts, arrow buttons and the verbose add-condition subsection.
Preserve stable item IDs and explicit completion; reorder commits on drop.

Remove Record progress and Card updates from the modal, including card-targeted
reports from the source/API/CLI contracts and existing data. The owner explicitly
confirmed the removal of card report functionality. Reports for projects and
milestones remain supported. Remove card Additional fields and `x-*` extensions
throughout the application. Both live projects were inventoried: their five cards
have no extensions, and neither project has card-targeted reports to remove.

## Card connections and planning simplification — owner decision, 2026-09-22

Remove Connections and blockers throughout the application: card milestone links,
dependency edges and blocked reasons, their commands, projections and rules.
Card planning keeps only inclusive schedule Start and End. Remove card `due`
and `review_on`, and remove deadline types globally. Milestones retain their
single date as `due: {date}`. Project/milestone reports, including blocker reports,
remain supported independently of removed card fields.

Timeline and calendar show recorded schedules without dependency forecasts or
card deadline/review markers. Card date attention uses schedule end; milestone
date attention uses its date. Retain archive, focus, checklist, tags, ordinary
version conflicts and durable command recovery. This supersedes dependency and
separate card deadline requirements in older handoff chapters; unrelated release
obligations remain.

The owner authorized removal from existing sources. Five cards across the two
registered projects, including the archived card, were cleared through normal
conditional CLI writes. The only present field was `depends_on` (one actual edge
and four empty arrays). No card deadline/review dates, milestone links, blocked
reasons or milestone documents were present. Bodies, schedules and retained
metadata were verified unchanged; no compatibility bridge was needed.

## Focus layout — owner decision, 2026-09-22

Remove the Focus introduction and three summary counters. Show In focus first,
Needs my attention next and In motion below, avoiding repeated card rows.
Retain attention badges on pinned cards. In motion is based on active card
status; date attention uses the simplified schedule End field. Independent
milestone resources and report attention remain supported, but Focus no longer
loads milestones for a counter.

The owner clarified that Add card is a floating button at the lower right;
the editor itself stays centered. This changes presentation and view reads,
not stored project data, pin order or source/API contracts.

The owner subsequently moved the Focus workspace header/actions below the
content as a footer and removed the source-of-truth slogan footer. Other views
keep their workspace header at the top. In motion still means active cards
outside the currently displayed pinned and attention results.
The header placement is superseded by the 2026-09-25 decision below.

## Card priorities — owner decision, 2026-09-22

Keep only Normal and High throughout card UI, source/API contracts, CLI validation
and filters. Remove Low and Urgent and their presentation branches. Existing Low
would map to Normal and Urgent to High through conditional writes; all six cards
in the two registered projects already use Normal, so no conversion is needed.
Historical command records remain immutable; undo cannot restore invalid values.

## Inline Focus ordering — owner decision, 2026-09-22

Replace Arrange focus and its modal with direct reordering of the visible pinned
cards. Present In focus as a vertical stack styled like Kanban cards. Holding
the left mouse button and dragging up/down changes order; release saves it.
Retain ordinary click-to-open, a keyboard alternative, conditional conflict
handling and unchanged retries. Filtering must preserve hidden pinned entries.
This changes the browser interaction, not the Focus source/API contract.

## Shared workspace header — owner decision, 2026-09-25

Project filtering belongs in the shared header, with no duplicate project
selector in the view content. Restore the Focus workspace bar above the content,
superseding the earlier footer placement. Keep ordinary project scope, filters,
browser history and the floating Focus Add card action.

## Project folders — owner decision, 2026-09-26

Add one optional folder category to projects, such as Work, Home or Hobby.
The owner clarified that the folder belongs only to the project, not individual
cards. Existing card tags remain. Focus filters all projects or projects in one
folder, replacing project filtering in that view. Other views retain project
selection. This supersedes project filtering in Focus from the shared-header
decision without changing the placement of that header.

## Timed events and remote testing — owner direction, 2026-09-26

Add start time and duration to cards. A time makes a card an event; a start/end
date range without a time remains planned work. The owner first requested a TODO,
then authorized completing it alongside the folder work. Existing milestones
remain until their proposed replacement is explicitly decided. This does not
change the requirement to preserve their existing sources.

After each verified application change, rebuild and restart the current manual
app so the owner can inspect it remotely. Preserve its data, origin, certificates
and network configuration. This authorization does not request deployment or
changes to host networking.

## Project folder input — owner direction, 2026-09-26

Make setting a project's folder work like adding tags to a card: confirm a name
or suggestion, show a removable chip, and preserve unadded input as a draft.
This changes the editor interaction; the project retains one optional folder.

## Card comments — owner direction, 2026-09-26

Add card conversations in the editor, visible comment indicators on cards and
CLI/API access for bots. Distinguish human and bot authors and retain the complete
comment history in each card's Markdown source. This is separate from the removed
card reports and does not restore card-targeted project reports.

## JSON project sources — owner direction, 2026-09-26

Replace Markdown/YAML source containers with JSON for every project resource,
using one schema-defined type/metadata/body envelope. The owner explicitly
permits rewriting or recreating the small test dataset. Preserve it where
possible, including comment history. This authorizes the current one-time format
conversion; it does not add a general migration framework to v1. Documentation
and descriptions remain Markdown where appropriate, with descriptions stored as
JSON string values. Rebuild and restart the existing manual app after verification.

## Report deletion — owner decision, 2026-09-26

Provide explicit permanent report deletion through the API as well as the CLI.
Report contents remain immutable, and corrections/resolutions remain separate
reports. Deletion requires the observed version and normal command identity;
referencing reports must be deleted first. See ADR-047. This replaces the need
for manual stopped-daemon cleanup of report sources.

## Daily Focus sections — owner decision, 2026-09-26

Keep pinned cards first regardless of dates or status. Needs my attention contains
reports and items needing action. In motion means date-only work whose inclusive
schedule contains today, rather than cards selected only by Active status. Add
Events after In motion for timed cards scheduled to start today. This supersedes
the earlier status-based In motion definition. Pin ordering and project folder
filtering remain unchanged.

## Card modal rearrangement — owner direction, 2026-09-26

Move the editable card title into a two-row header. Replace the card status
select with a status-icon disclosure and Priority select with an on/off High
priority button beside project context. Retain save state, pin and card actions.
Promote Checklist to the same visual level as Description. Remove the date-plan
and label-entry helper sentences. Place the comment composer before history,
remove visible author controls and redundant comment/helper labels, and default
browser comments to human/Owner. Existing history and CLI/API author options stay
intact; this changes presentation and browser defaults, not the source contract.

## Card section visibility — owner direction, 2026-09-30

Replace Card layout up/down buttons with six-dot drag handles. Add an eye toggle
for each section; the owner confirmed that visibility belongs to the specific
card across all devices. Hiding a section preserves its content. Existing
browser-local section order remains separate. See
[ADR-056](../docs/ADR-056-CARD-SECTION-VISIBILITY.md).


## Focus, Calendar and Timeline corrections — owner direction, 2026-10-01

Use the In focus card appearance in In motion and Events. Remove the duplicate
Overdue badge where the schedule already describes lateness. Correct the upper
corners of the main workspace panel, including Focus and Projects; leave the
other Projects content and Needs my attention behavior as they are.

Calendar pointer movement and resizing save on drop without a confirmation modal.
Retain ordinary recovery on failed, uncertain and conflicting writes. Ensure month
moves do not leave items hidden and render the symbols used in the legend.

Remove Timeline shortcuts/editing help and its duplicate New scheduled card action;
retain the header Add card action. Provide row dragging and allow the final empty
row to create work on the clicked date. Review the apparently unused Milestone
concept: it is currently an independent API/CLI resource with date projections
and reports, rather than a card type. This review does not retire its source or
report contracts.

## Trusted user profiles — owner direction, 2026-10-04

Allow two or more trusted people to use one application instance with separately
selected project folders. Keep the current pairing mechanism and allow profile
selection without passwords or roles. Each profile owns its workspace, approved
roots, project registrations, preferences, Focus order, report read state and
operational journal. Existing data stays with the default Owner, and existing
sessions retain their shared instance authority.

Profiles are an organizational boundary, without access restrictions between
paired users. A project folder cannot be registered in two profiles; shared
projects and hostile-user isolation remain outside this change. Switching a
browser profile requires finishing or discarding drafts and resolving pending
commands. It reloads only that tab, preserving selections in other open tabs.
See [ADR-060](../docs/ADR-060-TRUSTED-USER-PROFILES.md).

## Shared exercise project — owner direction, 2026-10-04

Name the existing profile Maciek and add Tomek. Register the existing exercise
project in both profiles, preserving one shared source folder. Add a Pompki card
with a Pompki counter, unit `rep`, step 1 and no fabricated recorded repetitions.
This supersedes the initial restriction against sharing a folder between profiles.

Keep trusted selection and personal workspace preferences/order/receipts. Shared
card contents and counter values are common; do not duplicate the project or
introduce passwords or roles. Conditional profile naming and coordinated shared
source writes are specified in [ADR-061](../docs/ADR-061-SHARED-PROFILE-PROJECTS.md).

## Counter Chart view — owner direction, 2026-10-04

Add Chart as a workspace view alongside Focus, Projects and Board. Visualize
saved counter histories with selectable overlays, comparisons and statistics.
Support multiplying counter quantities by a configured rate to show a calculated
value, including quantities such as hours. This extends the counter presentation
scope of ADR-049; recorded daily totals and ordinary source/write rules remain.

Use synthetic histories only in temporary test projects and remove those projects
after verification. Do not fabricate repetitions in the existing Pompki counters.
Rates and chart display choices are presentation settings; they do not rewrite
counter units or recorded history.

## Main project status board — owner direction, 2026-10-04

Add a new workspace view named Main alongside Focus, Chart and the existing views.
It is a board for whole projects, with columns matching project status, rather
than a board for cards within a project. Existing project states remain Active,
Paused and Archived. The card Board keeps its name and behavior.

Main uses the existing registered-project summaries and project state commands.
Folder/title filtering, project opening and conditional status moves support the
board without introducing project ordering fields or custom project statuses.
The new view may be selected as the default workspace view; see
[ADR-063](../docs/ADR-063-MAIN-PROJECT-STATUS-BOARD.md).

## Projects replaces Main — owner direction, 2026-10-04

The whole-project status board replaces the previous Projects overview. Keep
the Projects name and folder icon, remove the separate Main entry/icon/screen,
and expose that board under Projects. This supersedes the preceding Main naming
and separate-view decision. Preserve project registration, opening and deletion
alongside conditional status moves; keep legacy links/preferences usable without
automatic source rewrites. See [ADR-064](../docs/ADR-064-PROJECTS-STATUS-BOARD.md).

## Polish browser interface — owner direction, 2026-10-04

Present the complete browser interface in Polish, including navigation, menus,
modals, settings, accessibility labels, calendar/widget words and recovery/error
messages. Focus retains its name. This supersedes the English UI-text rule;
code identifiers, comments, maintained documentation, commits and CLI/protocol
values remain English. User-authored source content is preserved.

## In-app agent — owner direction, 2026-10-06

Add an Agent button to the left of the floating Add card action. It opens a
chat dialog backed by Claude Code or Codex, selectable in Settings. Give the
agent full access with permission prompts skipped for now, because only the
owner uses this instance. Show only the owner's input and the agent's final
output, with thorough error and run-state handling. The agent may start in a
subdirectory of the Astra repository and have its own `AGENTS.md` there.

For a host started with the agent option, this supersedes the earlier rule that
the server has no execute endpoint. It authorizes nothing beyond that; a host
started without the option keeps the earlier rule. See
[ADR-070](../docs/ADR-070-AGENT-RUNS.md).

## Projects by name and remote operation — owner direction, 2026-10-07

Choosing Add project and entering a name must create the project's folder
automatically in the default destination set in Settings, and activate a
private GitHub repository for it. When the name collides, use a folder name
that fits. No message that has to be clicked may appear on the local machine:
the instance is remote, everything must be possible through remote access, and
processes such as adding a project must run without friction.

In reply to three questions the owner chose: the first commit with `.project`
and `AGENTS.md` is pushed to the new repository; when GitHub fails the project
is still created locally and the publication can be repeated; browsing approved
folders stays for existing folders, and the host's folder dialog leaves the
interface.

For a host started with the GitHub option this extends the exception made for
the agent: the server may run fixed `git` and `gh` command lines and reach
GitHub. It authorizes nothing else. See
[ADR-074](../docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md).

## Product direction — owner statement, 2026-10-07

Recorded as direction, not as scheduled scope; the owner asked that none of it
be built yet.

Astra is ultimately a construction in which a virtual machine on a server runs
what is being built here, as a closed system used through remote access. It
offers an interface prepared for people who build, manage, create, arrange and
push work forward, which is what exists today, and an agent that steers it and
adds information. It will later be widened by further modules, for example a
customer base and perhaps a CRM, and eventually offers and other functions.

It is remote access to one's own company for small businesses whose owner
handles practically everything and would like it all to get done by itself.
For now the core is strictly about projects, the calendar and delivery: what is
to be done, laid out in time, and perhaps some simple resources in counters.

## Project places, publication switch and agent parity — owner direction, 2026-10-07

Later the same day the owner asked for three additions. The Add project dialog
should let the owner choose a folder by clicking and add a folder there, inside
the application. Publishing to GitHub and creating the private repository must
be a function switched on or off in Settings, so that not everyone who creates
projects this way has to archive them on GitHub at once; for the owner it is
set and on by default. And when the owner asks the agent in the chat to create
a project with a list of cards, the agent must do it the same way as the
interface, with the folder, the `.project` data and Git, and the same must be
available from the Astra CLI. See
[ADR-074](../docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md).
