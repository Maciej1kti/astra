# Using Astra

Start with [installation](../INSTALL.md), then pair a browser and register a
project folder. All views use the same host and project sources. This guide
describes implemented behavior; [limitations](LIMITATIONS.md) lists open boundaries
and [the roadmap](../ROADMAP.md) separates those from planned release work.

## The basic model

| Term | Meaning |
| --- | --- |
| Host / instance | One `projectd` process and its durable workspace; sessions and preferences belong to it |
| Project | One explicitly selected directory with `.project/project.json` and its resource collections |
| Folder category | Optional project metadata such as Work or Home; it does not move a directory |
| Card | A work item with status, description and optional checklist, labels, plan/event, comments and counters |
| Milestone | An independent checkpoint with its own status and optional date |
| Report / update | An immutable account of a result, blocker, note or decision, targeting a project or milestone |
| Focus pin | A card's persistent `pinned` field; the host separately remembers pin order |

Reports and card comments serve different purposes. Reports record project or
milestone outcomes and decisions; comments retain the conversation on one card.
Neither a report nor a completed checklist automatically changes card status.

## Choose a view

| View | Use it for | Key behavior |
| --- | --- | --- |
| Focus | Today's work and items needing attention | Ordered pins, attention, current plans and today's events; folder-category filtering |
| Projects | Register and inspect project folders | Project context, folder category and project actions |
| List | Find and filter resources | Bounded pages, search/filter controls and access to resource editors |
| Board | Arrange cards by status | Manual ordering, drag/drop and keyboard alternatives; a workspace overview and project boards |
| Calendar | See dates in day, week, month or agenda form | Date plans, timed events and milestone markers, with direct move/resize saves |
| Timeline | Inspect recorded schedules over time | Schedule bars and milestones; API/CLI call this view `gantt` |
| Updates | Read project/milestone reports | Read receipts, corrections and explicit decision resolutions |

Search and filters do not change source files. Where a view offers another page,
use its paging controls: a displayed page is not the entire dataset. Calendar
agenda pages hold up to 200 items; its grid/time layouts up to 1,000.

## Create and edit cards

A title is enough to start a card. Its statuses are **Planned**, **Active**,
**Review**, **Done** and **Cancelled**; priority is **Normal** or **High**.
There is no requirement to pass through every status in order. Reopen a completed
card when appropriate; archiving is separate from status.

Card and project editors automatically save valid changes. Text saves after a
short pause; discrete field changes save immediately. **Saved** confirms the
acknowledged write. Incomplete fields, a conflict or a lost response can keep a
draft open for correction or recovery. Use the editor's explicit close/discard
flow to protect unsaved input.

Descriptions display Markdown. Click the description to edit it; keyboard users
can focus it and press Enter or Space. Leaving the field returns to the formatted
view. Embedded HTML is escaped and remote images are not loaded.

Cards have six freely reorderable sections: Description, Checklist, Counters,
Comments, Schedule and Labels. Open Card layout in the header and drag a six-dot
handle to arrange them in one column. A focused handle also supports the arrow
keys, Home and End; Escape cancels a drag. Order is local to this browser.

The eye beside each section shows or hides it for this particular card on every
device. Hiding keeps its data and unfinished entries. Visibility saves with the
card and follows the same save/conflict handling as other edits. The layout menu
always keeps all six sections available, even when every section is hidden.
Reset layout restores the default browser order and shows all sections on the card.
On phones the editor fills the viewport with a persistent header; on larger screens
it is a centered dialog.

### Checklists and labels

Checklist items have stable identities, text and explicit completion. Drag their
handles to reorder, or pick up with Space/Enter, move with arrow keys and confirm;
Escape cancels. Only a completed reorder is saved. Finishing every item does not
mark the card Done, and Done cards may still have incomplete checklist items.

Labels belong to cards. Suggestions come from the selected project's card labels.
A project tag rename is a reviewed background workflow; wait for job completion.
A project's Folder category is a separate value used to group projects in Focus.

### Comments and daily counters

Post a comment explicitly after writing it. Browser comments use the human/Owner
attribution; CLI/API callers can label human or bot authors. Comments stay in the
card's source history and cannot be rewritten by an ordinary card patch or undo.
These labels are not separate authenticated accounts.

Counters record one absolute total per day in the workspace timezone. Give a
counter a name, unit and step, then scrub horizontally or type a value and confirm
it. The card editor shows a 14-day trend and saved history; Focus pins expose
compact daily controls. Missing history is not a recorded zero. The current-day
control can start at zero when nothing has been saved.

