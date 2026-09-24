# Source-backed Focus and project tags — 2026-09-24

Focus pin membership is now the optional `pinned` card metadata field in
`.project/cards/*.md`; `workspace.focus` only ranks source-pinned cards. The
card editor and CLI use versioned card patches, and deletion checks the same
source field. A second workspace reading the same project sees the same pins.

Project tag names are derived from exact labels on that project's cards. The
browser and typed CLI read a project catalog rather than the legacy workspace
vocabulary. Rename/merge prepares one bounded, durable project workflow and
submits it with one command identity. Preflight checks all source bytes and
card filenames before the first write. A change after preview rejects the
plan without writing; a conflict during execution stops the recoverable job
for review. No all-or-nothing filesystem transaction is claimed.

The local automated gate passed on Linux: schemas/examples/OpenAPI, Python,
98 JavaScript tests, Rust tests, formatting, Clippy, bundle budget and release
build. The release Chromium broad HTTPS smoke, planning browser test and all
11 maintained regression suites passed. This is browser emulation, not a
physical iPhone or Safari test.

The verified release build was started on Linux and Mac Mini. The union of
their three former host-local Focus pins was written through versioned card
patches to `.project/cards/*.md`, committed and synchronized. Both daemons now
return the same three Focus card IDs; their order differs as an intentionally
local preference. Both return the same project tag catalog and catalog version
(`cokolwiek`: 2 cards; `flaga-test`: 1 card). Source validation reports 44
checked documents, no issues on each host. Mac Mini's web and Rust release
builds pass. Browser tests ran on Linux Chromium; no physical iPhone or Safari
check was performed.
