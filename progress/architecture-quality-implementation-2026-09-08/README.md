# Architecture and quality implementation — 2026-09-08

> Historical evidence. Commands and bare artifact paths describe the original run.
> [Original record and artifacts](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/architecture-quality-implementation-2026-09-08/README.md) are preserved in the published checkpoint; see [current status](../STATE.md) for maintained guidance.

Scope: implement all seven findings in the adjacent architecture-quality review.
Baseline: `9528056132f73e8f3e963dbb25cbf80d219a8ab8`. Existing untracked audit
material belongs to this task and is preserved. No root `.project` is initialized.

## Completed findings

| Review finding | Implementation |
| --- | --- |
| 1. Repeated command lifecycle | One controller and reactive adapter serve all nine command consumers. Replies explicitly distinguish committed results, accepted jobs and unresolved states. Per-row tag operations keep independent controllers; registration retains accepted jobs until completion. |
| 2. App state ownership | Session, navigation and view-data owners manage their own lifetimes. Pairing, navigation, header and filters have separate components. App composes these owners and feature callbacks. |
| 3. Validated Rust models | Source reads retain `ParsedDocument` and its byte version; workspace reads return `Versioned<Workspace>`. Registration, workspace changes, source ordering and dependency checks operate on typed models. Mutation preparation names its candidate and observed references. |
| 4. Editor and API types | Discriminated targets bind resource kind to source type. Per-kind drafts own initial values, dirty snapshots and deliberate set/clear mappings. Card and report fields have focused components; command completion carries explicit UI intent. All 101 named OpenAPI schemas are exported, with typed resource endpoint functions. |
| 5. Application boundary | Engine exposes operations for auth, status, jobs, events and maintenance. Journal, index, writer and workflow modules are private; HTTP dispatch no longer queries the command table or acquires their locks. Contextual error categories support safe server diagnostics without changing public error responses. |
| 6. Readable projections | Index lifecycle, reconciliation, projections, queries, events and tests have separate modules. Attention, calendar, board and timeline views have dedicated modules and adjacent SQL where useful. Named row mappings and expanded JSON separate queries from policy. |
| 7. Feature structure and consistency | Frontend code lives in ten feature folders with shared API, contracts, resource presentation and UI modules. Theme and dialog styles are shared; workspace styles are scoped to their elements. Unused TypeScript locals/parameters are rejected, maintained JavaScript tests/scripts are formatted, and Rust engine scenarios share a fixture across focused modules. |

See [the original review](../architecture-quality-2026-09-08/README.md) for the
baseline findings and [code structure and ownership](../../docs/CODE-STRUCTURE.md)
for the maintained architecture and extension points.

## Boundaries preserved

- Original command payload, request ID, epoch and expected version survive retries,
  session loss and ambiguous status reads. A failed lookup does not release a
  pending write. Conflicts preserve drafts and require deliberate resolution.
- Source formats, HTTP schemas, database schemas and persisted journal replies are
  unchanged. JSON remains intentional at patch, projection, wire and extension
  boundaries. Complete candidates still pass validation before durable writes.
- Typed serialization retains canonical key ordering. No-op writes retain original
  source bytes. Recovery, fsync, version checks, auth and admission limits remain.
- Private persistence access does not require release-mode fixture bypasses.
  Application white-box tests compile inside the crate; subprocess durability
  children still execute their intended crash checkpoints.
- Error logs contain categories and static operation labels, without underlying
  source error strings, payloads or credentials. Legacy generic errors remain where
  a more specific category would need further changes to the owning operation.

## Descriptive change metrics

| Measure | Before | After |
| --- | ---: | ---: |
| App component lines | 2,235 | 894 |
| App script lines | 814 | 462 |
| App state declarations | 54 | 18 |
| Editor component lines | 1,248 | 691 |
| Editor script lines | 607 | 385 |
| Editor state declarations | 53 | 19 |
| Production Rust lines over 180 characters | 93 | 3 |

These describe responsibility extraction and formatting, not a reduction in total
application functionality or a quality score. The remaining long Rust lines are
string literals. Counts are reproducible with [metrics.py](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/architecture-quality-implementation-2026-09-08/checks/metrics.py);
the resulting [metrics.json](checks/metrics.json) also records verification totals.

## Verification

The [integrated gate](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/architecture-quality-implementation-2026-09-08/checks/final-gate.txt) runs schema generation, package and
documentation checks, OpenAPI validation, Python and JavaScript tests, Svelte/
TypeScript checking, formatting, frontend production build and bundle limits,
rustfmt, Clippy with warnings denied, Rust tests and a workspace release build.

| Check | Result |
| --- | --- |
| Rust tests | 120 passed, including recovery and transport coverage |
| JavaScript tests | 62 passed, including new controller and view-data tests |
| Python tests | 12 passed |
| Svelte / TypeScript | 0 errors, 0 warnings |
| Integrated gate | Passed |
| Release browser smoke and planning scenarios | Passed |
| Release browser regression suites | All seven passed: card, tags, editor, dialogs, planning, code-health, protocol |

Commands:

```sh
CARGO_INCREMENTAL=0 .venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release npm run test:browser
python3 progress/architecture-quality-implementation-2026-09-08/checks/metrics.py
```

[Browser evidence](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/architecture-quality-implementation-2026-09-08/checks/browser-final.txt) includes actual HTTPS transport, source
writes, lost-response replay, conflicts, independent drafts, Back/Forward guards,
session revocation, pagination, planning gestures and desktop/mobile layouts.
The final server diagnostic change additionally has a Rust regression checking
that private source error text cannot enter diagnostics or public responses.

An intermediate Rust link ran out of disk space. Only generated application/server
build caches were cleaned, and the complete gate was rerun successfully with
incremental compilation disabled. See [cache cleanup](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/architecture-quality-implementation-2026-09-08/checks/build-cache-cleanup.txt).

Stage outputs are retained under `checks/`; bulk browser artifacts use ignored
`test-results/browser/`. Browser checks use Chromium device emulation, not a
physical iPhone or Safari. Benchmarks and physical-device acceptance were not part
of this quality refactor; these results do not claim overall product acceptance.
