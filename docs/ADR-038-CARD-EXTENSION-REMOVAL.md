# ADR-038: Remove card metadata extensions and card-targeted reports

## Status

Accepted — 2026-09-22

## Decision

Card metadata has a closed field set. Card source documents, domain validation,
OpenAPI schemas, generated contracts, create and patch payloads, and historical
undo validation no longer accept or emit `x-*` extension fields. Milestone and
update metadata retain their existing bounded extensions. Shared targets remain
available wherever cards are valid targets for non-report features.

The Rust card wire model is strict and does not flatten an extension map. A
card source containing an extension is rejected before a mutation can write it.
The same validation rejects extension fields in create, patch, and an old undo
snapshot; rejected operations leave the current source bytes unchanged.
Report metadata targets are limited to projects and milestones. Card-targeted
report create requests, source documents, report filters, and CLI target syntax
are rejected. The shared target model remains card-capable for attention and
other non-report features.

## Compatibility and cleanup

Inspection of the five live cards, including the archived card, across the two
registered projects found zero card extensions and zero card-targeted reports,
so no cleanup write is required. Existing examples and parser fixtures are
updated to use the closed card metadata shape. Project and milestone reports
remain supported. This decision does not add a source migration framework or
alter the retained milestone and update extension contract.

## Consequences

Clients must keep card-specific metadata in the defined fields. Sending a card
`x-*` field receives normal schema validation failure and must not be retried
with the same unsupported payload. Unrelated edits preserve card body and
supported metadata; milestone and update extensions continue to round-trip.
