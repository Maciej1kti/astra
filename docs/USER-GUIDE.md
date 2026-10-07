# Using Astra

Start with [installation](../INSTALL.md), then pair a browser and register a
project folder. All views use the same host and project sources. This guide
describes implemented behavior; [limitations](LIMITATIONS.md) lists open boundaries
and [the roadmap](../ROADMAP.md) separates those from planned release work.

## Interface language

The browser interface is Polish on every device, including menus, dialogs,
settings, status/priority labels, accessibility text, pairing and recovery messages.
**Focus** keeps its name. Navigation uses **Projekty**, **Tablica**, **Wykres**,
**Kalendarz**, **Oś czasu**, **Lista** and **Aktualizacje**; **Więcej** opens the
remaining phone shortcuts. Focus sections are **W Focus**, **Potrzebuje mojej
uwagi**, **W toku** and **Wydarzenia**.

Dates, month/day names and displayed numbers use Polish formatting. Chart rates
accept either a decimal comma or point. Source identifiers, API/CLI values,
paths, user/profile names and user-written project content retain their meaning
and spelling. The CLI and contributor documentation remain English. Browser
language follows the application rather than the device language or a previously
stored English preference; saving workspace settings records the Polish locale.

## The basic model

| Term | Meaning |
| --- | --- |
| Host / instance | One `projectd` process with shared browser pairing and one or more trusted user profiles |
| User profile | A selected workspace with its own project folders, approved roots, Focus order, preferences and report read state |
| Project | One explicitly selected directory with `.project/project.json` and its resource collections |
| Folder category | Optional project metadata such as Work or Home; it does not move a directory |
| Card | A work item with status, description and optional checklist, labels, plan/event, comments and counters |
| Milestone | An independent checkpoint with its own status and optional date |
| Report / update | An immutable account of a result, blocker, note or decision, targeting a project or milestone |
| Focus pin | A card's persistent `pinned` field; the host separately remembers pin order |

Reports and card comments serve different purposes. Reports record project or
milestone outcomes and decisions; comments retain the conversation on one card.
Neither a report nor a completed checklist automatically changes card status.

## Choose a user

Open **Ustawienia przestrzeni roboczej → Użytkownik**. Enter a **Nazwa nowego użytkownika** and choose
**Dodaj użytkownika** to create an empty profile. To use it, select **Bieżący użytkownik** and
choose **Zmień użytkownika**. The settings button shows the profile used by that tab.
Finish or explicitly discard unsaved changes and resolve pending commands before
switching; the switch is disabled while that work remains.

