# Contributing to Astra

Astra is under active development. Contributions can improve behavior, tests,
documentation or reproducible problem reports. Start with the [roadmap](ROADMAP.md)
and [known limitations](docs/LIMITATIONS.md). Before starting a large feature,
describe its user-facing behavior in an issue so the maintainer can confirm scope.
Small fixes should include a reproduction and the smallest meaningful verification.

## Issues and coordination

For a bug, include the commit (`git rev-parse HEAD`), OS/architecture, browser and
tool versions, exact steps, expected behavior and actual behavior. Use synthetic
data and sanitized logs. State whether a result came from a physical device,
desktop browser or emulator. Follow [Security](SECURITY.md) for sensitive reports.

For a feature, explain the problem and a concrete use case, check for existing
issues and identify the relevant scope decision. An idea in an issue is not an
accepted change to v1. The owner retains product scope, release and license
decisions.

Agree on the files and contract changes being worked on before overlapping with
another contributor. Prefer one person integrating a shared schema change; avoid
parallel rewrites of the writer, generated files or the same feature. Use small,
reviewable branches and keep unrelated working-tree edits out of your commit.

## Prepare a pull request

1. Work from a current checkout, using a branch in your fork if you do not have
   repository write access. Record the starting revision and inspect local changes.
2. Read this guide, [architecture](docs/ARCHITECTURE.md),
   [code ownership](docs/CODE-STRUCTURE.md), [status](progress/STATE.md) and relevant
   contracts/ADRs before editing.
3. Implement one cohesive change, including affected documentation and meaningful
   verification. Keep generated output and runtime data out of the patch.
4. Run focused checks and the full local gate; add browser or package checks when
   the behavior requires them. Review the final diff for unrelated files/secrets.
5. Open a pull request explaining the problem, resulting behavior, checks and
   remaining limits. Link the relevant issue or decision. Use a draft when a
   specific part still needs discussion or verification.

Review feedback should address behavior and evidence. If the branch moves or
conflicts, reconcile the intended behavior and rerun affected checks after
integration. Do not equate a green local build with unobserved remote CI.

## Set up

Follow [Installation](INSTALL.md) for the pinned Node, Rust and Python versions,
then [Development](DEVELOPMENT.md) for the edit/test loop. Build the frontend before
the daemon because `projectd` embeds its assets. Use synthetic projects for tests;
keep private user projects, credentials and runtime state out of this repository.
Astra's own persistent `.project/` planning sources are intentionally tracked;
`.project/.local/`, `.manual/`, dependencies and build output remain excluded.

## Where changes belong

| Change | Start here |
| --- | --- |
| Dates, ordering and document rules | `crates/domain` |
| Parsing, source bytes and filesystem operations | `crates/project-store` |
| Commands, queries, recovery and application rules | `crates/application` |
| HTTP/Unix admission and host integration | `crates/projectd` |
| CLI arguments and output | `crates/projectctl` |
| Browser feature and interaction | `apps/web/src/features/<feature>` |
| Browser transport and typed endpoints | `apps/web/src/lib/api` |
| Public schemas | `contracts` |

Read [Code structure](docs/CODE-STRUCTURE.md) for ownership and lock order.
Features own their state and expose explicit actions. Shared modules must not
import feature implementations. Keep concrete storage and framework dependencies
where they are used; add an abstraction when it gives a real boundary or useful
independent test, not merely to shorten a file.

## Example: change a card field

Update the source schema and API request/response schemas where their behavior
changes. Change domain validation and application preparation, then the editor
translation and presentation. Run `npm run contracts` to update generated types.
Preserve milestone and report extensions when editing unrelated fields.
Project and card metadata do not allow extensions. A protocol change
includes examples, regression coverage and an architecture decision in the same
change. Do not edit generated types by hand.

Normal mutations go through the server. An existing resource requires its read
version. An uncertain write retains the original request ID, epoch and payload;
a failed status lookup does not prove rejection. Never replace this with an
automatic refetch-and-overwrite. Keep durability and reference rechecks intact.

## Check a change

