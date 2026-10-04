# Multi-user folder access review — 2026-10-04

Read-only architecture review of separate users with different project folders.
No multi-user implementation, product scope or acceptance decision was made.

Current Astra has one owner and multiple paired devices. Sessions identify devices;
the project registry, approved browsing roots and workspace state belong to the
instance. Approved roots authorize registration browsing, not access to already
registered projects. See [Architecture](../docs/ARCHITECTURE.md#runtime-topology),
[Limitations](../docs/LIMITATIONS.md#product-boundaries), and the Session, Workspace
and Root schemas in [OpenAPI](../contracts/openapi.yaml).

One daemon could support separate users by adding stable identities, user-linked
sessions, project/root grants and personal workspace state. Authorization would
need to cover direct reads/writes, aggregate views, search, events, command results,
jobs, history and administrative actions. This is a proposed design, not current
behavior; private versus shared projects remains to be specified.

Without that change, separate instances of the same binary can use separate data
directories, ports, HTTPS hostnames and registered project folders. Distinct
hostnames avoid collisions between the fixed browser session cookies. They must not
write the same project concurrently: the existing writer lease permits one daemon.
See [host setup](../INSTALL.md#run-your-own-host) and
[write ownership](../docs/ARCHITECTURE.md#write-and-recovery-path).

Evidence: maintained guides, contracts, authentication/admission, workspace/root
storage and writer-lock implementation were inspected. No runtime configuration
or application code was changed; no application tests or restart were required.
`scripts/check_package.py` passes, including Markdown links and contract examples.
