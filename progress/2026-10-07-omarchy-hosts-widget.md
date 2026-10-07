# Omarchy widget lists Astra hosts — 2026-10-07

The owner asked for the Omarchy bar widget to stop showing the local Focus
preview and instead connect to chosen Astra hosts, starting with a Tailscale
host, with more hosts added by pasting and one host visible at a time.

## What changed

- The widget keeps a host list and a selected host in its two shell settings,
  `hosts` and `activeHost`. The bar shows `✦` and the selected host's name.
- The panel lists the hosts, selects or removes one, and adds pasted addresses:
  a bare host or IP, `host:port`, an `https://` origin, optionally `name=` first.
  Scrolling over the bar label switches hosts; left-click opens the selected one.
- Reachability is `curl` to `<origin>/healthz` for the selected host only. It
  does not verify the certificate and sends no credentials.
- The local socket, the `projectctl focus-preview` call and the Focus rows are
  gone from the widget. The CLI command and ADR-057 are unchanged.
- The [integration guide](../integrations/omarchy/README.md) describes the
  address forms, install, limits and IPC.

## Checks

On Arch/Omarchy, Linux 7.2.5, Node 24:

- `node --test scripts/tests/omarchy-hosts.test.mjs`: six parser tests covering
  default port, names, explicit origins, rejected forms, duplicates and the
  stored round trip. `npm run test:unit`: 532 pass.
- `python3 -m unittest discover -s integrations/omarchy -p 'test_*.py'`: 3 pass.
- `omarchy plugin validate integrations/omarchy/astra.focus` passes.
  `npm run format:check` passes.
- The probe command returned 200 for the manual host at `https://localhost:47832`
  and 000 for a closed port. `omarchy bar set astra.focus hosts … --json` wrote
  the setting.

## Not verified

- The new QML has not run in the shell. The installed copy matches the
  repository, but the running shell kept the previous widget in memory and
  `omarchy restart shell` refuses while the session is locked. The panel, text
  input, host switching and bar label are therefore unobserved.
- `npm run lint` did not run: `eslint` is missing from this checkout's
  `node_modules`. The full gate was not run.
- No remote host was configured; the owner supplies the Tailscale address.
