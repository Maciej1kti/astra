import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogNames, catalogNameError, destinationTag, canFinishTagChange } from "../../apps/web/src/lib/tag-management.ts";

const catalog = { version: "r1.example", complete: true, issues: [], tags: [
  { name: "Old", managed: true, usage: 0, projects: [] },
  { name: "Destination", managed: false, usage: 2, projects: [] },
  { name: "Research, design", managed: true, usage: 1, projects: [] },
] };
const preview = { source: "Old", target: "Destination", complete: true, changes: [], issues: [], version: "r1.example" };

test("finishing a tag change requires complete source coverage and every reviewed card saved", () => {
  assert.equal(canFinishTagChange(catalog, preview, [{ state: "saved" }]), true);
  for (const state of ["ready", "conflict", "failed", "uncertain"]) {
    assert.equal(canFinishTagChange(catalog, preview, [{ state }]), false);
  }
  assert.equal(canFinishTagChange({ ...catalog, complete: false }, preview, []), false);
  assert.equal(canFinishTagChange(catalog, { ...preview, complete: false }, []), false);
  assert.equal(canFinishTagChange({ ...catalog, tags: [{ name: "Old", usage: 1 }] }, preview, []), false);
  assert.equal(canFinishTagChange(null, preview, []), false);
});

test("catalog replacements retain managed exact names and do not silently promote all observed labels", () => {
  assert.deepEqual(catalogNames(catalog), ["Old", "Research, design"]);
  assert.deepEqual(catalogNames({ ...catalog, tags: [{ name: " existing ", managed: true }] }), [" existing "]);
});

test("new names validate Unicode code points, case-sensitive identity and explicit whitespace", () => {
  assert.equal(catalogNameError("😀".repeat(48)), "");
  assert.ok(catalogNameError("😀".repeat(49)));
  assert.ok(catalogNameError(" "));
  assert.ok(catalogNameError(" Research "));
  assert.equal(catalogNameError("research", ["Research"]), "");
  assert.equal(catalogNameError("Cafe\u0301", ["Café"]), "");
  assert.ok(catalogNameError("Research", ["Research"]));
});

test("choosing a historical padded destination preserves its exact identity", () => {
  assert.equal(destinationTag("  new name  ", catalog), "new name");
  assert.equal(destinationTag(" historical ", { ...catalog, tags: [{ name: " historical " }] }), " historical ");
});
