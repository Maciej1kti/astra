# Try the application

Complete the [source build](INSTALL.md#clone-and-build), including release binaries,
first. From this repository, run:

```sh
npm run try
```

Open **https://localhost:47832** in Chrome or Safari. This local-only test launcher
uses a self-signed certificate, so the browser asks you to accept the local test
certificate. Codex's embedded browser may reject it; use your regular browser.
No system certificate trust or private-network settings are changed.

Request browser access. Copy the challenge displayed in the browser, then run in
a second terminal in this repository:

```sh
npm run pair:try -- "CHALLENGE_FROM_BROWSER"
```

Return to the browser and connect. This uses the normal pairing flow. Approval
only matches the challenge you supply; it does not automatically admit browsers.

The launcher creates a sample project with three cards. Its files and credentials
stay in the ignored `.manual/` directory. Your edits persist after stopping and
restarting. Ctrl+C in the launch terminal stops the host and local HTTPS proxy.
Do not delete `.manual/` if you want to keep these test edits.

To open the same manual workspace on a phone connected to this Mac through
Tailscale, stop the local launcher and start it with the Mac's Tailscale IPv4
address:

```sh
ASTRA_TRY_TAILSCALE_IP="$(tailscale ip -4)" npm run try
```

Open the HTTPS URL printed by the launcher on both the phone and the Mac. The
proxy binds only to this Mac's Tailscale address, and the certificate includes
that IP address. The test certificate is self-signed, so accept its warning on
each device. Pair the phone separately using its displayed challenge and
`npm run pair:try -- "CHALLENGE_FROM_BROWSER"`. Both devices must be connected to
the same tailnet. No Tailscale Serve setting is required.

The iOS app and its widgets refuse a self-signed certificate, and Safari warns
about it. With HTTPS certificates enabled in the tailnet, add the host's
Tailscale name and the launcher serves the certificate Tailscale issues for it,
which devices trust without a warning:

```sh
ASTRA_TRY_TAILSCALE_IP="$(tailscale ip -4)" \
ASTRA_TRY_TAILSCALE_NAME="<host>.<tailnet>.ts.net" npm run try
```

The address then is `https://<host>.<tailnet>.ts.net:47832` and the IP address
stops working: the daemon accepts one origin, so every browser pairs again
under the new one. The launcher asks Tailscale for the certificate at each
start, which also renews it.

The launcher remembers the sample in `.manual/state/sample-seeded`. Removing its
registration or physically deleting its `.project` directory does not create a
new sample on restart. Existing sample metadata is also recognized when upgrading
an older manual workspace. To bring a retained sample back, explicitly register
its folder through the normal registration flow.

## A useful first pass

On a phone, check the compact **Focus → Projekty → Więcej** bar. Open More to reach
Calendar, Timeline, List, Board, Chart and Updates. In **Dostosuj nawigację**, move
views earlier/later and toggle their eyes, then reload to check this browser's
layout. Hide every shortcut and recover through More or Reset navigation. Select
an off-bar view and rotate the screen: More should indicate it on phones, while
the desktop sidebar shows that view. Check Escape, keyboard focus and menu
scrolling in landscape.

1. Select **Try Local Projekty**, open a card and change its title/description.
2. Set start/end dates; move it on Board and Timeline.
3. Create another card and a milestone. Change their statuses.
4. Pin two cards to Focus and arrange their order.
5. Add an update, mark it read, then inspect history and undo a card edit.
6. Open a second browser tab, edit the same card in both and inspect the conflict.
7. Refresh the browser and restart the host to check that your edits remain.

Report the action, expected result and actual result. A screenshot helps with
layout issues. This handoff is for practical feedback, not final release acceptance.

On Focus, check **W Focus → Potrzebuje mojej uwagi → W toku → Wydarzenia**.
Pinned cards stay at the top regardless of status, archive state or dates.
Attention contains overdue items, review cards, unresolved decisions and unread
reports. Reading a report removes its unread reminder; reading a decision does
not resolve it. Upcoming dates alone do not need attention in Focus.
In motion contains unfinished date plans whose inclusive Start–End range contains
today in the workspace timezone, including cards still marked Planned. Undated
and future plans are absent. Events contains unfinished timed cards starting
today, ordered by start time; ended events move to attention. Pins take precedence
and each visible card appears once. Check folder/title filters, separate plan and
event pagination, and the floating Add card action on a narrow viewport.

Card and project fields save automatically. Text saves after a short pause;
selections save immediately. Wait for **Zapisano** to confirm persistence. Use the
header X to close the editor; there are no Save changes or Cancel buttons. A new
card is created after entering a valid title. Add tags/checklist items with their
Add controls, and post reports separately. Invalid input, conflicts or uncertain
commands keep the draft available for correction or explicit recovery.

Card editors use a centered dialog over a dimmed, blurred workspace on desktop
and a single responsive reading column. Phones use a full-height editor with a
persistent header. Project editors remain centered dialogs.
Existing cards show a one-line relative schedule; click it to edit dates/time.
New cards keep these controls expanded, including after the first automatic save.
Check upcoming, current, overdue, finished and timed cards in the workspace
timezone. A partial schedule stays expanded until corrected or cleared.
Use the layout icon beside Card actions to drag any of the six sections by its
six-dot handle. Check the insertion preview, Escape cancellation, scrolling in a
short panel, and Arrow/Home/End keys on a focused handle. Order persists in the
same browser. Toggle each eye and reopen the card on another paired device:
visibility must match for that card while other cards stay unchanged. Hide/show
sections with unsent comment, counter, checklist and tag drafts, and confirm the
entries survive. Check hiding all six sections, Reset layout and reduced motion.
Section order is local to each browser and does not change card source data.
Their descriptions display formatted Markdown; click the description field to
edit the source, then click outside it to return to the formatted view. Keyboard
users can focus the description and press Enter or Space to edit, then Tab to
leave it. These modals have no Change history section. Cards no longer have
Kind, Expected result or Owner fields. Project
review dates, phases and extensions are also removed from the source and API
contracts. Card planning uses only Start and End dates; card deadline/review
dates, deadline types, dependencies, milestone links and blocked reasons are
removed throughout the application.

The card Checklist uses one row per item: checkbox, text, remove icon and drag
handle. Drag the handle to reorder; keyboard users can pick up with Space or
Enter, move with arrow keys, then confirm or cancel with Escape. Only a completed
reorder is saved. Use Add item for a new entry. Card editors have no Record
progress, Card updates, Additional fields or Connections and blockers sections. Reports target projects
or milestones; cards have no custom metadata extensions.

## Try the agent

The in-app agent is off in the launcher by default. Stop it and start it again
with the repository's `agent/` directory enabled; Claude Code or Codex must be
installed and signed in on this computer:

```sh
ASTRA_TRY_AGENT=1 npm run try
```

The agent runs with your user's full rights and no permission prompts, so keep
this to the synthetic sample project. See
[Enable the in-app agent](INSTALL.md#enable-the-in-app-agent) and the
[user guide](docs/USER-GUIDE.md#use-the-agent).

1. Check that **Agent** appears at the lower right in every view and, in Focus,
   to the left of **Dodaj kartę**. Without `ASTRA_TRY_AGENT=1` it must be absent.
2. In **Ustawienia przestrzeni roboczej → Dostawca agenta** choose Claude Code or
   Codex. Open the dialog: its badge names the provider, and a missing command
   is reported with **Otwórz ustawienia**.
3. Add a counter to a sample card and send „zrobiłem 10 pompek” (or a request
   naming that card). The dialog shows **Agent pracuje…**, then only the answer;
   open the card and check the counter's total for today.
4. Send a follow-up that refers to the answer. Close the dialog while a message
   runs: the button shows a ring, then a green mark when the answer arrives.
5. Use **Przerwij** on a long request, reload during a run, and restart the
   launcher while a message runs. After the restart the dialog must report that
   the host no longer remembers the message instead of calling it failed.
6. Repeat on a narrow viewport and with the keyboard only: Tab reaches every
   control, Enter sends on a desktop, Escape closes the dialog.

A browser emulator is not a physical phone; record a real-device check
separately.

## Known limits

- The launcher defaults to localhost on the host computer. Its explicit tailnet
  mode above uses that host's Tailscale address. A regular host uses the private
  HTTPS setup described in [Installation](INSTALL.md).
- Chromium and targeted macOS WebKit suites have revision-specific evidence.
  Physical iPhone/Safari and full platform/planning acceptance remain outstanding;
  see [coverage](docs/LIMITATIONS.md#platform-and-browser-coverage).
- Git observation covers HEAD and staged changes, excluding `.project`; it does not
  claim to check unstaged or untracked files.
- Milestone/report extensions use advanced JSON fields. Full performance, fault,
  device and release acceptance remain open; see the [roadmap](ROADMAP.md).
- Built-in backup archives and source migrations are deferred.

The prepared binary is in `target/release/`. To rebuild after changing source:

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
```

## Arrange projects in Projects

Open **Projekty** from the sidebar or the phone's navigation bar. In a synthetic
workspace, give projects Active, Paused and Archived statuses and check that
each appears in its matching column. Filter by folder and title, then open a
project and verify its current fields. Drag the project card to a different
column; reload to check the saved status. Escape cancels a held drag. The card's
**Więcej działań** menu supports keyboard and touch changes. On a phone, hold a
card to lift it, use the status strip to change columns and check that the page
itself stays within the viewport.

On either board, check how a move feels: the other cards part around a dashed
slot, the released card flies into it and stays there without a dialog or a
jump, and Escape sends it home. Alt+arrows on a focused card move it and keep
the focus on it. On a phone, a sideways swipe that starts on a card turns one
column; holding a lifted card at the screen edge or on a column chip turns the
page, and a collapsed column opens under it.
Select Projects in **Ustawienia przestrzeni roboczej → Widok domyślny** and open the app without a
view query to check the preference.

## Add a project by name

Approve a directory for new projects once on the host, for example
`target/release/projectctl --socket .manual/state/projectd.sock add-root "$PWD/.manual/projects" --label Projects`
after creating that directory. Open **Projekty → Dodaj projekt**, type a name
and choose **Utwórz projekt**. The folder appears inside the approved directory
under a name derived from the project's, with `-2`, `-3` and so on when that
name is taken, and the app opens the new project. Nothing opens on the host's
desktop. With several approved directories, first choose one under
**Ustawienia → Katalog nowych projektów**.

Started with `ASTRA_TRY_GITHUB=1 npm run try`, the same button also creates a
private repository in the GitHub account the host's `gh` is signed in to and
pushes `.project` and `AGENTS.md`. This creates a real repository: use a name
you are willing to keep or delete on GitHub afterwards. When GitHub cannot be
reached, the dialog reports that the project works locally and offers **Ponów
publikację**; the project's **Git** dialog offers the same later.

## Add an existing project folder

**Dodaj projekt → Masz już folder z projektem? → Dodaj istniejący folder**
browses the directories approved on the host and registers a folder that
already exists there. The browser no longer opens the host's folder dialog
([ADR-074](docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md)).

Registration adds `.project` planning files and a managed `AGENTS.md` block while
preserving existing content. The user names the project or selects the folder; no
file attachments or automatic repository discovery are involved.

## Gantt and calendar walkthrough

Use a sample project and three cards named Design, Build and Review. Set their
inclusive schedules to September 7–9, September 8–10 and September 9–10, 2026.
In **Oś czasu**, open the month title, go to a date in September 2026, then:

1. Inspect the recorded schedule bars. With only these three cards, the latest
   recorded end date is September 10. Saturdays and Sundays are shaded in the
   day scale; switch to **Tygodnie** and **Miesiące** and back.
2. Drag a bar, then each of its ends. The bar must follow the pointer between
   days, show the dates it would get, and save on release with no dialog.
   Escape during a gesture cancels it. Alt+Left/Right on a focused bar or end
   changes one day; adding Shift changes a week. Click a bar and check that the
   card opens, not a date dialog.
3. Drag a row by its grip, try Alt+Up/Down, then reload to verify the browser
   remembers the project order. Click a day in the final row and check
   the new card draft has that date; press on one day and release on another
   for a range. The header Add card action remains.
4. Leave a card without dates and check that it is listed above the axis under
   **Bez harmonogramu** and opens as a card.
5. Change the card's Start and End fields, wait for Saved, then reload and check
   that the same inclusive range appears. There are no dependency connectors,
   forecast controls or separate card deadline/review markers.

In **Kalendarz**, navigate to the same dates and try day, week, month and agenda.
Select an empty day/range or use **Nowa zaplanowana karta** to open a prefilled draft.
Move planned work or resize either end and verify that it saves without a
confirmation dialog and stays visible at its new dates. Milestone
date markers open the milestone editor. Date-only cards use inclusive planned
ranges; timed events use their recorded start and duration.

The **Skróty i edycja kalendarza** disclosure lists controls. Alt+1 through
Alt+4 select the four layouts; Alt+T returns to today. Alt+Left/Right navigates
when the calendar region has focus and moves dates when a planned event has
focus; Shift changes that move to a week. Normal text-entry shortcuts are kept.
Date-only plans keep whole-day dates. Timed events appear in hourly calendar
views; their local start time follows the workspace timezone.

Repeat an edit in two browser tabs to inspect conflict handling: a bar moved
in a tab that has not yet seen the other tab's change must return to its saved
days and show the conflict. Keep an uncertain
proposal open and use **Ponów to samo polecenie** or check its status; do not submit
an independent replacement without knowing the first outcome. On a narrow
screen, swipe to pan the timeline, hold a bar briefly to move it and open the
card for exact dates. Record physical-device findings separately from browser emulation.
