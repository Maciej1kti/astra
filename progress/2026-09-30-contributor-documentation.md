# Contributor and self-build documentation

The owner requested current English documentation for a repository with multiple
contributors, while deferring the project license. This documentation change was
first checked against application revision `fda5849be27d5b2751ed2c71a26f17e53d7e0ba6`,
including the concurrently completed empty-counter action. After the concurrent
Attention change at `7c6938c`, the full gate was repeated successfully and the
performance evidence links were updated. The following `249c761` checkpoint changes
only evidence. This task changes no application code, protocol, product scope or
acceptance status.

## Result

- Reworked the README and documentation index around user, operator and contributor
  paths. Added a source-build/installation guide, user guide, architecture/repository
  map, limitations/platform matrix and a scope-preserving roadmap.
- Added ASCII diagrams for runtime topology, data ownership, reads, durable writes,
  repository layout, planning and release/document relationships.
- Documented exact pinned toolchains, frontend-first embedding, trial versus
  installed runtime, private HTTPS, pairing, explicit registration, Git mode,
  packaging, optional user services, upgrades and stopped-copy recovery.
- Updated contribution/development guidance and added bug, feature and pull-request
  templates. Clarified verification, coordination and documentation ownership.
- Corrected stale dependency/forecast claims, project-folder editing, missing-day
  counter semantics and the old split card layout. The package's own guide remains
  self-contained. CLI report creation and attribution are explicit.
- Marked 23 historical chapters/reports as reference material while preserving
  their original contents after the notices. Kept unresolved requirements and
  immutable evidence references. Replaced the obsolete active cleanup plan with
  current navigation and a link to its immutable predecessor.

## Verification

Environment: macOS 27.0 ARM64; Node 24.11.0, npm 11.6.1, Rust/Cargo 1.92.0 and
Python 3.14.6. Existing pinned dependencies were used; this was not a fresh-machine
dependency installation.

| Check | Result |
| --- | --- |
| `.venv-check/bin/python scripts/check.py` | Initial and combined gates passed: 255 Rust, 137 JavaScript and 12 Python tests; contracts, examples, links, Svelte (zero errors/warnings), boundaries, formatting, Clippy, bundle check and release build |
| `scripts/check_package.py` after documentation edits | Passed schemas/examples, local links, traceability, SQLite and template checks |
| Markdown parser review | Local file and heading anchors resolved; ASCII blocks checked; historical body preservation verified |
| Local Markdown preview | README, installation, architecture, user guide and roadmap rendered with tables/code blocks at desktop and 390px widths; no page overflow; README and architecture visually inspected |
| `scripts/package.py` | Built the macOS ARM64 archive with current installation/recovery guides and third-party notices |
| `scripts/release-smoke.py` | Passed checksum, repeat installation into a path with spaces, no auto-start, packaged daemon/CLI, graceful stop/restart, stopped-copy recovery, index rebuild and old-epoch rejection |
| `git diff --check` | Passed |

Bulk logs, preview HTML/images and review scripts are under ignored
`test-results/docs/`; the archive is under ignored `dist/`. The previews check
Markdown readability, not GitHub's live renderer. Service-enable commands were
reviewed against the generated paths but not executed. No network configuration,
installed service or existing manual application's lifecycle was changed by this
documentation task. The full gate rebuilt binaries as part of its normal checks.

Physical devices, Linux/ext4, login-start, a new clean-machine walkthrough,
power-loss and full release acceptance were not established here. Application
browser suites were not rerun for prose-only changes. Remote CI is separate from
the local results above. License selection and security-support/reporting decisions
remain open with the owner.