The initial **Owner** profile keeps all existing projects and settings; its name
can be changed through the [CLI](../CLI.md#trusted-user-profiles). Adding a
profile does not move or copy project sources. Register that profile's exact
folders through Projects or the [CLI](../CLI.md#trusted-user-profiles). A project
folder can be registered in several profiles in the same instance. They share
the same cards, reports, comments, counters and recorded values. Other project
folders remain visible only in the profiles where they are registered.

Shared cards have the same Focus pin membership in every participating profile;
each profile keeps its own Focus order, preferences and report read state.
Command history belongs to the profile that made the edit. Unregistering removes
only that profile's registration. Before deleting or relocating a shared project,
unregister it from the other profiles.

A switch reloads the current tab. Reloading keeps that tab's profile, and already
open tabs keep their own selection. New tabs use the last selected profile in
that browser. Other devices select their profiles independently.

If a remembered profile is unavailable, Astra reports the problem. **Użyj domyślnego użytkownika** explicitly returns that tab to the default profile while keeping its
paired session.

Profiles organize work for trusted people. Any paired browser can select any
profile; pairing and device approval are shared across the instance. There are
no profile passwords, roles or private access restrictions between paired users.
Use separate application instances if users must be unable to access each
other's folders. See [limitations](LIMITATIONS.md#product-boundaries).

## Choose a view

On phones, the bottom bar starts with **Focus**, **Projekty** and **Więcej** (three
dots). More opens the other views. Open **Więcej → Dostosuj nawigację** to move
any view by its six-dot handle and toggle its eye to show or hide it on the bar.
A focused handle also accepts ArrowUp/Down or Home/End, just like the card section
selector. Escape or Tab cancels an unfinished drag; a drop outside the menu keeps
the previous order.
Hidden views remain available in More; when one is selected, More is highlighted.
**Przywróć nawigację** restores Focus and Projects. Order and bar visibility are
saved in this browser, across projects and profiles; other devices keep their own
layout. The desktop sidebar keeps every view available in the chosen order, so
its **Więcej** entry holds only **Dostosuj nawigację**.

| View | Use it for | Key behavior |
| --- | --- | --- |
| Focus | Today's work and items needing attention | Ordered pins, attention, current plans and today's events; folder-category filtering |
| Projekty | Arrange and manage whole projects | Active, Paused and Archived columns, folder/title filters, status moves and project actions |
| Lista | Find and filter resources | Bounded pages, search/filter controls and access to resource editors |
| Tablica | Arrange cards by status | Manual ordering, drag/drop and keyboard alternatives; a workspace overview and project boards |
| Kalendarz | See dates in day, week, month or agenda form | Date plans, timed events and milestone markers, with direct move/resize saves |
| Oś czasu | Inspect recorded schedules over time | Schedule bars and milestones; API/CLI call this view `gantt` |
| Wykres | Compare recorded counter histories | Select counters, overlay compatible units, group dates, inspect statistics and convert values with individual rates |
| Aktualizacje | Read project/milestone reports | Read receipts, corrections and explicit decision resolutions |

Search and filters do not change source files. Where a view offers another page,
use its paging controls: a displayed page is not the entire dataset. Calendar
agenda pages hold up to 200 items; its grid/time layouts up to 1,000.

Open **Projekty** from the sidebar or the phone's navigation bar to see projects in
their current status columns, including archived projects. Use **Folder** and
the title filter to narrow the board. Click a project to open its editor, or use
**Dodaj projekt** to register a folder. Projects is the same board as a
project's cards, with status columns of its own: drag a project card itself to
another column to save its status (on a touch screen, hold the card first);
Escape cancels the drag. Alt+Left/Right on a focused card moves it one column over. The card's **Więcej działań** menu offers the same
status changes with keyboard and touch controls. Columns collapse, scroll on
their own and, on a phone, are reached from the status strip above the board.
Project order follows the loaded project list. A project whose status cannot be
read appears in a separate **Niedostępne** column that takes no moves.

Moves use the displayed project version. A conflict keeps the proposal for
review; close it and inspect the current project before trying again. An uncertain
result retains **Sprawdź stan** and **Ponów to samo polecenie**. Projects can also be chosen
as the default view in Workspace settings. The separate Main shortcut and former
project grid are removed. Older Main links and saved defaults open Projects;
existing navigation entries merge into one Projects shortcut.
Use a project's **Więcej działań → Usuń projekt** for the existing deletion preview
and explicit confirmation.

### Motion and accessibility

Navigation, loaded content, menus and dialogs share layered motion effects.
Surfaces appear first, followed by headings, sections and small details. Existing
tags enter with their section; adding a tag gives a separate confirmation pulse.
Entrances gently fade into view with subtle movement; headings and small tag
details also resolve from a light blur into sharp text.
Card context, titles, metadata, labels and daily counter footers have their own
opening layers across views. Editing a counter or refreshing data keeps them in place.
Calendar reveals its headings, grid and event groups in stages after the selected
period loads. Agenda days and the month overflow popup use the same gentle effects,
on desktop and mobile; moving an event does not replay the whole calendar.
Chart opens the same way: its controls, counter list and plot surfaces appear
in turn and the lines rise from the baseline. They rise again when you
change the selected counters, grouping, totals or range, and stay still during
a refresh. The pairing page, the sidebar, List filters and the cards listed
under Timeline use the same soft entrances. Inside a dialog the fields and
rows follow their section, menu items appear one after another, and an opened
disclosure such as **Dostosuj nawigację** reveals its rows in turn.
Buttons respond to a press, and the navigation highlight follows the selected
view on desktop and mobile. To disable these effects, enable **Reduce motion**
in your operating system; Astra follows changes immediately, including while
an editor is open. Animations do not change save confirmation or draft protection.

## Create and edit cards

A title is enough to start a card. Its statuses are **Zaplanowane**, **Aktywne**,
**Do sprawdzenia**, **Gotowe** and **Anulowane**; priority is **Normalny** or **Wysoki**.
There is no requirement to pass through every status in order. Reopen a completed
card when appropriate; archiving is separate from status.

Card and project editors automatically save valid changes. Text saves after a
short pause; discrete field changes save immediately. **Zapisano** confirms the
acknowledged write. Incomplete fields, a conflict or a lost response can keep a
draft open for correction or recovery. Use the editor's explicit close/discard
flow to protect unsaved input.

Descriptions display Markdown, and links in them work as links. Click the text
to edit it. Keyboard and screen-reader users reach **Edytuj opis**, a button
beside the text that appears when it has keyboard focus; Enter or Space starts
editing. Leaving the field returns to the formatted view. Embedded HTML is
escaped and remote images are not loaded.

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
If its confirmation is lost, **Sprawdź stan** reports whether the rename has
finished and **Ponów to samo polecenie** continues the same job.
A project's Folder category is a separate value used to group projects in Focus.

### Comments and daily counters

Post a comment explicitly after writing it. Browser comments use human attribution
with the selected profile's name; new reports also start with that name. CLI/API
callers can label human or bot authors. Existing attribution stays unchanged.
Comments stay in the card's source history and cannot be rewritten by an ordinary
card patch or undo.
These labels are not separate authenticated accounts.

Counters record one absolute total per day in the workspace timezone. Give a
counter a name, unit and step, then scrub horizontally or type a value and confirm
it. The card editor shows a 14-day trend and saved history; In focus, In motion and Events expose
compact daily controls for their active counters. Missing history is not a recorded zero. The current-day
control can start at zero when nothing has been saved.

Use **Dodaj licznik** below the list to add a counter. Once a counter has been
archived, a menu in the same place offers Add counter and **Zarchiwizowane**.
Archiving hides a counter
without erasing its history. Units cannot change after a result has been recorded;
counter data has no destructive clear/undo operation. New edits use the latest
acknowledged card version, while a pending edit retains its original day/version.

## Compare counters in Chart

Open **Wykres** from the sidebar or the phone's **Więcej** menu. Use the Project
selector to inspect one project or all registered projects.

The plot is the main surface. On a wide screen the **Liczniki** list sits beside
it; on a tablet or phone it collapses to one row showing how many counters are
selected, and opens in place when tapped. Choose up to eight counters by their
name and source card. **Znajdź licznik** filters the list; **Także zarchiwizowane**
also reveals histories retained on archived counters, cards and projects. A
counter without recorded history remains available to select. Each selected
counter keeps its colour while you add or remove others.

Pick **7 dni**, **30 dni**, **90 dni** or **1 rok**, or open **Własny** for an
inclusive **Od**/**Do** range. Group results by **Dni**, **Tygodnie** or
**Miesiące**. On a desktop or tablet these controls sit above the plots. On a
phone the range, grouping and totals are three menus in one row directly below
the plots, so the plot follows the counter list at once. Until you pick a grouping yourself it follows the range: days up
to 45 days, weeks up to 180 and months beyond. Every plot draws dots joined
by lines. **Sumy okresów** puts one dot per group; **Narastająco** adds recorded
values from the beginning of the range. A group without a recording has no dot
and the line passes over it to the next recording; a saved zero is a dot on the
zero line.

The row above each plot names every counter and shows its value for one group,
starting with the latest recorded one. Move the pointer over the plot, drag or
tap it, or focus the plot and use the arrow keys, Home and End to read another
group. A group without a recording reads **Brak zapisu**; in a running total it
reads the held total with **bez zapisu**.

Plots always show recorded values. Counters with the same unit share a plot and
different units get separate plots, each with its own scale.

**Podsumowanie okresu** lists each selected counter's total, recorded days,
average and best day; on a narrow screen every counter becomes its own card.
**Różnica** appears when at least two selected counters share a unit, and
compares totals with the first of them. To estimate a cost, payment or other
derived value, enter an individual **Stawka** in that counter's row. For example,
ten recorded hours at a rate of 100 give 1,000 in the chosen **Jednostka
wynikowa**. **Razem** adds same-unit totals and the converted values. Only
counters with a valid rate contribute; zero is a valid rate. Rates value the
summary only and do not change the plots. Rates and the
output label are saved in this browser for the selected workspace profile. These
controls do not change counter units or recorded sources.

Ranges are limited to 400 days. Counter catalogs are paged; use **Wczytaj więcej liczników** when
offered to discover further counters, up to 500 loaded entries; narrow the Project
scope for larger catalogs. At most eight counters can be selected at once.
Changes recorded in another client refresh
the dashboard, and opening a source card still reads its current version before
editing.

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
Alt+Home/End moves the row to the first/last position. Escape or Tab cancels an
unfinished pointer preview; a drop outside the ordering surface keeps the order.
This per-project presentation order is saved in the current browser. The final
empty row creates a card on the clicked date; the main Add card action remains.

## Understand Focus

Focus presents these sections in order and avoids repeating a visible card:

1. **W Focus:** pinned cards, regardless of status or dates. Reorder directly or
   use Alt+Up/Down on a focused card; Alt+Home/End moves it to the first/last
   visible position. Filtered ordering preserves hidden entries.
2. **Potrzebuje mojej uwagi:** actionable signals such as overdue work, review cards,
   unresolved decisions and unread reports. Reading a decision is not resolving it.
3. **W toku:** unfinished date-only plans whose inclusive range contains today
   in the workspace timezone. A Planned card can be here; an undated Active card
   does not qualify merely because it is Active.
4. **Wydarzenia:** unfinished timed cards starting today, ordered by start time. Ended
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

History records supported changes. Each entry shows when it was recorded and
which fields changed, named as in the editor. Undo proposes a new conditional
edit and may conflict with later changes. It is not a restore system for deleted
resources.

Archive, unregister and delete have different effects:

| Action | Effect |
| --- | --- |
| Archive a card/project | Retain sources while changing ordinary visibility; restore an archived project before editing its cards |
| Unregister a project | Remove the host registration through local maintenance; retain the project's source directory |
| Delete a card | Permanently remove its JSON source; a card pinned to Focus leaves Focus with it |
| Delete a report through CLI/API | Permanently remove it after reference checks; delete referencing reports first |
| Delete a project | Review a directory snapshot, then permanently remove `.project/` and its host registration; other project files remain |

Deleting a project also removes its search index entries and source diagnostics.
Delayed filesystem notifications do not restore warnings for a removed project.

There is no trash or built-in restore for permanent deletion. A deleted resolution
can reopen a decision. Use an external stopped-server backup if you need a recovery
copy. [CLI deletion](../CLI.md#permanent-deletion) describes the conditional commands.

## Use the agent

The **Agent** button appears at the lower right of every view, beside **Dodaj
kartę** in Focus, only when the host's OS owner started `projectd` with
`--agent-dir` ([installation](../INSTALL.md#enable-the-in-app-agent)). Without
that option the button is absent. The agent is a local Claude Code or Codex that
changes data through `projectctl`, with the daemon user's full rights and no
permission prompts; see [limitations](LIMITATIONS.md#in-app-agent).

Open the dialog and write a sentence, such as „zrobiłem 10 pompek” or „dodaj
komentarz do karty o fakturze”. The agent finds the project and card, makes the
change and answers once. The dialog shows only your message and that answer, not
what the agent did on the way, so check the card when it matters. Each message
carries today's date in the workspace timezone, the open view and the selected
project, so relative dates and the project you are looking at are known to the
agent. Answers are shown as Markdown.

- **Wyślij** sends; a message holds up to 8,000 characters. Enter sends on a
  desktop and Shift+Enter starts a new line. On a touch screen Enter is a line
  break and only the button sends; Ctrl or Cmd with Enter always sends.
- One message runs at a time per conversation, and the host runs at most two
  agents together. Later messages resume the provider's session, so a follow-up
  can refer to the previous answer. **Nowa rozmowa** starts afresh and
  is available when nothing is running.
- Closing the dialog does not stop the agent. A ring on the button means it is
  working, a green mark that a new answer waits. Reloading restores the
  conversation from the host.
- The **Dostawca agenta** setting in **Ustawienia przestrzeni roboczej** (shown
  only when the agent is enabled) selects **Claude Code** or **Codex** for the
  current profile. It applies to new conversations; the dialog's badge shows the
  provider a conversation keeps. If the host cannot find the chosen command, the
  dialog says so and offers **Otwórz ustawienia**.

| What the dialog shows | Meaning |
| --- | --- |
| **Wysyłanie…** | The message is on its way. After a lost connection the browser repeats the identical request up to four times, 1 to 8 seconds apart; the host starts the agent once however often it arrives |
| **Nie udało się potwierdzić, że wiadomość dotarła do hosta.** with **Ponów** | The retries are used up. **Ponów** repeats the same request, so it cannot run the agent twice. The message may have arrived |
| **Agent pracuje…** with a clock and **Przerwij** | The agent is running. Cancelling asks the host to end it (**Przerywanie…**); it may already have made some changes |
| The answer | The run succeeded. **Odpowiedź została skrócona.** means it exceeded 65,536 characters |
| An error message, with **Szczegóły** | The run failed: the provider reported an error (its message is under **Szczegóły**) or ended without an answer (**Agent zakończył pracę bez odpowiedzi.**) |
| **Przerwano. Agent mógł zdążyć wykonać część zmian.** | You cancelled the run |
| **Agent nie skończył w wyznaczonym czasie i został zatrzymany.** | The time limit (default 10 minutes) ended it; part of the work may be done |
| **Host został uruchomiony ponownie i nie pamięta tej wiadomości.** with **Wyślij ponownie** and **Odrzuć** | The daemon restarted. Whether the agent acted is unknown: check the card before **Wyślij ponownie**, which sends the text as a new message in a new conversation |
| **Poprzednia rozmowa nie jest już dostępna na hoście.** | After a restart the host no longer has the conversation; a new one begins |

A message the host refuses (for example because the agent is busy, the chosen
provider cannot be started or `projectctl` is missing beside the daemon) starts
nothing: the reason appears above the composer and the text returns to it.

Conversations and runs are kept in the daemon's memory only. A restart loses
them, and the outcome of a run that was in progress cannot be read back. Only
the unacknowledged message and the conversation's ID are kept in the browser, so
a reload can resume. An expired session keeps the dialog and the conversation;
pair the browser again to continue. Switching profile is disabled while the
dialog holds a draft or a running message, and each profile has its own
conversation.

The agent follows [instructions](../agent/AGENTS.md) written for it, such as
changing only what you asked and not guessing between two cards. They guide it;
they do not restrict it.

## When a save needs attention

| Situation | Appropriate next step |
| --- | --- |
| Invalid input | Correct it while retaining the draft |
| Another edit changed the resource | Open **Aktualna zapisana wersja** to compare its fields with your intent (**Kopiuj aktualną wersję** copies its source), then deliberately prepare a new edit |
| Response lost / command pending | Check status or retry the same command; retain its request ID, epoch, payload and original version. Settings, new users and tag renames offer both, like every other dialog |
| Session expired/revoked | Pair again in the panel shown above your open work, then follow the command's recovery state |
| Settings changed elsewhere | Load the current settings, review your retained changes and save them again deliberately |
| Host offline | Restore the host connection; writes do not fall back to local files |
| Source/recovery diagnostic | Inspect the host diagnostics before changing data |

When a session ends while a dialog holds a draft or an unresolved command, that
dialog stays open underneath a pairing panel. Request access and approve the
browser as usual; the dialog returns with the same draft and request ID, and
**Sprawdź stan** or **Ponów to samo polecenie** continue the original command.
**Pokaż zachowaną pracę** steps the panel aside so the draft can be copied, and
**Połącz ponownie** in the dialog brings it back. Dialogs with nothing to lose
close. The browser asks before leaving a page that still has an unresolved
command, because a reload discards its request ID.

Astra reconnects its change notifications by itself, including after the host
refused the connection. **Ponowne łączenie…** in the sidebar means changes made
elsewhere may not have arrived yet.

A settings save rejected because the settings changed elsewhere is not sent
again. **Wczytaj aktualne ustawienia** reads the saved state without writing:
fields you edited keep your values, the others show what is saved now.

Keep drafts before an explicit reload. Browser-local appearance preferences are
not a durable offline draft queue. The CLI's [safe retry rules](../CLI.md#uncertain-results-and-safe-retries)
apply to automation too. For a problem report, record the revision and exact action
with synthetic or sanitized data; see [Contributing](../CONTRIBUTING.md).
