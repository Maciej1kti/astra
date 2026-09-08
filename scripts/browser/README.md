# Browser regression suites

Build the web assets and Rust binaries first. Run all coverage with:

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
ASTRA_TEST_PROFILE=release npm run test:browser
```

The two primary suites exercise broad workflows and planning widgets. The portable
regression runner adds card acceptance/activity, workspace tags, editor draft
safety, board/settings/focus dialogs, planning navigation, bounded view/activity
reads, real stale-page recovery in all five paged views, and direct/status command
outcomes with preserved drafts and unavailable conflict details:

```sh
ASTRA_TEST_PROFILE=release npm run test:browser:regressions
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs card tags
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs command-outcomes
```

Each regression suite gets a fresh synthetic fixture, temporary owner-only state,
local HTTPS proxy and ordinary daemon. Browser access uses normal challenge/owner
approval. No existing `.manual/` connection, user project or authentication bypass
is used. Temporary credentials and source files are removed at teardown, including
failed setup. Historical dated entry points have been retired; use these maintained commands.

`host.mjs` owns CLI validation and ordinary pairing. `runtime.mjs` owns explicit
runtime selection and browser/host lifecycle boundaries; suites own assertions
and artifacts. Invoke individual suites through the runner above. A direct suite
invocation requires both `ASTRA_AUDIT_RUNTIME` and `ASTRA_EVIDENCE_DIR` and never
falls back to a manual workspace.

Node 24, OpenSSL and installed Playwright Chromium are required. Set
`ASTRA_TEST_CHROMIUM` to an explicit installed Chromium executable if needed.
Without `ASTRA_TEST_PROFILE=release`, scripts use the debug binaries. Browser/device
emulation does not establish physical iPhone, Safari or Omarchy shell acceptance.

Output defaults to ignored `test-results/browser/`. `ASTRA_EVIDENCE_DIR` overrides
the output of one command; avoid sharing an output directory between concurrent
runs. Manifests record artifact paths, byte counts and SHA-256 hashes. CI uploads
this directory for 90 days. Keep short result summaries and reproducible commands
in `progress/`; promote specific evidence to durable storage before its retention
expires when a release acceptance decision depends on it.

Historical screenshots and logs are preserved at the immutable checkpoint linked
from `progress/README.md`; concise local records retain their original limitations.
