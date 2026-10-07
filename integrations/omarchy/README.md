# Astra Hosts for Omarchy

A native Quickshell bar widget for the Omarchy 4 shell. It runs inside the
existing shell, with no Tauri, webview, persistent helper daemon, or extra Python
dependencies. The full application remains the existing WebUI.

The widget keeps a list of Astra hosts and shows one of them in the bar: `✦`
followed by the selected host's name. The label turns to the bar's urgent colour
when that host does not answer.

- Left-click opens the selected host's WebUI in Omarchy's browser app mode, or
  focuses its existing window. Repeated clicks are ignored while a launch is in
  progress. With no host configured, a left-click opens the panel instead.
- Right-click toggles the panel. It lists the hosts, marks the selected one,
  and has a field for adding another. Paste an address and press Enter. Click a
  row to select that host, or `✕` to remove it. Escape closes the panel.
- Scrolling over the bar label switches to the next or previous host.
  Middle-click checks the selected host again.
- The selected host is checked on startup, when the selection changes, when the
  panel opens with a five-second throttle, every 60 seconds while closed and
  every 15 seconds while open. The timestamp identifies the last observation,
  not a continuous health guarantee.

The plugin id remains `astra.focus`, so an existing bar entry and IPC target keep
working. This version no longer reads Focus or any other project data.

## Host addresses

One entry is `address` or `name=address`. Several entries may be pasted at once,
separated by commas or whitespace.

| Entry | Stored origin |
| --- | --- |
| `100.64.0.7` | `https://100.64.0.7:47832` |
| `mini=100.64.0.7` | `https://100.64.0.7:47832`, shown as `mini` |
| `astra-host:9443` | `https://astra-host:9443` |
| `https://astra.example.ts.net` | `https://astra.example.ts.net` |

A bare host or IP gets port 47832, the HTTPS port of the
[manual test host](../../DEVELOPMENT.md#build-loop). An explicit `https://` origin
is kept as written. Plain `http://`, paths, user names and anything else that is
not an origin are rejected. Names are at most 40 characters without whitespace,
commas, `=` or `/`. The list holds at most 20 hosts and one row per origin.

## Install

Copy `astra.focus/` into `~/.config/omarchy/plugins/astra.focus/`, then run:

```sh
omarchy plugin validate ~/.config/omarchy/plugins/astra.focus
omarchy-shell shell rescanPlugins
omarchy plugin list
omarchy plugin enable astra.focus
omarchy bar set astra.focus hosts "mini=100.64.0.7, https://astra.example.ts.net"
```

Hosts can equally be added from the panel. Configuration stays in the user's
`~/.config/omarchy/shell.json`, outside this repository, as the `hosts` and
`activeHost` settings of the widget; the panel writes them with `omarchy bar set`.
When upgrading from the Focus preview version, remove its `socketPath` and
`webUrl` settings and the installed `status.py`.

Discovery is asynchronous: wait until `astra.focus` appears in the plugin list
before enabling it. Back up `shell.json` before changing the bar. This Omarchy
release can retain cached QML after a source change; if hot reload does not apply
it, use `omarchy restart shell` after saving. The shell refuses that restart
while the session is locked.

## What the check means

The widget runs `curl` against `<origin>/healthz` with a five-second limit, HTTPS
only, no redirects and no credentials. HTTP 200 counts as reachable. The check
does not verify the certificate, because manual test hosts use a self-signed
one; it therefore says that something answers at that address, not that it is a
trusted Astra server. Opening the WebUI goes through the browser's ordinary
certificate handling and Astra's pairing flow.

The widget does not discover hosts, start or stop servers, approve browser
pairing, or read or write project data. Host addresses are validated before use
and passed to `curl` and the launch helper as separate arguments, never through
a shell. Python remains only in the window launch/focus helper.

`projectctl focus-preview` and [ADR-057](../../docs/ADR-057-FOCUS-WIDGET-READER.md)
remain available for a local Focus preview, but this widget no longer calls them.

IPC for scripting and troubleshooting:

```sh
omarchy-shell astra.focus status
omarchy-shell astra.focus add mini=100.64.0.7
omarchy-shell astra.focus select mini
omarchy-shell astra.focus next
omarchy-shell astra.focus remove https://100.64.0.7:47832
omarchy-shell astra.focus refresh
omarchy-shell astra.focus toggle
omarchy-shell astra.focus launchUI
```

Window matching uses the Chromium web-app class for the selected hostname
and Astra's `Local Projects` title. It does not focus ordinary browser tabs or
other local web apps. Chromium omits the port from that class, so two Astra
instances on different ports of the same hostname cannot be distinguished by
this integration yet; use distinct hostnames for those instances.

To remove it from the bar: `omarchy plugin disable astra.focus`. The source
folder can remain for later use. This widget depends on Omarchy's shell APIs;
other Linux desktops and macOS are not supported by this integration.

## Validation

```sh
node --test scripts/tests/omarchy-hosts.test.mjs
python3 -m unittest discover -s integrations/omarchy -p 'test_*.py'
omarchy plugin validate integrations/omarchy/astra.focus
```

Runtime QML validation must use the installed Omarchy shell, whose `qs.*`
imports are not resolved by a standalone qmllint invocation by default.
