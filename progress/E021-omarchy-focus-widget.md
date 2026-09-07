# Omarchy Focus widget — 2026-09-07

Implemented and installed a native Omarchy bar widget while retaining the
existing browser WebUI. Desktop application packaging remains deferred for this
iteration. No application protocol, persistence rules, Focus selection, or
project cards were changed.

## Implementation

- `integrations/omarchy/astra.focus` contains the distributable manifest, QML
  widget, and dependency-free Python local API reader.
- A star icon exposes an availability indicator and a hover popup with up to
  five Focus pins, a remaining count, unavailable-card placeholders, last-check
  time, and Open Astra / Refresh actions.
- Existing authenticated Unix-socket GET endpoints supply the data; no cookie
  export, project-file reading, server lifecycle actions, or writes are used.
- Startup/hover refresh and bounded 60-second closed / 15-second open polling
  avoid a persistent helper. The QML watchdog bounds a stuck reader to eight
  seconds. Plain-text rendering and UUID validation isolate untrusted content.
- Local shell settings were backed up before installation. The widget was
  placed after the existing agent widget. Socket paths, URLs, runtime state, and
  desktop captures remain outside Git.

## Verification

- Omarchy 4.0.2-1 on the actual Linux/Wayland desktop, one display at 2x scale.
- Plugin manifest validator passed. Five Python behavior tests passed: empty
  Focus, bounded detail requests, unavailable pin, invalid reference IDs, and
  unavailable socket.
- Actual pointer movement verified hover opening, persistence while entering
  the popup, and dismissal after leaving both surfaces. Empty and populated
  panels were visually inspected on the running desktop.
- An isolated Unix HTTP fixture supplied seven references, including a missing
  card and literal HTML in titles. The live widget rendered five entries, one
  unavailable placeholder, plain text, and the remaining count. No real Focus
  data was edited. A completed missing-socket check cleared previous entries and
  reported unavailable. The real socket setting was restored afterwards.
- The widget's launch action opened the existing WebUI in a real browser app
  window titled Local Projects. Hover and launch callbacks share the tested
  widget methods; the launch action was invoked through widget IPC.
- `npm run build` passed: Vite production build 1.14 s; initial JS 92.54 kB gzip
  plus CSS 4.45 kB gzip. Frontend source and assets were unchanged.
- Ten helper invocations against the live empty Focus: median 57.25 ms, maximum
  61.38 ms, including Python startup. This is a small smoke measurement, not a
  release benchmark or a populated-board performance claim.

## Limits and observations

Availability describes the last successful local Focus API read, not HTTPS
proxy health, all-project health, or continuous server readiness. No server
start/stop controls are included. Multiple displays, other Omarchy versions,
macOS, and physical touch have not been validated for this integration.

Standalone qmllint could not resolve the shell's runtime `qs.*` imports; QML
was instead loaded and exercised inside the installed shell. Initial discovery
was asynchronous. Cached QML and a transient duplicate IPC registration during
rapid layout changes required one shell restart; current widget IPC exposes the
updated methods and live status. Installation notes document this behavior.
