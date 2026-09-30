# Request-local Rust receipt membership, 2026-09-30–10-01

Focus's all-read note-history path spent time concatenating each project/report
identity and searching SQLite's temporary membership tree. It still exceeded
the typical-query p95 target after decision histories were improved. A private
Rust predicate now looks up borrowed row identities in nested project/report
hash sets from the same durable receipt snapshot.

The ordered journal serialization and its cursor hash are unchanged. The journal
lock ends before the index snapshot. Membership is decoded only on first use,
so a full decision prefix or no examined unread rows allocates no set. Canonical
UUID pairs permit borrowed JSON decoding; the completed set owns its keys. The
predicate performs no I/O, SQL or nested locks and cannot run from stored views
or triggers. Read statements/results end before explicit removal under the index
lock; removal is required before success, and a drop guard handles unwinding.
No snapshot or set is retained between requests.

Only the pinned rusqlite crate's existing `functions` feature is enabled. There
is no new dependency version, source/API schema, receipt authority,
durability change or source-validation bypass. The ordinary read/decision
distinction, mixed order, scope, cursor identity and pagination remain intact.
See the updated [daily Focus decision](../docs/ADR-048-DAILY-FOCUS.md).

## Release evidence

macOS 27.0, Apple M4/16 GiB, local SSD, Rust 1.92.0 release Engine and bundled
SQLite 3.53.2. Control is `0d1179a` (application `b5b5994`). Separate disposable
UUID fixtures use the same source shape, normal indexing and durable receipt
commands. Report IDs deliberately repeat across projects. Every call checks
exact sorted first-page identities/reasons and empty source warnings. Timings
exclude HTTP, VPN, browser rendering and physical-device behavior. Heavy builds
and tests do not run during these measurements.

The required note-only profile has 100 projects, 10,000 unscheduled active/planned
cards and 50,000 reports. Each receipt distribution has 20 warm calls, then
200 timed calls per pass. Access comparisons alternate control/ordered/covering
indexes in the same fixture; the table selects only passes without extra indexes.
The receipt-only prototype uses the lazy predicate and borrowed decoding.

| Read receipts | Control p50 / p95, two passes | Receipt-only p50 / p95, two passes |
| --- | ---: | ---: |
| None | 14.72 / 16.48; 15.23 / 15.78 ms | 15.25 / 17.81; 15.98 / 18.67 ms |
| 25,000 | 24.13 / 29.16; 23.60 / 26.90 ms | 21.20 / 23.84; 21.12 / 21.80 ms |
| 50,000 | 52.77 / 57.63; 53.19 / 58.27 ms | 35.49 / 36.14; 35.55 / 36.41 ms |

The all-read median improves about 33%; p99 is 38.64/38.31 ms and maxima
38.75/38.83 ms. No-receipt medians are slightly higher; these runs do not
establish an improvement for that path or eliminate earlier larger outliers.
Complete sample arrays are retained, including all access variants.

The current control plus a new ordered partial index saves about 6 ms but adds
3.95 MiB of live index pages. Adding a concatenated covering key uses 7.67 MiB
and saves only about another half millisecond. The first Rust prototype without
an index measures 36.12/37.16 and 36.24/37.32 ms all-read p50/p95. Borrowed
decoding and lazy initialization then reduce this to the receipt-only values above.
The lazy predicate plus the ordered index measures 30.09/30.55 and
30.16/31.10 ms. At that point the extra index appeared to offer only about
5 ms. A wider concentrated profile below establishes a much larger benefit,
so the ordered index is selected. The covering variant is rejected. Experimental
index changes are confined to disposable fixtures.

A concentrated note profile has one project, 100 cards and 50,000 reports.
Alternating index variants in the same fixture, with 20 warm calls and 200
samples each, exposes the remaining whole-project sort:

| Read receipts | Rust without extra index, p50 / p95 | Rust with ordered index, p50 / p95 |
| --- | ---: | ---: |
| None | 57.57 / 59.60; 58.49 / 60.64 ms | 2.066 / 2.087; 2.060 / 2.091 ms |
| 25,000 | 42.79 / 43.88; 42.89 / 44.09 ms | 6.979 / 7.068; 7.126 / 7.231 ms |
| 50,000 | 21.18 / 21.61; 21.12 / 21.55 ms | 15.02 / 16.59; 15.03 / 15.78 ms |

