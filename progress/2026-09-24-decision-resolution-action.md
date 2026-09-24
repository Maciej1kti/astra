# Resolve a decision from its update record — 2026-09-24

Focus opens an unresolved decision's update record, but the record previously
offered only Mark read/unread. Reading does not remove the decision from Needs
my attention. The record now offers Resolve decision. It opens a new editable
resolution report with the original decision ID and target prefilled; saving
the report closes that attention signal while retaining both reports.

The Focus browser regression failed before the change at the missing action.
After the change it verified the prefilled reference, saved the resolution,
confirmed the decision disappeared from attention, and confirmed another
decision remained. The full local gate and all 11 release Chromium regression
suites passed. This verifies the browser flow in Chromium emulation, not on a
physical iPhone or in Safari.