| Scope | Useful focused command |
| --- | --- |
| Frontend types/contracts | `npm run check` |
| Frontend behavioral unit tests | `npm run test:unit` |
| One JS test | `node --test scripts/tests/planning-read.test.mjs` |
| One Rust crate | `scripts/cargo-local test -p project-domain --locked` |
| Application rules/recovery | `scripts/cargo-local test -p project-application --lib --locked` |
| Documentation/contracts/examples | `.venv-check/bin/python scripts/check_package.py` |
| Full local gate | `.venv-check/bin/python scripts/check.py` |
| Browser interaction | `ASTRA_TEST_PROFILE=release npm run test:browser` |

Use `npm run format` and `scripts/cargo-local fmt --all` before review, keeping
unrelated formatting changes out of the patch.
Browser tests require built assets/binaries and Playwright Chromium; see
[browser suites](scripts/browser/README.md). A data-loss/conflict fix starts with a
failing regression. Persistence changes must pass the subprocess durability
suite. Do not replace meaningful behavior tests with source-text assertions.

Application tests under `crates/application/tests` are explicitly included as
private unit-test modules; `autotests = false` is intentional. This keeps failure
injection private. Frontend `.mjs` tests import actual `.ts` modules using Node's
built-in runner. Type-only endpoint checks live with the frontend so TypeScript
can verify invalid payloads are rejected at compile time.

## Documentation changes

All new code, comments, documentation and commit messages are English. Browser
UI text is Polish, with Focus retaining its name, following the owner's
2026-10-04 direction.
Keep each topic's main explanation in one place and link to it:

| Change | Update |
| --- | --- |
| Installation flags, build tools, packaging | `INSTALL.md`, `DEVELOPMENT.md`, `ops/PACKAGE.md` as applicable |
| User-visible behavior | `docs/USER-GUIDE.md`, `CLI.md`, relevant manual walkthrough |
| Module ownership or data flow | `docs/ARCHITECTURE.md`, `docs/CODE-STRUCTURE.md` |
| Product boundary or acceptance evidence | `docs/LIMITATIONS.md`, `ROADMAP.md`, concise `progress/` evidence |
| Public protocol | Schemas/OpenAPI, examples, generated representations, regression tests and ADR |

Verify commands against actual `--help`, scripts and configuration. Label sample
values, distinguish prerequisites from runtime dependencies, and keep archive
instructions self-contained: `ops/PACKAGE.md` becomes the archive's `README.md`.
Use fenced `text` blocks for ASCII diagrams and tables for comparisons. Check
links with `scripts/check_package.py`; inspect anchors and rendered readability
when changing headings. No new test is needed just to mirror documentation prose.

Preserve original requirement IDs and unresolved obligations. Historical Polish
chapters and dated evidence remain reference material, clearly separated from
English onboarding. Later owner decisions supersede historical behavior; a
documentation edit cannot silently drop acceptance requirements or mark them passed.

## Project coordination data

Read `.project/README.md` and the relevant project context through `projectctl`
with the exact repository folder. Persistent `.project/` sources are project
outcomes and milestones, not detailed implementation plans or agent transcripts.
Append a concise report after a meaningful result, blocker or decision request.
Use the server and observed versions for writes; do not edit planning JSON directly
because a server is unavailable. A clone with no available host can still be used
for code work and synthetic tests; report the coordination limitation explicitly.
Do not initialize missing project data or change priority, dates, focus or
acceptance without the owner's instruction.

## Submit a focused change

Describe the problem, resulting behavior and actual verification. Mention material
limits, especially platform/device coverage. Prefer cohesive feature-sized changes
and clear English names, comments, documentation and commit messages. Formatting
is automated; clever syntax and extra abstraction are not goals.

Routine logs, screenshots and generated specifications belong in `test-results/`
or CI artifacts. Keep concise evidence summaries in `progress/`; link historical
proof to its immutable commit when retiring an artifact from the current tree.
Do not remove unresolved requirements or claim acceptance from a passing build.

The project license and private security-reporting channel remain owner decisions
before a supported public release. See [Security](SECURITY.md) and the
[release checklist](delivery/RELEASE-CHECKLIST.md).
