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

## Divider correction

The initial follow-up removed the section divider as well as the excess space.
The owner clarified that sections must remain separated. The divider is restored,
with 8px spacing above and below it after Counters; other section boundaries keep
their existing spacing. This corrects report `ba3ce1e1-34b7-4431-a237-4d7d4d9c8ed7`.

The full gate again passes 251 Rust, 137 JavaScript and 12 Python tests.
Release `card-layout` passes in Chromium and WebKit. Twenty-four Chromium geometry
cases verify section boundaries with Description before and after Counters across
320–1440px and short landscape widths; both phone arrangements were reviewed.
The rebuilt/restarted manual app preserves all 39 prior source versions, two pins,
preferences and certificate; trusted HTTPS verifies all 33 build assets.
Correction evidence is in ignored `test-results/counter-section-divider/`.
