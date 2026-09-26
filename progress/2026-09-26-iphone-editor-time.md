# Phone editor date/time fields — 2026-09-26

The owner's iPhone screenshot shows a date control covering the adjacent Start
time field. The editor now gives date, time and duration inputs full rows up to
640px, keeps the plan/event hint below the fields, bounds the native controls and
normalizes WebKit date/time appearance. Status and Priority retain two columns.
The optional event model and native date/time pickers are unchanged.

Verification on macOS ARM64, Node 24.11, release daemon and embedded frontend:

- Full `.venv-check/bin/python scripts/check.py` passes, including schema checks,
  Python/JavaScript/Rust tests, Svelte, formatting, Clippy and release builds.
- Chromium suites `editor-inputs events editor responsive` pass; editor has 14
  scenarios and responsive has 36 checks.
- `ASTRA_TEST_BROWSER=webkit` runs `editor-inputs` against a separately paired
  synthetic host. At 320–1440px it checks bounds and unobscured touch targets,
  empty/populated time, autosave, reload and conversion back to a date plan.
- The previous embedded build fails the new phone row-separation assertion.
  Desktop WebKit does not reproduce the exact native iOS painting failure;
  screenshots from both engines were reviewed after the fix. The suite records
  two WebKit deferred ResizeObserver notifications during viewport changes
  separately; no other page errors occurred. Physical iPhone confirmation remains
  with the owner and is not claimed by browser emulation.
- Rebuilt the frontend and release daemon, restarted the existing manual launcher
  with its data, certificates and tailnet address retained, and verified HTTP 200
  at `https://100.122.250.14:47832/` plus its current embedded asset
  `/assets/index-4-WEJ4DA.js`. Instance ID and command epoch are unchanged.

Ignored evidence: `test-results/iphone-time-fix/`; the previous-layout failure is
in `test-results/iphone-time-before-layout/`. The owner's unrelated project
metadata edit is preserved outside this change.
