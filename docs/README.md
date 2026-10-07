# Documentation

The maintained user and contributor guides are in English. Start with the path
that matches your task; historical requirements are indexed separately below.

## Use and operate Astra

| Guide | Contents |
| --- | --- |
| [Overview](../README.md) | Product, capabilities, quick start and license status |
| [Build and install](../INSTALL.md) | Prerequisites, source build, trial, foreground host, package, pairing and upgrades |
| [User guide](USER-GUIDE.md) | Views, cards, dates, Focus, the Agent dialog, reports, recovery and deletion behavior |
| [CLI reference](../CLI.md) | Implemented commands, JSON/text output, versions and safe retries |
| [Manual walkthrough](../MANUAL-TESTING.md) | Synthetic trial, remote trial access and practical checks |
| [Operations](../ops/README.md) | Configuration and host lifecycle |
| [Package guide](../ops/PACKAGE.md) | Self-contained instructions also included in built archives |
| [Stopped-server recovery](../ops/RECOVERY.md) | What to copy, how to restore and what must be preserved |
| [Limitations](LIMITATIONS.md) | Product boundaries, platform coverage and unverified acceptance |
| [Roadmap](../ROADMAP.md) | Implemented scope, remaining work and owner decisions |

## Contribute and understand the implementation

| Guide | Contents |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Issues, scope, branches, ownership, review and evidence |
| [Development](../DEVELOPMENT.md) | Build loop, focused/full checks, browser suites and benchmarks |
| [Architecture](ARCHITECTURE.md) | Runtime/storage/write diagrams and repository map |
| [Code structure](CODE-STRUCTURE.md) | Specific feature/module owners, lock order and test boundaries |
| [Design system](DESIGN-SYSTEM.md) | UI tokens, components, responsive behavior and interaction ownership |
| [Motion system](DESIGN-SYSTEM.md#motion-vocabulary) | Soft entrances, layer order, timing tokens, Calendar, desktop/mobile behavior and extension rules |
| [Security reporting](../SECURITY.md) | Reporting status, sanitization and dependency advisory checks |
| [Scripts](../scripts/README.md) | Tool entry points and generated artifacts |
| [Browser suites](../scripts/browser/README.md) | Real-host integration coverage and suite selection |
| [Omarchy integration](../integrations/omarchy/README.md) | Optional Linux desktop integration |

## Contracts and decisions

| Reference | Authority |
| --- | --- |
| [Source schema](../contracts/domain.schema.json) | Project resource and workspace JSON structures; server rules add semantic validation |
| [OpenAPI](../contracts/openapi.yaml) | HTTP endpoints, request/response schemas and errors |
| [CLI output](../contracts/cli-output.schema.json) | Stable machine-readable CLI envelopes |
| [Local IPC](../contracts/local-ipc.json) | Host-local administrative transport contract |
| [Examples](../examples/README.md) | Validated synthetic documents and protocol vectors |
| [Architecture decisions](12-ADRS.md) | Rationale and invariants; later decisions can supersede earlier ones, such as [ADR-070](ADR-070-AGENT-RUNS.md) for the optional in-app agent and [ADR-074](ADR-074-PROJECT-CREATION-AND-REPOSITORIES.md) for projects added by name |
| [Owner scope decisions](../progress/SCOPE.md) | Explicit scope overrides, deferrals and removals |

Generated schema representations and TypeScript types are checked for drift by
the full gate. Edit their source contracts and run the documented generators;
do not edit generated files by hand.

## Document authority and history

Use current guides for operating the application and locating code. For a proposed
change, read its contracts and applicable ADRs as well as the owner scope decisions.
If observed code differs from its contract, record and resolve that discrepancy;
do not silently redefine the contract in prose.

```text
  Owner scope decisions        explicit changes to intended scope
            |
  Contracts + applicable ADRs  current formats and invariants
            |
  Maintained English guides   current user/contributor behavior
            |
  Retained requirements       open obligations, subject to later decisions

  Dated evidence              proof for a particular revision/environment
  .project/                   project outcomes, milestones and dates
```

The numbered chapters `00` through `14` retain the original implementation
requirements and decision history, including Polish prose. They are not the
onboarding path, a command reference or a claim that every requirement shipped.
Some passages have later clarifications. Their open obligations remain tracked;
labeling a chapter historical does not cancel a requirement.

| Retained chapter | Current starting point |
| --- | --- |
| [00 Decisions](00-DECISIONS.md), [01 Product](01-PRODUCT.md) | [Roadmap](../ROADMAP.md), [scope](../progress/SCOPE.md) |
| [02 Architecture](02-ARCHITECTURE.md) | [Architecture](ARCHITECTURE.md), [code ownership](CODE-STRUCTURE.md) |
| [03 Data format](03-DATA-FORMAT.md) | [Source overview](ARCHITECTURE.md#source-format), schema and ADR-046 |
| [04 Writes/recovery](04-WRITES-AND-RECOVERY.md) | [Write path](ARCHITECTURE.md#write-and-recovery-path), applicable ADRs |
| [05 API/events](05-API-AND-EVENTS.md) | OpenAPI and typed endpoint modules |
| [06 CLI/agents](06-CLI-AND-AGENTS.md) | [CLI](../CLI.md), managed project instructions |
| [07 Security](07-SECURITY.md) | [Security reporting](../SECURITY.md), [architecture](ARCHITECTURE.md#security-and-operations-boundaries) |
| [08 UI/interactions](08-UI-AND-INTERACTIONS.md) | [User guide](USER-GUIDE.md), [design system](DESIGN-SYSTEM.md) |
| [09 Performance](09-PERFORMANCE.md) | [Limitations](LIMITATIONS.md#reliability-and-performance-acceptance), dated release measurements |
| [10 Operations](10-OPERATIONS.md) | [Installation](../INSTALL.md), [recovery](../ops/RECOVERY.md) |
| [11 Quality/tests](11-QUALITY-AND-TESTS.md) | [Development](../DEVELOPMENT.md), [release checklist](../delivery/RELEASE-CHECKLIST.md) |
| [12 ADRs](12-ADRS.md) | Same decision index; follow later superseding ADRs |
| [13 Risks](13-RISKS-AND-OPTIMIZATIONS.md), [14 Sources](14-SOURCES.md) | [Limitations](LIMITATIONS.md) and the cited decision's original references |

`delivery/REQUIREMENTS.json` and `delivery/ACCEPTANCE.json` retain stable IDs for
traceability. Older delivery backlogs are historical sequencing, not today's work
queue. [Current status](../progress/STATE.md), [evidence policy](../progress/README.md)
and the [release checklist](../delivery/RELEASE-CHECKLIST.md) distinguish implementation
from acceptance. Original reports and retired bulk artifacts remain available
through immutable checkpoint links; no open requirements are removed by this index.

To assemble the retained chapters offline, run `python3 scripts/assemble_spec.py`.
Output goes to ignored `test-results/docs/MASTER-SPEC.md`; edit the chapters, not
that generated copy. See [documentation maintenance](../CONTRIBUTING.md#documentation-changes)
when updating a guide.
