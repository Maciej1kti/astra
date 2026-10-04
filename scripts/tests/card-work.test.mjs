import { acceptanceProgress } from "../../apps/web/src/lib/resources/resource-summary.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceValidation,
  moveAcceptanceToIndex,
  reorderAcceptance,
} from "../../apps/web/src/features/cards/card-work.ts";

const first = {
  id: "11111111-1111-4111-8111-111111111111",
  text: "Result is visible",
  completed: false,
};
const second = {
  id: "22222222-2222-4222-8222-222222222222",
  text: "Verified on a phone",
  completed: true,
};

test("checklist reordering retains source items and stable identities", () => {
  const original = [first, second];
  assert.deepEqual(moveAcceptanceToIndex(original, second.id, 0), [
    second,
    first,
  ]);
  assert.deepEqual(original, [first, second]);
  assert.equal(moveAcceptanceToIndex(original, first.id, 0), original);
  assert.equal(moveAcceptanceToIndex(original, "missing", 1), original);
  assert.equal(moveAcceptanceToIndex(original, first.id, -1), original);
  assert.equal(
    moveAcceptanceToIndex(original, first.id, original.length),
    original,
  );
  assert.deepEqual(moveAcceptanceToIndex(original, first.id, 1), [
    second,
    first,
  ]);
  assert.deepEqual(reorderAcceptance(original, [second.id, first.id]), [
    second,
    first,
  ]);
  assert.deepEqual(acceptanceProgress(original), { total: 2, completed: 1 });
  assert.deepEqual(acceptanceProgress([]), { total: 0, completed: 0 });
});

test("invalid acceptance drafts are rejected without normalizing saved text", () => {
  assert.equal(acceptanceValidation([first, second]), "");
  assert.ok(acceptanceValidation([first, { ...second, id: first.id }]));
  assert.ok(acceptanceValidation([{ ...first, text: "  " }]));
  assert.ok(acceptanceValidation([{ ...first, text: "x".repeat(501) }]));
  assert.equal(
    acceptanceValidation([{ ...first, text: "😀".repeat(500) }]),
    "",
  );
  assert.ok(acceptanceValidation(Array(101).fill(first)));
});
