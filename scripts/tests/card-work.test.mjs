import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceValidation,
  acceptanceProgress,
  moveAcceptance,
  cardPurposeValidation,
} from "../../apps/web/src/features/cards/card-work.ts";
import {
  cardUpdatePayload,
  hasCardUpdateDraft,
  newCardUpdateDraft,
} from "../../apps/web/src/features/cards/card-update.ts";

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
  assert.match(acceptanceValidation(Array(101).fill(first)), /100 acceptance/);
  assert.equal(cardPurposeValidation("", ""), "");
  assert.match(cardPurposeValidation("x".repeat(4001), ""), /Expected result/);
  assert.match(cardPurposeValidation("", "x".repeat(121)), /Owner/);
});

test("card update payload is independently targeted and cannot include card mutations", () => {
  const empty = newCardUpdateDraft();
  assert.equal(hasCardUpdateDraft(empty), false);
  assert.throws(() => cardUpdatePayload(first.id, empty), /summary/);
  const draft = {
    ...empty,
    kind: "result",
    summary: "Verified result",
    body: "Details",
  };
  assert.equal(hasCardUpdateDraft(draft), true);
  assert.deepEqual(cardUpdatePayload(first.id, draft), {
    target: { type: "card", id: first.id },
    kind: "result",
    summary: "Verified result",
    body: "Details",
    author: { kind: "human", label: "Owner" },
  });
  assert.equal(
    Object.hasOwn(cardUpdatePayload(first.id, draft), "status"),
    false,
  );
  assert.throws(
    () => cardUpdatePayload(first.id, { ...draft, author: " " }),
    /author/,
  );
});
