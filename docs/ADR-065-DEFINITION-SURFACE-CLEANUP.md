# ADR-065 — Remove unused definitions and align supported API workflows

Status: accepted for the owner-authorized audit cleanup, 2026-10-04.

The definition/consumer audit found two registration operations present only in
OpenAPI, an unused indexed tag-suggestion endpoint, and CLI tag renames classified
as ordinary commands even though the server responds with a durable workflow.
The owner requested removal of the audit findings and verification of the result.

Remove `GET` and `DELETE /api/v1/registrations/{project_id}` and their unused
`RegistrationResource` schema. Those routes were never implemented. Unregistration
remains an explicit host-local maintenance plan/apply operation: it removes
registration and Focus references, preserves project sources and rechecks the
observed workspace version. No remote administrative route is introduced.

Remove `GET /api/v1/workspace/tag-suggestions`, its application implementation,
response schema, example and dormant browser cache. This retires the indexed
suggestion/cache portion of [ADR-032](ADR-032-SCOPED-PAGES-AND-TAG-SUGGESTIONS.md).
Its page identity and event metadata decisions remain in force. TagPicker reads
fresh names from the selected project's source-based tags endpoint; tag-change
notifications still invalidate that mounted picker. Milestones and the three
legacy workspace vocabulary/catalog/preview operations remain supported.

Named CLI `tags rename` and generic project-tag rename requests use the existing
workflow confirmation boundary. HTTP 202 with a valid accepted job exits 9 with
`ok=true`, the job ID and the original request ID/epoch. This establishes workflow
acceptance; callers inspect the job before reporting completion. Malformed replies
still preserve the original identity and uncertain result. Generic project-tag
preview requests are reads carrying JSON and acquire no durable command identity.
Retries retain the exact plan payload, request ID and epoch without another write.

Remove proven dormant helpers, variants, wrappers, tokens and excess dependency
features, retaining currently used behavior and tests of the production paths.
Generated representations are regenerated from the edited contracts. A real
daemon regression covers named/generic tag previews, accepted renames, original
command/job status, unchanged retries, removed routes and retained local
unregistration without source deletion. Focused Rust checks and the full gate
remain required; browser checks and a rebuilt manual application verify the
integrated cleanup rather than establishing physical-device release acceptance.
