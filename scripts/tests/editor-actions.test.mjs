import { test } from "node:test";
import assert from "node:assert/strict";
import { canUndoDraft } from "../../apps/web/src/features/editor/editor-actions.ts";
import {
  addTag,
  tagValidation,
  matchingTags,
} from "../../apps/web/src/features/tags/tags.ts";

test("Undo is rejected while a draft or unresolved command exists", () => {
  assert.equal(canUndoDraft(true, false, false), false);
  assert.equal(canUndoDraft(false, true, false), false);
  assert.equal(canUndoDraft(false, false, true), false);
  assert.equal(canUndoDraft(false, false, false), true);
});

test("editing unrelated fields does not split, trim or normalize source tags", () => {
  const source = [
    "Design, research",
    " polskie znaki ąę ",
    "Cafe\u0301",
    "Café",
    "QA",
  ];
  assert.equal(tagValidation(source), "");
  const next = addTag(source, "  Nowy, ważny  ");
  assert.equal(next.error, "");
  assert.deepEqual(next.labels, [...source, "Nowy, ważny"]);
  assert.deepEqual(source, [
    "Design, research",
    " polskie znaki ąę ",
    "Cafe\u0301",
    "Café",
    "QA",
  ]);
});

test("duplicate, empty and over-limit additions retain the original tags with field feedback", () => {
  for (const [source, value] of [
    [["A"], "A"],
    [["A"], "   "],
    [["A"], "x".repeat(49)],
    [Array.from({ length: 20 }, (_, i) => `tag ${i}`), "another"],
  ]) {
    const result = addTag(source, value);
    assert.ok(result.error);
    assert.deepEqual(result.labels, source);
  }
  assert.equal(addTag([], "😀".repeat(48)).error, "");
});

test("source suggestions preserve exact spelling and omit selected tags", () => {
  assert.deepEqual(
    matchingTags(["UI", "UX", "UI", " ui ", "Planning"], ["UI"], "u"),
    [" ui ", "UX"],
  );
  assert.deepEqual(addTag([], " ui ", true), { labels: [" ui "], error: "" });
  assert.deepEqual(addTag(["UI"], "ui"), { labels: ["UI", "ui"], error: "" });
});
