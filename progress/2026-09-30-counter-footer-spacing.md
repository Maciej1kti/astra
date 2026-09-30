# Counter footer spacing

Date: 2026-09-30. Owner-requested follow-up to `1b28d35`.

Removed the divider and excess vertical space below the three-dot counter menu.
The following section has an 8px gap with no top border or padding; spacing
between other sections is preserved. This follows Counters when sections move.

On macOS arm64 / Node 24.11, the full gate passes 251 Rust, 137 JavaScript and
12 Python tests. Release `card-layout` and `counters` pass in Chromium and WebKit.
The existing visual helper passes 24 menu/layout cases, including the new spacing
at 320–1440px and short landscape widths; the phone screenshot was reviewed.

Rebuilt/restarted the manual app at `https://100.122.250.14:47832`. Trusted HTTPS
verifies all 33 build assets; all 38 prior resource versions, two pins, preferences
and the certificate are preserved. Logs and screenshots are under ignored
`test-results/counter-footer-spacing/`. Physical-device/release acceptance remains open.
