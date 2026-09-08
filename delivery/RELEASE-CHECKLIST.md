# v1 release checklist

[Owner scope decisions](../progress/SCOPE.md) take precedence. Built-in backup
archives and source-format migration frameworks are deferred beyond v1. Their
remaining stopped-copy recovery and operational-state obligations still apply.

Each item needs revision-specific test evidence or an explicit owner decision.
Unchecked items are not claims that the implementation is absent; they indicate
that full release acceptance has not been established.

- [ ] Requirements R01–R36 are covered; no required view was removed without an owner decision.
- [ ] Normal writes use the coordinator; versions, retry identity, epochs and uncertain outcomes are verified.
- [ ] The fault matrix is exercised with no unresolved class of data loss.
- [ ] Registration preserves existing AGENTS and `.project` content, exact-folder selection and browser root authority.
- [ ] Physical iPhone editing, touch move/resize/scroll and shared desktop/phone sources are verified.
- [ ] Board, calendar, Gantt, list, focus, projects and updates work against the real server.
- [ ] Private HTTPS access, pairing/revocation and CSRF/Origin/Host protections are verified.
- [ ] Markdown, path/source parsing and Git observation have abuse coverage; archive parsing applies only when that deferred feature exists.
- [ ] Stopped-server copy/recovery restores sources, workspace and focus, rotates the epoch and revokes old sessions. Built-in archive tooling remains deferred.
- [ ] Deleting/rebuilding the index preserves durable operational state.
- [ ] Release performance includes server/client costs; targets pass or deviations are explicitly accepted.
- [ ] macOS ARM64 and Arch/Omarchy installation works without runtime Node, Docker or root; environments are recorded.
- [ ] Upgrade and old-client flows preserve drafts and reject incompatible contracts.
- [ ] Logs, fixtures and release packages contain no private data or tokens.
- [ ] Lockfiles, package checksums, third-party notices and a dependency license inventory are present; paid dependencies require approval.
- [ ] User and agent instructions have been followed successfully from a fresh setup.
- [ ] Known product limitations are distinguished from missing verification evidence.
- [ ] The owner has chosen the project license and approved the supported release. A public source checkpoint alone is not a supported release.
- [ ] A private security-reporting channel and supported-version policy are documented.
- [ ] README, contribution guide and maintained architecture describe the shipped version; obsolete handoff instructions are removed or clearly historical.
