# ADR-057: Bounded Rust reader for the Focus widget

Status: accepted implementation optimization, 2026-10-01. Since 2026-10-07 the
Omarchy widget lists Astra hosts and no longer calls this reader; the
command and its contract remain. Since 2026-10-10 the widget is developed in
[its own repository](https://github.com/Maciej1kti/astra-omarchy).

The optional Omarchy status helper starts Python and reads up to five full card
resources after reading Focus membership. Current servers already include bounded
card summaries in the same Focus projection snapshot (ADR-051). The widget only
needs titles and statuses, so source bodies and separate reads are unnecessary.

`projectctl focus-preview` maps that snapshot into five ordered preview rows using
the existing Rust CLI and checked, UID-authenticated Unix transport. It retains
an explicit absolute socket, the 100-pin membership bound, 2 MiB per response,
two seconds per request and a six-second whole-read budget. Reads require the
documented HTTP 200; another success status cannot become a claimed 200. A lower CLI timeout
shortens the budget. Titles/statuses are limited to 300/40 Unicode characters.

Missing, invalid, unavailable and stale summaries remain unavailable placeholders
in their membership position. A modern host never triggers a speculative detail
read. A reference-only host retains up to five ordinary card reads within the same
budget; a failed detail leaves that pin unavailable. Malformed Focus membership
or summaries fail the read. No source cache, editable version, write command,
background service or implicit project discovery is introduced.

The existing CLI envelope/error/exit conventions remain; its schema documents
`FocusPreview` data and a validated example. There is no new HTTP endpoint,
OpenAPI field or source/storage format. Source validation and command durability
remain server-owned. The QML widget consumes the CLI envelope through its existing
process/watchdog lifecycle. The separate Python window launch helper remains.

Native CLI regressions cover order, five-row bounds, literal/unicode text, stale
and missing entries, old hosts, invalid path identifiers, response limits and a
shortened whole deadline. Release comparisons include complete process startup
against the normal daemon; they do not establish Linux shell/QML acceptance on a
macOS host. Runtime coverage and timing limits belong in the
[iteration evidence](../progress/2026-10-01-widget-focus-reader.md).
