# Browser regression suites

Build the web assets and Rust binaries first. Run all coverage with:

```sh
npm run build
scripts/cargo-local build --workspace --release --locked
ASTRA_TEST_PROFILE=release npm run test:browser
```

## Motion verification

After the build above, run the shared motion scenarios against the real release
daemon in both engines:

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs motion
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs motion
```

Follow the [design system](../../docs/DESIGN-SYSTEM.md#motion-vocabulary) for
parameters and ownership.

The `motion` suite requires that loaded content starts no scripted animation and
that no entrance is delayed or blurred: a view fades once within 200 ms, a
dialog arrives within 280 ms and a menu within 120 ms, each already readable
halfway through, and a data refresh or an edit starts nothing. It checks the
moving navigation selection across desktop/tablet/mobile, rapid navigation,
keyboard opening, menu reversal, native dismissal/focus restoration, the tag
confirmation pulse, live reduced-motion changes and the release CSP, and that
Calendar, Timeline and Board arrive without staged layers. Effects are sampled
by pausing the actual animation at a fixed time, independent of runner
scheduling. It captures rendered light/dark surfaces in Chromium; WebKit
retains its existing screenshot/CSP restriction. These are browser checks, not
physical-device acceptance or a frame-rate benchmark. Raw pointer/keyboard
scenarios wait for native `dialog[open]` removal before acting on the
background; exiting layers leave the accessibility tree before their brief
visual exit ends. Disclosure helpers use `aria-expanded` to distinguish an open
panel from its outgoing painted surface. Native Calendar drag, resize,
cancellation, conflict/retry and touch behavior remain covered by the planning,
events and calendar-popup suites.

## Polish interface verification

The `localization` suite checks all eight views against an English browser and
stored English workspace preference, translated native widget/date labels,
card/settings dialogs, calendar keyboard focus, section controls and phone
navigation at 320/390px and short landscape dimensions. Existing interaction
suites use the Polish visible and accessible labels while retaining protocol
identifiers and conditional-write assertions.

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs localization
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs localization
```

## Other interaction coverage

The `projects` suite checks the whole-project status board, all three project states,
local folder/title filters, fresh editor opening, keyboard status moves and
pointer cancellation. It covers conditional conflicts and unchanged retries after
a lost response, persisted status/default-view choices, legacy Main routes/local
navigation and narrow touch controls. Projects retains its name and icon; no
separate Main shortcut or default-view option remains.
Chromium captures rendered desktop and phone boards; WebKit exercises behavior
without screenshot preparation. All sources belong to the disposable test host.

The `accessibility` suite checks that a rendered description is ordinary
content with working links and a separate labelled edit button, operated by
keyboard alone and by pointer at 1440, 390 and 320px; that the editor's discard
prompt is a labelled group which returns focus; that card deletion and the
settings discard prompt are named alert dialogs holding focus; and that no
alert region contains a button or link. WebKit uses Alt+Tab, as Safari does.

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs accessibility
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs accessibility
```

The `menus` suite covers the shared native action/date/navigation popover,
lower-edge clipping, viewport bounds, start alignment, panel growth, rotation,
scroll anchoring, Tab/Escape focus and menus inside a narrow card dialog.
The `dialog-components` suite covers held deferred loading, dialog replacement,
nested tag focus, centralized Escape guards and the fixed card-project footer at
desktop, phone and short landscape sizes. Run both against a release daemon in
Chromium and WebKit:

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs menus dialog-components
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs menus dialog-components
```

The `navigation` suite checks the compact Focus/Projects/More phone bar, off-bar
view navigation and selection, browser-local order and visibility persistence,
upgrades that normalize Main entries to Projects and remove duplicates, all-hidden
recovery, keyboard
focus/dismissal, touch targets, landscape scrolling, desktop rotation and reduced
motion at 320–1024px. It measures the bar itself: even insets, one label size and
resting weight, centered labels, cells that do not move with the selection and,
in Chromium, an emulated home-indicator inset that lifts the bar without
stretching it. Its shared grip/eye selector covers mouse and touch ordering,
Escape/Tab/outside cancellation, inert aligned previews, ArrowUp/Down/Home/End
and retained handle focus. Chromium captures rendered
surfaces; WebKit checks the same behavior without screenshot preparation.

The HTTPS smoke exercises broad workflows, including keyboard Focus ordering and
reload persistence, while the planning suite covers its widgets. The portable
regression runner adds card checklists and handle reordering, project tags,
editor draft safety, board/settings dialogs, planning navigation, bounded view
reads, real stale-page recovery in all five paged views, and direct/status command
outcomes with preserved drafts and unavailable conflict details. The deletion
suite covers permanent card and project metadata deletion, a touched card menu
action inside the editor at 390px, one-step deletion of a card pinned to Focus,
confirmation safety,
command uncertainty, conflicts and current-project navigation.

