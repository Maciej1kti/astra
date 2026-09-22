# Try the application

From this repository, run:

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

The launcher remembers the sample in `.manual/state/sample-seeded`. Removing its
registration or physically deleting its `.project` directory does not create a
new sample on restart. Existing sample metadata is also recognized when upgrading
an older manual workspace. To bring a retained sample back, explicitly register
its folder through the normal registration flow.

## A useful first pass

1. Select **Try Local Projects**, open a card and change its title/description.
2. Set start/end dates; move it on Board and Timeline.
3. Create another card and a milestone. Change their statuses.
4. Pin two cards to Focus and arrange their order.
5. Add an update, mark it read, then inspect history and undo a card edit.
6. Open a second browser tab, edit the same card in both and inspect the conflict.
7. Refresh the browser and restart the host to check that your edits remain.

Report the action, expected result and actual result. A screenshot helps with
layout issues. This handoff is for practical feedback, not final release acceptance.

Card and project fields save automatically. Text saves after a short pause;
selections save immediately. Wait for **Saved** to confirm persistence. Use the
header X to close the editor; there are no Save changes or Cancel buttons. A new
card is created after entering a valid title. Add tags/checklist items with their
Add controls, and post reports separately. Invalid input, conflicts or uncertain
commands keep the draft available for correction or explicit recovery.

Card and project editors open in centered dialogs over a dimmed, blurred workspace.
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

## Known limits

- The launcher listens on localhost on the host computer. Phone access requires
  the intended private HTTPS network setup.
- The planning views have local Arch Linux/Chromium verification. Physical
  iPhone/Safari and macOS planning acceptance remain outstanding; CI results
  and earlier platform evidence are recorded separately in `progress/`.
- Git observation covers HEAD and staged changes, excluding `.project`; it does not
  claim to check unstaged or untracked files.
- Some less common metadata fields use the advanced JSON editor. Full release polish,
  larger performance/fault scenarios and documentation cleanup await feedback.
- Built-in backup archives and source migrations are deferred.

The prepared binary is in `target/release/`. To rebuild after changing source:

```sh
npm run build
scripts/cargo-local build --workspace --release
```

## Add an existing project folder

Open **Projects → Add project → Choose folder…**. The host's operating-system
folder dialog opens. Select any repository folder, review the displayed path and
click **Add project**. There is no restriction to a Projects directory. Cancelling
the system dialog creates no project files. The app opens the selected project's
board after registration succeeds.

The dialog appears on the computer running projectd. On macOS it uses the system
folder picker; Linux desktop hosts use XDG Desktop Portal with a FileChooser backend (such as
xdg-desktop-portal-gtk or KDE); Zenity is a fallback. Run the host in the desktop
session so it can reach the user session bus. For a remote host without a desktop,
**Remote host without a desktop? → Browse approved folders** retains the existing
owner-approved directory browser as an alternative.

Registration adds `.project` planning files and a managed `AGENTS.md` block while
preserving existing content. The user selects the repository; no file attachments
or automatic repository discovery are involved.


## Gantt and calendar walkthrough

Use a sample project and three cards named Design, Build and Review. Set their
inclusive schedules to September 7–9, September 8–10 and September 9–10, 2026.
In **Timeline**, choose September 2026, then:

1. Inspect the recorded schedule bars. With only these three cards, the latest
   recorded end date is September 10.
2. Drag a bar or either edge and confirm the date proposal. Escape during a
   gesture cancels it. Alt+Left/Right on a focused handle changes one day;
   adding Shift changes a week. Open the selected card for full editing.
3. Change the card's Start and End fields, wait for Saved, then reload and check
   that the same inclusive range appears. There are no dependency connectors,
   forecast controls or separate card deadline/review markers.

In **Calendar**, navigate to the same dates and try day, week, month and agenda.
Select an empty day/range or use **New scheduled card** to open a prefilled draft.
Move planned work or resize either end, then confirm the proposal. Milestone
date markers open the milestone editor; card events use their planned range.

The **Calendar shortcuts & editing** disclosure lists controls. Alt+1 through
Alt+4 select the four layouts; Alt+T returns to today. Alt+Left/Right navigates
when the calendar region has focus and moves dates when a planned event has
focus; Shift changes that move to a week. Normal text-entry shortcuts are kept.
All views use whole-day dates; there is no hourly reservation model.

Repeat an edit in two browser tabs to inspect conflict handling. Keep an uncertain
proposal open and use **Retry same command** or check its status; do not submit
an independent replacement without knowing the first outcome. On a narrow
screen, pan inside the timeline and use the selected-card controls as an editing
alternative. Record physical-device findings separately from browser emulation.
