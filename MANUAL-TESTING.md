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

## A useful first pass

1. Select **Try Local Projects**, open a card and change its title/description.
2. Set start/end/due dates; move it on Board and Timeline.
3. Create another card and a milestone. Try a dependency and blocked status.
4. Pin two cards to Focus and arrange their order.
5. Add an update, mark it read, then inspect history and undo a card edit.
6. Open a second browser tab, edit the same card in both and inspect the conflict.
7. Refresh the browser and restart the host to check that your edits remain.

Report the action, expected result and actual result. A screenshot helps with
layout issues. This handoff is for practical feedback, not final release acceptance.

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

1. Connect Design to Build and Build to Review using the predecessor/successor
   form. Confirm each dependency proposal. Alternatively, click the connector
   beside the predecessor's bar and then the successor's connector.
2. Inspect the arrows and project timing summary. With only these three cards,
   the recorded finish is September 10 and the dependency forecast ends on
   September 14. Enable **Dependency forecast** to see the shifted bars and the
   amber underline on one chain determining that finish.
3. Disable the forecast. Drag a bar or either edge and confirm the date proposal.
   Escape during a gesture cancels it. Alt+Left/Right on a focused handle changes
   one day; adding Shift changes a week. Open the selected card for full editing.
4. Expand **Dependencies** to disconnect an edge. The successor's other
   predecessors must remain. Attempting Review → Design while the original
   chain exists should show a cycle error and leave the graph unchanged.

The forecast is a read-only estimate within one project. It includes weekends,
respects recorded starts and preserves durations. Missing dates or predecessors
make the estimate incomplete. It does not automatically save a waterfall plan,
move deadlines or account for resource capacity.

In **Calendar**, navigate to the same dates and try day, week, month and agenda.
Select an empty day/range or use **New scheduled card** to open a prefilled draft.
Move planned work or resize either end, then confirm the proposal. Deadline and
review markers open the shared editor and remain separate from the planned range.

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
