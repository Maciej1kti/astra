import type { Pending } from "./api";

/** Side actions must never end the editing session or replace its draft. */
export function editorCompletion(pending: Pick<Pending, "path">) {
  if (pending.path === "/api/v1/workspace/focus") return "focus";
  if (pending.path === "/api/v1/workspace/read-receipts") return "read";
  return "resource";
}

export function canUndoDraft(dirty: boolean, pending: boolean, busy: boolean) {
  return !dirty && !pending && !busy;
}
