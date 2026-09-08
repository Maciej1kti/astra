/** UI intent is retained alongside the immutable command, independently of its URL. */
export type EditorIntent =
  | { kind: "resource" }
  | { kind: "focus"; pinned: boolean }
  | { kind: "read"; read: boolean };

export function canUndoDraft(dirty: boolean, pending: boolean, busy: boolean) {
  return !dirty && !pending && !busy;
}
