# Source lease path performance, 2026-09-30

The owner's performance objective remains open. The
[remaining-cost ranking](2026-09-30-performance-ranking.md) also retains the
durable-create bottleneck. This iteration removes a repeated filesystem traversal
inside source collection reads; it does not change source or protocol formats.

## Change and retained guards

Every collection file previously walked the full lease directory and then the
full collection path. The reader already owns the approved project descriptor.
Its lease check now opens that project's fixed `.local` child relative to the
descriptor, using `DIRECTORY`, `NOFOLLOW` and `CLOEXEC`, and compares the current
lock file with the held locked inode and its single-link requirement.

Before any source bytes are opened, the following existing absolute-path walk
still checks every component without following symlinks, the approved project
inode and the collection inode. The individual file still retains canonical ID,
`NOFOLLOW`, nonblocking/type/hardlink checks, the 1 MiB limit and current byte
version. Ordinary lease verification and collection-name discovery retain their
existing full path checks. Missing lease is not an empty collection.

There is no byte, version, inode or pathname-validation cache. Writer admission,
reference rechecks, authorization, conditional commands and the
prepare/write/commit sequence are unchanged. No fsync or fullfsync is removed.

## Release measurement

macOS 27, Apple M4/16 GiB, Rust 1.92.0, release application benchmark. Both
conditions start with one disposable project, 1,000 cards and no reports. The
normal workload makes 40 durable creates and 160 conditional title patches.

| Operation | Control p50 / p95 | Relative lease lookup p50 / p95 |
| --- | ---: | ---: |
| Create | 230.7 / 246.3 ms | 160.3 / 173.7 ms |
| Title patch | 26.8 / 32.6 ms | 27.0 / 33.2 ms |
| Mixed durable mutations | 27.4 / 234.9 ms | 27.8 / 162.7 ms |

Create median falls by about 30%; mixed p95 by about 31%. Single-resource title
patches are effectively unchanged, as expected. These application-level timings
exclude HTTP, VPN, browser rendering and physical-device coverage. Forty creates
do not meet the separate 200-create acceptance sample requirement. The recorded
150 ms target remains unmet, including create p95.

## Verification

The existing filesystem guards pass. A new table covers a `.local` symlink to
the same held lease, a new lease directory/file and a hardlink, after an earlier
successful read, for cards, milestones and reports. It passes before and after
the optimization. A controlled build without the new relative lookup's
`NOFOLLOW` fails the symlink case; its source is restored before final checks.
Existing tests retain lease/collection/project replacement, reparented children,
current bytes, source symlinks/hardlinks, file-size bounds and missing-lease
behavior.

The full gate passes 252 Rust, 137 JavaScript and 12 Python tests, including
contracts, schemas, formatting, Svelte checks, clippy, bundle bounds and release
builds. Broad release HTTPS/planning checks and all 24 Chromium regression
suites pass. Five WebKit suites pass (session, planning, calendar layout, events
and protocol). WebKit deletion stops before exercising the application because
its context does not support the test's `clipboard-write` permission; deletion
coverage remains Chromium-only in this run.

The full gate also passes after integration with the latest card section/menu
changes. Affected card layout, counter, session and card checks pass in Chromium;
card layout, counter and session checks also pass in WebKit. The existing manual
restart is pending at this checkpoint. No requirement, scope or acceptance
status changes.

Ignored evidence is under `test-results/calendar-rendering-2026-09-30/`:
`source-relative-before.json`, `source-relative-after.json` and the retained
filesystem/negative-control/build logs. The benchmark command is
`target/release/examples/benchmark 1 1000 0`; artifacts use the isolated worktree
and the normal release source/command implementation.
