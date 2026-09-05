# Application engine verification

Verified locally on macOS ARM64 on 2026-09-05. Full check output:
`progress/checks/engine.txt`.

Implemented durable, resumable registration plans; project/card/milestone/update
commands; approval-based pairing and revocable hashed sessions; rebuildable FTS
projections with stale-source isolation; bounded event replay and revision-bound
pagination. Registration preserves existing owner instructions and publishes the
workspace entry last. A recovery regression test confirms previously completed
steps are rechecked before later writes.

All 37 Rust tests pass, including the crash-test child harness. Python validation,
OpenAPI validation, strict Clippy, release compilation and Svelte checks/build pass.
The integration tests use real folders and competing clients of the engine.

This evidence does not establish HTTP/Unix transport security, browser workflows,
physical phone behavior, Linux behavior or power-loss durability. Those remain
outstanding. No gate completion is claimed here.
