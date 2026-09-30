# Retained draft clock context, 2026-09-30

The broad release HTTPS smoke found a session-loss regression after the compact
schedule summary was introduced. App passed the display label `workspace time`
when bootstrap was cleared. Schedule/counter formatting treated it as an IANA
timezone and threw, interrupting the preserved editor's updates.

The focused session regression reproduces six `Invalid time zone` exceptions and
a comment field left enabled. It combines a remotely changed workspace timezone,
scheduled card, existing/new counter dates and an unsent comment before ordinary
session revocation. The corrected release run has no page errors, retains dates
and drafts, and disables the comment input after access ends.

Session owns the last authenticated timezone separately from bootstrap. Accepted
bootstrap/preferences responses update both; session loss still clears bootstrap,
reads and event-stream admission. Editor/planning consumers receive the retained
clock context. The UTC initial value applies only before any accepted bootstrap;
there is no local-device timezone substitution or authorization fallback.

The broad smoke also waits for the board title's existing stable hitbox before
opening its status editor after quick creation. The first run missed that opening;
the subsequent run reached session revocation and exposed the reproducible clock
exception. Opening/status/write assertions remain intact.

Final integration/browser/manual verification is recorded with
[the calendar iteration](2026-09-30-calendar-rendering.md). Neither this correction
nor its report changes scope or acceptance.
