# Development

Follow [Build and install](INSTALL.md) for the pinned toolchains and first build.
Read [Contributing](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md),
[code ownership](docs/CODE-STRUCTURE.md) and the contracts relevant to your change.
[Current status](progress/STATE.md) records implementation evidence; a local
check does not establish release acceptance.

## Build loop

The root npm workspace owns dependencies for `apps/web`. Use `npm ci` with Node
24.11.0, Rust 1.92.0 from `rust-toolchain.toml` and a Python 3.14 `.venv-check`
installed from `scripts/requirements-validation.lock`.

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
npm run try
```

`projectd` embeds the built frontend, so rebuild it after frontend changes.
`npm run try` uses the release binaries and persistent ignored `.manual/` data.
A debug-only Rust build is insufficient for that launcher. Use the
[manual guide](MANUAL-TESTING.md) for pairing and walkthroughs.
`ASTRA_TRY_AGENT=1 npm run try` starts that daemon with
`--agent-dir` set to this repository's `agent/` directory, which enables the
[in-app agent](docs/ADR-070-AGENT-RUNS.md); it needs Claude Code or Codex
installed and signed in. The agent has the daemon user's full rights, so use it
with synthetic data.
`ASTRA_TRY_GITHUB=1 npm run try` adds `--github`, so a project added by name
gets a real private repository in the account `gh` is signed in to
([ADR-074](docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md)). The tests never
reach GitHub: they use `crates/projectd/tests/fixtures/fake-gh.sh`.

For a debug build, keep the same frontend-first order:

```sh
npm run build
scripts/cargo-local build --workspace --locked
```

Run `target/debug/projectd` with an explicit data directory and HTTPS origin as
in [installation](INSTALL.md#run-your-own-host). `npm run dev` starts only Vite's
local frontend server; it does not create the daemon, HTTPS proxy or paired
session. The integrated trial is the documented end-to-end development path.
There is no development authentication bypass.

Use synthetic projects and isolated state for tests. Do not initialize, seed or
replace another contributor's manual workspace. When updating the owner's existing
manual application under the repository instructions, preserve its data, origin,
certificates and connection settings and verify its existing HTTPS address.
Documentation-only edits do not require restarting a running application.

## Verification

Run the full local gate before integration:

```sh
.venv-check/bin/python scripts/check.py
```

In dependency order it checks generated schemas, contract/examples and Markdown
links, OpenAPI, Python and JavaScript tests, frontend types, import boundaries,
formatting, the frontend/bundle budget, Rust formatting, Clippy, Rust tests and a
release build. It includes subprocess durability tests. It does **not** run browser
suites, package installation, advisory scans or physical-device acceptance.

| Focus | Command |
| --- | --- |
| Contracts/examples/documentation links | `.venv-check/bin/python scripts/check_package.py` |
| Generated API schema drift | `.venv-check/bin/python scripts/generate_api_schema.py --check` |
| Frontend types/contracts | `npm run check` |
| JavaScript behavior | `npm run test:unit` |
| One behavior test | `node --test scripts/tests/planning-read.test.mjs` |
| Domain rules | `scripts/cargo-local test -p project-domain --locked` |
| In-app agent (daemon) | `scripts/cargo-local test -p projectd --locked`; the tests use the scripted provider `crates/projectd/tests/fixtures/fake-agent.sh`, never a real one |
| In-app agent (browser logic) | `node --test scripts/tests/agent-api.test.mjs scripts/tests/agent-chat.test.mjs scripts/tests/agent-storage.test.mjs` |
| Application rules/recovery | `scripts/cargo-local test -p project-application --lib --locked` |
| Frontend dependency boundaries | `node scripts/check-boundaries.mjs` |
| Bundle budget, after build | `npm run check:bundle` |

Format the files you changed using the repository tools. The broad format commands
are `npm run format` and `scripts/cargo-local fmt --all`; review their diff and keep
unrelated formatting out of the contribution.

Contract changes regenerate representations with:

```sh
.venv-check/bin/python scripts/generate_api_schema.py
npm run contracts
```

Include examples, regression coverage and an ADR in the same protocol change.
Generated browser types live under `apps/web/src/lib/contracts/`.

## Browser integration

After the frontend and release binaries are built:

```sh
npx playwright install chromium
ASTRA_TEST_PROFILE=release npm run test:browser
```

On Linux, Playwright may also need OS libraries; CI provisions them with
`npx playwright install --with-deps chromium`. That step can require administrator
access, unlike ordinary runtime use. Install them deliberately for your test host.

The suites create temporary synthetic projects and a short-lived self-signed
HTTPS proxy, start an ordinary daemon and pair through the real approval flow.
They do not reuse a running `.manual/` host. The broad HTTPS suite, planning suite
and individual regression suites cover different layers.

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs card tags
npx playwright install webkit
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs editor-inputs
```

