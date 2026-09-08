# ADR-029 — Bounded report history by target (2026-09-08)

Status: accepted for the owner-authorized code health implementation.

Card activity previously downloaded every report in the project before selecting
its target. A card's short history could fail when unrelated reports reached the
client's collection bound. The existing report collection now accepts the optional
pair `target_type` and `target_id`. Both fields must be supplied together;
`target_type` is `project`, `card` or `milestone`, and `target_id` is a canonical
UUIDv4. Invalid pairs and target filters on other resource collections return
HTTP 422 `INVALID_TARGET_FILTER`.

`GET /api/v1/projects/{project_id}/updates` applies both target fields to the
derived report metadata before sorting and pagination. The same filters are
available on `GET /api/v1/views/list?type=update`; its optional `project_id` retains
the existing workspace/project scope. The pair participates in cursor identity,
so changing the target invalidates an old cursor. The default page remains 50
summaries, with a maximum of 200. Report bodies still require the detail endpoint.
Deleting a target source does not erase its report history or require recreating it
before querying the derived reports.

The projection adds a disposable composite report-target index. Source report
files, append-only semantics, read receipts, authorization, command identities,
and durability do not change. Clients keep explicit pagination and recover from
`CURSOR_STALE` by loading a fresh first page; they do not raise an all-records cap.

Verification covers more than 20,000 unrelated reports, type/project isolation,
bounded pages without duplicates, cursor target identity, invalid filter pairs,
and the existing transport and SummaryPage contracts. See
`examples/requests/card-report-history.json`.
