# ADR-061: Shared project sources between trusted profiles

Status: accepted owner direction, 2026-10-04. Extends
[ADR-060](ADR-060-TRUSTED-USER-PROFILES.md).

The owner requested naming the existing profile Maciek, adding Tomek and sharing
the existing exercise project between them. Keep the trusted profile model and
ordinary registration flow. Registering the same exact folder in another profile
adds membership in that profile; it does not copy or initialize a second project.
Nested `.project` source trees remain rejected.

All engines in one host share a workspace operation gate and a pool of project
store handles. Each source folder retains one writer lease and one mutex around
source validation and prepare/write/commit. Each profile keeps its own durable
workspace, roots, journal, receipts, history and index. Source mutations check
pending recovery in every participating journal under the shared project lock;
the existing recorded rejection and same-command retry rules still apply. Each
profile receives the shared coordination before recovering its own state; the
host opens listeners only after every profile has opened. Other daemon instances
cannot borrow these leases.

Project/card/report sources, counter configuration and recorded values are shared.
Source Focus pin membership is also shared; admission checks the bounds of every
workspace registering that exact project ID and folder. Focus ordering, report
read receipts and workspace preferences remain personal. History is retained in
the profile that submitted the command, and undo still requires the current source
version. Native source watchers refresh each participating projection and SSE
stream; reads never select a second copy of a shared source.

Unregistering a project removes only the selected profile's membership. Deleting
or relocating a project while other profiles register it is rejected with
`PROJECT_SHARED`; remove those registrations first. This keeps destructive
multi-workspace workflows outside the initial sharing implementation.

Profile names can be changed with `PATCH /api/v1/users/{id}` and `{name}`. The
required `If-Match` is the observed `UserList.version`, a version of the sorted
profile registry independent of the selected user. Rename uses the root command
journal and epoch. Its registry update and committed response are one SQLite
transaction, preserving replay identity across interruption. The default name is
stored in root metadata and defaults to Owner on existing installations. Renaming
does not change profile IDs, folder membership, existing attribution or epochs.

There are no per-user permissions, separate private copies or per-person counter
totals inside a shared card. Every paired device can still select every profile.
Shared sources and all participating operational journals must be backed up and
restored together with the host stopped.
