# Requirements and release acceptance

For the current product and contribution path, start with the
[roadmap](../ROADMAP.md), [limitations](../docs/LIMITATIONS.md) and
[contribution guide](../CONTRIBUTING.md). This directory preserves requirement and
acceptance traceability, including original handoff material.

| File | Purpose |
| --- | --- |
| [REQUIREMENTS.json](REQUIREMENTS.json) | Stable requirement IDs R01–R36 |
| [ACCEPTANCE.json](ACCEPTANCE.json) | Acceptance scenarios, statuses and evidence references |
| [BACKLOG.json](BACKLOG.json) | Original implementation task breakdown and dependencies |
| [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) | Maintained open checks before a supported release |
| [TRACEABILITY.md](TRACEABILITY.md) | Human-readable original requirement/test/task map |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Detailed original acceptance scenarios |
| [PLAN.md](PLAN.md), [BACKLOG.md](BACKLOG.md), [AGENT-ROLES.md](AGENT-ROLES.md) | Historical sequencing and responsibility model |

The older prose includes Polish and proposed behavior that later decisions changed.
It is reference material, not the current installation guide or live assignment
queue. [Owner scope decisions](../progress/SCOPE.md) supersede it. In particular,
built-in backup archives/source migrations are deferred and card dependencies were
removed; other unresolved requirements remain. The JSON source format is governed
by the current schema and ADR-046, not earlier YAML terminology.

The local gate validates IDs, dependencies and evidence paths. That traceability
check does not prove a scenario passed. Do not change acceptance from a documentation
cleanup or a passing build. Add revision/environment-specific evidence and obtain
the appropriate owner decision before claiming release acceptance.
