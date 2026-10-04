# ADR-060: Trusted user profiles in one daemon

Status: accepted owner direction, 2026-10-04.

The initial one-profile-per-folder restriction is superseded by
[ADR-061](ADR-061-SHARED-PROFILE-PROJECTS.md), which adds shared source folders and
conditional profile renaming while retaining trusted selection.

The owner needs two or more trusted people to select their own project folders
inside one application instance. The previous single-workspace model shared
project registration, approved roots, preferences, Focus order and read receipts
between every paired device.

Keep one daemon, Unix socket, HTTPS origin and central pairing/session authority.
Add a durable registry of UUIDv4 profiles, with the initial Owner referencing the
existing root engine and its unchanged data and command epoch. Each additional
profile has a separate engine and durable workspace, approved roots, journal,
history, receipts and disposable index. Project sources remain in the registered
folder's `.project/`; creating or switching profiles does not move or copy them.
One exact project folder can be registered in only one profile in this instance.

`GET /api/v1/users` returns registry items, `current_user_id` and the root creation
epoch. `POST /api/v1/users` durably creates a caller-identified profile through
the root journal and retains ordinary request ID/epoch retry semantics. The
operational database upgrades to version 3; durable creation intentions allow
startup to complete an interrupted creation before admission. A ready profile
whose state has gone missing must fail visibly rather than silently recreate it.

`X-Astra-User` selects the engine for HTTP and local content endpoints; omission
selects Owner. SSE uses the `user_id` query because native EventSource cannot set
that header. Bootstrap identifies the selected profile. CLI `--user` overrides
`ASTRA_USER`; neither a project path nor a browser selection implicitly chooses
a CLI profile. Content command/status/retry routing keeps its original profile,
while registry creation and device pairing always use the root authority.

The browser holds one selected profile per tab. Explicit switching checks draft
and command state, persists the next selection and reloads that tab. Other open
tabs keep their selection; new tabs inherit the browser's last selection. Profile
creation also retains its immutable root command scope through uncertainty.

Every paired device can select every profile. This is a trusted workspace model,
not an authentication or authorization boundary between people. There are no
passwords, roles, profile grants or shared-project semantics. Separate instances
remain the supported option when users need private access isolation. Central
session revocation, CSRF, Origin validation, conditional writes, durable recovery
and source validation remain required for all selected profiles.

Verification covers existing Owner data, independent engine state, profile
creation/recovery, duplicate-folder rejection, selected HTTP/CLI scopes, SSE,
browser creation/switching, retained tabs, draft protection and narrow keyboard
layout. It does not establish team access control or physical-device acceptance.
