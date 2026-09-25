# Local rebuild and restart — 2026-09-25

The clean checkout and `origin/main` both pointed to `1e72a6b`. The running
manual host still used a release binary built on 2026-09-24. Before stopping it,
`doctor` reported ready storage and index state, no pending commands, and no jobs.

`npm run check`, `npm run build`, `npm run check:bundle`, and
`scripts/cargo-local build --workspace --release --locked` passed. The existing
manual host was stopped gracefully and restarted with its persistent `.manual`
state. The restarted HTTPS endpoint at `https://localhost:47832/` returned 200
and served the new `index-CutJ6_U5.js` asset. `doctor` again reported ready state,
no pending commands or issues. Source validation checked 57 documents with no
invalid documents. The instance ID and command epoch were preserved.

This was a local rebuild and runtime smoke check. No full gate, browser suite,
physical-device test, or release acceptance was performed in this run.

## Rebuild after the new checkout

On the same day, checkout `7c0fe8c` was rebuilt with Node 24.11.0 and the host's
Rust 1.98.1 (the repository pins Rust 1.92.0). The release frontend and Rust
workspace builds passed. The existing manual host retained `.manual/` state and
served `index-Bd4R2p-T.js` over local HTTPS after restart. CLI project context
returned successfully and offline validation found 59 valid source documents.

The full local gate passed with `RUST_TEST_THREADS=1`. Its first run with default
parallel test execution had one transient `WouldBlock` error while opening a
test store; that test passed alone, then all tests passed in the serial run.
The browser suite and physical-device checks were not run for this local restart.
The detailed gate log is in ignored `test-results/local-rebuild-full-gate-2026-09-25.log`.
