# Limitations and verification coverage

This page separates current product boundaries from work still needed for release.
It describes the repository as of 2026-10-04. Follow [current status](../progress/STATE.md)
for revision-specific evidence and [owner decisions](../progress/SCOPE.md) for scope.
An implemented feature and a passed release acceptance scenario are different claims.

## Product boundaries

| Area | Current behavior |
| --- | --- |
| Ownership | One OS owner per instance with multiple paired devices and freely selectable trusted user profiles; no passwords, team roles or access restrictions between paired users |
| Profile projects | Personal registration, approved roots, preferences, Focus order and report read state; profiles in one host can share a folder's source data and counter values. Shared deletion/relocation requires unregistering other profiles first; command history remains per profile |
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
| Counter charts | Inclusive ranges of at most 400 days, 100 series per page, 500 loaded catalog entries and eight selected series per chart; daily source quantities are integers. A counter's rate is stored with it as a decimal of at most four places and its whole-history total is read with every series; the money unit and display choices are browser-local, and derived amounts are calculations, not stored monetary transactions. Plugins are modules built into the application and switched on per profile; third-party or runtime-loaded plugins are not supported. A profile stores tile choices for at most 200 counters |
| CLI | Bounded single-page reads; no streaming `watch`, automatic pagination or general batch mutation transaction |
| Project repositories | Off unless the OS owner starts `projectd` with `--github`; then any paired browser can create private repositories in the host's GitHub account and push planning data. Publication state other than the last failure is read from Git. See [Project repositories](#project-repositories) |
| In-app agent | Off unless the OS owner starts `projectd` with `--agent-dir`; then any paired browser can instruct a local coding agent that runs with the daemon user's full rights and no permission prompts. See [In-app agent](#in-app-agent) |

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
| iOS app and widgets | Built, exercised in an iOS 27 simulator against a real daemon and uploaded to TestFlight for internal testing; never run on a physical iPhone, and for iPhone only. It needs a host certificate that iOS trusts: the manual launcher's self-signed certificate is refused even when installed as trusted, so start the launcher with `ASTRA_TRY_TAILSCALE_NAME`. Widgets act as the host's default profile, refresh on the system's budget rather than live, and speech recognition was not exercised with a microphone. See [ADR-076](ADR-076-IOS-APP-AND-WIDGETS.md) |
| Mac app | Builds, signs for development and passed its check on the build machine: the host's page in a window, the menu bar item and the dictation panel. Not distributed, never paired, and its widgets were never placed on a desktop. The dictation shortcut is fixed to Control-Option-Space. See [ADR-077](ADR-077-MAC-APP.md) |
| Other architectures/browsers | No blanket compatibility or support claim; a new target needs its own build and behavioral evidence |
| Browser age | Colours use CSS `light-dark()` and menus use native popovers, so the interface needs Chrome/Edge 123, Firefox 120 or Safari 17.5 and later; an older browser shows unstyled colours |

The [CI definition](../.github/workflows/check.yml) specifies Ubuntu 24.04 and
macOS 15. Its presence is not proof that the latest remote run passed. See the
[browser guide](../scripts/browser/README.md) for what the maintained suites exercise.

## Reliability and performance acceptance

The implementation includes conditional writes, durable journal/recovery, source
validation, subprocess fault tests and bounded projections. The remaining release
work includes the full fault matrix, physical power-loss behavior, sustained/soak
testing, upgrade compatibility, login-start and complete client/server performance
acceptance. None is established solely by a successful local build.

An interrupted write whose source was then changed by another tool becomes
`needs_review` and blocks further writes to that project until an operator
settles it. Astra never overwrites or restores the source in that state. The
only resolution is host-local and keeps the current source:
`projectctl recovery list`, then `recovery abandon`; see
[ADR-067](ADR-067-REVIEWED-INTENT-RESOLUTION.md). The browser offers no control
for it, and reviewed project deletions and workflows are not covered.

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
| Open connections | 96 on the network listener and 32 on the local socket; a request head must arrive within 150 s / 30 s |

Individual fields can fit their limit while the combined metadata exceeds its
bound. [Source schemas](../contracts/domain.schema.json), server validation and
[OpenAPI](../contracts/openapi.yaml) are the detailed references. Do not raise
bounds without abuse tests and measurements.

Pairing accepts at most ten active requests and five new requests per minute
for the whole instance. The host sees every network caller through its proxy as
one source, so the limit cannot be per client: someone who can reach the HTTPS
address without a session can keep new devices from pairing while they keep
sending requests, and their labels appear in the approval list. Paired browsers
and the local CLI are unaffected, and a request still grants nothing until the
owner approves its challenge. Removing this needs either a trusted client
address from the proxy or pairing started by the operator; neither is designed.

