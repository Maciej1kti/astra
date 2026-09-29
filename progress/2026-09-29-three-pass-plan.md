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
- [ ] Pass 2: measure and optimize A08, retaining authoritative write checks,
  journal ordering, fsync and conflict behavior. Compare release workloads.
- [ ] Pass 3: review the final implementation and broader failure/security/
  durability boundaries; fix newly confirmed issues with focused regressions.
- [ ] Final full gate and release browser checks; rebuild/restart the existing
  manual application and verify its unchanged HTTPS address; report and push.

Current checkpoint: pass 1 is verified and ready to commit. Resume with pass 2
release measurements and source-read profiling, then perform the bounded final audit.

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
