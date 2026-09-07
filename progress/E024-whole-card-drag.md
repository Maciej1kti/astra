# E024 — Whole-card dragging and clean cards

Date: 2026-09-07. Supersedes E022's handle, on-card actions and manual drop
confirmation. The owner requested Trello-style card interaction, with no drag
arrows or status controls on the card.

## Result

Cards contain a title and metadata. Their entire surface is clickable and
draggable: clicking opens the existing editor; moving at least five pixels
starts dragging. On touch, a 250 ms hold starts dragging; moving before the
hold completes preserves ordinary scrolling. There are no on-card arrows,
status selectors or action menus. Alt+Up/Down provides keyboard reordering.

Dragging shows a full-card preview outside the clipped column, dims the source,
and displays an insertion line above the preview. Top/bottom placement uses
known neighbor IDs. Empty columns accept drops. Unknown page boundaries and
unchanged positions do not submit a command. Horizontal and vertical edge
scrolling are limited to approximately 450 px/s with a capped frame delta.

Drop automatically submits the existing versioned MoveChange command. There
is no extra confirmation click and no optimistic committed state. A conflict
retains the proposal; an uncertain result retains the same request ID, epoch,
payload and expected version for retry. The existing dialog handles errors and
pending commands. Server APIs and file contracts did not change.

The gesture captures its baseline when the pointer first goes down. Board
refreshes are deferred through the armed and dragging phases, including an
in-flight response. Cancellation covers Escape, pointer cancellation, lost
capture, another pointer, orientation changes, window blur, session loss and
component destruction. Each path removes the preview/indicator and stops the
animation loop.

Add card and pagination controls now live in the corresponding column footer.
Footers follow the existing SVAR column layout, disappear when collapsed and
retain keyboard activation. The aggregate All projects view remains an overview
and explicitly asks the user to select a project before reordering.

## Verification

The new title-drag regression failed against the previous release because no
card preview appeared. Previous tests had exercised only the arrow handle.
Browser tests now exercise actual pointer movement over the card surface and
inspect the server's saved result, not merely a DOM reorder.

The expanded real-HTTPS suite covers:

- No card arrows, status selectors or menus; click-to-edit and keyboard reorder.
- Full-card preview, insertion indicator and automatic save after drop.
- Cross-column status changes and unchanged retry identity after a simulated 503.
- CLI mutation during a held drag produces a conflict without overwriting it.
- Vertical auto-scroll, Escape cancellation and stopped scrolling after cancel.
- Column-footer creation and 51-card pagination; an unknown predecessor on page
  two prevents submission.
- CDP touch input on the mobile context: hold-to-drag saves the new order while
  an immediate swipe scrolls a long column and creates no drag preview.
- Existing calendar, timeline, pairing, persistence, session-loss and draft tests.

Test geometry now waits for stable bounds and retries detached-element lookup
at most twice. This addresses element replacement during asynchronous refresh;
it never retries a mutation. One touch-test coordinate initially fell in the
footer, so the test now starts inside the measured scrolling area.

Environment: Arch Linux x86_64, Intel Core i7-3720QM, Node 24.11.0,
Chromium 151.0.7922.173. Browser emulation is not physical iPhone, Safari or
macOS validation. No sustained-frame-rate or large-dataset latency claim.

Final production build: Vite 1.82 s; incremental Rust release build 20.21 s.
Initial JS 245.79 kB / 91.62 kB gzip; lazy Board JS 81.11 / 26.98;
lazy Board CSS 54.82 / 7.70. No new dependency was added.
`npm run check` reports zero Svelte errors/warnings and matching contracts.

Reproduction:

```sh
npm run build
scripts/cargo-local build --release -p projectd -p projectctl
ASTRA_TEST_PROFILE=release ASTRA_TEST_CHROMIUM=/usr/bin/chromium \
  node scripts/browser-smoke.mjs
```

Screenshots: `screenshots/desktop-board.png`, `screenshots/board-drag-preview.png`,
`screenshots/desktop-board-dark.png` and `screenshots/mobile-board.png`.
Final browser output is recorded in `checks/whole-card-browser.txt`.
