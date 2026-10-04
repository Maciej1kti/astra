# Limitations and verification coverage

This page separates current product boundaries from work still needed for release.
It describes the repository as of 2026-10-04. Follow [current status](../progress/STATE.md)
for revision-specific evidence and [owner decisions](../progress/SCOPE.md) for scope.
An implemented feature and a passed release acceptance scenario are different claims.

## Product boundaries

| Area | Current behavior |
| --- | --- |
| Ownership | One OS owner per instance with multiple paired devices and freely selectable trusted user profiles; no passwords, team roles or access restrictions between paired users |
| Profile projects | Separate project registration, approved roots, preferences, Focus order and report read state; one profile per exact project folder, without project sharing between profiles |
| Connectivity | Browser writes require the host; no offline mutation queue or disconnected editing/sync |
| Hosting | User process on loopback behind an owner-managed private HTTPS proxy; no hosted service or automatic network setup |
| Project selection | Exact explicit folders; no discovery through parents, Git remotes or worktrees |
| Multiple hosts | Independent instances; no federation, shared cross-host Focus or automatic merges |
| Filesystems | Local files with guarded paths and one cooperating writer; network shares and actively synchronized multi-writer folders are not a supported durability mode |
| Planning | Recorded date ranges/events and milestones; no dependencies, critical path, automatic rescheduling or working-day calendar |
| Reports | Immutable content targeting projects/milestones; corrections and resolutions append new reports; cards use comments |
| Deletion | Card, report and project metadata deletion is permanent; no trash or built-in undelete |
| Git | Observes HEAD and staged changes excluding `.project`; does not claim unstaged/untracked coverage, auto-commit or auto-fetch |
| Markdown | Text formatting and deliberate links; no executed HTML, remote image loading or automatic link previews |
| Attribution | Human/bot labels on comments and reports are declarations, not separate authenticated identities |
| CLI | Bounded single-page reads; no streaming `watch`, automatic pagination or general batch mutation transaction |

Changing these boundaries requires an explicit scope decision. Missing CLI aliases
are not proof that the corresponding API behavior is absent; see the current
[command guide](../CLI.md) before implementing another interface.

## Deferred beyond v1

The owner explicitly deferred built-in backup archives, archive verification/restore
workflows and a general source-file migration framework. The
[stopped-server copy procedure](../ops/RECOVERY.md), operational database compatibility,
epoch/session safety and rejection of unsupported source versions remain required.
Deferred requirements are retained in the delivery records and are not marked passed.

Legacy Markdown/YAML project sources are not an alternative supported input format.
The current JSON source conversion was an explicitly approved one-time change;
it does not provide a migration tool for arbitrary existing data.

## Platform and browser coverage

| Environment | Evidence and remaining limits |
| --- | --- |
| macOS ARM64 host | Local release builds, real-daemon browser checks and package/recovery evidence exist; complete installation/login-start and release acceptance remain open |
| Linux x86_64 host | CI is configured for Ubuntu 24.04; Arch/Omarchy has dated local evidence, including a desktop portal check; complete Arch/ext4 acceptance remains open |
| Windows host | No implementation or supported build path; code relies on Unix IPC and filesystem facilities |
| Chromium | CI and local real-host browser suites; results apply to their recorded revision and environment |
| Playwright WebKit | Targeted macOS suites have evidence; some suite/harness limits are recorded in dated reports |
| Physical iPhone / Safari | Full device acceptance remains open; phone viewport emulation and desktop WebKit are not substitutes |
| Other architectures/browsers | No blanket compatibility or support claim; a new target needs its own build and behavioral evidence |

The [CI definition](../.github/workflows/check.yml) specifies Ubuntu 24.04 and
macOS 15. Its presence is not proof that the latest remote run passed. See the
[browser guide](../scripts/browser/README.md) for what the maintained suites exercise.

## Reliability and performance acceptance

The implementation includes conditional writes, durable journal/recovery, source
validation, subprocess fault tests and bounded projections. The remaining release
work includes the full fault matrix, physical power-loss behavior, sustained/soak
testing, upgrade compatibility, login-start and complete client/server performance
acceptance. None is established solely by a successful local build.

