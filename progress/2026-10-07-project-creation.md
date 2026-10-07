# Projects by name and private repositories — 2026-10-07

The owner uses the instance remotely and asked that adding a project need only
its name: the folder is created in a default destination set in Settings, a
private GitHub repository is activated, a colliding name gets a folder name
that fits, and nothing has to be clicked on the host
([scope](SCOPE.md#projects-by-name-and-remote-operation--owner-direction-2026-10-07)).
Decision record: [ADR-074](../docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md).
The owner's wider [product direction](SCOPE.md#product-direction--owner-statement-2026-10-07)
is recorded in the scope and the [roadmap](../ROADMAP.md#direction-beyond-v1);
none of it was built.

## What changed

- **Dialog.** **Dodaj projekt** asks for a name and runs folder, registration
  and publication in order, repeating only a failed step. The host's folder
  dialog is no longer opened by the browser; **Dodaj istniejący folder** keeps
  the approved-root browser.
- **Default root.** `Preferences.project_root_id` selects an approved root
  under **Ustawienia → Katalog nowych projektów**; a profile with exactly one
  approved root needs no choice.
- **Folder.** `POST /api/v1/project-folders` derives an ASCII folder name,
  creates it exclusively and returns an ordinary registration plan; a taken
  name, locally or in the GitHub account, receives `-2`, `-3` and so on.
- **Repository.** On a host started with `--github`, the daemon initializes
  Git, commits `.project`, `AGENTS.md` and `.gitignore`, creates a private
  repository through the signed-in `gh` and pushes. A failure leaves a working
  local project; the project's **Git** dialog shows the state and repeats the
  publication. Every process runs without a terminal, prompt, hook, signing or
  keychain helper.
- **Protocol.** Three operations, three schemas, `github_enabled` in bootstrap
  and one preference, with OpenAPI, generated types and examples.

## Verification

- `scripts/check.py`: all 16 steps pass on the branch rebased on `4f5336a`,
  with 488 Rust tests and 529 Node tests. The initial bundle is 81,903 of
  81,920 bytes; the base commit had one byte to spare, so the two dialogs ask
  the host whether it publishes instead of receiving a flag from the shell.
- `crates/projectd/tests/transport/repository.rs`, four tests over real
  transport with a scripted `gh` and real Git: default-root rules and the
  preference's validation, folder naming, idempotent creation, suffixes for a
  name taken locally or on GitHub, the private repository and the files pushed
  to it, an unreachable GitHub, a signed-out host, and repetition.
- `ASTRA_TEST_PROFILE=release npm run test:browser`: the CLI tag workflow, the
  smoke, the planning script and all 42 Chromium suites pass. The new
  `project-creation` suite runs six scenarios through the release daemon:
  creation by keyboard with a real push, suffixes, a GitHub failure repeated in
  the dialog, a failed publication repeated later from the Git dialog, the root
  chosen in Settings among two, and a 390-pixel touch layout. Its settled
  screenshots were inspected. The smoke and two existing suites moved from the
  host folder dialog to the name-only dialog.
- WebKit was not run for this change.

## Limits

- Against GitHub itself only the read-only calls were run (`gh api user`,
  `gh api repos/…` for an existing and a missing repository, and
  `gh auth git-credential`), with gh 2.93.0 and Git 2.50.1 on macOS. No
  repository was created on the owner's account during verification; the
  first real creation is the owner's.
- Chromium only for the new suite's screenshots; a browser emulator is not a
  physical phone test.
- The remaining limits are listed under
  [Project repositories](../docs/LIMITATIONS.md#project-repositories).
