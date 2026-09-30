# Calendar rendering follow-up, 2026-09-30

The owner's performance objective remains open. Two additional month-grid
prototypes reduce repeated work but do not demonstrate a useful release latency
gain. Both are reverted; the verified application retains
`2230eb2a`'s renderer. Source lease path performance is recorded separately in
[the source evidence](2026-09-30-source-paths.md).

## Candidates and measurements

The first prototype omits each normal event's initial header-height read because
the parent's synchronous reposition pass already sets its margin. Background and
interaction chunks retain their original path. The dense regression's header
reads fall from 455 to 16, with unchanged complete membership, geometry, resize,
refresh, popup and keyboard behavior.

The second prototype accumulates hidden chunks in ordered per-day arrays with
identity sets, publishing each changed day once per synchronous hide pass. It
avoids repeated `includes` and array copies while retaining duplicate protection,
ordering and unchanged array identity. Unit and dense Chromium checks pass.

Both remain unaccepted optimizations because quiet release timings do not show a
noticeable gain. macOS 27, Apple M4/16 GiB, Chromium 153.0.8010.12, 1440x1000,
1,000 source cards/995 dated items; five consecutive samples per condition.
Constrained emulation uses 4x CPU, 100 ms latency and 6/1 Mbps. These are medians,
not p95 or physical-device acceptance. The same fixture and readiness observer
wait for painted calendar content and outstanding ordinary API reads.

| Condition | Control | Initial margin prototype | Margin + hidden batch |
| --- | ---: | ---: | ---: |
| Local cold | 213.6 ms | 218.8 ms | 215.1 ms |
| Local warm | 165.3 ms | 165.6 ms | 164.9 ms |
| Constrained cold | 1343.6 ms | 1360.7 ms | 1340.2 ms |
| Constrained warm | 1009.3 ms | 1025.6 ms | 1060.3 ms |

The control's warm ranges are 160.0–186.4 ms locally and 1003.1–1046.0 ms
constrained. No performance claim is made from reduced operation counts alone.

## Remaining cost and coverage

Three separately instrumented control traces retain 7,339 DOM elements. Their
main-thread layout totals are 85–89 ms and style/layout-tree work 79–114 ms under
CPU emulation; rendering tasks remain substantial. Profiling changes timing and
does not replace the quiet comparison. Removing additional cheap repeated reads
does not remove the first required layout of the populated grid.

Reducing DOM population needs its own behavior-preserving implementation and
evidence. The 1,000-item grid bound, complete popup content, variable content
height, interaction previews, resize behavior and observed versions remain
requirements. No server/protocol change, requirement removal or acceptance
status change follows from this experiment.

Ignored evidence: `test-results/calendar-rendering-2026-09-30/hidden-before/`,
`initial-margin-after/`, `hidden-batch-after/`, `initial-margin-check/`,
`hidden-batch-check/` and `hidden-trace-before/`. Diagnostic source maps are
retained only in ignored evidence and are not published in the manual app.