Recent release measurements cover the 100-project / 10,000-card / 50,000-report
fixture and concentrated 1,000-card collections. They show improvements, with
remaining expensive Focus Attention/tag reads and dense Calendar rendering. Recorded
outliers remain relevant. These datasets are measurement profiles, not product
capacity limits. See [bounded source-read evidence](../progress/2026-09-30-parallel-source.md)
and [performance ranking](../progress/2026-09-30-performance-ranking.md) for environment,
sample counts and limits. The [later Attention iteration](../progress/2026-09-30-attention-filters.md)
distinguishes ordinary Attention from Focus Attention with 50,000 unread reports.
The [Focus receipt/prefix iteration](../progress/2026-09-30-focus-attention-prefix.md)
reduces repeated receipt scans and bounds ordered unread candidates; its measured
first-page profiles do not cover every decision/history distribution or large offset.
The [existing-index iteration](../progress/2026-09-30-focus-eligibility-indexes.md)
reduces the all-read 50k-receipt profile from 85.5 to 52.7 ms median; its p95 is
still 59.5 ms and earlier larger outliers remain recorded. Receipt histories
and dense decisions need separate coverage; further gains are not ruled out.
The [decision-history iteration](../progress/2026-09-30-focus-decision-histories.md)
replaces repeated resolution/correction scans with statement-local membership
and sufficient decision prefixes. Required mixed-history medians improve from
3.4–3.5 seconds to 30–38 ms; a separate concentrated 50k-report profile measures
18–26 ms. The mixed shipped comparison has only 20 samples per profile; the
concentrated case has 200 but no shipped baseline at that scale. Note-only
all-read p95 remains about 60 ms. Wider graph/edge/offset and concurrent profiles,
older outliers, device and transport verification remain open.
The [request-local receipt iteration](../progress/2026-09-30-focus-rust-receipts.md)
replaces concatenation/tree membership with a lazy Rust hash predicate and an
ordered unread index. Required note-only all-read release calls measure 30.5 ms
median / 31.2 ms p95 versus the current control's 52.8–53.2 / 57.6–58.3 ms.
A concentrated 50k-note index comparison improves 58 to 2.1 ms without receipts;
mixed histories retain 30–39 ms medians in 200-sample follow-ups. Each request
still reads durable receipts; no cache is retained. These isolated calls exclude
transport/browser costs and do not remove the broader coverage limits above.
The [tag source-read iteration](../progress/2026-09-30-tag-source-reads.md) reduces
repeated folder work while preserving current-file counts and preview versions.
Such catalogs still inspect source files and scale with the selected card collection.
The [later ordered-read iteration](../progress/2026-09-30-tag-parallel-reads.md)
reduces a required global median to 423 ms and a 1k-card project p95 to 34 ms,
with a 51 ms maximum. Its isolated profiles exclude transport/browser costs;
contention uses sequential reads and larger sources need separate coverage.
Do not infer a universal latency guarantee from these measurements.
The [later dense Calendar probes](../progress/2026-09-30-calendar-initial-probes.md)
reduce operation counts without a stable useful quiet latency gain and are
reverted. Further component/DOM work is not ruled out by those experiments.

The current initial JS/CSS build regression budget is 80 KiB gzip. This is a bundle
check, not a user-perceived performance acceptance result. Planning and secondary
dialogs load separately; dense pages still cost browser work.

## Source and state bounds

The server enforces bounds rather than accepting unlimited input:

| Item | Current bound / interpretation |
| --- | --- |
| Source document | 1 MiB of JSON; metadata up to 64 KiB and decoded body up to 960 KiB |
| JSON structure | Depth up to 12 and at most 10,000 nodes |
| Card title / project name | 240 / 120 characters |
| Card labels | Up to 20, each up to 48 characters |
| Card checklist | Up to 100 items; each text up to 500 characters |
| Source Focus membership | Up to 100 pins across registered projects |
| Calendar displayed page | Up to 200 agenda items or 1,000 grid/time items, with paging |

Individual fields can fit their limit while the combined metadata exceeds its
bound. [Source schemas](../contracts/domain.schema.json), server validation and
[OpenAPI](../contracts/openapi.yaml) are the detailed references. Do not raise
bounds without abuse tests and measurements.

## Before a supported public release

The owner still needs to select Astra's license, approve the supported release,
and establish a private security-reporting channel and supported-version policy.
The package generator collects dependency notices; it does not resolve the project
license or establish that every release checklist item has passed.

Use the [roadmap](../ROADMAP.md) for remaining work and the
[release checklist](../delivery/RELEASE-CHECKLIST.md) for acceptance obligations.
For security reports, follow [SECURITY.md](../SECURITY.md).
