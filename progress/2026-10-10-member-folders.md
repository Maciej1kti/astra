# Member folders — 2026-10-10

The owner asked for a systemic way for agents started in a subfolder to report
to the project kept in the folder above
([scope](SCOPE.md#member-folders--owner-direction-2026-10-10),
[ADR-080](../docs/ADR-080-MEMBER-FOLDERS.md)).

## What changed

- A project's registration can name member folders below it. The exact path of
  a declared member selects the project in `projectctl --project`; a child,
  sibling, worktree or copy does not, and nothing is inferred from parents.
- Two maintenance operations, `add_member` and `remove_member`, use the
  existing plan, apply and job sequence with the observed workspace version.
  Applying `add_member` appends the path-free
  [member block](../templates/managed-member-block.md) to the member's
  `AGENTS.md`, then records the member in `workspace.json`.
- Registration and relocation refuse the path of a declared member.
  Registering a former member replaces its unedited member block with the
  project block.
- Contracts, the request example, the CLI guide and its help text, the user
  guide, limitations and the code ownership guide describe the change.

## Checks

- New regression tests cover selection before and after a declaration, the
  read-only preview, replay, each refusal without a write, a nested member,
  relocation, unregistration and the registration interplay
  (`crates/application/tests/engine/members.rs`), the bounds of the stored
  list (`crates/domain/tests/contracts.rs`) and the path over the real Unix
  socket (`crates/projectd/tests/transport.rs`).
- `scripts/check.py` passed in full on macOS 27 (Apple silicon): contracts,
  script tests, frontend check, lint, build and bundle budget, `fmt`, `clippy`
  and 501 Rust tests. The debug profile was built without debug information
  (`CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_INCREMENTAL=0`) to fit the disk. The
  later one-line change of the client's help text was checked with `fmt`,
  `clippy` and the tests of that crate.
- No browser suite ran: the interface change is one message for a rejection
  code. Linux was not exercised.

## Rollout on the owner's instance

- The manual instance was restarted on the new build with its launch settings.
  Over its HTTPS address `/healthz` answered 200 and `/api/v1/bootstrap` 401;
  identity, command epoch, both profiles, all 18 sessions, the 15 projects and
  the stored workspace were the same before and after.
- `server`, `apps` and `omarchy` were declared as members of Astra's own
  project, three jobs done. `projectctl --project . context` now answers with
  that project from each of them and still answers `PROJECT_NOT_REGISTERED`
  from a folder below one of them. The stored workspace differs only by the
  three member entries.
- Codex, which reads no instructions above a repository root and could not name
  the project before, named the command and the project when started in a
  member folder.
- This checkout's `AGENTS.md` now ends with the block Astra installed, in place
  of the hand-written section that pointed at the workspace.

## Not done

Members cannot be declared or seen in the browser, the in-app agent's context
does not list them, reports do not record the member they came from, and the
client has no typed alias for the two operations. A member's block is not
removed when its membership ends.
