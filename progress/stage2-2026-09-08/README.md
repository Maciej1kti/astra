# Stage 2: structured cards and workspace tags

> Historical evidence. Commands and bare artifact paths describe the original run.
> [Original record and artifacts](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/README.md) are preserved in the published checkpoint; see [current status](../STATE.md) for maintained guidance.

This stage follows the verified UI repair batch at `52c40f4`. It addresses the
next portions of CARD-01 and TAG-01 from the browser audit. The implemented slice
and verified boundaries are recorded below.

## Implemented behavior

- Cards have an optional expected result, an optional owner display label, and an
  ordered acceptance checklist. Each item has a stable UUID and an independent
  completion flag. Completing a checklist never changes the card status.
- The inspector edits these fields with the existing versioned save. Shared
  summaries show owner and acceptance counts. Full-text search and budgeted CLI
  context include the new content. Oversized context entries retain explicit
  next-read references instead of presenting an incomplete checklist.
- An inline composer records results, blockers, decision requests and notes for
  the selected card. It uses its own durable command identity and preserves the
  unsaved card draft. Closing, browser navigation, copying and uncertain writes
  account for both drafts.
- Workspace settings opens the tag manager. It provides catalog creation,
  search, usage by project, adding observed labels to the catalog and removing
  unused catalog entries. Card suggestions include workspace names. The catalog
  UI initially renders 100 matches and can show more without limiting source
  usage counting to the first resource page.
- Rename and merge show the affected cards and exact resulting labels before
  applying ordinary versioned CardPatch commands. Saved, conflicting and
  uncertain rows remain visible individually. A retry retains the original
  request ID, epoch, payload and expected version. An explicit new preview is
  required to reconsider conflicting cards.
- Catalog cleanup is a separate reviewed step. Incomplete scans, unresolved
  commands, remaining source usage and partial results prevent the interface
  from declaring the rename complete. Source files retain literal labels and
  remain meaningful outside the registered workspace.
- `projectctl tags list`, `tags preview --source … --target …` and
  `tags set --input … --if-version …` expose the same contracts. Preview is
  read-only even though its HTTP method is POST. Card get/set and context expose
  the structured card model.

## Compatibility and boundaries

Existing cards and workspaces remain valid without rewriting their source files.
The disposable search projection upgrades transactionally; the original
Markdown body remains separate. An older strict application version may reject
cards using these new optional fields. Existing byte limits remain unchanged.

Tag identity is exact and case-sensitive. Newly entered names trim outer spaces;
selecting a historical spelling, including whitespace or distinct Unicode
normalization, retains that exact spelling. Commas are ordinary name characters.
No automatic merge or migration occurs. There are no opaque tag IDs or account
assignment semantics in this stage.

The tag scanner reports unreadable/invalid sources and its explicit bounds:
50,000 card files, 10,000 distinct observed names and 500 affected preview rows.
The saved vocabulary is limited to 500 names. Archived cards are included.
Archived projects remain subject to the existing write restriction and must be
restored before changing their cards. A multi-card operation is not atomic;
already committed changes remain after a later conflict or a closed review.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Domain/OpenAPI/examples and specification checks | Pass | [Integrated log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/integrated.log) |
| Python helper tests | 4 passed | Integrated log |
| JavaScript helper tests | 32 passed | Integrated log |
| Rust tests, including crash/recovery, context, legacy index upgrade, tag limits and transport | 92 passed | Integrated log |
| Rust formatting and Clippy with warnings denied | Pass | Integrated log |
| Final Svelte/TypeScript check | 0 errors, 0 warnings | [UI log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/final-ui.log) |
| Final production web and release daemon builds | Pass | [Web build](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/final-web-build.log), [Rust build](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/final-release-build.log) |
| New card browser scenarios | 9/9 passed | [Results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/card-browser/results.json), [log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/card-browser-checks.log) |
| New tag browser scenarios | 6/6 passed | [Results](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/tag-browser/results.json), [log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/tag-browser-checks.log) |
| Maintained browser smoke | Pass, exit 0 | [Log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/browser-smoke.log) |
| Maintained planning regression | Pass, exit 0 | [Log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/planning-browser.log) |

The final stage-specific run used Chromium 153.0.8010.12 on macOS Apple Silicon.
It reported no JavaScript page errors; the card suite also checked for CSP
violations and found none. Desktop and 390 × 844 mobile viewports were exercised.
Representative screenshots were visually inspected, including desktop merge,
partial conflicts, mobile dark mode, acceptance controls and Board summaries.
The mobile checks found no horizontal document overflow and measured 44 px
checklist move targets. This is browser viewport testing, not a physical phone.

The initial card run found an ambiguous accessible label on the update-kind
select. An explicit field name fixed it and the complete card suite then passed.
The [initial log](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/checks/card-browser-checks.initial.log) and
[failure screenshot](https://github.com/Maciej1kti/astra/blob/2a5530a8bb83eec0c3f6f289cac8587aa9d66898/progress/stage2-2026-09-08/card-browser/C04-update-failure.png) are retained as
superseded evidence. The first backend run also corrected a test assertion:
replayed error responses intentionally remain identical to the original error
and do not acquire a success-only `replayed` field. No write semantics changed
to satisfy that test.

Browser scenarios use normal pairing, a real HTTPS proxy,
the release daemon, Unix CLI and isolated synthetic `.project` sources. Only the
self-signed test certificate is accepted by the browser context; the application
continues to require HTTPS, CSRF, sessions, conditional writes and strict CSP.

Reproduction after the web and release builds:

```sh
node progress/audit-2026-09-08/audit-host.mjs
node progress/stage2-2026-09-08/card-browser-checks.mjs
node progress/stage2-2026-09-08/tag-browser-checks.mjs
```

The fixture connection, browser cookies and command inputs stay in ignored
`.manual/` or temporary directories. Do not commit them.

## Remaining product work

- Multi-tag filtering with explicit any/all semantics and saved views.
- Accessible tag color choices and additional large-catalog interaction checks.
- Card templates/duplication and richer attachment/evidence presentation.
- Card-targeted correction/resolution shortcuts; these remain available through
  the existing Updates editor.
- Physical iPhone/Safari and Linux host acceptance, packaged upgrade checks, and
  sustained performance measurement on larger real-world workspaces.

This stage does not claim full product acceptance or completion of every
competitor feature from the audit. The source-of-truth, durability and deferred
backup/source-migration boundaries remain unchanged.
