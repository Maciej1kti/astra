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
      JSON.stringify([
        "comments",
        "comments",
        "schedule",
        "private text",
        { draft: "private text" },
        42,
      ]),
  });
  assert.deepEqual(result, [
    "comments",
    "schedule",
    "description",
    "checklist",
    "counters",
    "labels",
  ]);
  let stored;
  assert.equal(
    writeCardLayout([...result, "private text", { draft: "private text" }], {
      setItem: (key, value) => {
        assert.equal(key, "astra-card-layout:v2");
        stored = value;
      },
    }),
    true,
  );
  assert.deepEqual(JSON.parse(stored), result);
  for (const value of ["null", "[]", "broken", '{"content":{},"properties":1}'])
    assert.deepEqual(
      readCardLayout({ getItem: () => value }),
      defaultCardLayout(),
    );
});

test("grouped browser preferences upgrade in their existing reading order", () => {
  const entries = new Map([
    [
      "astra-card-layout:v1",
      JSON.stringify({
        content: ["comments", "comments", "schedule", "private text"],
        properties: ["labels"],
        draft: "private text",
      }),
    ],
  ]);
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
  const legacy = entries.get("astra-card-layout:v1");
  const upgraded = readCardLayout(storage);
  assert.deepEqual(upgraded, [
    "comments",
    "description",
    "checklist",
    "counters",
    "labels",
    "schedule",
  ]);
  const mixed = moveCardSection(upgraded, "labels", -1);
  assert.equal(writeCardLayout(mixed, storage), true);
  assert.deepEqual(readCardLayout(storage), mixed);
  assert.equal(entries.get("astra-card-layout:v1"), legacy);
  assert.deepEqual(JSON.parse(entries.get("astra-card-layout:v2")), mixed);
});

test("all sections can cross the former group boundary without mutating the input", () => {
  const initial = defaultCardLayout();
  let moved = initial;
  for (let step = 0; step < 4; step++)
    moved = moveCardSection(moved, "schedule", -1);
  assert.deepEqual(moved, [
    "schedule",
    ...initial.filter((s) => s !== "schedule"),
  ]);
  moved = moveCardSection(moved, "comments", 1);
  assert.deepEqual(moved.slice(-2), ["labels", "comments"]);
  assert.deepEqual(initial, defaultCardLayout());
  assert.deepEqual(moveCardSection(initial, "description", -1), initial);
  assert.deepEqual(moveCardSection(initial, "labels", 1), initial);
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
