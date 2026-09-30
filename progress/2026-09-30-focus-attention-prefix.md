# Focus Attention receipt membership and ordered prefixes, 2026-09-30

The owner's performance objective remains open. The actual Focus Attention path
previously scans every eligible report and searches the receipt JSON array again
for each row. On the required 100-project / 10,000-card / 50,000-report fixture,
1,000 read receipts make the release first-page query take about 3.6 seconds.

The statement now builds receipt membership once and takes the first
`offset + limit + 1` eligible unread reports in project/ID order before mixing
them with other reasons. That prefix is sufficient because all unread reports
share their weight, NULL date and reason in the final ordering. Eligibility,
parent archival and project/folder scopes precede the prefix. The signed prefix
length saturates, preserving accepted large offsets without overflow. NULL set
entries are excluded, matching the previous equality-based absence check.

The shared event-boundary query also checks whether an event has ended before
running active/parent checks. This reorders the existing conjunction; qualifying
ended events and their cursor invalidation remain identical. Shared receipts are
still read from the durable journal before the index snapshot; their unchanged
ordered serialization/hash still participates in cursor identity. No persistent
receipt projection, retained source cache, protocol/schema, lock or durable-write
change is introduced.

## Release measurements

macOS 27, Apple M4 / 16 GiB, local SSD, Rust 1.92.0 release Engine, bundled SQLite
3.53.2. The disposable fixture contains current validated JSON sources; receipts
are created through ordinary `Engine::receipts` commands. Each query is the actual
`attention_mode(None, None, None, 200, now, true)` first page. Measurements exclude
transport, VPN and browser rendering. Bulk timings and plans remain ignored.

| Read receipts | Implementation | Samples / warmup | p50 | p95 | p99 |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | Control `5386db1` | 200 / 20 | 89.2 ms | 112.8 ms | 138.7 ms |
| 0 | Receipt set + prefix | 200 / 20 | 25.0 ms | 26.3 ms | 31.4 ms |
| 0 | Final, including event eligibility | 200 / 20 | 22.3 ms | 23.3 ms | 25.9 ms |
| 1,000 | Control `5386db1` | 20 / 2 | 3,642.0 ms | 3,692.2 ms | 3,692.2 ms |
| 1,000 | Receipt set + prefix | 200 / 2 | 25.6 ms | 26.6 ms | 28.4 ms |
| 1,000 | Final, including event eligibility | 200 / 2 | 24.9 ms | 32.8 ms | 38.6 ms |
| 50,000 (all reports read) | Final | 200 / 2 | 95.2 ms | 199.1 ms | 582.5 ms |

The expensive populated-receipt control has only 20 measurements, explicitly
separate from the 200-sample query runs. Its median comparison identifies the
algorithmic cost; its tail estimates have that sample-count limitation. Runs are
not pooled or averaged. The previous iteration's 85.5 ms Focus p95 used an
interleaved benchmark and is not substituted as the control for these standalone
first-page measurements. The final populated run has larger tails than its
prefix-only run; no unconditional latency guarantee is claimed.

The actual bundled SQLite query plan changes the correlated `json_each` scan to
a statement-local list subquery and retains bounded unread candidates. A separate
Python/SQLite probe was used only to investigate plans, not as product release
performance evidence. The all-read 50,000-receipt profile returns no unread
items, but still reads/serializes the full receipt snapshot and filters candidates.
It retains substantial cost and larger outliers; no equivalent control or
universal sub-50-ms Focus claim is made. That history distribution remains a
performance candidate.

## Verification

A new engine regression covers more than 400 active unread candidates with IDs
repeated across projects, archived parents, project/folder scopes, limits 1/7/200,
mixed overdue/decision/unread/review ordering, milestone report targets, read
decisions, read-to-unread cursor invalidation, maximum signed offsets and the
all-read case. The test passes before and after the change. A negative control
that omits the offset from the prefix fails its global one-item pagination;
the correct prefix is restored. Earlier fixture/macro preparation errors were
corrected without changing production validation.

The implementation checks pass all 77 engine tests. The full gate passes 256
Rust, 137 JavaScript and 12 Python tests, contracts, formatting, Svelte, clippy,
bundle bounds and release builds. Focus, events and protocol suites pass in both
Chromium and WebKit against the real release daemon. The protocol suite retains
ordinary stale-page recovery; Focus retains report read/decision resolution and
observed-version writes. After integration with the latest card-layout controls,
the full gate passes 258 Rust, 139 JavaScript and 12 Python tests. Focus, events,
protocol and card-layout pass again in both engines; broad HTTPS passes. Rendered
desktop Focus and narrow-screen card results are inspected.

The original embedded frontend and release daemon are rebuilt. The existing
manual launcher is restarted with its current state, origin and certificate.
Trusted HTTPS remains `https://100.122.250.14:47832`; all 33 served build files
match the build. All 50 prior resource versions, two pins, preferences and
certificate are preserved. A concise normal CLI project report records the
result (`3f40586e-af4f-4b82-a4ac-9a13967f8202`). No acceptance or project-card
status is changed by this evidence.

## Reproduction and limits

Ignored evidence is in `test-results/focus-attention-2026-09-30/`: release control,
prefix and final JSON/time logs, full sample arrays, query plans, the temporary
`focus_benchmark.rs` source, regression logs and the investigation probe. The
temporary example is removed before the full gate; it is not shipped. Calls use
`focus_benchmark 100 100 500 <receipt-count> <samples>` with identical source
generation and normal receipt commands. Fixture setup contributes to external
peak memory; this is not warmed daemon RSS. The all-read process has an external
maximum RSS of 84,574,208 bytes and peak memory footprint of 77,840,888 bytes,
including its fixture setup and normal receipt writes.

Dense decisions/resolutions, large offsets, concentrated report collections and
other receipt distributions are not covered by these first-page timings.
Dense Calendar rendering, legacy global tag reads and recorded create pauses
remain separate performance candidates. Physical-device and end-to-end release
acceptance remain open.
