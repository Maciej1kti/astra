import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultCardLayout,
  readCardLayout,
  writeCardLayout,
  moveCardSection,
} from "../../apps/web/src/features/editor/card-layout.ts";

test("layout preferences retain only known unique sections and fill missing sections", () => {
  const result = readCardLayout({
    getItem: () =>
      JSON.stringify({
        content: ["comments", "comments", "schedule", "private text"],
        properties: ["labels"],
        draft: "private text",
      }),
  });
  assert.deepEqual(result, {
    content: ["comments", "description", "checklist", "counters"],
    properties: ["labels", "schedule"],
  });
  let stored;
  assert.equal(
    writeCardLayout(
      { ...result, draft: "private text" },
      { setItem: (_, value) => (stored = value) },
    ),
    true,
  );
  assert.deepEqual(JSON.parse(stored), result);
  for (const value of ["null", "[]", "broken", '{"content":{},"properties":1}'])
    assert.deepEqual(
      readCardLayout({ getItem: () => value }),
      defaultCardLayout(),
    );
});

test("section moves preserve membership and the original layout at boundaries", () => {
  const initial = defaultCardLayout();
  const moved = moveCardSection(initial, "content", "comments", -1);
  assert.deepEqual(moved.content, [
    "description",
    "checklist",
    "comments",
    "counters",
  ]);
  assert.deepEqual(initial, defaultCardLayout());
  assert.deepEqual(
    moveCardSection(initial, "content", "description", -1),
    initial,
  );
  assert.deepEqual(moveCardSection(initial, "content", "schedule", 1), initial);
});

test("unavailable storage keeps the default usable and reports that persistence failed", () => {
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.deepEqual(readCardLayout(denied), defaultCardLayout());
  assert.equal(writeCardLayout(defaultCardLayout(), denied), false);
});
