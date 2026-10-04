import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultCardLayout,
  readCardLayout,
  writeCardLayout,
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
  const mixed = [
    "labels",
    ...upgraded.filter((section) => section !== "labels"),
  ];
  assert.equal(writeCardLayout(mixed, storage), true);
  assert.deepEqual(readCardLayout(storage), mixed);
  assert.equal(entries.get("astra-card-layout:v1"), legacy);
  assert.deepEqual(JSON.parse(entries.get("astra-card-layout:v2")), mixed);
});

test("browser storage preserves an order that crosses the former group boundary", () => {
  const initial = defaultCardLayout();
  const submitted = [
    "schedule",
    "description",
    "checklist",
    "counters",
    "labels",
    "comments",
  ];
  let stored;
  assert.equal(
    writeCardLayout(submitted, { setItem: (_key, value) => (stored = value) }),
    true,
  );
  assert.deepEqual(readCardLayout({ getItem: () => stored }), submitted);
  assert.deepEqual(initial, defaultCardLayout());
  assert.deepEqual(submitted, [
    "schedule",
    "description",
    "checklist",
    "counters",
    "labels",
    "comments",
  ]);
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