Without `ASTRA_TEST_PROFILE=release`, browser scripts select debug binaries.
See [browser suites](scripts/browser/README.md) for coverage and additional knobs.
Desktop WebKit and viewport emulation do not establish physical iPhone/Safari
acceptance. Artifacts go to ignored `test-results/browser/` by default.

## iOS app

The iOS app and its widgets build with Xcode and are not part of `scripts/check.py`.
Run `scripts/ios/test-kit.sh` after a change under `apps/ios/AstraKit`, and see
the [iOS build guide](scripts/ios/README.md) for the simulator checks.

## Packaging and CI

Verification is local: run the gate and the affected browser suites before a
push, and push only work that passed them. [CI](.github/workflows/check.yml)
does not start on a push or pull request; start it by hand from the Actions tab
when a second-platform run is wanted. It then runs on Ubuntu 24.04 and macOS 15,
installs the pinned toolchains, runs the local gate, Chromium browser suites,
host packaging and package installation/recovery smoke. Workflow results apply
to the tested commit.
Advisory scanning is a [separate workflow](SECURITY.md#dependency-advisories).

```sh
.venv-check/bin/python scripts/package.py
.venv-check/bin/python scripts/release-smoke.py dist/local-projects-VERSION-OS-ARCH.tar.gz
```

Use the actual generated archive filename. See [installation](INSTALL.md) and the
[package guide](ops/PACKAGE.md). Packaging uses the current host's release binaries;
it does not cross-compile or publish them. Release packages contain third-party
notices. Full license/publication decisions remain with the owner.

## Performance work

Measure release builds, separately from builds and browser suites:

```sh
scripts/cargo-local build -p project-application --example benchmark --release --locked
target/release/examples/benchmark 1 1000 500
target/release/examples/benchmark 100 100 500
```

The arguments are project count, cards per project and reports per project.
Each profile has 20 warmups and 200 measured mutations (40 creates, 160 title
patches), plus indexed reads and 200 `project_tags` samples from the selected
project's current card sources. Workspace tag catalog timings use one warmup and
ten samples. Application timings
exclude HTTP, VPN and browser rendering. The 100/100/500 profile covers 100 projects,
10,000 cards and 50,000 reports; it is not a capacity limit.

Record the revision, hardware/OS, fixture, sample counts, metric definition and
coverage limits. Compare equivalent workloads and retain outliers. Keep a concise
summary in `progress/`, bulk output in ignored `test-results/`. The initial JS/CSS
regression budget is 80 KiB gzip following static imports; this is distinct from
end-user performance targets. The build manifest is not served as a public asset.

## Test ownership

Application tests under `crates/application/tests` compile as private unit-test
modules (`autotests = false` is intentional). Failure injection stays private.
Frontend `.mjs` tests import actual TypeScript modules through Node's built-in
runner; compile-time endpoint examples live in `apps/web/src/type-tests/`.

Use a failing regression first for data-loss/conflict fixes. Exercise affected
browser behavior for UI/transport changes and package/recovery behavior for host
changes. Report skipped or unavailable coverage explicitly. Preserve unresolved
requirements; passing tests and commits are evidence, not automatic acceptance.