The existing report-kind access sorts the entire project before yielding its
unread prefix. The ordered partial index delivers the same sufficient prefix
without that sort. Query plans confirm that difference. It adds 3.95 MiB;
initial measured creation takes 57 ms in this fixture. The covering expression
adds another 3.69 MiB without a useful consistent gain. Final SQL explicitly
selects the ordered index; startup installs it for older disposable projections,
and normal report writes/rebuild maintain it. Receipt authority stays in the journal.

The final release executable, with startup-installed index and explicit SQL
selection, is measured again without experimental index changes. In the required
note profile (200 samples after 20 warm calls), p50/p95/p99 is
14.74/15.15/18.17 ms with no receipts, 20.97/21.56/23.32 ms with half read and
30.50/31.18/34.97 ms with all read. Maxima are 18.20/23.36/37.36 ms.
The all-read median improves about 42% against the current control; no-receipt
performance stays similar. Broader and older outliers are not disproved.

The final concentrated executable is measured separately with the installed
index and no experimental schema changes. Its 200-sample p50/p95/p99 is
1.995/2.099/2.151 ms with no receipts, 6.785/6.916/7.005 ms with half read
and 14.73/15.08/15.24 ms with all read. Maxima are 2.166/7.200/15.247 ms.
The concentrated comparison's 58-to-2 ms gain is specifically the ordered-index
effect on the Rust predicate, not a measured shipped-code concentrated baseline.

A 200-sample required mixed-history follow-up uses four decisions, a resolution,
a correction and four notes/results per ten reports; two decisions remain open.
Receipt-only p50/p95/p99 is 30.31/31.20/32.95 ms with no receipts,
34.78/35.73/37.59 ms with half read and 38.56/39.97/42.74 ms with all read.
Maxima are 33.12/37.95/46.08 ms. These are consistent with the previous
20-sample 30/35/38 ms profile; no matching 200-sample shipped mixed control is
claimed. A full decision prefix skips receipt-set construction.

The final executable repeats the mixed profile with its startup-installed index:
200-sample p50/p95/p99 is 30.20/31.70/39.62 ms with no receipts,
34.63/35.64/38.04 ms with half read and 38.39/40.38/41.44 ms with all read.
Maxima are 44.86/38.22/42.38 ms. The selected combination preserves the
mixed-history improvement without constructing unnecessary membership sets.

## Verification and remaining work

Ten serial attention regressions pass, including the existing exact paged scopes,
repeated IDs, maximum resolution edges, decisions independent of read receipts,
startup/rebuild and unchanged sources. The new regression exercises concurrent
scoped/general reads, current receipt transitions, invalid/stale cursors, a
retained-projection mapping error, predicate removal after success and errors,
fresh ordinary report insertion, reopening and exact source bytes/versions.
The older-index regression now also removes the selected unread index before
opening; actual attention reads require its restoration. All ten regressions pass
again with the selected index.

The full gate passes 269 Rust, 139 JavaScript and 12 Python tests, contracts,
formatting, Svelte, clippy, bundle bounds and release workspace builds. The first
gate stopped on a test-helper clippy suggestion; it is corrected before the full
passing run. Focus and protocol pass against real release daemons in Chromium
and WebKit through ordinary pairing. Read decisions remain until resolved;
unread notes disappear after reading. First-page recovery succeeds in all five
paged views. Desktop and 320px Focus renders are inspected. Manual publication
is pending.
Ignored evidence is in `test-results/focus-unread-2026-09-30/`: full samples,
plans, control/prototype/selected sources and executables, process timings and
the focused regression log. Temporary examples are removed before integration.

Process peak RSS is 106.4 MiB for the required control and 85.1/82.9 MiB for
the final required note/mixed profiles; final concentrated notes peak at
311.9 MiB. These include fixture generation, validation/indexing and durable
receipt commands. They are not warmed daemon memory acceptance or a universal
memory improvement. Earlier process peaks and latency outliers remain recorded.

Dense Calendar, wider graph/edge/offset/source-size and sustained concurrency,
durable-write pauses and physical-device/transport acceptance remain open.
This is one measured iteration of the full objective, not release acceptance.
