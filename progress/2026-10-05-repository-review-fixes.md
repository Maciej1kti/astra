# Repository review fixes — 2026-10-05

The owner asked for a review of the repository and then authorized fixing all of
its findings. The review read the Rust workspace and the browser application; its
findings were confirmed in the source before any change. This record covers the
resulting changes at the revision that contains it, starting from `0073d7f`.

## Resolution

Each behavior change began with a regression that failed for the reviewed reason.

- **Writes blocked after `PREPARED`.** A failure before the rename or unlink left
  the command pending and refused every later write to the project until restart.
  Such intents are now withdrawn: a changed target is the recorded
  `VERSION_CONFLICT`, other storage failures forget the command so the unchanged
  request retries. Six writer regressions returned `202 prepared` before the fix.
- **Recovery only at startup.** The next write completes this journal's
  interrupted intents with the startup rules; a conflicting external edit still
  becomes `needs_review` and no source bytes are overwritten.
- **Transient failures journaled as rejections.** An unreadable source and the
  delete path's recovery refusal are no longer replayed for the same request ID.
- **Malformed resource IDs.** `GET/PATCH/DELETE` on a collection resource with a
  non-canonical ID returned `503`; it is now `404 RESOURCE_NOT_FOUND`.
- **Admission.** The local socket and network listener have separate pools, and a
  network body is collected only for a verified session or the pairing routes.
  Before the fix an unauthenticated request waited for its body with a permit held.
- **Production panics.** 102 `unwrap`/`expect` sites in request paths return errors;
  nine `#[expect]` annotations with reasons remain, and the lints are enforced for
  non-test code. Directory listing uses the held descriptor.
- **Session loss with an open dialog.** The pairing page was inert beneath modal
  dialogs. Pairing now opens above retained dialogs and returns the same draft and
  request ID. Dialogs with nothing to lose close.
- **Refused event stream.** A non-200 reply closed the stream permanently. It is
  now replaced with bounded backoff once bootstrap confirms the session.
- **Command owners.** Session access, unload guards, the conflict flag and the
  request-ID/check/retry controls are shared; date, move, tag and registration
  dialogs gain the unload guard. Settings records a version conflict and offers an
  explicit, read-only reload that keeps edited fields.
- **Presentation.** Transport and invalid-response failures are distinct and
  remain uncertain for mutations; raw error text no longer reaches Board,
  Timeline or Calendar. Polish count forms use the shared locale. Smaller fixes
  cover the first-visit session notice, retained checklist/tag entries on pin,
  released paging state, tag-change notification order and status announcements.
- **Hygiene.** The `devalue` advisory is cleared, workflow actions are pinned to
  commit SHAs with a crate download cache, a dead ignore rule is removed, three
  owner reports move beside their evidence, and the status page is an index.

[ADR-066](../docs/ADR-066-DEFINITE-OUTCOMES-AND-ADMISSION.md) records the server
decisions. Schemas, OpenAPI operations and source formats are unchanged.

## Rejected and deferred

- **Duplicate flush.** `sync_file` calls `sync_all` and `F_FULLFSYNC`. A release
  probe on the development host (macOS, APFS, 3 × 200 synced appends) measured
  3.05–3.14 ms for `sync_all`, 3.03–3.09 ms for `F_FULLFSYNC` and 3.09–3.39 ms
  for both; plain `fsync` took 0.04 ms. `sync_all` therefore already performs the
  full flush, and the second call costs about 0.1–0.3 ms. The durable sequence is
  unchanged and no write-latency gain is claimed.
- **`needs_review` resolution.** No command settles a reviewed conflict. It needs
  an owner decision on operator semantics; see [limitations](../docs/LIMITATIONS.md#reliability-and-performance-acceptance).
- **Not changed:** the dispatcher's route table, a JavaScript linter and
  `noUncheckedIndexedAccess` (39 errors), cross-profile recovery at write time,
  read-receipt pruning, workflow plan byte encoding, watcher task supervision and
  pre-validation writes in registration/relocation planning.
- **Local disk.** Three reproducible `target/` copies under ignored
  `test-results/` (about 28 GB) were not removed; deletion was not permitted in
  the working session.

## Verification

```sh
.venv-check/bin/python scripts/check.py
ASTRA_TEST_PROFILE=release npm run test:browser
ASTRA_TEST_PROFILE=release ASTRA_TEST_BROWSER=webkit node scripts/browser/regressions.mjs session-recovery command-recovery session dialogs dialog-components command-outcomes editor-header deletion tags localization autosave editor navigation focus projects loading planning
```

- The full gate passes all 15 steps: 287 JavaScript, 7 Python and 353 Rust tests,
  contracts, boundaries, formatting, the 80 KiB bundle budget (80,743 bytes),
  Clippy with warnings rejected and the release build.
- Chromium passes the CLI tag workflow, broad HTTPS smoke, planning checks and all
  39 regression suites. The same chain also passed all 37 prior suites on a build
  containing only the server changes.
- WebKit passes the 17 suites listed above. The new `session-recovery` (7) and
  `command-recovery` (10) suites failed 0/7 and 0/10 against `0073d7f`.
- Rendered pairing-over-dialog states were inspected at 1440px and 320px.

Logs are in ignored `test-results/review-fixes/`; suite output is under
`test-results/browser/`.

## Existing application rollout

The rebuilt embedded frontend and release daemon run at the existing
`https://100.122.250.14:47832` with the same launcher, data directory, connection
settings and certificate. Read-only snapshots before and after the restart are
identical: instance identity, command epoch, both profiles, 15 projects, all 41
resource versions, three pins, preferences, roots and both certificate files.
All 65 served assets match the local build over the existing certificate, the
CSP header is present, an unauthenticated bootstrap returns `401` and `doctor`
reports no warnings or source issues. The
[project result](https://github.com/Maciej1kti/astra/blob/498b3a1eac6acabe399e0c49fb8849da24cf6350/.project/updates/acc78827-c729-4d1f-af76-34a5c1275dc1.json) and
the [decision request](https://github.com/Maciej1kti/astra/blob/498b3a1eac6acabe399e0c49fb8849da24cf6350/.project/updates/5e09c0e3-0475-4ffb-813b-5e625ad00afe.json)
for `needs_review` were appended through the selected CLI project and read back.

## Limits

Findings were established by reading code and by the regressions above; no
measurement of perceived performance was made. The admission change was tested
in-process and through the browser suites, not under sustained hostile load. The
restarted application was checked through its CLI and HTTPS assets, without a
paired-browser visit. Remote CI was not observed. Browser emulation and macOS
WebKit are not physical iPhone acceptance; physical-device and full release
acceptance remain open, and no card acceptance, priority or deadline is changed.
