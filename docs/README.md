# Documentation

## Using and contributing

- [Product overview](../README.md)
- [Development setup](../DEVELOPMENT.md)
- [CLI guide](../CLI.md)
- [Manual walkthrough](../MANUAL-TESTING.md)
- [Installation](../ops/PACKAGE.md) and [stopped-server recovery](../ops/RECOVERY.md)
- [Contributing](../CONTRIBUTING.md)
- [Code structure and ownership](CODE-STRUCTURE.md)
- [Current status](../progress/STATE.md) and [release checklist](../delivery/RELEASE-CHECKLIST.md)

## Contracts and architectural decisions

[Source schemas](../contracts/domain.schema.json), [OpenAPI](../contracts/openapi.yaml)
and [CLI output](../contracts/cli-output.schema.json) describe the public formats.
[Architecture decisions](12-ADRS.md) explain choices and invariants. Generated
TypeScript and JSON representations are checked for drift by the local gate.

The numbered chapters retain original implementation requirements. In particular,
read [source formats](03-DATA-FORMAT.md), [writes and recovery](04-WRITES-AND-RECOVERY.md),
[API/events](05-API-AND-EVENTS.md) and [security](07-SECURITY.md) before changing
those contracts. Some handoff prose is still Polish; it remains a requirement
reference, not the contributor onboarding path or proof of completion.

[Owner scope decisions](../progress/SCOPE.md) supersede older wording. Deferred
backup archives/source migrations and unverified physical-device acceptance must
not be silently marked complete. [Delivery requirements](../delivery/REQUIREMENTS.json)
and [acceptance scenarios](../delivery/ACCEPTANCE.json) remain traceable.

## Historical material

[Progress](../progress/README.md) contains concise implementation and verification
records. Obsolete bulk artifacts are available at the linked immutable checkpoint.
A historical test result applies to its revision, not automatically to current code.

For an offline consolidated copy of the requirement chapters, run
`python scripts/assemble_spec.py`. Output goes to ignored
`test-results/docs/MASTER-SPEC.md`; edit source chapters, not that generated copy.
