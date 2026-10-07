# Project places, publication switch and agent parity — 2026-10-07

Follow-up to [projects by name](2026-10-07-project-creation.md) on the owner's
[later direction](SCOPE.md#project-places-publication-switch-and-agent-parity--owner-direction-2026-10-07):
choose and add a folder by clicking, switch GitHub publication in Settings
with it on by default, and have the agent and the CLI create a project the
same way as the interface. [ADR-074](../docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md)
was extended.

## What changed

- **Place.** **Dodaj projekt** shows the place the folder goes to. **Zmień
  miejsce…** opens a chooser inside the dialog that lists folders below the
  approved roots, enters them, adds one with **Nowy folder** and confirms with
  **Wybierz ten folder**. `createProjectFolder` accepts that place, and
  `POST /api/v1/roots/{root_id}/directories` creates the folder.
- **Switch.** `Preferences.publish_repositories`, shown as **Publikuj nowe
  projekty na GitHubie** on a host that publishes; absent means on. The server
  decides and reports `publish` in the folder reply, so every client behaves
  alike. With it off GitHub is not asked and no Git repository is made; the
  Git dialog still publishes one project deliberately.
- **CLI and agent.** `projectctl project create` runs folder, registration and
  publication and prints the result. The agent's instructions tell it to use
  that command only, to use the default place without asking, and to continue
  with the returned folder.
- **Fixes found on the way.** A default root revoked on the host no longer
  starts the chooser or blocks saving other settings, and the dialog reads
  `publish` instead of probing a route.

## Verification

- `scripts/check.py`: all 16 steps pass, with 490 Rust tests and 529 Node
  tests; the initial bundle is 81,910 of 81,920 bytes.
- `crates/projectd/tests/transport/repository.rs` gained two tests: a folder
  made below a root with its name and path validation, a project placed in a
  nested folder without any default root, and the preference switching
  `publish` off and on, without a question to GitHub while it is off.
- `ASTRA_TEST_PROFILE=release npm run test:browser`: the CLI tag workflow, the
  smoke, the planning script and 41 of 42 Chromium suites passed in one run.
  `command-recovery` failed because its new-project case had no approved root
  for the dialog's place; with one approved it passes, rerun together with
  `project-creation` and `dialog-components`.
- `project-creation` now has nine scenarios. The new ones choose a place by
  clicking, add a folder with Enter and by button, refuse a duplicate folder,
  switch publication off in Settings and publish one project by hand, repair a
  default root revoked on the host, and run `projectctl project create` with
  the preference off, on, with `--root`/`--path` and with `--no-publish`,
  then list cards in the folder it returned. Settled screenshots of the chooser
  and the Settings switch were inspected.

## Limits

- The agent's instructions were not exercised with a real Claude Code or Codex
  run: creating a project on the owner's instance makes a real folder and a
  real repository. The command the agent is told to use is covered by the
  browser suite through the release CLI.
- Still no repository was created on GitHub itself during verification.
- Chromium only.
