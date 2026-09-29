# Bounded remediation — 2026-09-29

Owner instruction: fix the audit findings, optimize measured bottlenecks, then
audit the whole application again. Use three passes, preserve checkpoints and
stop before adding speculative infrastructure or rewriting sound components.
Baseline: `1a8f650`; findings and measurements are in
[the repository audit](2026-09-29-repository-audit.md).

## Execution and resume point

- [x] Pass 1: regressions and fixes for A01–A07; refresh maintained guidance (A09).
  Start with browser session recovery/preferences and command confirmation, then
  Focus failure isolation/admission, pagination and representation validators.
- [x] Pass 2: measure and optimize A08, retaining authoritative write checks,
  journal ordering, fsync and conflict behavior. Compare release workloads.
- [ ] Pass 3: review the final implementation and broader failure/security/
  durability boundaries; fix newly confirmed issues with focused regressions.
- [ ] Final full gate and release browser checks; rebuild/restart the existing
  manual application and verify its unchanged HTTPS address; report and push.

Current checkpoint: pass 1 is committed/pushed as `5751928`. Pass 2 is verified
and ready to commit. Resume with pass 3: audit the final code and broader failure,
security and durability boundaries, fix only newly confirmed issues, then stop.
The partial pin index passes the full gate and release session/Focus suites. The
manual app was rebuilt/restarted; all 18 existing resource versions, pins,
preferences, certificate and HTTPS origin matched. Project report:
`56cf690f-689f-4507-a343-2a22f689e924`.

Pass 1 evidence: failing regressions reproduced A01/A03/A04/A05/A06 before their
fixes; the earlier audit reproduced A02/A07. The final full gate passes (235 Rust,
110 JavaScript, 12 Python), including subprocess durability, contracts/examples,
types, Clippy and release builds. Broad release HTTPS/planning checks and all 18
Chromium suites pass. Session/Focus were repeated after retaining the project
store lock throughout ordinary prepare/write operations; only new-pin admission
releases it under the exclusive workspace gate. Synthetic command fixtures now
include the real protocol identity fields. No validation or durability guard was
weakened to pass a check.

ADR-050 and the Focus response example record the contract changes. Maintained
guides are corrected and STATE is consolidated with an immutable historical link.
The Focus projection also removes A08's display scan; quantify it in pass 2.
The manual application was rebuilt and restarted at its existing HTTPS origin.
All 17 pre-existing resource versions, two pins, preferences and certificate
matched across restart; the new embedded assets are served and project validation
passes. Project report: `ed7e93fd-3c3a-446d-a4f7-08ea343a9edd`.

Two pre-existing owner card edits (`2fec9ea1…`, `37d0a92d…`) must remain untouched
and excluded from commits. Local detailed logs belong in ignored
`test-results/remediation-2026-09-29/`.

Each verified batch gets a concise checkpoint, a project report through the CLI,
and a commit/push. Application batches also rebuild frontend/release binaries and
restart the existing manual instance with its data, certificates and connection
settings. Do not change project acceptance or card status merely because tests
pass. Keep physical iPhone, Arch/ext4, power-loss and full release acceptance
limitations explicit.

## Scope limits

No new services, migration framework, generic event system, database source of
truth, dependency churn or broad UI rewrite. Preserve existing milestone and
legacy API compatibility. Prefer a small cohesive extraction only when needed
to test or own corrected behavior. Retain historical evidence and unresolved
requirements. Three passes are a stopping boundary, not an endless audit loop.


## Pass 2 measurements and stopping decision

Same macOS 27 ARM64 / Apple M4 / 16 GiB environment as the audit, release builds,
no concurrent tests/builds during measurements. Existing manual app remained idle.
Focus: one project/one pin, 3 warmups plus 20 samples. Other rows: one project,
1,000 cards/500 reports, 20 warmups plus 200 operations (40 creates/160 title edits).
These are application timings, excluding HTTP, VPN, browser rendering and RSS.

| p95 | Audited baseline | Pass 1 projection | Pass 2 pin index |
| --- | ---: | ---: | ---: |
| Focus, 1,000 cards | 206.23 ms | 0.84 ms | 0.25 ms |
| Focus, 10,000 cards | 1,811.91 ms | 5.88 ms | 0.35 ms |
| Search, 1,000 cards | 1.46 ms | 1.36 ms | 1.34 ms |
| Attention | 5.31 ms | 6.20 ms | 6.26 ms |
| Mixed durable writes | 323.26 ms | 320.38 ms | 322.77 ms |
| Creation subset | 337.04 ms | 328.99 ms | 349.20 ms |
| Title edit subset | 31.01 ms | 31.55 ms | 32.68 ms |

The bundled SQLite planner initially preferred a project/type scan even with the
partial index present. The focused query now explicitly uses the pin index;
its full EXPLAIN plan is regression-checked. It retains invalid/unavailable pin
observations and changes only disposable projection indexing.

Source primitive profiling (1,000 files, 20 samples) found median 99.75 ms in
location/lease verification, 62.39 ms in protected reads/directory identity,
4.98 ms in parsing/validation and 1.29 ms in hashing. The writer also rereads
observed ordering references. Creation remains above the 150 ms mixed-write p95
target; neither the pin index nor sorting changes solve filesystem verification
cost. Its median remained about 318–320 ms. Keep those guards rather than add
an authoritative cache, skip reference reads or replace the filesystem layer.
This is the intended stop before speculative architecture. Full performance
acceptance remains open; all measurements, including slower creation tails, are
retained in ignored evidence.
