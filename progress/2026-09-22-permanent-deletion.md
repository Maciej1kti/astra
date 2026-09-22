# Permanent deletion — 2026-09-22

Implements the owner's revised deletion decision, superseding the trash proposal
in [the earlier review](2026-09-22-deletion-review.md). See
[ADR-034](../docs/ADR-034-PERMANENT-DELETION.md) and the [CLI guide](../CLI.md).

## Result

- Browser and CLI physically delete card files and a project's exact `.project/`
  tree. Project registration/focus entries are removed; enclosing repository files
  remain. There is no trash or restore action.
- Card deletion checks the observed source version, incoming dependencies (including
  archived cards) and focus. Reports remain append-only and deletion history cannot
  be undone. Project confirmation binds a bounded inventory and workspace version.
- Both commands retain request identity through uncertainty and replay after removal.
  Durable preparation precedes unlink/fsync/commit. Project recovery tracks a cursor,
  rejects unexpected remaining entries and does not reopen/recreate `.local`.
- Browser confirmation locks conflicting writes, preserves drafts until commitment,
  supports status/identical retry, and handles current/last-project navigation.
  A pending project command has beforeunload protection and a command-details export.
- Operational schema v1 upgrades retain the epoch, pending writes and existing history.
  Failed disposable projection updates cannot reverse commitment; repair is queued.
- Sample seeding remembers its first initialization outside `.project`, preventing
  automatic recreation after permanent deletion on later launcher runs.

Luna xhigh agents wrote the initial implementation and regression tests. Parent
review corrected tree path handling, ancestor identity checks, no-create lease
recovery, remaining-tree validation, mutation exclusion, client completion/locking
and projection repair. Regressions first exposed the directory-path/parent-swap
bugs and missing card projection repair, then passed after corrections.

## Verification

Commands (Node 24 is selected through PATH):

```sh
.venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release ASTRA_TEST_CHROMIUM=/usr/bin/chromium npm run test:browser
```

The full local gate passed **210 Rust, 85 JavaScript and 12 Python tests**,
contracts/examples, frontend typing, import boundaries, formatters, Clippy with
warnings denied and release builds. One interactive portal test remains ignored.
The full release HTTPS/browser gate passed: smoke, planning and all nine regression
suites, including deletion D01–D12. No page errors were reported in the final run.

Focused checks passed: 14 project deletion application tests, six deletion transport
tests, card deletion/focus/dependency/history/replay tests, operational migration,
and card projection failure/repair. Subprocess tests terminate at card prepare,
unlink, directory sync and commit; project cases include prepare, entry/cursor
persistence, writer-lock removal, `.local` removal, root removal and workspace/command
commit. Changed sources/workspace, added files, parent replacement, links/FIFO,
server state inside the target and nested registered projects are rejected.

Routine logs and screenshots are ignored under `test-results/deletion-2026-09-22/`
and `test-results/browser/`. Browser harness corrections select the exact Add card
button and allow fractional-pixel viewport rounding while requiring at least 99%
of the mobile navigation target to remain visible.

## Environment and limits

Linux x86_64, kernel 7.2.5-3-omarchy; Node 24.11.0, Python 3.14.7, installed Rust
1.98.1 (the documented Rust 1.92 pin was unavailable), Chromium 152.0.7977.82.
Repository storage is Btrfs; temporary isolated fixtures use `/tmp` on tmpfs.
Process-termination tests verify recovery sequencing, not physical power-loss
behavior. The interactive desktop portal test is excluded from the ordinary gate.
This is not physical iPhone/Safari, ext4 or full release acceptance.

The running owner daemon was not restarted or deployed, and remaining live projects
were not used for destructive tests. The sample had already been unregistered in
the preceding review; that earlier administrative action retained its source tree.