The autosave suite covers automatic card/project writes, queued edits, creation,
close flushing and recovery without replacing the original command identity. The
focus suite covers the four Focus sections, daily plan/event bounded reads, pinned
card precedence, filters, inline pointer ordering and the viewport anchored card
action. It also marks a decision read, verifies it remains in Focus, then resolves
it through the update editor while another unresolved decision remains visible.

The tags suite also adds 80 external source cards to exercise larger catalogs
through normal paired HTTP reads. It checks updated usage counts after a source
edit and the exact current card version in a browser rename preview, alongside
project isolation, archived merges and stale-plan rejection.

The protocol suite also compares complete normally paired HTTPS and CLI agent
context at 4,096, 24,576 and 131,072-byte budgets. Actual response bytes remain
bounded; only `generated_at` is removed for equality. Out-of-range budgets retain
the existing validation error.

The `editor-opening` suite holds an ordinary source response while fresh project
and tag transports start after its transport. The editor waits for that current
source; ordinary opening retains exactly one source/project/tag read. Reopening reads the
acknowledged current source.
It holds an ordinary opening tag response, changes another card through the CLI,
then delivers that old response after refreshed suggestions are visible. The stale
catalog must not replace current tags or mutate the opened resource. This checks
request order and correctness. Another conditional CLI tag change occurs while
the source is held, before Labels exists: that opening catalog must be discarded
and replaced by a fresh read. Quiet release timing measurements are separate.
The suite also holds all three real responses, switches view and requires actual
transport abort signals and request failures for each. The editor suite's
late-response scenario deliberately keeps only its held source transport
nonabortable so its completed-response assertions still exercise late delivery.
Both cases retain the destination and reject an obsolete editor.

The comments suite covers human/browser and bot/CLI attribution, source history,
Markdown rendering, unsent draft protection, comment counts and editor access
from every card view, mobile layout, response-loss retries and concurrent conflicts.

The events suite covers event autosave, conversion to/from date plans, hourly
calendar movement, duration edits, slot creation, mobile layout and browser
timezone independence.

The `ui-corrections` suite checks Timeline pointer/keyboard row ordering and
per-project browser persistence, exact blank-row dated creation, narrow layout,
Chromium touch input and workspace header corners.

The `calendar-popup` suite checks complete month-popup membership and current
versions, native pointer movement and both resize boundaries from the popup,
automatic writes without confirmation, lost-acknowledgement replay, competing
conditional-write conflicts, Escape cancellation, long wrapping titles and fresh Enter/Space source opening
at 1440, 390 and 320px. It also checks the popup against its currently measured
grid and verifies that native handles receive pointer input after list scrolling.
The saved Chromium release control passes the native gesture scenario. The
WebKit control exposes automatic dialog-margin displacement and a scrollbar
covering the end-resize handle; the maintained popup styles correct both.

The loading suite holds preferences until Calendar, Gantt and Board have rendered
their initial pages. Republishing that identical route must not read those pages
again, and typing/clearing loaded-title filters remains local. A subsequent
ordinary CLI edit must trigger a new read and publish its acknowledged title and
source version. Widget imports still begin alongside bootstrap; failed deferred
imports and pending pairing retain explicit recovery.

The editor-inputs suite checks date/time control bounds, touch targets, empty
time fields, event autosave/reload and conversion back to a plan at 320–1440px.
The card-layout suite checks compact relative schedules, deliberate expansion,
incomplete-date recovery, creation state, grouped-preference upgrades, unrestricted
six-section ordering/reset/reload, per-card visibility across browser contexts,
all-hidden recovery, retained mounted drafts and disclosure state,
matching visual/reading order, keyboard/touch controls, motion preferences and
strict CSP at 320–1440px plus landscape. WebKit runs the same behavior without screenshots,
whose preparation would inject a stylesheet prohibited by the app's CSP.
For WebKit coverage, install the matching Playwright browser and select it:

```sh
npx playwright install webkit
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs editor-inputs
```

Chromium remains the default. WebKit on macOS does not reproduce native iOS
pickers or establish physical iPhone acceptance. The suite records WebKit's
deferred ResizeObserver notifications separately from application errors.

The responsive suite checks all eight views at 320, 390, 768 and 1024px, Projects'
Folder header and title filtering, readable List filters with reload persistence,
Calendar navigation, diagonal touch swipes inside a long modal and the system
reduced-motion preference. These checks use
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

The focus-controls suite also verifies active counter footers in In motion and
Events, archived-counter omission, narrow layouts, pointer cancellation, keyboard
saving and reload persistence without per-card detail reads.

The counters suite covers multiple definitions, explicit Save, horizontal scrub,
touch cancellation/vertical scrolling, guarded numeric input, compact rows and
dated history. It retains midnight rollover, preserved drafts, hidden counters,
unit protection, response-loss replay and concurrent conflict coverage.

