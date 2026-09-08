# Contributing to Astra

Astra is under active development. Before starting a large feature, describe its
user-facing behavior in an issue so the maintainer can confirm scope. Small fixes
should include a reproduction and the smallest meaningful verification.

## Set up

Follow [Development](DEVELOPMENT.md) for the pinned Node, Rust and Python
versions. Build the frontend before the daemon because `projectd` embeds its
assets. Use synthetic projects for tests; keep user projects, credentials and
runtime state outside version control.

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
Preserve unknown extensions when editing unrelated fields. A protocol change
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

Run `npm run format` and `scripts/cargo-local fmt --all` before review.
Browser tests require built assets/binaries and Playwright Chromium; see
[browser suites](scripts/browser/README.md). A data-loss/conflict fix starts with a
failing regression. Persistence changes must pass the subprocess durability
suite. Do not replace meaningful behavior tests with source-text assertions.

Application tests under `crates/application/tests` are explicitly included as
private unit-test modules; `autotests = false` is intentional. This keeps failure
injection private. Frontend `.mjs` tests import actual `.ts` modules using Node's
built-in runner. Type-only endpoint checks live with the frontend so TypeScript
can verify invalid payloads are rejected at compile time.

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
