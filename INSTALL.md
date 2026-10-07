# Build and install Astra

Build Astra on the machine type where it will run. This guide uses your own source
build and optional locally generated archive. A passing build does not declare a
supported release; check [platform coverage](docs/LIMITATIONS.md#platform-and-browser-coverage).

Choose one path after building:

| Path | Use it for | State and network |
| --- | --- | --- |
| [Local trial](#try-a-sample-project) | Explore the interface | Persistent `.manual/`, local test HTTPS proxy |
| [Foreground host](#run-your-own-host) | Use your own project folders | Explicit private state directory and your HTTPS proxy |
| [Installed binaries](#package-and-install-your-build) | Keep a host outside the checkout | Same host model, with an optional generated user service |

## Prerequisites

| Tool | Version / purpose |
| --- | --- |
| Node.js and npm | Node **24.11.0**, recorded in `.nvmrc`; install JavaScript dependencies with `npm ci` |
| Rust | **1.92.0**, including rustfmt and Clippy, recorded in `rust-toolchain.toml` |
| Python | **3.14** for repository validation, packaging and installation |
| Native compiler and linker | Needed by Rust/native dependencies, including bundled SQLite; use the host's development toolchain |
| Git | Clone the repository and inspect the revision |
| gzip | Used while embedding precompressed frontend assets |
| OpenSSL | The trial and browser tests generate local test certificates with `openssl req -addext` |

On macOS, install the command-line development tools. On Linux, provide a C build
toolchain and Python venv support through your distribution. The intended host
targets are macOS ARM64 and Linux x86_64, with Arch/Omarchy a target environment.
Windows is not implemented: the daemon and CLI use Unix sockets and Unix filesystem
facilities. The manually started CI workflow covers Ubuntu 24.04 and macOS 15; see
the coverage limits linked above.

Runtime and build dependencies differ: an installed daemon embeds the frontend
and uses bundled SQLite. Node is needed for building and the trial proxy, Python
for validation/installation and the optional Omarchy integration. Neither Node
nor Python serves ordinary requests in an installed daemon.

## Clone and build

```sh
git clone https://github.com/Maciej1kti/astra.git
cd astra
git rev-parse HEAD
```

Record the revision if you will report a result. Select Node 24.11.0 with your
Node manager (`nvm use` if you use nvm). With rustup already installed:

```sh
rustup toolchain install 1.92.0 --profile minimal --component rustfmt --component clippy
python3.14 -m venv .venv-check
.venv-check/bin/python -m pip install -r scripts/requirements-validation.lock
npm ci
npm run build
scripts/cargo-local build --workspace --release --locked
```

The frontend must be built **before** `projectd`: Rust embeds `apps/web/dist/`.
The executables are `target/release/projectd` and `target/release/projectctl`.
`scripts/cargo-local` uses normal Cargo unless an existing repository-local Rust
installation is present in `.tools/`; it does not install a toolchain itself.

Run the full local verification gate before using a build as a contribution or
release candidate:

```sh
.venv-check/bin/python scripts/check.py
```

It includes a release build but does not run browser/device acceptance. See
[development checks](DEVELOPMENT.md#verification) for the additional suites.

## Try a sample project

From the built checkout:

```sh
npm run try
```

Open `https://localhost:47832` in your regular browser and handle the local
self-signed certificate prompt. Request access. In a second terminal in the same
checkout, compare and approve the browser's challenge:

```sh
npm run pair:try -- "CHALLENGE_FROM_BROWSER"
```

Return to the browser to connect. The launcher starts a real release daemon on
loopback port 47831 and a local HTTPS proxy on 47832. It creates a synthetic sample
project on first use. `.manual/` retains sources, state, certificates and edits
between runs. Ctrl+C stops the launcher; it does not erase the trial workspace.
`ASTRA_TRY_AGENT=1 npm run try` also enables the in-app agent with the
repository's `agent/` directory; see [Enable the in-app agent](#enable-the-in-app-agent).

No system service or certificate trust is installed. Do not run this alongside
another host already using those ports. For an existing tailnet trial and the
walkthrough, see [manual testing](MANUAL-TESTING.md). A phone's `localhost` is the
phone itself, so this local URL is not a remote-access address.

## Run your own host

Choose a short, absolute data directory owned by your OS user, with permissions
0700 and no symlink components. Keep host state separate from project sources.
The following example uses a new directory:

```sh
mkdir -m 700 "$HOME/.lp"
target/release/projectd \
  --data-dir "$HOME/.lp" \
  --public-origin https://YOUR_PRIVATE_HOST
```

Replace `https://YOUR_PRIVATE_HOST` with the exact HTTPS origin the browser will
visit. Include a nondefault port if used; omit paths and trailing slashes. The
daemon always binds HTTP to `127.0.0.1` (default port 47831). `--port PORT` changes
the loopback port. It does not terminate TLS or configure DNS, VPN or a proxy.

Your private HTTPS reverse proxy must:

1. Forward to that loopback port and preserve the browser's external `Host` header.
2. Serve the exact configured HTTPS origin with a certificate trusted by clients.
3. Support streaming responses for server-sent events without buffering them.
4. Close idle upstream connections within about two minutes. The host closes a
   connection that sends no request for 150 seconds and keeps at most 96 open.

Configure this layer separately using your existing host setup. A private network
does not replace browser pairing. A CLI-only workflow can use the Unix socket
without a browser proxy, although `--public-origin` is still a required argument.

In a second terminal, use the built CLI without installing it:

```sh
export PATH="$PWD/target/release:$PATH"
export ASTRA_SOCKET="$HOME/.lp/projectd.sock"
projectctl hello
projectctl doctor
```

The `PATH` entry above is for the current shell. `--socket PATH` can replace
`ASTRA_SOCKET`; no server instance is chosen implicitly.

### Pair a browser

Open the configured HTTPS origin and request access. On the host:

```sh
projectctl pairings
projectctl approve PAIRING_ID --challenge "CHALLENGE_FROM_BROWSER"
```

Use the ID and matching challenge from that pending request, then finish connecting
in the browser. Pair each device separately. Settings and the CLI expose session
inspection/revocation; see [CLI](CLI.md). Pending requests expire, so request a new
pairing if approval is too late.

### Select a trusted user profile

Existing installations retain their data in **Owner**. In **Workspace settings →
User**, add an empty profile and explicitly switch to it before registering its
folders. The CLI selects the same workspace with `--user USER_ID` or `ASTRA_USER`;
omitting both selects the default profile. Profiles can be renamed through the
CLI. Register the same exact existing project folder in another profile to share
its source data within this host; personal workspace settings remain separate.
See [CLI profiles](CLI.md#trusted-user-profiles).

Pairing remains shared across profiles, and every paired device can choose any
profile. Profiles are intended for trusted people, without passwords or roles.
For private access isolation, run separate instances with separate state
directories and HTTPS origins. Do not register the same writable project folder
in more than one instance.

### Register a project

Choose the exact existing folder. First inspect the registration plan:

```sh
projectctl registration-plan /absolute/project/path --name 'My project'
projectctl register PLAN_ID
projectctl projects
projectctl --project /absolute/project/path context --json
```

Replace `PLAN_ID` with the returned plan ID and inspect the returned job status
with `projectctl job JOB_ID` until it completes. Registration prepares `.project/`
and a managed block in `AGENTS.md`, preserving existing content. Review the plan's
Git treatment of `.project/`; source tracking versus local exclusion is explicit.
An accepted registration may return exit 9 because the job is still pending;
check that job instead of submitting a second registration.
The CLI plan defaults to private Git mode (a local exclusion). Add `--tracked`
to `registration-plan` if you intend to commit the persistent `.project/` sources;
keep `.project/.local/` excluded. The daemon does not commit files to Git.

The browser adds projects through **Projekty → Dodaj projekt**, which needs a
directory you approved on the host. Nothing in that flow opens a dialog on the
host, so it works from a phone or any remote browser:

```sh
projectctl add-root /absolute/projects --label Projects
```

Typing a project name then creates a folder of that name inside the approved
root and registers it. With several approved roots, choose one under
**Ustawienia → Katalog nowych projektów**. **Dodaj istniejący folder** in the
same dialog registers a folder that already exists below an approved root.
Local CLI registration does not require an approved root. No parent-folder or
Git-remote search selects a project on your behalf.

### Create private GitHub repositories for new projects

Start `projectd` with `--github` to have each project added by name published
to a private repository of the GitHub account that `gh` is signed in to on the
host. Read [ADR-074](docs/ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md) and the
[limitations](docs/LIMITATIONS.md#project-repositories) first: any paired
browser can then create repositories in that account.

Prerequisites on the host: Git, and the GitHub CLI signed in for the daemon's
user with the `repo` scope (`gh auth status`).

```sh
target/release/projectd \
  --data-dir "$HOME/.lp" \
  --public-origin https://YOUR_PRIVATE_HOST \
  --github
```

| Option | Meaning |
| --- | --- |
| `--github` | Enables publication. The daemon finds `gh` and `git` on its own `PATH` at startup and refuses to start without them |
| `--github-gh-bin PATH`, `--github-git-bin PATH` | Executables to use instead. Both need `--github` |
| `--github-remote-base URL` | Prefix of a new repository's remote, default `https://github.com/`; set it for a GitHub Enterprise host. Needs `--github` |

When GitHub cannot be reached the project is still created and works locally;
repeat the publication from the project's **Git** dialog. The manual launcher
passes the option with `ASTRA_TRY_GITHUB=1 npm run try`.

### Enable the in-app agent

The browser's **Agent** button is off unless you start `projectd` with
`--agent-dir`. It then runs a local Claude Code or Codex for each chat message,
with your user's full rights and no permission prompts. Enable it only on an
instance that people you trust use; read [limitations](docs/LIMITATIONS.md#in-app-agent)
and [ADR-070](docs/ADR-070-AGENT-RUNS.md) first. The agent inherits the daemon's
environment.

Prerequisites on the host: Claude Code (`claude`) or Codex (`codex`), installed
and signed in for the daemon's user; `projectctl` in the same directory as the
`projectd` executable; and a directory holding the agent's instructions as
`AGENTS.md`. The repository's [`agent/`](agent/AGENTS.md) is that directory:

```sh
target/release/projectd \
  --data-dir "$HOME/.lp" \
  --public-origin https://YOUR_PRIVATE_HOST \
  --agent-dir "$PWD/agent"
```

| Option | Meaning |
| --- | --- |
| `--agent-dir PATH` | Enables the agent. The directory must exist; it is the agent's working directory and must hold a non-empty `AGENTS.md` of at most 64 KiB |
| `--agent-claude-bin PATH`, `--agent-codex-bin PATH` | Provider executables. By default the daemon looks for `claude` and `codex` on its own `PATH` when a run starts, which can differ from your shell's. Both need `--agent-dir` |
| `--agent-timeout SECONDS` | Limit of one run, 1 to 3600; the default is 600. Needs `--agent-dir` |

`AGENTS.md` is read when a run starts, so editing it changes new runs without a
restart or rebuild. Each person chooses Claude Code or Codex in **Ustawienia
przestrzeni roboczej → Dostawca agenta**; the setting appears only when the
agent is enabled. The dialog is described in the
[user guide](docs/USER-GUIDE.md#use-the-agent).

A source build has the `agent/` directory; the package archive and the generated
service units do not include it and pass none of these options. For an installed
host, keep a directory with a copy of `agent/AGENTS.md` and add the options to
your own service definition deliberately. A SIGTERM or Ctrl+C stop ends running
agents; stopping the daemon with SIGKILL leaves them running.

## Package and install your build

After building and checking the same revision:

```sh
.venv-check/bin/python scripts/package.py
```

This creates `dist/local-projects-VERSION-OS-ARCH.tar.gz` and its `.sha256` file.
The actual filename is printed; the archive matches the current host, not a
cross-compilation target. It contains both binaries, embedded web assets,
`install.py`, installation/recovery instructions and third-party notices.
Packaging requires the build dependencies and does not publish a release.

From `dist/`, verify the exact archive you intend to extract with `sha256sum -c`
on Linux or `shasum -a 256 -c` on macOS, passing its `.tar.gz.sha256` filename.
Replace `VERSION-OS-ARCH` below with the actual generated suffix. From `dist/`,
extract that archive and enter its directory:

```sh
tar -xzf local-projects-VERSION-OS-ARCH.tar.gz
cd local-projects-VERSION-OS-ARCH
python3 install.py \
  --prefix "$HOME/.local" \
  --data-dir "$HOME/.lp" \
  --public-origin https://YOUR_PRIVATE_HOST
export PATH="$HOME/.local/bin:$PATH"
```

The installer copies binaries to the prefix and generates an absolute-path launchd
or systemd user-service file under `share/local-projects/`. It creates no network
configuration and starts no service. The generated path is printed. Follow the
self-contained [package guide](ops/PACKAGE.md) to run in the foreground or enable
that reviewed service. Stop an existing instance before replacing it.

Return to the repository root to exercise your archive in an isolated temporary
prefix:

```sh
.venv-check/bin/python scripts/release-smoke.py dist/local-projects-VERSION-OS-ARCH.tar.gz
```

Replace the filename with the one generated above. This verifies installation,
startup/restart and stopped-copy recovery; it does not test service startup at login.

## Update or remove an installation

Before upgrading, inspect compatibility notes, resolve pending commands and make
a [stopped-server copy](ops/RECOVERY.md). Build/check the new revision, stop the
old daemon, install the new binaries and restart with the same data directory,
origin and proxy configuration. Check `hello`, `doctor`, browser access and an
existing card. Rebuilding JavaScript alone does not update the embedded frontend.

Do not use `--after-restore` for an ordinary restart or upgrade. It is a one-time
recovery action that rotates the command epoch and revokes sessions. Older binaries
must not write newer incompatible state; rolling back binaries alone may be unsafe.

To remove an installation, stop and disable any user service you enabled, then
remove its installed binaries and generated service file. Keep project folders
and host state unless you separately intend to delete their data. Astra has no
automatic uninstaller or general source-format migration tool.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `projectctl` is not found | Use `target/release/projectctl` or add the installed `bin` directory to `PATH` |
| Missing embedded frontend during Rust build | Run `npm ci` and `npm run build` first |
| Server will not open its state directory | Use an existing owner-only 0700 directory, safe absolute paths and a short socket path |
| Address/socket already in use | Identify the existing host; use its connection or stop it deliberately before starting a replacement |
| Browser cannot connect or gets Host/Origin errors | Compare the browser origin, proxy Host forwarding and `--public-origin` exactly |
| The Agent button is missing, or its dialog reports a missing command | The host was started without `--agent-dir`; or the daemon's `PATH` lacks `claude`/`codex` (pass `--agent-claude-bin` / `--agent-codex-bin`) or `projectctl` is not beside `projectd` |
| **Dodaj projekt** reports that no directory of new projects is selected | Approve one with `projectctl add-root`, or choose among several under **Ustawienia → Katalog nowych projektów** |
| A new project has no GitHub repository | The host was started without `--github`, `gh` is signed out, or GitHub was unreachable; the daemon's stderr holds the failing command's last output. Repeat from the project's **Git** dialog |
| CLI write times out | Keep its request ID, epoch, payload and version; inspect command status using [safe retries](CLI.md#uncertain-results-and-safe-retries) |
| Source validation/recovery warning | Inspect `doctor` and the affected source; do not delete operational state or overwrite a conflict |

For a bug report, include the revision, OS/architecture, tool versions, command,
expected result and sanitized output. Follow [Security](SECURITY.md) for sensitive
reports.
