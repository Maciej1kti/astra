# Astra split into three repositories — 2026-10-10

The owner asked for one folder holding three repositories
([scope](SCOPE.md#three-repositories--owner-direction-2026-10-10)).

| Repository | Content | Visibility |
| --- | --- | --- |
| [astra](https://github.com/Maciej1kti/astra) | Server, command-line client, web interface | Public |
| [astra-omarchy](https://github.com/Maciej1kti/astra-omarchy) | Omarchy bar widget | Public |
| astra-apps | iOS and Mac apps | Private; see the [earlier report](2026-10-10-closed-source-apps.md) |

## Omarchy widget

- `integrations/omarchy` and its parser test moved to the new repository with
  the four commits that touched them; the test is `tests/hosts.test.mjs` there.
  The widget has no build dependency on this repository.
- Here the gate no longer runs the widget's Python tests, and the guides link to
  the new repository. The two dated reports about the widget stay, as both
  sides are public.

## Local layout and the running instance

- On the build machine the three repositories are the folders `server`, `apps`
  and `omarchy` of one folder. The apps' checks find this repository in the
  sibling folder `server`, or through `ASTRA_SOURCE`.
- The manual instance was stopped, moved with this repository and started
  again from the new folder with the same settings; it did not answer for
  about one second and was not rebuilt. Its registration of this project was
  moved to the new folder with the `relocate` maintenance operation (plan,
  then apply; job done in two steps).
- Instance identity, command epoch, both profiles, all 18 browser sessions,
  the 15 projects with their availability and the Focus list were the same
  before and after. `/healthz` answered 200 and `/api/v1/bootstrap` 401 on the
  public address; both agent providers are available and GitHub publication is
  enabled.

## History rewrite

- On the owner's direction `main` was rewritten without `apps/ios`,
  `scripts/ios`, the full texts of ADR-076 and ADR-077 and the two reports of
  the first app builds. 357 of 358 commits remain; one that changed only app
  files disappeared. Commits before 2026-10-09 keep their identifiers, later
  ones have new ones.
- The tree at the tip was the same before and after, except for the two
  notices that replace those reports; they were added again in the commit
  that carries this section. No app path is left in any commit, and searches
  of every remaining version of every file for five strings taken from the
  apps' code found nothing.
- Six links in five earlier reports named a commit that was rewritten; they
  now name its successor.
- Not covered: GitHub keeps commits that no branch reaches available by their
  identifier until its support removes them, which only the owner can request.
  Earlier versions of the code structure and development guides still describe
  the apps' folders in prose.

## Planning data

- On the owner's direction `.project/` moved to the folder that holds the three
  repositories, which became a fourth, private repository with the 156 commits
  that touched those files. This repository no longer tracks `.project/` and
  ignores it; its agent and contributor guides point to the workspace instead.
- The manual instance was stopped for about one second while the files moved,
  and its registration of the project was moved to that folder with the
  `relocate` operation (job done in two steps). Identity, command epoch, both
  profiles, all 18 sessions, the 15 projects and their availability and the
  project's card list were the same before and after; the stored workspace
  file differs only in that project's path.
- Not done: the cards and reports are still in this repository's history, and
  six links in five earlier reports still point at report files there. The
  owner asked for their removal; the rewrite was prepared (358 commits become
  314) but not pushed.

## Checks

- In the new repository: six parser tests and three launch-helper tests pass.
- Here: `scripts/check_package.py` passes and the remaining
  `scripts/tests/*.test.mjs` pass. No application code changed.
