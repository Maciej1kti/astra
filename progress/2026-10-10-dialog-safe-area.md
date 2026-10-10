# Dialogs under the status bar in the iOS app — 2026-10-10

The owner reported the first bug from TestFlight. On their iPhone 12 Pro Max
Settings showed everything but sat too high; on a tester's iPhone 13 mini
Settings showed only the header and no content.

## Cause of the first symptom

The shared `app-dialog` rule sized and centred a dialog against the whole
screen. In a browser tab that is the page. In the iOS app the page runs under
the status bar by design, and a dialog is in the top layer, placed against the
screen, so its header went under the status bar. The Agent dialog and the
full-screen card editor each handled the inset themselves; the other fifteen
dialogs did not.

## Change

`apps/web/src/styles/dialog.css`: `app-dialog` starts at
`env(safe-area-inset-top)` and takes the inset out of its maximum height, in the
base rule and in the phone rule. `apps/web/src/styles/editor.css`: the
full-screen card editor sets `inset-block-start: 0`, because its header already
pads itself. No native code changed, so the fix reaches installed apps when the
host is updated, without a TestFlight build.

## Checks

Xcode 27.0, iOS 27.0 simulators created as "iPhone 13 mini" (375×812) and
"iPhone 12 Pro Max" (428×926), scratch host from `target/release`.

- Before, on the 13 mini: the Settings close button's top edge was at 17 pt
  with the status bar ending at 50 pt; the screenshot shows the title under the
  clock. `SettingsLayoutTests` failed on that.
- After: 67 pt against 50 pt on the 13 mini and 64 pt against 47 pt on the
  12 Pro Max, the first section on screen below the header. The test passes on
  both, each erased and paired first.
- The card editor on the 12 Pro Max: close button at 47 pt, the status bar's
  edge, so it is full screen and not offset twice.
- Browser suites against the rebuilt daemon: `dialogs`, `dialog-components`,
  `responsive`, `editor-opening`, `editor-header`, `agent`, `card-layout` and
  `ui-corrections` pass.
- `npm run check:bundle`: 81,698 of 81,920 bytes.

## Not reproduced

Settings with only the header on the tester's iPhone 13 mini. On the 13 mini
simulator the content is there, before and after the change, and also with
Reduce Motion on, which I tried as a cause and ruled out. The simulator runs
iOS 27; the tester's iOS version is not known to me, and no older runtime is
installed (about 9 GiB of disk is free). The change above may or may not affect
that symptom. It needs the tester's iOS version and a screenshot after the
host update.

## Not verified

- Either physical phone.
- The other dialogs one by one in the app; they share the rule, and only
  Settings and the card editor were opened there.

## Rollout

The release daemon was rebuilt with the new frontend and the owner's manual
instance restarted with its settings unchanged. Instance ID, command epoch,
both profiles, 18 sessions and 15 projects were identical before and after;
`/healthz` answers 200 and `/api/v1/bootstrap` 401 without a session at the
Tailscale address, and the stylesheet served there equals the built one and
contains the top safe-area rule.

iPhone build 202610100921 was uploaded to TestFlight and is in internal
testing. It is not needed for this fix; it carries the native changes made
since the first build, among them the check for an input device before
dictation starts.
