import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";
import { CommandController } from "../../apps/web/src/lib/api/command-controller.ts";
import {
  commandErrorMessage,
  isRejectedConflict,
} from "../../apps/web/src/lib/api/command-result.ts";

const pending = Object.freeze({
  path: "/api/v1/workspace/focus",
  method: "PUT",
  payload: { items: [] },
  version: "original-version",
  requestId: "original-request",
  epoch: "original-epoch",
});

test("recorded source/workspace conflicts keep their classification after status recovery", async () => {
  for (const code of [
    "VERSION_CONFLICT",
    "REFERENCE_CHANGED",
    "PROJECT_ARCHIVED",
    "DOCUMENT_INVALID",
    "NORMALIZATION_REQUIRED",
    "PROJECT_RECOVERY_REQUIRED",
    "WORKSPACE_RECOVERY_REQUIRED",
    "REGISTRATION_RECOVERY_REQUIRED",
    "RECOVERY_REQUIRED",
    "FOCUS_TARGET_ARCHIVED",
    "FOCUS_REFERENCE_CHANGED",
    "WORKSPACE_SOURCE_CHANGED",
    "ORDER_CHANGED",
    "ORDER_REBALANCE_REQUIRED",
    "UNDO_TARGET_CHANGED",
    "UNDO_CREATE_NOT_SUPPORTED",
    "HISTORY_UNAVAILABLE",
    "EPOCH_CHANGED",
    "IDEMPOTENCY_KEY_REUSED",
    "REQUEST_OUTSIDE_WINDOW",
  ]) {
    const error = { error: { code } };
    for (const lost of [false, true]) {
      const operation = new CommandController({
        send: async () => {
          if (lost) throw new TypeError("Response lost");
          throw new ApiError(code === "VERSION_CONFLICT" ? 412 : 409, error);
        },
        status: async (identity) => {
          assert.equal(identity, pending);
          return { state: "rejected", error };
        },
      });
      operation.prepare(pending);
      await assert.rejects(operation.commit(), (cause) => {
        assert.equal(isRejectedConflict(operation.state.phase, cause), !lost);
        return true;
      });
      if (lost) {
        assert.equal(operation.pending, pending);
        await assert.rejects(operation.confirm(), (cause) => {
          assert.equal(
            isRejectedConflict(operation.state.phase, cause),
            true,
            code,
          );
          assert.match(commandErrorMessage(cause), new RegExp(code));
          return true;
        });
      }
      assert.equal(operation.pending, null);
    }
  }
});

test("failed status lookup retains uncertainty and the original command", async () => {
  const operation = new CommandController({
    status: async () => {
      throw new ApiError(409, { error: { code: "EPOCH_CHANGED" } });
    },
  });
  operation.prepare(pending);
  await assert.rejects(operation.confirm(), (cause) => {
    assert.equal(isRejectedConflict(operation.state.phase, cause), false);
    return true;
  });
  assert.equal(operation.state.phase, "uncertain");
  assert.equal(operation.pending, pending);
});

test("validation, missing resources and unknown 422 errors are not conflict proposals", () => {
  for (const [status, code] of [
    [422, "VALIDATION_FAILED"],
    [422, "DEPENDENCY_INVALID"],
    [422, "COMMAND_REJECTED"],
    [404, "RESOURCE_NOT_FOUND"],
    [401, "SESSION_REQUIRED"],
  ]) {
    assert.equal(
      isRejectedConflict("rejected", new ApiError(status, { error: { code } })),
      false,
      code,
    );
  }
  assert.equal(
    isRejectedConflict("rejected", new TypeError("Network failure")),
    false,
  );
  assert.equal(isRejectedConflict("rejected", new ApiError(409, {})), true);
  assert.equal(isRejectedConflict("rejected", new ApiError(412, {})), true);
});

test("error presentation retains the useful reason and exact code without duplicating it", () => {
  assert.equal(
    commandErrorMessage(
      new ApiError(422, {
        error: { code: "FOCUS_TARGET_ARCHIVED", message: "Card archived" },
      }),
    ),
    "Card archived (FOCUS_TARGET_ARCHIVED)",
  );
  assert.equal(
    commandErrorMessage(
      new ApiError(409, {
        error: {
          code: "FOCUS_TARGET_ARCHIVED",
          message: "FOCUS_TARGET_ARCHIVED",
        },
      }),
    ),
    "FOCUS_TARGET_ARCHIVED",
  );
  assert.equal(
    commandErrorMessage(new TypeError("Response lost")),
    "Response lost",
  );
});
