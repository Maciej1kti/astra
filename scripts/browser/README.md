# Browser regression suites

Build the web assets and Rust binaries first. Run all coverage with:

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
ASTRA_TEST_PROFILE=release npm run test:browser
```

The two primary suites exercise broad workflows and planning widgets. The portable
regression runner adds card acceptance/activity, workspace tags, editor draft
safety, board/settings/focus dialogs, planning navigation and bounded view/activity reads:

```sh
ASTRA_TEST_PROFILE=release npm run test:browser:regressions
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs card tags
```

Each regression suite gets a fresh synthetic fixture, temporary owner-only state,
local HTTPS proxy and ordinary daemon. Browser access uses normal challenge/owner
approval. No existing `.manual/` connection, user project or authentication bypass
is used. Temporary credentials and source files are removed at teardown, including
failed setup. The old dated progress entry points delegate here for compatibility.

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

Historical tracked screenshots remain until their acceptance references can be
replaced with equally durable evidence. This policy prevents new routine screenshot
bloat without silently invalidating existing evidence or rewriting Git history.
