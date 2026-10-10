# ADR-080: Member folders select their project

Date: 2026-10-10. Status: accepted by owner direction, recorded in
[scope](../progress/SCOPE.md#member-folders--owner-direction-2026-10-10).

A project folder often holds several repositories, each in its own subfolder,
while `.project/` lives once in the folder above them. An agent started in one
of those subfolders had no way to learn which project its work belongs to:
`projectctl --project .` selects exactly the current folder, parent folders are
never searched, and the managed instructions exist only in the project folder's
own `AGENTS.md`. Some coding agents read instructions from parent folders and
some stop at the repository root, so reports reached the project only by luck.

## Decision

The owner declares a subfolder of a registered project as a **member folder**.
A member folder selects its project by its own exact path, and the host writes
instructions into the member's `AGENTS.md` that say so.

- The declaration is host data. `ProjectRegistration` in `workspace.json` gains
  an optional `members` array of paths relative to the project folder, at most
  64 entries of up to 1024 characters, unique. Each is a `/`-separated path without
  empty, `.` or `..` components and without a `.project` component. A
  registration without members keeps the bytes it had. Like registration,
  membership belongs to one profile.
- Paths are relative, so relocating a project keeps its members, and
  unregistering a project ends them.
- `POST /local/v1/projects/resolve` answers with the project of a registered
  folder and, failing that, with the project whose declared member folder is
  exactly the given path. A child, sibling or parent of a member folder still
  answers `404 PROJECT_NOT_REGISTERED`. Nothing is inferred from the folder
  tree, Git remotes or worktrees; the earlier rule is unchanged, it now has an
  explicit second entry in the registry. The reply shape is unchanged.
- Two maintenance operations use the existing plan, apply and job sequence with
  the observed workspace version: `add_member` and `remove_member`, each with
  `project_id`, `relative_path` and `expected_workspace_version`. A plan only
  reads. Applying `add_member` writes the member's `AGENTS.md` and then
  `workspace.json` as journaled, resumable steps.
- `templates/managed-member-block.md` is the text for a member folder. It names
  no path. It tells the agent to run `projectctl --project . context --json`
  from the member folder, to report to the project through `projectctl`, to keep
  project data out of the member's own files and commits, and, when the host
  answers `PROJECT_NOT_REGISTERED`, to continue the requested work without
  searching for a project or creating one. Its markers
  (`local-projects-member:begin` … `local-projects-member:end`) differ from the
  project block's, so neither is mistaken for the other.

## Rules at the boundaries

`add_member` refuses, without writing:

| Condition | Answer |
| --- | --- |
| Workspace changed since it was read | `412 VERSION_CONFLICT` |
| Path is absolute, empty, or has an empty, `.`, `..` or `.project` component | `422 MEMBER_PATH_INVALID` |
| A component is missing or spelled differently from the folder listing | `404 MEMBER_FOLDER_NOT_FOUND` |
| A component is a symbolic link or not a folder | the store's existing refusal |
| The folder is a registered project | `409 PATH_ALREADY_REGISTERED` |
| The folder is a member of another project | `409 PATH_IS_MEMBER` |
| The folder contains `.project` | `409 MEMBER_IS_PROJECT` |
| `AGENTS.md` exists in another letter case | `409 AGENTS_CASE_CONFLICT` |
| `AGENTS.md` holds a project block, or a member block that was edited | `409 MANAGED_BLOCK_CONFLICT` |
| More than 64 members, or a path over 1024 characters | `422 WORKSPACE_LIMIT` |

Components are opened one by one without following links, and the spelling
must match the folder listing because selection compares exact paths: on a
case-insensitive filesystem `docs` would open `Docs` but never match what the
CLI sends.

Declaring a folder that is already a member is allowed. It restores removed
instructions and changes nothing else.

`remove_member` rewrites only `workspace.json` and warns `FILES_RETAINED`: the
member's `AGENTS.md` keeps its block, as unregistering keeps a project's. A
retained block is harmless, because it tells the agent what to do when the
folder is not mapped. An undeclared path answers `404 MEMBER_NOT_DECLARED`.

Registering a folder, or relocating a project to a folder, that is a declared
member answers `409 PATH_IS_MEMBER`; remove the membership first. Registering a
former member replaces its unedited member block with the project block, so the
file never carries both. A registered folder always wins over a member entry of
the same path.

## Consequences

- The fix does not depend on which agent runs or how it discovers instruction
  files: the member's own `AGENTS.md` carries them, and the host confirms the
  mapping.
- A worktree or another copy of a member folder is a different path and is not
  mapped. The block says so.
- `workspace.json` with members cannot be read by a daemon older than this
  change, which rejects unknown fields. Remove the members before running an
  older build.
- A member's block is not removed or upgraded automatically. A later template
  version will need the same reviewed replacement the project block needs.

Not part of this decision: showing or editing members in the browser, naming
member folders in the in-app agent's context, tagging a report with the member
it came from, and typed `projectctl` aliases for the two operations.
