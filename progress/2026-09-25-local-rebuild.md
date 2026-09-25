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
