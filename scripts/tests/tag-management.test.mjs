import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogNameError } from "../../apps/web/src/features/tags/tag-management.ts";

test("new names validate Unicode code points, case-sensitive identity and explicit whitespace", () => {
  assert.equal(catalogNameError("😀".repeat(48)), "");
  assert.ok(catalogNameError("😀".repeat(49)));
  assert.ok(catalogNameError(" "));
  assert.ok(catalogNameError(" Research "));
  assert.equal(catalogNameError("research", ["Research"]), "");
  assert.equal(catalogNameError("Cafe\u0301", ["Café"]), "");
  assert.ok(catalogNameError("Research", ["Research"]));
});
