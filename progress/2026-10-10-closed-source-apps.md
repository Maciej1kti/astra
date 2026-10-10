# iOS and Mac apps made closed source — 2026-10-10

The owner said that the server and the web interface are open source and that
the iOS and Mac apps will not be, and asked for the repository to be arranged
accordingly ([scope](SCOPE.md#apps-are-closed-source--owner-direction-2026-10-10)).

## What changed

- `apps/ios`, `scripts/ios` and the full texts of ADR-076 and ADR-077 moved to
  a private repository with the eight commits that touched them. Anonymous
  requests for that repository are answered with 404.
- This repository no longer tracks those paths and ignores `/apps/ios/` and
  `/scripts/ios/`. `AGENTS.md` forbids bringing the apps' code or records back.
  The summaries of both decisions stay in [the ADR list](../docs/12-ADRS.md).
- [Code structure](../docs/CODE-STRUCTURE.md#ios-and-mac-apps) names the files
  here that the apps' checks read: two contract examples, the browser test
  host and its fixture, and the pairing page's labels.
- In the private repository the scratch host, the pairing helper and the
  contract tests find a checkout of this repository through `ASTRA_SOURCE`, by
  default the folder `astra` beside it.

## Checks

- From the private repository: the 66 unit tests pass and fail in the two
  contract tests when `ASTRA_SOURCE` names a missing folder; the scratch host
  started against this repository's release daemon and the pairing helper
  obtained a session from it.
- Here: `scripts/check_package.py` passes, including the relative links. No
  application code changed, so no build, browser suite or restart of the
  running instance was needed.

## Not done

- The apps were public in this repository from 2026-10-09 to 2026-10-10, and
  the commits that added them are still in its history, so their code as of
  those commits can still be read here. The repository had no forks, stars or
  watchers when the apps were removed. Removing those commits rewrites the
  history of `main` and is the owner's decision.
- No Xcode build, simulator run or upload was repeated from the private
  repository; only the unit tests and the scratch host were run there.
- The project license remains deferred.
