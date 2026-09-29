# Stability follow-up — 2026-09-29

Owner direction: investigate the isolated crash-test failure, add automatic
dependency advisory checks in CI, then inspect and simplify the editor where a
cohesive boundary helps. Explain older API compatibility before any retirement.
Baseline: `4d13816`; the earlier three-pass audit remains closed.

## Checkpoint

- [x] Run a bounded diagnostic series with captured crash-child output; fix only
  a reproduced cause. Keep an unexplained failure explicit if it does not recur.
- [x] Add scheduled and lockfile-change advisory checks for npm, Cargo and Python,
  preserving pinned dependencies and treating service failure as an incomplete scan.
- [ ] Inspect `Editor.svelte`, extract a concrete responsibility when useful,
  and verify draft, command identity, conflict and session behavior.
- [ ] Explain workspace tag vocabulary versus current project tag management,
  and milestone compatibility; retain both unless the owner decides otherwise.
- [ ] Full gate, appropriate release browser checks, reports, commits/pushes.
  Rebuild/restart the existing manual app after application changes and verify HTTPS.

Current checkpoint: CI/advisory changes and the autosave test correction pass
the full gate (238 Rust, 110 JavaScript, 12 Python) and all ten release Chromium
autosave scenarios. Project report: `deaaa64c-ad79-4150-8c3e-dfc781bc6a3c`.
Resume with editor extraction and compatibility review; the original crash
failure did not recur and remains unexplained.
Application behavior is unchanged since `4d13816`; two pre-existing
owner card edits (`2fec9ea1…`, `37d0a92d…`) remain excluded. Read the current CLI
project context using the exact repository folder. Detailed logs and fixtures:
ignored `test-results/stability-followup-2026-09-29/`.

No new service, storage rewrite, dependency upgrades, feature removal or expanded
release acceptance is authorized by this maintenance task. Physical iPhone testing
is not part of this run.

## Diagnostics and advisory checks

The workspace-feature test binary passed 20 serial and four concurrent complete
crash/recovery runs: 144 write checkpoints, each checking recovery and replay.
The original exit 101 remains unexplained; do not claim it was fixed.

Remote runs `36603859037` and `36601833733` separately failed browser AS01 on both
Ubuntu and macOS, after their Rust/full gates passed. AS01 timed two browser clicks
and a durable HTTP response against 350 ms to infer that text debounce was skipped.
Adding 500 ms response latency reproduced its false failure. The corrected test
pauses browser timers and requires the status write to complete without advancing
them, while keeping the delayed response and source/identity assertions. All ten
autosave scenarios then passed. This changes the test, not writer durability.

The pinned OSV 2.6.0 scan covers npm, Cargo and validation-tool Python lockfiles.
The initial run returned no matching advisories; a known-vulnerable synthetic
requirements file failed (exit 1) and a missing input failed (exit 127). Scheduled
and dependency-change checks use the official pinned reusable workflow, including
its incomplete-scan guard, and publish findings to GitHub Code scanning. No package
versions changed. See SECURITY.md for the schedule, reproduction and triage.

Raw results: `crash-series.json`, `ci-4d13816-failed.log`,
`autosave-latency-before/`, `autosave-latency-after/`, `osv-results.json` and
`advisory-negative-checks.json` in the ignored evidence directory above.
