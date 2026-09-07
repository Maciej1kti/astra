# Existing browser regression coverage

Inspection date: 2026-09-08. Source commit: `c3b912fc122b58780f870ee4da27c2d29411725a`.
This inventory describes the assertions in `scripts/browser-smoke.mjs` and `scripts/planning-browser.mjs`; it is **not an execution result**. Audit execution outcomes belong in `../regression/`.

## Environment and fidelity shared by both scripts

Both launch the actual `projectd` and `projectctl` binaries in a fresh temporary state directory, register synthetic project folders, generate an ephemeral self-signed HTTPS certificate, and use a real HTTPS proxy to the daemon. Pairing is requested in the browser and approved through the real CLI; there is no authentication bypass. UI writes are checked through CLI/API reads and, for project/card setup, actual files. Test state and temporary certificate material are removed at the end.

Browser: headless Playwright Chromium (optionally overridden through `ASTRA_TEST_CHROMIUM`). Default desktop viewport is 1440 × 1000. `ignoreHTTPSErrors: true` deliberately accepts the test certificate: this verifies application behavior over HTTPS, **not certificate-chain trust or production/private-network TLS setup**. The scripts do not run Tailscale or connect to the user's ordinary projects.

## `browser-smoke.mjs`

| Area | What is exercised and asserted |
| --- | --- |
| Pairing and projects | Request/approve/claim; native-picker cancellation message; selected-folder confirmation before creating `.project`; real approved-root browser navigation and confirmed registration. |
| Cards and Markdown | Create a scheduled card with a separate due date; preview suppresses script/image elements; verify created title and planned end through real daemon reads. |
| Concurrent edits | Desktop saves while iPhone-emulated editor retains an older version; conflict message appears, mobile draft remains, saved desktop title survives. Explicitly discard the mobile draft. |
| History and focus | Undo one title change through history; pin card to focus; reorder two focus entries using the arrangement dialog and verify persisted order. |
| Navigation and updates | Reach all seven views; create an update, mark it read, filter unread only, verify read receipt. This is not exhaustive CRUD coverage of every view. |
| Preferences and external changes | Save timezone/default view; reload verifies them. Modify a synthetic source file externally and verify watcher/SSE refresh in the UI and daemon. Set dark theme and verify it persists after reload. |
| Timeline gestures | Cancel a held move using Escape, synthetic `pointercancel`, orientation change, and second-pointer events without changing the resource version. Incoming real SSE during a held gesture preserves the baseline and causes a conflict on save. Move a schedule and preserve the independent due date. Resize end with a concurrent edit and retain the draft. |
| Board creation and sorting | Collapse/expand a column; keyboard quick-create; ensure card-level select/handle/details controls are absent; change status in editor; drag by card title with preview/drop indicator; verify order immediately; `Alt+ArrowDown` ordering; drag across status columns. |
| Board conflict/retry | Synthetic first-response failure retains command identity and exact body across retry. A concurrent real update during a held drag prevents stale placement. Quick-create retry retains title, disables duplicate Create, preserves command identity, and results in exactly one card. |
| Board pagination and scrolling | A review column with 51 cards loads 50 then 1. Drag auto-scroll advances and stops after Escape without saving. A drop before an unknown predecessor on page two is rejected. Per-project collapse and horizontal/vertical first-page scroll persist across view navigation, project switch, and reload. |
| Emulated touch | A second Chromium context uses the iPhone 13 device descriptor and copied authenticated storage. CDP touch input tests hold-to-drag persistence and immediate swipe scrolling without a drag preview. This is not Safari or physical touch hardware. |
| Calendar and dependencies | Milestone appears on timeline; week/day column counts and period navigation; `Alt+2` view shortcut; scheduled-card creation prepopulates start date; connect dependencies; verify forecast dates and that forecast is read-only; reject a dependency cycle; `Alt+ArrowRight` calendar move persists. |
| Search and support | Search Markdown content and exclude a non-match; clear search; show `NOT_A_GIT_ROOT` for a synthetic non-Git folder; open zero-issue host diagnostics. Successful Git repository observation is not tested. |
| Session loss | Revoke actual test sessions while card, planning, and settings drafts are open. UI leaves authenticated views; drafts and copy controls survive, including a pending settings command. |
| Layout/error checks | Dark/desktop/narrow screenshots; one document-width assertion at 390 × 844; primary desktop page must have no `pageerror`. Screenshots do not have automated pixel or contrast comparisons. |

### Controlled replacements and injected events

- Native folder selection endpoint returns synthetic `cancelled` and `selected` envelopes; selected registration plans come from the real CLI and final registrations are real. The OS file chooser itself is not tested.
- One Gantt GET returns synthetic 503 `SERVER_BUSY`; later real read must succeed.
- Timeline PATCH temporarily returns synthetic HTTP 202 `prepared`; retry then reaches the daemon.
- Board-move PATCH and card-create POST return one synthetic 503, then real requests are allowed. These exercise uncertain-result UI state and same-command retry, but are not a crash or a real response lost after durable commit.
- Settings PATCH returns synthetic 503 before real session revocation.
- Orientation/second-pointer/pointercancel events, some scroll positions, and interim screenshot themes are programmatically injected. The final persisted-theme test does use Settings UI.

## `planning-browser.mjs`

Uses one real synthetic project with three CLI-created cards and a dependency chain.

| Area | What is exercised and asserted |
| --- | --- |
| Timeline and dependencies | Gantt bars appear; connect another edge using connector buttons; first dependency PATCH returns synthetic 503; retry retains request ID, epoch, version, and payload; saved edges are verified; disconnect one edge without losing the other. |
| Forecast | Toggle forecast and take a screenshot. Numeric forecast computation and read-only enforcement are asserted in the larger smoke script, not here. |
| Calendar gestures | Native calendar drag with Escape leaves version unchanged; move one day and assert exact planned dates; resize end and start independently, save each change, assert exact editor dates and current resource version linkage. |
| Layouts/themes | Week, day, agenda, and month appearances; dark calendar/timeline screenshots; at 390 × 844 verify a timeline bar intersects the chart viewport. Screenshot themes are injected directly into the DOM. |
| Runtime/security signals | Assert no page errors, no recorded CSP violations, and no requests to another origin on the tested page. Console errors are printed, but absence of all console error messages is not an independent assertion. |

## Material gaps these scripts cannot close

No physical iPhone/Safari, Firefox, WebKit, screen-reader session, complete keyboard-only walkthrough, 200% zoom, reduced-motion walkthrough, accessibility contrast audit, or comprehensive long-title/Unicode/empty/error-state matrix. No sustained performance budgets or high-volume dataset beyond the board pagination fixture. No actual OS chooser, valid Git-root success, production TLS, daemon shutdown/restart recovery, real network loss after a committed write, or broad filesystem fault injection. Screenshots support visual inspection; generating them alone is not proof of visual quality. A full PASS would establish the listed flows in this environment, not every application function or release acceptance.
