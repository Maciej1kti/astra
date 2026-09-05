# Development

The application is under active implementation. Read `progress/STATE.md` for
current coverage and limitations. The temporary handoff remains normative until
its requirements have been implemented and verified.

## Toolchains

Use Node 24.11.0 (`.nvmrc`), Rust 1.92.0 (`rust-toolchain.toml`) and Python 3.14.
On this checkout, `scripts/cargo-local` uses the repository-local Rust installation
under `.tools/`. On a fresh machine, install the pinned Rust toolchain with rustup
or provide the same local directories. Dependencies are pinned in Cargo.lock,
package-lock.json and scripts/requirements-validation.lock.

```sh
python3 -m venv .venv-check
.venv-check/bin/pip install -r scripts/requirements-validation.lock
npm ci
npm run build
scripts/cargo-local build --workspace --locked
.venv-check/bin/python scripts/check.py
```

Build the frontend before compiling `projectd`: the daemon embeds the production
assets. `scripts/check.py` enforces that order. Development API requests must go
through the normal session/CSRF protections; there is no authentication bypass.

## Run

Choose an absolute, non-symlink, owner-only state directory. Keep the Unix socket
path short enough for the host OS (macOS has a small sockaddr_un limit).

```sh
mkdir -m 700 "$HOME/.local-projects"
target/debug/projectd --data-dir "$HOME/.local-projects" --public-origin https://your-host.example
```

The HTTP listener binds only `127.0.0.1:47831`. Configure your own trusted HTTPS
proxy (for example an existing Tailscale Serve setup) to preserve the public Host.
The origin must match `--public-origin` exactly. The daemon does not configure
network access, VPNs, TLS certificates or public hosting.

```sh
target/debug/projectctl --socket "$HOME/.local-projects/projectd.sock" hello
target/debug/projectctl --socket "$HOME/.local-projects/projectd.sock" add-root /absolute/projects --label Projects
```

Open the HTTPS origin, request pairing, compare the displayed challenge and
approve it through `projectctl ... approve ID --challenge "the displayed challenge"`.
Then confirm in the browser. List pending requests with `projectctl ... pairings`.

For CLI registration, run `registration-plan /absolute/project`, inspect the JSON
plan, then `register PLAN_ID`. Use `projects`, `get /api/v1/...` and `command --help`
for resource operations. Existing resource edits require `--if-version`.
CLI commands print the request ID and epoch to stderr before sending. An uncertain
result must be checked through `/api/v1/commands/REQUEST_ID`; retries must provide
both `--request-id` and `--epoch` with unchanged input and version.

## Browser integration test

```sh
npx playwright install chromium
npm run build
scripts/cargo-local build --workspace --locked
node scripts/browser-smoke.mjs
```

This creates temporary synthetic projects, a short-lived self-signed HTTPS proxy
and an ordinary daemon, pairs Chromium through the real owner approval flow, and
checks creation and competing edits. It cleans up its processes and temporary
state. Screenshots and logs are evidence under `progress/`, not user project data.
Chromium phone emulation is not physical iPhone or Safari validation.
