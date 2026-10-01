# Calendar popup probes

Starting revision: `1de11942e6bd11e0eb51f643ecbe010b63b3e579`; its application
implementation is `8fdff83f387985e030f892d6441309bc7054b4a7`.
No application change is selected. Broad performance and release acceptance
remain open.

## Profile interpretation

The saved release popup CPU profile from the preceding interaction investigation
has an anonymous hot frame at column 42692 of `CalendarView-Bdm6iGVR.js`.
Reading those exact bytes from its saved control daemon identifies the frame as
the mount callback calling the native dialog's `show()`. Its approximately
65 ms constrained self time must not be attributed to chunk sorting or derivation.
The profile span also includes behavior checks; its complete span is not the
quiet opening duration. Native insertion, layout and rendering remain material
costs when the complete popup contains 963 entries and about 9,350 document
elements.

## Quiet release comparisons

Apple M4, macOS 27, Node 24.11.0, Rust 1.92.0, Chromium 153.0.8010.12,
1440 × 1000. Each implementation has seven rounds per profile with 1,000 cards
and whole-month plans. Constrained conditions emulate CPU ×4, 100 ms latency,
6 Mbps download and 1 Mbps upload. Every round navigates cold/warm, opens the
complete native day list and then opens a card from that list. Readiness includes
rendered content, two animation frames and settling ordinary API reads.
Builds and focused tests finish before timing comparisons. No full gate,
browser regression or CPU trace runs concurrently with timing.

Popup opening median milliseconds:

| Probe | Local control | Local probe | Constrained control | Constrained probe |
| --- | ---: | ---: | ---: | ---: |
| Defer unused native event normalization | 88.1 | 94.4 | 292.3 | 302.2 |
| Delegate row keyboard handling and declarative attributes | 97.5 | 97.1 | 303.0 | 303.4 |
| Bypass the main-grid Event wrapper inside the popup | 88.0 | 85.9 | 302.7 | 299.5 |
| Bound first opening by the measured current grid height | 97.3 | 92.5 | 306.8 | 299.1 |
| Repeat the measured opening bound | 85.1 | 87.5 | 302.3 | 304.5 |

The normalization and delegation probes do not improve readiness. Bypassing one
component layer retains native interaction/resizer descendants but establishes
only a small difference within sample variation. The early measured bound's
initial apparent gain reverses in the quiet repeat. All four probes are restored;
no benefit is claimed from them. Calendar cold/warm readiness and editor opening
are broadly unchanged. These measurements do not establish a performance ceiling,
p95, physical-device or remote-network acceptance.

## Fidelity and final verification

All 560 timing samples retain the ordinary request paths: 280 Calendar openings
issue one Calendar GET, 140 full popup openings issue zero API reads and 140
editor openings issue exactly the current card source, project and project-tag
GETs. Every popup's complete IDs, titles and versions are compared with the
normal API; every opened source response is checked for the selected version/ID.
Postprocessing initially used an incorrect `project-tags` pathname assertion;
it is corrected to require the three exact typed project/source/tag paths.
The response and identity checks are not relaxed.

Focused candidate tests and type/build checks pass. The restored application
matches the starting tracked source and is rebuilt locally. Its earlier full
gate and Chromium/WebKit evidence remain attached to the unchanged application
commit; they are not new acceptance runs for these rejected probes. Documentation
checks apply to the result/report publication. No protocol, authorization,
conditional write, durability, concurrency or response bounds change. No new
dependency, retained geometry, source cache or partial popup is selected.

The existing manual application remains the verified editor read-overlap build.
This documentation-only result does not require another application restart.
Trusted HTTPS at `https://100.122.250.14:47832` returns the unchanged root bytes;
launcher PID 49561 remains live. All 34 rebuilt frontend files, including the
Vite manifest, match the original checkout. The owner's unrelated card SHA is
unchanged at `d79037cd72f3a1258c525cbce6056f42c2e8710a7f8340d1fb2c506bf485da9b`.

The ordinary report to the explicitly selected original project is committed
and read back with its exact body/version: report
`fcbb5530-3049-4204-a9c4-21f97c10a231`, request
`01a0f623-f193-7bf4-85ed-2e664b16c88c`, version
`r1.b956c9b838f7e19d47e5eb3d2afa33726dcf6eb5878e1b0f3dd01f6a7ba40b89`.
Identity, epoch and unchanged payload are saved before submission. No card status,
scope, priority or acceptance decision changes.

Bulk patches, control binaries, samples, comparison matrices, build/test logs and
read-count checks remain in ignored `test-results/calendar-snippet-2026-10-01/`.
Next work should target native DOM/layout/rendering costs while preserving
complete membership, long wrapping titles, native gestures and current versions.
