# Browser regression suites

Build the web assets and Rust binaries first. Run all coverage with:

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
ASTRA_TEST_PROFILE=release npm run test:browser
```

The HTTPS smoke exercises broad workflows, including keyboard Focus ordering and
reload persistence, while the planning suite covers its widgets. The portable
regression runner adds card checklists and handle reordering, workspace tags,
editor draft safety, board/settings dialogs, planning navigation, bounded view
reads, real stale-page recovery in all five paged views, and direct/status command
outcomes with preserved drafts and unavailable conflict details. The deletion
suite covers permanent card and project metadata deletion, confirmation safety,
command uncertainty, conflicts and current-project navigation.

The autosave suite covers automatic card/project writes, queued edits, creation,
close flushing and recovery without replacing the original command identity. The
focus suite covers the four Focus sections, daily plan/event bounded reads, pinned
card precedence, filters, inline pointer ordering and the viewport anchored card
action.

The comments suite covers human/browser and bot/CLI attribution, source history,
Markdown rendering, unsent draft protection, comment counts and editor access
from every card view, mobile layout, response-loss retries and concurrent conflicts.

The events suite covers event autosave, conversion to/from date plans, hourly
calendar movement, duration edits, slot creation, mobile layout and browser
timezone independence.

The editor-inputs suite checks date/time control bounds, touch targets, empty
time fields, event autosave/reload and conversion back to a plan at 320–1440px.
For WebKit coverage, install the matching Playwright browser and select it:

```sh
npx playwright install webkit
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs editor-inputs
```

Chromium remains the default. WebKit on macOS does not reproduce native iOS
pickers or establish physical iPhone acceptance. The suite records WebKit's
deferred ResizeObserver notifications separately from application errors.

The responsive suite checks all seven views at 320, 390, 768 and 1024px, readable
List filters with reload persistence, Calendar navigation, diagonal touch swipes
inside a long modal and the system reduced-motion preference. These checks use
the real release app and ordinary pairing, with synthetic source data.
It also checks sidebar touch scrolling at 844 × 390 and 740 × 320, and keeps the
active view visible after rotation between portrait and landscape and reload.

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

The counters suite covers multiple definitions, explicit OK, dated totals, midnight
rollover, preserved drafts, hidden counters, unit protection, mobile layout,
response-loss replay and concurrent conflicts.
