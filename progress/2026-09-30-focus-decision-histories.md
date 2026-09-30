# Bounded Focus decision histories, 2026-09-30

Attention previously rescanned a project's reports for every decision to find
matching resolutions/corrections. The release control's exact query plan uses
the project/type index for each correlated history scan. At 2,000 unresolved
reports this already takes about 1.65 seconds; mixed required histories exceed
three seconds while holding the shared projection snapshot.

The statement now builds closure membership once from resolution edges and
correction targets using the existing report-kind index. Canonical membership
keys include both project and report UUID. Nonmatching missing/NULL edges do not
poison membership; a later correction of a resolution does not reopen its
decisions. Project/folder eligibility, archived projects, source targets and
direct closure rules remain unchanged.

Eligible decisions have a sufficient sorted prefix of `offset + limit + 1`,
saturating at SQLite's signed limit, just like unread reports. The statement
materializes that decision prefix once. If it alone fills the requested prefix,
lower-priority unread reports cannot enter the page. Their limit becomes zero
before any report scan. Overdue rows still precede decisions; lower reasons keep
their final mixed order and ordinary unread eligibility when required.

There is no new index/schema, API field, retained cache, receipt projection,
source authority or durability change. Receipt snapshot/hash and cursor scope
remain unchanged; journal reads finish before the index snapshot. Startup and
rebuild continue installing the required existing indexes. See the updated
[daily Focus decision](../docs/ADR-048-DAILY-FOCUS.md).

## Release measurements

macOS 27.0, Apple M4/16 GiB, local SSD, Rust 1.92.0 release Engine and bundled
SQLite 3.53.2. Control is `34d0dfe`. Each executable uses the same synthetic
harness/source shape and ordinary durable receipt commands, with separate
disposable UUID fixtures. Report IDs deliberately repeat across projects. Every
call checks exact sorted first-page report identities, reasons and empty source
warnings. Calls exclude HTTP, VPN and browser rendering. Runs are sequential,
without concurrent builds or heavy checks.

The required fixture contains 100 projects, 10,000 unscheduled planned/active
cards and 50,000 reports. Mixed groups have four decisions, one resolution, one
correction and four notes/results per ten reports; two decisions remain open.
Receipt profiles mark zero, half and all reports read through ordinary commands.
First-page limit is 200; all profiles have 20 warm calls.

| Required mixed history | Samples | Control p50 / p95 | Selected p50 / p95 |
| --- | ---: | ---: | ---: |
| No receipts | 20 | 3429.2 / 3472.7 ms | 30.41 / 31.22 ms |
| 25,000 receipts | 20 | 3486.4 / 3508.6 ms | 34.76 / 35.37 ms |
| 50,000 receipts | 20 | 3543.3 / 3582.3 ms | 38.19 / 38.99 ms |

These 20-sample p95/p99 values are the measured maxima, not strong tail estimates.
The source graph still returns open decisions when every report is marked read.

| Other history | Samples | Control p50 / p95 | Selected p50 / p95 |
| --- | ---: | ---: | ---: |
| One project, 2,000 unresolved decisions, no receipts | 20 | 1641.61 / 1664.46 ms | 2.19 / 2.22 ms |
| Same, 1,000 receipts | 20 | 1646.73 / 1704.94 ms | 2.27 / 2.29 ms |
| Same, 2,000 receipts | 20 | 1649.08 / 1680.97 ms | 2.39 / 2.41 ms |
| Required notes only, no receipts | 200 | 15.09 / 15.44 ms | 15.39 / 15.71 ms |
| Required notes only, 25,000 receipts | 200 | 23.68 / 24.71 ms | 23.87 / 28.25 ms |
| Required notes only, 50,000 receipts | 200 | 52.48 / 79.31 ms | 53.56 / 59.98 ms |

Note-only medians remain similar, rather than demonstrating an improvement.
Control note-history maxima are 17.20/69.06/222.22 ms; selected maxima are
16.19/46.16/67.73 ms. These runs do not establish that outliers are eliminated;
the older receipt-history evidence remains relevant. The all-read note-only
case still exceeds the typical-query 50 ms p95 target.

A separate concentrated profile has one project, 100 cards and 50,000 mixed
reports. With 200 samples after 20 warm calls per receipt profile, selected
p50/p95/p99 is 18.24/18.74/21.21 ms with no receipts, 22.39/23.15/24.51 ms
with half read and 25.71/26.86/29.05 ms with all read. Maxima are
21.59/24.56/31.70 ms. There is no shipped-code baseline at this concentrated
scale; the intermediate membership-only prototype measures about 91/97/94 ms.

The membership-only required prototype measures 50/58/98 ms. Decision prefixes
with row/outer guards still read unwanted history: an outer guard executes after
the unread coroutine yields, and an all-read scan has no early yield. The selected
zero limit's actual bundled SQLite bytecode checks the prefix count and takes
`IfNot` before the report `OpenRead`. Full bytecode, query plans and all prototype
samples are retained; operation-count reasoning is supported by full Engine
timings, not substituted for them.

## Verification and publication

Three focused regressions pass. They cover repeated report IDs across four
projects, 100-edge resolutions, overlapping closures, corrections of resolutions,
archived projects, milestone/project subjects, folder/project scopes, receipt
independence, exact general/Focus pagination, fresh normal resolutions, stale
cursor rejection, unchanged source bytes/versions and reopening. Separate cases
preserve missing/NULL retained-projection edge behavior and priority boundaries
between overdue, decision, unread, due-soon and review items at four page sizes.
The older-projection reopen/rebuild regression also drops the required existing
report-kind index. Browser F09 now marks a decision read before resolving it,
checking that another unresolved decision remains.

The full gate passes 268 Rust, 139 JavaScript and 12 Python tests, contracts,
formatting, Svelte, clippy, bundle bounds and release builds. Focus and protocol
pass against ordinarily paired real release daemons in Chromium 153.0.8010.12
and WebKit 26.6. F09 retains a read decision until its resolution; the other
decision remains. Cursor recovery passes in all five paged views. Rendered
desktop and 320px Focus results are inspected.

The original embedded frontend and release daemon are rebuilt. The existing
manual launcher is restarted with its current data, connection settings and
certificate. All 56 prior source versions, two pins, preferences and certificate
are preserved. Trusted HTTPS remains `https://100.122.250.14:47832`, and all
33 served assets match the rebuilt frontend. The ordinary CLI appends and reads
back report `1345e532-dea2-40bd-8e13-72b33e4c18fc` with its committed source
version. No card status, scope or acceptance is changed.

The owned temporary example is removed before the full gate. Ignored evidence
is in `test-results/focus-decisions-2026-09-30/`: complete sample arrays, exact
plans/bytecode, control/intermediate/selected executable sources and process
timings. Required mixed process peak RSS is 105.0/101.5 MiB control/selected;
note-only is 103.9/108.0 MiB. Concentrated 50k intermediate/selected peaks are
339.6/328.4 MiB. These include fixture creation/indexing and durable receipt
commands; they are not warmed daemon memory acceptance or universal memory
improvements. Statement-local prefix limits do not bound all fixture allocations.

Dense Calendar, note-only large receipt tails, wider graph/edge/offset/source-size
and concurrent-read profiles, durable-write pauses and physical-device/transport
acceptance remain open. This is one measured iteration of the full objective.
