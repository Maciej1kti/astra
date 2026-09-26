# Clear test updates — 2026-09-26

At the owner's explicit request, removed all 64 existing update/report sources
from the two registered test projects (62 Astra, 2 loai). The 7 cards, their
comments and both project documents remain byte-for-byte unchanged. Workspace
settings, Focus pins, pairing, instance identity and command epoch are retained.

The normal report API is append-only. This was a one-time source-data cleanup
with the manual daemon stopped and instance/project leases held. Observed API
versions were checked against source hashes, the complete report inventory was
rechecked under the leases, and unresolved operational work was absent. Original
files and the cleanup manifest are retained in ignored owner-only evidence at
`test-results/clear-updates-2026-09-26/`. Tracked Astra reports also remain in
Git history at commit `7d37893`.

After restart, both projects validate, both report collections return zero items,
and the existing HTTPS address returns 200. No application code changed. No new
project report was appended because the requested outcome is an empty Updates
collection. Existing owner edits to project/card sources are not committed here.
