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

- This local launcher is available only on this Mac. Phone access needs the intended
  private HTTPS network setup, which has not been installed here.
- Physical iPhone/Safari and Arch Linux testing remain outstanding. Automated CI
  covers Ubuntu and macOS; browser automation uses Chromium.
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
