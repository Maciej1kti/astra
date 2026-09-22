import { acceptanceProgress } from "../../apps/web/src/lib/resources/resource-summary.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceDropIndex,
  acceptanceValidation,
  moveAcceptance,
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
  assert.deepEqual(moveAcceptance(original, second.id, -1), [second, first]);
  assert.deepEqual(original, [first, second]);
  assert.deepEqual(moveAcceptance(original, first.id, -1), original);
  assert.deepEqual(moveAcceptance(original, "missing", 1), original);
  assert.deepEqual(moveAcceptanceToIndex(original, first.id, 1), [
    second,
    first,
  ]);
  assert.deepEqual(moveAcceptanceToIndex(original, first.id, 0), original);
  assert.deepEqual(
    acceptanceDropIndex(original, first.id, 40, [
      { id: first.id, top: 0, bottom: 40 },
      { id: second.id, top: 48, bottom: 88 },
    ]),
    0,
  );
  assert.deepEqual(
    acceptanceDropIndex(original, first.id, 100, [
      { id: first.id, top: 0, bottom: 40 },
      { id: second.id, top: 48, bottom: 88 },
    ]),
    1,
  );
  assert.equal(acceptanceDropIndex(original, "missing", 40, []), null);
  assert.deepEqual(reorderAcceptance(original, [second.id, first.id]), [
    second,
    first,
  ]);
  assert.deepEqual(acceptanceProgress(original), { total: 2, completed: 1 });
  assert.deepEqual(acceptanceProgress([]), { total: 0, completed: 0 });
});

test("invalid acceptance drafts have specific feedback without normalizing saved text", () => {
  assert.equal(acceptanceValidation([first, second]), "");
  assert.match(
    acceptanceValidation([first, { ...second, id: first.id }]),
    /repeated identifier/,
  );
  assert.match(acceptanceValidation([{ ...first, text: "  " }]), /Add text/);
  assert.match(
    acceptanceValidation([{ ...first, text: "x".repeat(501) }]),
    /500 characters/,
  );
  assert.equal(
    acceptanceValidation([{ ...first, text: "😀".repeat(500) }]),
    "",
  );
  assert.match(acceptanceValidation(Array(101).fill(first)), /100 checklist/);
});
