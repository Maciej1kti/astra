# Code health follow-up implementation

Owner instruction: implement the fixes from the follow-up audit. Baseline:
`a71b282c8b95cdb6185943ab9a8edb27f3097128`.

| Work | State |
| --- | --- |
| Stale planning pages, epoch-aware command status and typed relation search | Complete; transport, unit and real browser regressions pass |
| Immutable command inputs, common lifecycle helpers and transport types | Complete; generated contract types and immutable pending snapshots |
| Large-project source preparation and tag suggestion costs | Safe lookup/early-conflict fixes and indexed suggestions complete; large-project write target remains unmet |
| Scoped pagination revisions | Complete; project cursors retain global SSE compatibility |
| Shell/editor responsibility extraction | Complete for registration browsing and draft-to-patch construction |
| Formatting, bundle gate and evidence retention | Complete; no new binary progress artifacts or runtime dependencies |
| Integrated checks, release benchmarks and browser regressions | Complete; 119 Rust, 54 JavaScript and 12 Python tests, all browser suites and packaged smoke pass; four release profiles recorded |

Preserve authenticated server writes, source authority, version/epoch checks,
stable retries, durable journal/fsync and recovery. Existing audit evidence is
historical. New bulk browser output stays in ignored `test-results/`.
No root `.project/` exists; do not initialize it.
