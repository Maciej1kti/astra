# Calendar presentation — 2026-09-30

The calendar follows the compact card-editor design on phone, tablet and desktop.
A shared-button toolbar puts the date input behind its month title, keeps Today,
period navigation, layout selection and scheduled-card creation available, and
uses a compact agenda/grid switch on phones. The month grid shows all seven days
without horizontal scrolling; hourly week columns retain readable widths and
scroll inside the calendar.

The default mobile agenda separates day headings, time labels and wrapping
resource titles with light dividers. Events use flat semantic fills, without
shadows: blue for timed work, green for plans and warm tones for due dates.
Overlapping hourly events occupy separate columns; short events retain a 24px
visual minimum for a legible title without changing their stored time/duration.
Full names, durations and normal editing remain available in the agenda and editor.
Both themes and the shared reduced-motion rules are retained.

## Boundaries

The toolbar is presentation only. No backend, protocol, source, paging or command
rules changed. The parallel performance work remains intact: current-source
reads, 200-item agenda / 1,000-item grid bounds, displayed event identity, held
refresh publication and guarded vendor geometry passes are unchanged.

## Verification

Environment: macOS arm64, Node 24.11, release daemon with embedded production
frontend, synthetic projects and ordinary HTTPS pairing.

- Full local gate: 252 Rust, 137 JavaScript and 12 Python tests; Svelte, formatting,
  contracts, package, boundaries, bundle and release build checks.
- Chromium: planning, calendar-layout, calendar-pages, events and responsive.
- WebKit: planning, calendar-layout, calendar-pages and events, with strict CSP.
- Broad HTTPS and planning browser checks cover source writes, drag, both resize
  edges, selection, Escape, keyboard dates, conflicts and held-refresh gestures.
- 300 added cards retain complete grid/popup membership and measured geometry
  bounds. An identical fresh read still performs zero extra cell/header/footer
  measurements. Real 205-card agenda pagination and source versions pass.
- Responsive review covers 320, 390, 768, 1024 and 1440px plus 844 × 390 landscape,
  four layouts, month display variants, short/overlapping events and dark mode.
  At 320/390px all seven month headers fit, overflow popups stay inside the screen,
  and hourly horizontal scrolling does not widen the page. Date disclosure Escape
  restores focus. The browser gesture assertion compares document coordinates,
  since focusing Refresh may scroll the document after closing an editor.

Generated evidence is in ignored `test-results/calendar-design/`: final gate,
`chromium-verified/`, `webkit-verified/`, `gestures-verified/`, `smoke/`, and
`verified/`. Earlier failed iterations are retained there; final runs above pass.
These are browser/emulator checks, not physical iPhone/iPad acceptance. No new
latency or general release-acceptance claim is made.

## Existing manual application

Rebuilt frontend and release daemon, then restarted the existing manual launcher
with the same data directory, origin, ports and certificate. All 41 prior source
versions, two pins, workspace preferences and certificate hash are unchanged.
Trusted HTTPS at https://100.122.250.14:47832 serves all 33 files from the verified
production build byte-for-byte. The result report is appended after this check.