Use Add counter for the first counter and the counter menu for existing/archived
ones. Archiving hides a counter
without erasing its history. Units cannot change after a result has been recorded;
counter data has no destructive clear/undo operation. New edits use the latest
acknowledged card version, while a pending edit retains its original day/version.

## Plan work and events

```text
  Card
   |-- No dates       --> unscheduled work
   |-- Start + End    --> date-only plan (both dates included)
   `-- Time + length  --> timed event (workspace timezone)

  Milestone           --> independent checkpoint with an optional date
```

A card uses either a date-only schedule or a timed event, not both. For a one-day
plan, Start and End are the same day. Existing cards show a relative schedule
summary that expands for editing; new cards keep the fields open. The date picker
stages changes until Apply. Partial/invalid ranges remain visible for correction.

Timed events have a local start and duration. The workspace timezone controls
their meaning, regardless of the viewing phone's timezone. Settings hold the
workspace calendar preferences. Calendar pointer moves and resizes save in the
background on drop. A failed or uncertain save opens recovery controls with the
original proposal and command; conflicts require a deliberate new edit. Timeline
date gestures and Calendar keyboard date editing use a proposal form. Escape or
a cancelled gesture makes no source change. Controls
also provide keyboard editing, described in the Calendar shortcuts disclosure
and [manual walkthrough](../MANUAL-TESTING.md#gantt-and-calendar-walkthrough).

Timeline shows what has been recorded. It does not calculate dependencies, critical
paths or automatically shift other cards. Cards have no separate deadline/review
dates, blocked-reason field or milestone link. Milestones remain independent
resources with project/milestone report support; they are not a card type.
Drag a Timeline row by its grip, or use Alt+Up/Down on the grip, to reorder it.
This per-project presentation order is saved in the current browser. The final
empty row creates a card on the clicked date; the main Add card action remains.

## Understand Focus

Focus presents these sections in order and avoids repeating a visible card:

1. **In focus:** pinned cards, regardless of status or dates. Reorder directly or
   use the keyboard controls; filtered ordering preserves hidden entries.
2. **Needs my attention:** actionable signals such as overdue work, review cards,
   unresolved decisions and unread reports. Reading a decision is not resolving it.
3. **In motion:** unfinished date-only plans whose inclusive range contains today
   in the workspace timezone. A Planned card can be here; an undated Active card
   does not qualify merely because it is Active.
4. **Events:** unfinished timed cards starting today, ordered by start time. Ended
   unfinished events move to attention.

Pins take precedence over later sections. Upcoming dates alone do not put a card
in Focus attention. The folder filter selects all projects or one project category.
Use the floating Add card action to create work from Focus. In focus, In motion
and Events share the same card layout, including schedule, checklist and counters.
Overdue pinned work shows its lateness in the schedule without a duplicate badge.

## Reports, history and deletion

Submit reports explicitly in Updates or through the CLI. Reports target projects
or milestones; cards use comments. A correction points to an earlier report, and
a resolution explicitly closes a decision signal. Reading a report clears its
unread reminder across the instance's devices but does not change the decision.

History records supported changes. Undo proposes a new conditional edit and may
conflict with later changes. It is not a restore system for deleted resources.

Archive, unregister and delete have different effects:

| Action | Effect |
| --- | --- |
| Archive a card/project | Retain sources while changing ordinary visibility; restore an archived project before editing its cards |
| Unregister a project | Remove the host registration through local maintenance; retain the project's source directory |
| Delete a card | Permanently remove its JSON source; unpin it first |
| Delete a report through CLI/API | Permanently remove it after reference checks; delete referencing reports first |
| Delete a project | Review a directory snapshot, then permanently remove `.project/` and its host registration; other project files remain |

There is no trash or built-in restore for permanent deletion. A deleted resolution
can reopen a decision. Use an external stopped-server backup if you need a recovery
copy. [CLI deletion](../CLI.md#permanent-deletion) describes the conditional commands.

## When a save needs attention

| Situation | Appropriate next step |
| --- | --- |
| Invalid input | Correct it while retaining the draft |
| Another edit changed the resource | Compare the current resource and your intent, then deliberately prepare a new edit |
| Response lost / command pending | Check status or retry the same command; retain its request ID, epoch, payload and original version |
| Session expired/revoked | Preserve the draft, pair again and follow the command's recovery state |
| Host offline | Restore the host connection; writes do not fall back to local files |
| Source/recovery diagnostic | Inspect the host diagnostics before changing data |

Keep drafts before an explicit reload. Browser-local appearance preferences are
not a durable offline draft queue. The CLI's [safe retry rules](../CLI.md#uncertain-results-and-safe-retries)
apply to automation too. For a problem report, record the revision and exact action
with synthetic or sanitized data; see [Contributing](../CONTRIBUTING.md).
