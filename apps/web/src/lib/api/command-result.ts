import { ApiError, apiCode } from "./api.ts";
import type { CommandSnapshot } from "./command-controller.ts";

// Command status carries the rejection code, but not its original HTTP status.
// These source/workspace conflicts require review before a new proposal.
const conflictCodes = new Set([
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
]);

export function isRejectedConflict(
  phase: CommandSnapshot["phase"],
  cause: unknown,
): boolean {
  // A failed lookup says nothing about the original command's outcome.
  return (
    phase === "rejected" &&
    cause instanceof ApiError &&
    ([409, 412].includes(cause.status) ||
      conflictCodes.has(apiCode(cause) ?? ""))
  );
}

export function commandErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const code = apiCode(cause);
  return code && !message.includes(code) ? `${message} (${code})` : message;
}
