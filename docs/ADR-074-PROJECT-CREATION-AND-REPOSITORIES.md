# ADR-074 — Projects by name and private repositories

Status: accepted on the owner's 2026-10-07 direction; see
[scope](../progress/SCOPE.md#projects-by-name-and-remote-operation--owner-direction-2026-10-07).

The owner works on Astra remotely. Adding a project opened a folder dialog on
the host's desktop, which nobody is there to answer, and the folder and its
repository had to be made by hand first. The owner wants to type a name and
have the folder created in a default place and a private GitHub repository
created for it, with no step on the host and a different folder name when the
wanted one is taken.

Until now the server created no directory outside a registered project, ran no
Git command that writes, and reached no network service. This record states
what it may now do, and for whom.

## Decision

### The default root

`Preferences.project_root_id` names the approved root in which new project
folders are created. It is one of the roots the OS owner approved with
`projectctl add-root`, saved like any preference; a root that is not approved is
refused with `PROJECT_ROOT_NOT_FOUND`. A profile without the preference uses
its only approved root; with none or several, creation answers
`PROJECT_ROOT_NOT_SET`. A browser therefore still never submits a path: the
directory capability stays the approved root.

### Creating the folder

`POST /api/v1/project-folders` takes a client-made `creation_id` and the
project name. The server derives the folder name (lowercase ASCII letters,
digits and single hyphens, Polish letters folded, at most 50 characters,
`projekt` when nothing is left), creates the folder and returns an ordinary
registration plan for it with tracked planning data. The folder is created with
an exclusive `mkdir`, so any existing entry of that name, or another spelling on
a case-insensitive volume, makes the server try `name-2` to `name-50`. On a
host that publishes repositories a name that the GitHub account already uses is
skipped the same way, so the folder and its repository share a name. When
GitHub cannot be asked, only the local check applies.

Registration is unchanged: the browser commits the returned plan with
`commitRegistration`, with the same request identity, epoch, job and recovery.
The folder exists before the plan is committed. A plan that is refused or never
committed leaves an empty folder, which the server removes only when planning
itself fails.

A repeated `creation_id` from the same session with the same input returns the
first result. Results are kept in memory for ten minutes; after a daemon
restart a repeated request creates a second folder with the next suffix.

### Publishing

The feature is off unless the OS owner starts `projectd` with `--github`.

| Option | Meaning |
| --- | --- |
| `--github` | Enables publication. `gh` and `git` are resolved to absolute paths at startup; the daemon refuses to start without them |
| `--github-gh-bin PATH`, `--github-git-bin PATH` | Executables to use instead of the first `gh` and `git` on the daemon's `PATH` |
| `--github-remote-base URL` | Prefix of a new repository's remote, followed by `owner/name.git`; default `https://github.com/` |

The manual launcher passes `--github` when `ASTRA_TRY_GITHUB=1`. Bootstrap
reports `github_enabled`; without the option both repository routes answer
`404 GITHUB_DISABLED` and the browser offers no publication.

`POST /api/v1/projects/{project_id}/repository` starts a background publication
of a registered project folder; `GET` reads its state: `absent`, `unpushed`,
`publishing`, `published` or `failed` with a code. A publication:

1. runs `git init -b main` when the folder has no `.git`;
2. when the repository has no commit, stages `.project`, `AGENTS.md` and an
   existing `.gitignore`, and commits them. Other files are never staged;
3. when there is no `origin` remote, reads the signed-in account, creates
   `owner/<folder name>` with `gh repo create … --private`, skipping to
   `-2` … `-20` when the name is taken, and adds the remote;
4. runs `git push -u origin HEAD`.

A folder that already has an `origin` is only pushed. Publishing a published
folder, or one whose publication runs, starts nothing. At most four
publications run at once, and each process has a 120-second limit.

`published` is read from Git, not remembered: the folder has an `origin` and a
remote-tracking branch. Only a failure's code lives in memory, until the next
attempt or a daemon restart. The reported URL never carries user information.

### Nothing asks the host

Every process runs with an empty stdin, `GIT_TERMINAL_PROMPT=0`,
`GH_PROMPT_DISABLED=1` and SSH in batch mode. Git runs with hooks off
(`core.hooksPath=/dev/null`), `core.fsmonitor=false`, `commit.gpgsign=false`
and the owner's credential helpers replaced by `gh auth git-credential`, so no
keychain, passphrase or signing dialog can open. A commit uses the host's Git
identity, or `Astra <astra@localhost>` when none is configured.

### The boundary

- Command lines are fixed in `crates/projectd/src/repository.rs`. A request
  selects a registered project or names a new one; it supplies no path, URL,
  option or command. The folder name reaches a command line only after it was
  reduced to the characters above.
- Publication uses the GitHub account and credentials of the OS user that runs
  the daemon. Any paired browser, in any profile, can create private
  repositories in that account and push the planning data of projects
  registered in its profile. Profiles do not limit it.
- Git runs inside the registered folder and reads that repository's own
  `.git/config`. That file is local configuration that cloning never copies,
  so a project's content cannot supply it; a folder the owner registered is
  trusted to that extent, as it is when the owner runs Git there.
- This is the second exception to the rule that the server starts no process
  for a request, after the agent runner ([ADR-070](ADR-070-AGENT-RUNS.md)), and
  the first feature that reaches a network service. It exists only on a host
  started with `--github`.

### The browser

**Dodaj projekt** asks for a name only and runs the three steps in order:
folder, registration, publication. A failed step is the one repeated; the
creation ID and the registration's request identity are kept until the dialog
closes. A failed publication leaves a working local project, with **Ponów
publikację** in the dialog and later in the project's **Git** dialog, which
also shows the repository state of every project. Settings gains **Katalog
nowych projektów**. The dialog still offers **Dodaj istniejący folder**, the
approved-root browser.

The browser no longer opens the host's folder dialog. The
`native-folder-selections` operations of ADR-025 remain in the API unchanged
and unused by the browser.

## Consequences

- A project can be added from a phone or another remote browser without any
  action on the host.
- New projects created this way track `.project/` in Git; `.project/.local/`
  stays excluded by the project's own `.gitignore`.
- The `--github` option makes outbound requests to GitHub from the host and
  creates repositories there. Deleting a project in Astra does not delete its
  repository.
- A daemon stopped between `gh repo create` and `git remote add` leaves an
  empty private repository that the next publication does not adopt; it uses
  the next suffix.
- `projectctl` has no dedicated command for these operations yet; they are
  reachable with its generic `command` and `get`.

## Verification

`crates/projectd/tests/transport/repository.rs` runs the operations against a
scripted GitHub CLI and real Git: the default root rules, naming and suffixes,
idempotent creation, the private repository and its pushed files, failures and
repetition. The `project-creation` browser suite covers the same through the
release daemon, including the phone layout. The real `gh` was checked only for
the read-only calls the feature makes; see the
[dated evidence](../progress/2026-10-07-project-creation.md).
