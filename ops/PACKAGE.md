# Install an Astra host package

This archive comes from a source build and contains `projectd`, `projectctl`, the
embedded browser application, this guide, recovery instructions, `install.py` and
`THIRD_PARTY_NOTICES.txt`. Package/service names retain `local-projects`. Use the
archive for the OS/architecture on which it was built. It is a development build;
full release acceptance and the project license decision remain open.

## Before installing

Verify the adjacent `.tar.gz.sha256` file against the archive. On Linux use
`sha256sum -c ARCHIVE.tar.gz.sha256`; on macOS use
`shasum -a 256 -c ARCHIVE.tar.gz.sha256`, from the directory containing both files.
Extract the matching archive and run the following commands from its directory.
Python is needed for the installer (repository verification uses Python 3.14).
The installed daemon itself needs neither Node.js nor Docker.

The host runs as your user. Choose a short, absolute state path with permissions
0700, no symlink components and room for its Unix socket. The example uses
`$HOME/.lp`. Choose the exact private HTTPS origin that your browsers will visit.

Your separately configured HTTPS reverse proxy must forward to
`127.0.0.1:47831`, preserve the external Host header and support unbuffered
server-sent events. Its certificate must be trusted by the clients. `--public-origin`
validates the expected origin; it does not configure TLS or network reachability.
A CLI-only host can use its socket without a browser proxy.

## Install and run in the foreground

Stop any existing instance before replacing its binaries. From the archive directory:

```sh
python3 install.py --prefix "$HOME/.local" --data-dir "$HOME/.lp" --public-origin https://YOUR_PRIVATE_HOST
export PATH="$HOME/.local/bin:$PATH"
projectd --data-dir "$HOME/.lp" --public-origin https://YOUR_PRIVATE_HOST
```

Replace the example origin with yours, including a nondefault HTTPS port if needed,
without a path or trailing slash. `--port PORT` changes the daemon's loopback port
and is also accepted by the installer; adjust the proxy accordingly.

The installer copies binaries to `PREFIX/bin`, creates the state directory if
needed and prints the generated user-service path under `PREFIX/share/local-projects`.
It starts no service, requires no administrator privileges and changes no network
settings. It rejects an existing state directory with unsafe ownership/permissions.
Ctrl+C cleanly stops a foreground daemon.

## Connect, pair and register

In another terminal, with the installed `bin` directory on PATH:

```sh
export ASTRA_SOCKET="$HOME/.lp/projectd.sock"
projectctl hello
projectctl doctor
```

Open the configured HTTPS origin and request browser access. Compare the displayed
challenge with the matching host request, then approve it:

```sh
projectctl pairings
projectctl approve PAIRING_ID --challenge "CHALLENGE_FROM_BROWSER"
```

Return to the browser and connect. Each device pairs separately. Settings can add
and select trusted profiles, each with separate project folders and preferences.
The CLI selects one with `--user USER_ID` or `ASTRA_USER`; omission uses the default
Owner. Pairing remains shared, and every paired device can select every profile.
There are no profile passwords or roles. For private access isolation, run separate
instances with separate state directories and HTTPS origins.

Register an exact existing project folder in the selected profile by reviewing
a plan first:

```sh
projectctl registration-plan /absolute/project/path --name 'My project'
projectctl register PLAN_ID
projectctl job JOB_ID
projectctl projects
projectctl --project /absolute/project/path context --json
```

Use the IDs returned by the preceding commands. Registration is a background job;
exit 9 with an accepted job is pending, not a failed registration. Read its status
until done before using the project. The plan describes source initialization,
managed AGENTS instructions and Git exclusion/tracking behavior. No auto-commit
occurs and no parent directory is inferred. CLI plans default to private Git mode;
add `--tracked` to `registration-plan` to prepare sources for tracking instead.
Keep `.project/.local/` excluded in either mode.

The browser's native folder picker opens on the host desktop. Linux uses XDG
Desktop Portal (FileChooser v3+) with a GTK/KDE backend, falling back to Zenity;
the daemon needs access to the desktop user's session bus. On a headless host,
use local CLI registration or explicitly approve a browser root:

```sh
projectctl add-root /absolute/projects --label Projects
```

Then select Browse approved folders in Add project. This approval is not needed
for explicit local CLI registration.

## Optional user service

First stop the foreground daemon. Review the generated file and its absolute
binary/state paths and origin. The commands below use the example prefix above;
adjust paths if you installed elsewhere. Enabling a service is your explicit
operator action. Login-start acceptance must still be checked on your host.

### Linux with systemd

```sh
mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/.local/share/local-projects/projectd.service" "$HOME/.config/systemd/user/projectd.service"
systemctl --user daemon-reload
systemctl --user enable --now projectd.service
systemctl --user status projectd.service
```

Logs are available through `journalctl --user -u projectd.service`. Stop and disable
with `systemctl --user disable --now projectd.service`. This is a user service;
pre-login operation or enabling linger is a separate host decision.

### macOS with launchd

```sh
mkdir -p "$HOME/Library/LaunchAgents"
cp "$HOME/.local/share/local-projects/local.projects.projectd.plist" "$HOME/Library/LaunchAgents/local.projects.projectd.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/local.projects.projectd.plist"
launchctl print "gui/$(id -u)/local.projects.projectd"
```

Stop with `launchctl bootout "gui/$(id -u)/local.projects.projectd"`. Remove its
LaunchAgents file if you do not want it loaded at a later login. The service runs
in the logged-in user's session; it does not configure sleep or networking.

After either service starts, verify `projectctl hello`, `doctor` and browser
access at the configured HTTPS origin. Do not run a second daemon against the
same state or project source directories.

## Safe use and upgrades

Use `--project /exact/registered/folder` for project commands. `--socket PATH`
overrides `ASTRA_SOCKET`. Run `--help`, `card --help` and `report --help` for the
current command tree. JSON is the default output; `--output text` is available
for human-readable results.

Read before editing an existing resource and use its `--if-version`. A durable
command prints its request ID and epoch before submission. If the response is
uncertain, retain those values, the original payload and original version:

```sh
projectctl command-status REQUEST_ID --epoch ORIGINAL_EPOCH
```

A failed status lookup does not establish that the write failed. An identical retry
uses both `--request-id` and `--epoch` with unchanged input/preconditions. Do not
replace an uncertain command or conflict with a blind new write.

Before an upgrade, inspect pending commands/jobs and make a stopped-server copy
as described in [RECOVERY.md](RECOVERY.md). Stop the daemon, install the new build,
update the reviewed service file if its arguments changed, and restart with the
same data, origin and certificates. `--after-restore` is a one-time recovery flag,
not an ordinary upgrade option. Never let an older incompatible binary write a
newer operational database or source format.

Copy the entire `users/` subtree with root state when backing up profiles; the
root registry and their SQLite/workspace files must come from the same stopped
copy. Recovery rotates all profile epochs and revokes the shared sessions.

To uninstall, stop/disable the service you enabled and remove its service file
and installed binaries. Keep host state and project folders unless you separately
intend to delete their data. Only the search index is disposable. Built-in backup
archives and general source migrations are deferred; use external backups.
