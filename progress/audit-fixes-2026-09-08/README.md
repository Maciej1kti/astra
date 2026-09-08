# Important architecture and quality audit fixes

Date: 2026-09-08. Scope: owner-authorized follow-up to the
[fresh audit](../fresh-quality-audit-2026-09-08/README.md), on the current local
tree over `2a5530a8bb83eec0c3f6f289cac8587aa9d66898`. Earlier cleanup and CLI work
remain present. This task does not publish, deploy or change the project license.

Implementation and local verification are complete. Changes were uncommitted at
task completion; see [current state](../STATE.md) for the later checkpoint. The full
local gate and release browser verification pass. Bulk output belongs in ignored
`test-results/audit-fixes-2026-09-08/`. This is not full release acceptance.

## Scope and priority

Importance follows the audit's 1–5 scale; change risk describes the sensitivity
of the affected boundary rather than the probability of a defect.

| Finding | Importance | Change risk | Implemented result |
| --- | ---: | --- | --- |
| Q02 — Conflicts after submission/status lookup | 4 | Medium | One outcome handler per feature, preserved drafts and original rejection details |
| Q03 — Command-row ownership | 4 | High | Journal owns record rules while callers own transactions and durable write order |
| Q04 — Operational inputs in preview JSON | 4 | Medium–high | Typed saved inputs with exact valid legacy compatibility |
| Q05 — Lost operational causes | 3 | Low–medium | Safe bounded diagnostics for continued or uncertain operations |
| Q06 — Projection failures after durable completion | 3 | Medium | Preserve completion, release store handles and arrange projection repair |
| Q07 — Application composition/navigation | 3 | Medium | Screen owners and read-only navigation state with explicit actions |
| Q08 — Known shapes represented as arbitrary JSON | 3 | Low–medium | Typed timeline input; remaining HTTP endpoint coverage assessed separately |
| Q09 — Repeated browser test infrastructure | 3 | Medium | One runtime/CLI/browser boundary with existing assertions retained |

Q02–Q07 are addressed within the audited boundaries. Q08 is partial: the typed
timeline seam is complete, while additional named frontend endpoints remain.
Q09 is partial: shared execution infrastructure is complete, while splitting
the broad smoke flow and remaining scenario/report wrappers is deferred.

## Compatibility and behavioral checks

- Journal characterization covers distinct command families, saved labels,
  digests, result/error slots, seven-day retention and rollback when insertion
  fails. Transaction and lock boundaries remain explicit.
- Q02 exposed an additional server defect: command-status read only `result_json`
  and omitted saved rejections in `error_json`. A failing regression captured the
  missing reason. Journal now selects the correct slot without changing stored
  records or the CommandStatus schema. UI browser regressions distinguish direct
  rejection, lost response/status lookup and unavailable conflict-detail reads.
- Q04 uses old JSON fixtures assembled independently of the new serializer,
  including approvals, extensions, steps and restart after an interrupted
  registration. Valid stored shape and request digests remain compatible.
- Q05 checks use actual missing-file and SQLite failures to verify bounded
  diagnostic categories without paths, error text, documents or credentials.
  Focused workspace, watcher and subprocess durability checks remain green.
- Q06 has three failing-before SQLite fault regressions: normalize, unregister
  and relocate returned a database error after the job was already done. All now
  retain their Accepted reply and exact replay, release the previous store and
  repair projections without changing source/workspace bytes. Coverage includes
  empty-workspace cleanup, restart, batch limits and backoff. A separate failed
  IndexRebuild remains pending until recovery performs its required refresh.
- Navigation's six new behavioral cases compile the real rune module and replace
  only history and feature hooks. The interrupted-history case first failed with
  routing left suspended; it now completes without presenting obsolete data.
  Existing route/history tests also pass. Compile-time cases reject external
  route mutation and access to the private read generation.
- Timeline's malformed-index regression first returned a falsely complete
  forecast after silently ignoring a non-string dependency. Typed conversion now
  reports a stored-data error. Six domain forecast tests and eight application
  planning tests pass, covering retained schedules, unreliable inputs, incomplete
  graphs, cross-page dependencies, date boundaries and the 10,000-card chain.
- Browser infrastructure tests exercise real CLI subprocess exit/envelope
  combinations, explicit runtime/suite selection, and cleanup after setup,
  scenario and reporting failures. All eight regression entry points share the
  same lifecycle helpers; an independently selected command-outcomes run passes
  all 14 cases with normal pairing.

See [ADR-033](../../docs/ADR-033-AUDIT-OWNERSHIP-AND-RECOVERY.md) and the
[rejected-status example](../../examples/command-status-rejected.json).

## Integrated verification

On macOS ARM64, Node 24.11, the pinned Cargo/Rust toolchain and the repository
Python environment:

```sh
.venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release npm run test:browser
```

The full local gate passes **174 Rust, 82 JavaScript and 12 Python tests**, schema
and example validation, generated contracts, frontend typing, import boundaries,
formatters, Clippy and optimized release builds. Evidence: `full-gate.log`.
The added rejected-status example is validated against the existing schema.

The release browser command passes the broad HTTPS/CLI smoke, planning widget
coverage and **all eight regression suites**: card, tags, editor, dialogs,
planning, code-health, protocol and command-outcomes. The last suite passes all
14 new conflict/status cases. Evidence: `browser-full.log`; screenshots, detailed
results and manifests are in `test-results/browser/`. These runs use synthetic
projects and ordinary pairing. Chromium mobile emulation is not physical iPhone
or Safari evidence. No remote CI, packaged installation or release acceptance
was established by this task.

Focused failing-before and passing-after evidence is retained as `q02-*`,
`q03-*`, `q04-*`, `q05-*`, `q06-*`, `q09-*`, `navigation-before.txt`,
`timeline-before.txt`, `timeline-domain.txt` and `timeline-after.txt` in the ignored
audit results directory. These include actual response loss, stored rejections,
SQLite faults and legacy restart inputs; they are not performance benchmarks.

## Remaining limits

Q01 was completed in the preceding CLI work. Q10 remains open under the existing
Kanban feature freeze. Q08/Q09 follow-up is described above. During a persistent
index failure, projections can remain stale until repair succeeds; the retry
batch limit bounds project count, not scan duration. Valid stored plans and source
formats require no migration; malformed execution inputs and corrupted timeline
projection shapes now fail explicitly.

This change does not establish public v1 acceptance. Device/platform installation, physical power-loss,
licensing and security-reporting release obligations remain in the
[release checklist](../../delivery/RELEASE-CHECKLIST.md).
