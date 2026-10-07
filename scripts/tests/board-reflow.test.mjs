import test from "node:test";
import assert from "node:assert/strict";
import {
  insertionIndex,
  partedOffsets,
} from "../../apps/web/src/features/board/board-reflow.ts";

test("the pointer inserts before the first card whose middle lies below it", () => {
  const middles = [140, 230, 320];
  assert.equal(insertionIndex(middles, 100), 0);
  assert.equal(insertionIndex(middles, 139.9), 0);
  assert.equal(insertionIndex(middles, 140), 1);
  assert.equal(insertionIndex(middles, 300), 2);
  assert.equal(insertionIndex(middles, 320), 3);
  assert.equal(insertionIndex([], 50), 0);
});

test("cards close the held card's place and open the slot, in one column or two", () => {
  // Another column: only the slot opens.
  assert.deepEqual(partedOffsets(3, 88, null, 1), [0, 88, 88]);
  assert.deepEqual(partedOffsets(3, 88, null, 3), [0, 0, 0]);
  // The column the card left, with the pointer elsewhere: its place closes.
  assert.deepEqual(partedOffsets(3, 88, 1, null), [0, -88, -88]);
  // Its own place: nothing moves.
  assert.deepEqual(partedOffsets(3, 88, 1, 1), [0, 0, 0]);
  // Moved down past one card: that card alone moves up.
  assert.deepEqual(partedOffsets(3, 88, 1, 2), [0, -88, 0]);
  // Moved up to the top: the cards above its old place move down.
  assert.deepEqual(partedOffsets(3, 88, 2, 0), [88, 88, 0]);
});
