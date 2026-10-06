# Operating an Astra host

Start with [Build and install](../INSTALL.md) to produce your own binaries/archive
using the pinned toolchains. [Package instructions](PACKAGE.md) cover installation,
pairing, registration and optional user services. [Recovery instructions](RECOVERY.md)
cover a stopped-server copy. The [architecture overview](../docs/ARCHITECTURE.md#three-kinds-of-state)
explains which files are primary data, operational state and disposable projections.

`projectd` accepts `--data-dir`, `--public-origin`, `--port`, the one-time
`--after-restore` flag and the optional in-app agent options `--agent-dir`,
`--agent-claude-bin`, `--agent-codex-bin` and `--agent-timeout` (see
[Enable the in-app agent](../INSTALL.md#enable-the-in-app-agent); the generated
service units and the installer pass none of them). It does not read a TOML
configuration file. Workspace
preferences are edited through the application; operational safety limits are
fixed in this release. `server.example.toml` is a historical reference inventory,
not a live configuration interface or an input to the daemon. Some labels retain
the original source-format terminology; use current schemas and code for exact limits.

The installer writes binaries and generates an escaped launchd or systemd user
service with actual absolute paths. It never enables a service. The `.in` files
are illustrative templates; use the generator for paths containing spaces or
service-manager metacharacters. Review generated files before enabling them.

The backend listens on loopback. A trusted private HTTPS proxy must preserve the
external Host header. Configure that proxy and private network separately after
reviewing the host's current setup. Registration is always explicit; the server
does not search the filesystem for projects.

Use an owner-only data directory (0700) and a short Unix socket path. Keep runtime
data outside the application source repository. The daemon emits bounded event
messages without document bodies or credentials; these templates do not create
unbounded plain-text log files. Host service log retention remains an operating
system setting.

Stop the service before replacing binaries or restoring compatible state. Review
pending commands first. Restart resumes safe interrupted writes; an unresolved
conflict requires inspecting the source, not forcing an overwrite. The installer
can be rerun with the same prefix; release smoke checks replacement, startup,
clean stop/restart and stopped-copy recovery in an isolated temporary directory.
This does not establish login-start, physical power-loss or iPhone acceptance.
