# Focus widget Rust reader — 2026-10-01

The read-only `projectctl focus-preview` replaces the optional Omarchy Python
status reader. Current hosts supply the first five titles/statuses from the same
Focus membership snapshot in one response. Reference-only hosts keep bounded
ordinary detail reads. Unavailable/stale neighbors retain their position. The
QML adapter consumes the existing CLI envelope through its process/watchdog
lifecycle. The independent Python window launch/focus helper remains.

## Release comparison

M4 / macOS 27 arm64, Rust 1.92, Node 24.11, Python 3.14.6. A normal release daemon
serves synthetic sources through its UID-authenticated Unix API and a recording
Unix proxy. Timings include process startup and complete output. No build, test
or browser profiling runs alongside quiet measurements. Each series has two
warmups and 30 matched pairs per profile, alternating order; two repeats include
the final strict-status release build.

| Profile | First Python → Rust median | Quiet repeat | Final release |
| --- | --- | --- | --- |
| Empty Focus | 25.81 → 2.85 ms | 27.31 → 3.02 ms | 33.26 → 3.67 ms |
| Five ordinary cards | 28.25 → 2.84 ms | 29.38 → 3.02 ms | 31.38 → 3.44 ms |
| Five 65,536-byte bodies | 29.34 → 2.85 ms | 30.30 → 3.07 ms | 31.45 → 3.22 ms |
| 100 pins, first five displayed | 28.67 → 3.42 ms | 29.81 → 3.65 ms | 30.15 → 3.65 ms |

All 720 selected observations check identical first-five titles, membership
order/count and availability. Current-host populated reads fall from six to one;
Rust downloads no full card bodies. Final-series p95 ranges are 35.44–42.99 ms
for Python and 3.55–4.73 ms for Rust, with 30 samples per profile, not a universal
tail guarantee. The final native outputs validate against the CLI envelope and
FocusPreview schemas. Saved controls, traces and all raw output stay in ignored
`test-results/widget-focus-reader-2026-10-01/`.

## Verification

The final full gate passes 456 tests: 278 Rust, 171 JavaScript and seven Python.
Nine new native CLI regressions cover order/text, missing/stale entries, old hosts,
unsafe IDs, empty/malformed snapshots, the 2 MiB response cap, Unicode bounds,
missing/relative socket paths, whole-budget expiry and strict HTTP 200 handling.
The existing CLI confirmation/retry/uncertainty and durability checks remain green.
CLI schema/example/package checks pass. No HTTP endpoint, OpenAPI field, source
format or write exception changes.

Three ordinary paired release browser suites per engine (Focus, protocol and code
health) pass in Chromium and WebKit before the final strict preview-status check.
Final Focus/protocol reruns also pass in both engines; manual publication
verification is pending.
Browser Focus screenshots are inspected at desktop and 320-pixel widths; this is
browser coverage, not widget acceptance. Initial benchmark fixture creation tried
`pinned` in CardCreate and was rejected; the corrected fixture uses an ordinary
observed-version CardPatch. The first native test fixture inherited nonblocking
accepted streams on macOS; explicitly normal blocking streams retain its bounded
timeout. Neither fixture correction changes application validation or bounds.

## Limits

No Omarchy shell is installed on this macOS host. Native process/Unix verification
and QML adapter inspection do not certify installed-shell PATH, Linux QML runtime,
pointer/window behavior or physical devices. The existing narrow-browser status
chip wrapping remains outside this reader change. There is no widget installation
or Linux deployment claim. This is a measured status-reader improvement; the main
browser/daemon latency, broader perceived ceiling and full release acceptance
remain open.
