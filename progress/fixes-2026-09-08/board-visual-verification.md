# Board and dialog browser verification

Date: 2026-09-08. Evidence: `board-dialog-browser/results.json` and adjacent PNGs.
The root integration runner executed the real release application through normal
pairing in Chromium 153.0.8010.12, with only the synthetic HTTPS certificate
accepted by the test browser. CSP and application authentication stayed enabled.

## Verified behavior

The final run passed all six targeted checks with no page errors:

- Board mounted with `style-src 'self'` and no `unsafe-inline`; its theme wrapper
  had no style attribute and no CSP violation occurred across both themes,
  1440/390/320 px layouts, collapse/expand and a cancelled whole-card drag.
- One card retained one interactive action and separate hard deadline, plan and
  review fields. The comma-containing label remained one chip. Target dates were
  separately identified. Cancelling drag preserved the saved status.
- Settings disabled unchanged Save and current-browser sign-out for dirty
  preferences. All submitted fields stayed frozen after an injected 503. Explicit
  retry retained the same request ID, epoch, version and body. The test discarded
  that pending draft and confirmed saved preferences stayed unchanged.
- Focus keyboard movement kept focus with the card, including boundary handling.
  Moving back restored unchanged order. Discard confirmation focused Keep editing
  and restored the initiating control. Ctrl+Enter saved the intended order.
- The Updates tab was fully visible after opening its direct URL and reloading at
  390 px. The final screenshot waits for connection and resources to settle.
- A08 exercised the actual mobile Sign out action at 390 px. The button was fully
  inside the viewport; clicking it ended the runner's synthetic browser session,
  returned to Connect your browser and Request access, and removed the paired
  workspace's Project selector. This is a performed interaction, not an inference
  from the button's presence.

## Visual inspection

Reviewed light and dark Board at desktop and narrow widths, Settings at 320 px
(normal and pending), Focus order at 320/390 px, and the direct-URL Updates shot.
Cards now have distinct muted-column/panel-card surfaces and complete borders.
Urgent, blocked and hard-deadline text stays legible in both themes. Long titles
and the 48-character unbroken tag wrap inside the card. No document horizontal
overflow was measured at any tested width.

Settings and Focus order keep their modal/footer inside the viewport, wrap action
rows and long text, and have no body horizontal overflow. At 320 px, pending
Settings content requires inner scrolling to expose the entire retry control;
the successful test click establishes that it is reachable. The sticky footer
remains visible. An optional later refinement could prioritize Retry in that
footer during an uncertain save.

The desktop dark Board shot retains horizontal scroll from the preceding narrow
layout; its partially clipped first column is the intentional scroll surface.
Full-page screenshots of native dialogs include page content below the physical
viewport; this is a screenshot artifact. The measured JSON modal/footer bounds,
rather than the total PNG height, establish that the dialog itself and its footer
fit the actual tested viewport, including 320/390 × 844 px.

## Test limits and initial fixture correction

The first attempt stopped before browser checks because a synthetic tag was 49
characters. The server correctly rejected it against the 48-character contract;
the test fixture was corrected. That failure was not an application defect.

These are Chromium screenshots and browser interactions, including narrow
viewports. They do not establish physical iPhone/Safari touch or keyboard behavior.
Full real-device acceptance remains open. The broader maintained browser suite
owns successful drag/drop persistence, touch scrolling and gesture conflicts.

No additional application correctness/security issue was found during the final
source review of the Board, shared metadata, Settings and Focus order changes.
Untrusted display content remains escaped text; no raw HTML, remote asset loading,
authentication bypass or relaxed Content Security Policy was introduced.
