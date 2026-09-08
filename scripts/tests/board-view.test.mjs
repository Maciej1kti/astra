import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readBoardView,
  writeBoardView,
} from "../../apps/web/src/features/board/board-view.ts";

test("board preferences isolate projects and never persist card data or cursors", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  writeBoardView(
    "project-a",
    {
      horizontal: 240,
      vertical: { review: 180 },
      collapsed: { done: true },
      title: "private",
      cursor: "expired",
    },
    storage,
  );
  assert.equal(readBoardView("project-a", storage).vertical.review, 180);
  assert.equal(readBoardView("project-a", storage).collapsed.done, true);
  assert.equal(readBoardView("project-b", storage).horizontal, 0);
  assert(![...data.values()][0].includes("private"));
  assert(![...data.values()][0].includes("expired"));
});
test("untrusted or unavailable browser storage cannot break the board", () => {
  for (const value of [
    "null",
    "[]",
    "broken",
    '{"horizontal":-1,"vertical":{"review":"bad"},"collapsed":{"done":"true"}}',
  ]) {
    const result = readBoardView("p", { getItem: () => value });
    assert.equal(result.horizontal, 0);
    assert.equal(result.vertical.review, 0);
    assert.equal(result.collapsed.done, false);
  }
  const denied = {
    getItem: () => {
      throw Error("denied");
    },
    setItem: () => {
      throw Error("denied");
    },
  };
  assert.equal(readBoardView("p", denied).horizontal, 0);
  assert.doesNotThrow(() =>
    writeBoardView("p", { horizontal: 0, vertical: {}, collapsed: {} }, denied),
  );
});

test("cancelled starts collapsed and preserves an explicit expansion", () => {
  assert.equal(
    readBoardView("new-project", { getItem: () => null }).collapsed.cancelled,
    true,
  );
  assert.equal(
    readBoardView("existing-project", {
      getItem: () => JSON.stringify({ collapsed: { cancelled: false } }),
    }).collapsed.cancelled,
    false,
  );
  assert.equal(
    readBoardView("malformed-preference", {
      getItem: () => JSON.stringify({ collapsed: { cancelled: "false" } }),
    }).collapsed.cancelled,
    true,
  );
});
