# Bounded remediation — 2026-09-29

Owner instruction: fix the audit findings, optimize measured bottlenecks, then
audit the whole application again. Use three passes, preserve checkpoints and
stop before adding speculative infrastructure or rewriting sound components.
Baseline: `1a8f650`; findings and measurements are in
[the repository audit](2026-09-29-repository-audit.md).

## Execution and resume point

- [ ] Pass 1: regressions and fixes for A01–A07; refresh maintained guidance (A09).
  Start with browser session recovery/preferences and command confirmation, then
  Focus failure isolation/admission, pagination and representation validators.
- [ ] Pass 2: measure and optimize A08, retaining authoritative write checks,
  journal ordering, fsync and conflict behavior. Compare release workloads.
- [ ] Pass 3: review the final implementation and broader failure/security/
  durability boundaries; fix newly confirmed issues with focused regressions.
- [ ] Final full gate and release browser checks; rebuild/restart the existing
  manual application and verify its unchanged HTTPS address; report and push.

Current checkpoint: plan recorded; no application changes yet. The baseline full
gate, 17 release Chromium suites and audit probes are recorded in the audit.
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
