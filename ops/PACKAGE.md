# Local Projects — host package

This package contains `projectd`, `projectctl` and the embedded browser application.
It is a development build, not a declaration of completed release acceptance.
Only run a package matching your operating system and architecture.

The server runs as your user and listens on loopback. Browser access requires your
own trusted private HTTPS proxy. Configure it to forward to `127.0.0.1:47831` and
preserve the external Host header. The public-origin argument is the exact private
HTTPS origin users visit; it does not make the service publicly accessible.

Install binaries and generate a service configuration:

```sh
python3 install.py --prefix "$HOME/.local" --data-dir "$HOME/.lp" --public-origin https://YOUR_PRIVATE_HOST
```

The installer creates no network configuration, starts no service and requires no
administrator privileges. Review the generated user service before enabling it with
your operating system's service manager. You can first run the installed daemon
in the foreground with the same `--data-dir` and `--public-origin` arguments.

Register an explicitly selected project:

```sh
projectctl --socket "$HOME/.lp/projectd.sock" registration-plan /absolute/project/path --name 'My project'
projectctl --socket "$HOME/.lp/projectd.sock" register PLAN_ID
```

Open the HTTPS origin, request access, then use `pairings` and
`approve PAIRING_ID --challenge CHALLENGE` on the host. Compare the displayed
challenge first. For browser-based registration, the host owner must explicitly
add an allowed directory using `add-root /absolute/path --label 'Work'`.

Project commands use `--project /exact/registered/folder`. Run `--help`,
`card --help`, `report --help` or `context --help` for typed operations. Reads
include resource versions. Mutations use `--if-version` and preserve request ID,
epoch and payload for retry. A transport timeout can mean an unknown write result;
check its request ID instead of blindly issuing a new operation.

Stop the server before replacing installed binaries. Keep a stopped-server copy
of your state before upgrades; see `RECOVERY.md`. A newer operational database or
source-file format must not be opened for writes by an older incompatible binary.
Deleting the application binaries never requires deleting project folders.
