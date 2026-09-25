# Compact, scrollable workspace navigation

Removed the sidebar brand and Workspace caption so Focus is its first item.
The whole sidebar now scrolls vertically when viewport height is limited;
navigation rows and Sign out retain their touch targets. Portrait keeps the
existing horizontal bottom navigation. Resizing or rotating reveals the active
view inside the sidebar's measured border and padding.

Verification on the release build:

- Reproduced the reported issue in the running dev app at 844 × 390: content
  exceeded the sidebar height, but a touch swipe left its scroll position at 0.
  After the fix, the same swipe reached scroll position 126 and exposed Sign out.
- Responsive E2E passes 35 checks, including 844 × 390 and 740 × 320 touch
  scrolling, landscape/portrait rotation and reload. Dialogs (7/7) and Focus
  (9/9) suites pass. The responsive rerun verifies the final padding-aware
  active-row positioning. No browser exceptions were observed.
- Frontend type/contracts, formatting, boundaries, bundle, package checks and
  `git diff --check` pass. The frontend and release daemon were rebuilt, and the
  existing manual launcher was restarted with its previous configuration.

Evidence: ignored `test-results/sidebar-landscape-2026-09-25/`. Checks use Chromium
touch emulation, not a physical phone/Safari. Per the owner's E2E direction,
no unit tests were added or run; full release acceptance remains open.