The `charts` suite creates temporary counter histories through ordinary conditional
CLI writes. It checks counter selection, shared-unit overlays, separate unit
panels, period bars with a zero stub, the stepped running total, the line form
for dense ranges, range-following and chosen grouping, stable series colours,
rates and statistics, project filtering, empty history and source refreshes.
Period values are read from the legend with the plot's keyboard slider. At
1440, 1024, 768, 390 and 320 px it checks touch targets, page containment,
unclipped statistics, the collapsed counter list and that the plot starts
within the first screen. At phone widths it also requires the three control
menus to share one row below the plots and uses each of them. Touch scenarios
read values from the plot; Chromium captures the rendered dashboard and WebKit
checks behavior without screenshot preparation. Synthetic counter sources and
credentials are removed with the temporary host at teardown.

The editor-header suite checks the three persistent header rows and conditional
feedback row while a long card is scrolled, including visible field/save errors,
command recovery, confirmations, an unclipped two-line title at 320px width,
phone portrait and a 320px-high landscape view.

The `session` suite covers startup read failure recovery and remote workspace
timezone changes with existing and new daily counter drafts. It also revokes
the ordinary session while schedule/counter/comment drafts remain mounted,
checking retained clock context, preserved drafts and disabled inputs.

The `session-recovery` suite revokes real sessions while an editor draft, an
uncertain board move and an in-flight project move with a settings draft are
open. It pairs again in place at 1440, 390 and 320px, checks that pairing stays
in front of a dialog that opens after it, steps it aside to copy retained work,
and continues the original command by status check or identical retry. It also
refuses the event stream once and requires later CLI changes to arrive, and
checks that a never-paired browser sees no expiry notice. Scenarios hand their
re-paired session to the next one because the host accepts five pairing
requests per minute. The `command-recovery` suite checks the unload guard of
every command dialog, the settings conflict path, retained unsubmitted editor
entries, the tag refresh without a stream, status feedback for copied drafts and
Polish read-failure messages. It also loses the reply of a settings write and of
a tag rename after the host has accepted them: a failed status lookup must keep
the command pending with both continuations, and a later check must settle it
with the original request ID and epoch and no second write. Run both in each engine:

```sh
ASTRA_TEST_PROFILE=release node scripts/browser/regressions.mjs session-recovery command-recovery
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs session-recovery command-recovery
```

The `users` suite creates a trusted profile through Settings, registers separate
projects and roots through the selected CLI workspace, and verifies direct
foreign-resource reads return unavailable in that workspace. It checks draft
protection, keyboard switching at 320 px, rendered profile settings/projects,
reload persistence and independent selections in existing tabs. These are scope
checks for trusted profiles, not a claim of access isolation between paired users.

The `shared-users` suite renames the initial profile, registers one existing
folder in two profiles and verifies their shared source/card version. It records
one counter step through the second profile's UI, reads the same result from the
first profile and rejects a stale write. Separate tabs retain their names and
unshared projects stay outside the second profile's selected workspace.

The `loading` suite holds bootstrap to verify concurrent preferences and selected
planning-module preloads, holds List data to verify editor warming starts after
the initial read, pauses
browser timers to distinguish immediate navigation from debounced search, checks
deferred-module failure recovery, and exercises pending pairing reload when the
concurrent unauthorized preference read cancels bootstrap. Timing measurements
remain separate from these controlled behavioral checks.
After ordinary CLI edits, Calendar uses its loaded-title filter to expose a
possibly hidden current item and checks its DOM source version. Gantt uses its
selection control for virtualized rows. Neither assertion requires every loaded
item to stay mounted in the main view.

The `calendar-pages` suite adds 205 scheduled cards to its disposable source
fixture. It checks complete agenda pagination, preserved item versions and keyboard
opening, first-page recovery and cursor reset when switching between agenda and
the broader month grid. The `planning` suite retains strict CSP checks in both
engines; WebKit records layout metrics without screenshots because Playwright's
screenshot preparation injects an inline stylesheet blocked by the app policy.

The `calendar-layout` suite adds 330 densely overlapping cards, including timed
events and plans crossing a week boundary or spanning the whole month. It checks
measured month-grid geometry calls, exact per-day hidden counts, unused time
formatting, complete item/popup membership, changed versions, resize layout and
keyboard opening with the observed version. It reconstructs every API-projected
chunk from full native representatives and compares natural heights, including a
live large-text change and 390/320 px month grids. Every checkpoint verifies all
populated day popups against current API IDs, titles and versions; days without a
popup must show all their items visibly. This also covers hidden source updates
without requiring a DOM node for every hidden event. Instrumented call counts are
regressions; release timing measurements remain separate.
