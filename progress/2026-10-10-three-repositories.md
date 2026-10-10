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

## Checks

- In the new repository: six parser tests and three launch-helper tests pass.
- Here: `scripts/check_package.py` passes and the remaining
  `scripts/tests/*.test.mjs` pass. No application code changed.
