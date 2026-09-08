# Current development plan

The [release checklist](../delivery/RELEASE-CHECKLIST.md),
[acceptance scenarios](../delivery/ACCEPTANCE.json) and
[owner scope decisions](SCOPE.md) define remaining obligations. Historical task
statuses are not a substitute for revision-specific acceptance evidence.

## Current work

Prepare a maintainable public product: simplify feature ownership and typed
boundaries, curate historical artifacts, and provide clear development and
contribution documentation. The safety checkpoint is
`2a5530a8bb83eec0c3f6f289cac8587aa9d66898`; this cleanup is local until reviewed.
The owner deferred the license decision.

## After the cleanup

Use owner feedback and the release checklist to select the next product slice.
Preserve the existing Kanban scope freeze. Remaining full acceptance includes
physical iPhone/Safari, Arch/ext4, power-loss and performance/reliability evidence;
automated local checks do not substitute for these requirements.

Run `.venv-check/bin/python scripts/check.py` before integration and the release
browser suites for affected interactions. A release decision also needs package
installation/recovery verification and clean, version-specific documentation.
