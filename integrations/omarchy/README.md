# Astra Focus for Omarchy

A native Quickshell bar widget for the Omarchy 4 shell. It runs inside the
existing shell, with no Tauri, webview, persistent helper daemon, or extra Python
dependencies. The full application remains the existing WebUI.

- Hover for 250 ms to see local API availability and the first five Focus pins.
- Move into the popup to use its buttons; leaving both surfaces closes it after
  450 ms. Left-click the bar icon or **Open Astra** to launch the configured
  WebUI in Omarchy's browser app mode, or focus its existing window. Repeated
  clicks are ignored while a launch is in progress. Right-click toggles the preview;
  middle-click refreshes it.
- Check on startup, on hover with a five-second throttle, every 60 seconds while
  closed, and every 15 seconds while open. The timestamp identifies the last
  observation, not a continuous health guarantee.
- Server availability means the Focus API responded; it does not certify every
  project's health or the HTTPS proxy. Individual inaccessible pins remain
  visible as unavailable. An unavailable API clears the old preview.

## Install

Copy `astra.focus/` into `~/.config/omarchy/plugins/astra.focus/`, then run:

```sh
omarchy plugin validate ~/.config/omarchy/plugins/astra.focus
omarchy-shell shell rescanPlugins
omarchy plugin list
omarchy plugin enable astra.focus
omarchy bar set astra.focus socketPath /absolute/path/to/projectd.sock
omarchy bar set astra.focus webUrl https://your-astra-origin
```

Use the actual local instance's socket and HTTPS origin. Configuration stays
in the user's shell settings, outside this repository. The widget does not
discover projects, start or stop servers, approve browser pairing, or write
project data. Opening WebUI may require the existing browser pairing flow.

Discovery is asynchronous: wait until `astra.focus` appears in the plugin list
before enabling it. Back up `shell.json` before changing the bar. During local
development, this Omarchy release can retain cached QML after a source change;
if hot reload does not apply it, use `omarchy restart shell` after saving.

The Python helper issues only bounded GET requests over the existing Unix
socket API, authenticated by the server using the peer UID. It resolves at most
five cards, validates reference UUIDs, and never executes document contents.
Each response is limited to 2 MiB, each socket operation to at most two seconds,
and the shell terminates a helper still running after eight seconds. Display
text is plain text. No user content or tokens are cached to disk.

Status IPC for troubleshooting:

```sh
omarchy-shell astra.focus status
omarchy-shell astra.focus open
omarchy-shell astra.focus close
omarchy-shell astra.focus launchUI
```

Window matching uses the Chromium web-app class for the configured hostname
and Astra's `Local Projects` title. It does not focus ordinary browser tabs or
other local web apps. Chromium omits the port from that class, so two Astra
instances on different ports of the same hostname cannot be distinguished by
this integration yet; use distinct hostnames for those instances.

To remove it from the bar: `omarchy plugin disable astra.focus`. The source
folder can remain for later use. This widget depends on Omarchy's shell APIs;
other Linux desktops and macOS are not supported by this integration.

## Validation

```sh
python3 -m unittest discover -s integrations/omarchy -p 'test_*.py'
omarchy plugin validate integrations/omarchy/astra.focus
```

Runtime QML validation must use the installed Omarchy shell, whose `qs.*`
imports are not resolved by a standalone qmllint invocation by default.