Adding a card to Focus validates every registered project's cards under the
workspace's exclusive gate, because pins live in sources and the limit of 100
is checked against them rather than against the disposable index
([ADR-041](ADR-041-SOURCE-BACKED-FOCUS-AND-TAGS.md)). Other requests wait while
that scan runs.

## Project repositories

Adding a project by name and publishing it
([ADR-074](ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md)) has these limits:

- **Account.** Repositories are created in the one GitHub account the host's
  `gh` is signed in to, always private. There is no per-profile account,
  organization choice or visibility setting.
- **Content.** The first commit holds `.project`, `AGENTS.md` and an existing
  `.gitignore` only. Later changes are not committed or pushed by the server;
  there is still no auto-commit or auto-fetch. A project created with
  publication off has no Git repository at all.
- **Names.** Folder names are ASCII, derived from the project name; a name
  written only in another script becomes `projekt`. A repository whose name
  was taken after the folder was created receives its own suffix and then
  differs from the folder's.
- **Memory.** A creation's identity and a failed publication's reason are held
  in daemon memory. After a restart a repeated creation request makes another
  folder, and a failed publication reads as not published.
- **Leftovers.** A creation that is refused after its folder was made can leave
  an empty folder, and a daemon stopped mid-publication can leave an empty
  private repository. Deleting a project never deletes its repository.
- **Preference.** **Publikuj nowe projekty na GitHubie** applies to projects
  created by name from then on. It does not unpublish anything and does not
  block a deliberate publication from a project's Git dialog.
- **Places.** A project can be placed only in an existing directory below an
  approved root. Folders made in the chooser cannot be renamed or removed from
  the browser.
- **CLI.** `projectctl project create` waits for a publication up to
  `--timeout`; a longer one is reported as `publishing` and finishes on the host.
- **Host dialog.** The browser no longer opens the host's folder dialog. Its
  API operations remain and still open a dialog on the host's desktop when
  called.
- **Verification.** Covered with a scripted GitHub CLI and real Git. Against
  GitHub itself only the read-only calls were exercised before the owner's
  first real use.

## In-app agent

The optional agent runner ([ADR-070](ADR-070-AGENT-RUNS.md)) is an owner-directed
exception to the rule that the server has no execute endpoint. It exists only on
a host started with `--agent-dir`.

- **Rights.** The provider runs without permission prompts or a sandbox, with
  the daemon's environment and the daemon user's rights. Any paired browser, in
  any profile, can instruct it, and the agent can reach other profiles because
  profiles are not an access boundary. A process of the daemon's user can use the
  same routes through the local socket.
- **Instructions are guidance.** `agent/AGENTS.md` asks the agent to change only
  what was requested and to treat card text as data. Nothing enforces it, and
  text written by someone else in a card, comment or report reaches an agent
  that has no sandbox.
- **Memory only.** Conversations and runs are lost when the daemon restarts, and
  the outcome of a run in progress at that moment cannot be read back. The
  browser reports such a turn as unknown, not as failed, and the agent may
  already have changed data. A cancelled or timed-out run may have made part of
  its changes.
- **Killed daemon.** A stop by SIGTERM or Ctrl+C ends the agent process groups
  and waits up to 20 seconds for them. A daemon killed outright leaves agent
  processes running.
- **Bounds.** Two running runs per host, one per conversation, 32 conversations,
  50 runs per conversation, 8,000-character messages, 65,536-character replies,
  1 MiB provider output lines and a run time limit (`--agent-timeout`, default
  600 seconds). Beyond them a start is refused.
- **No CLI.** `projectctl` has no commands for agent runs; the generic `command`
  form cannot confirm one and `get` of a running run exits with code 9.
- **Context block.** A project folder path longer than 240 characters or
  containing `<` or `>` is altered in the block the agent receives and then does
  not work with `--project`; the agent receives at most 100 projects.
- **Providers.** The flag sets were verified against Claude Code 2.1.291 and
  Codex 0.160.0. Another version may treat them differently; a run whose output
  holds no final answer fails as `AGENT_OUTPUT_INVALID`.
- **Coverage.** Automated tests use a scripted provider. The dialog has had no
  physical-device test; emulation does not replace one.

## Before a supported public release

The owner still needs to select Astra's license, approve the supported release,
and establish a private security-reporting channel and supported-version policy.
The package generator collects dependency notices; it does not resolve the project
license or establish that every release checklist item has passed.

Use the [roadmap](../ROADMAP.md) for remaining work and the
[release checklist](../delivery/RELEASE-CHECKLIST.md) for acceptance obligations.
For security reports, follow [SECURITY.md](../SECURITY.md).
