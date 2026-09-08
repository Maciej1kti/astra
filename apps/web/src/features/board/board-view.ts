const statuses = ["planned", "active", "review", "done", "cancelled"];
export type BoardView = {
  horizontal: number;
  vertical: Record<string, number>;
  collapsed: Record<string, boolean>;
};
type Reader = { getItem: (key: string) => string | null };
type Writer = { setItem: (key: string, value: string) => void };
const offset = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(10_000_000, Math.max(0, value))
    : 0;
function sanitize(value: unknown): BoardView {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const vertical =
    raw.vertical && typeof raw.vertical === "object"
      ? (raw.vertical as Record<string, unknown>)
      : {};
  const collapsed =
    raw.collapsed && typeof raw.collapsed === "object"
      ? (raw.collapsed as Record<string, unknown>)
      : {};
  return {
    horizontal: offset(raw.horizontal),
    vertical: Object.fromEntries(
      statuses.map((status) => [status, offset(vertical[status])]),
    ),
    collapsed: Object.fromEntries(
      statuses.map((status) => [
        status,
        typeof collapsed[status] === "boolean"
          ? collapsed[status]
          : status === "cancelled",
      ]),
    ),
  };
}
/** Browser-only display preferences. Never store card data or server cursors. */
export function readBoardView(project: string, storage?: Reader): BoardView {
  try {
    return sanitize(
      JSON.parse(
        (storage ?? localStorage).getItem(`astra-board-view:${project}`) ??
          "null",
      ),
    );
  } catch {
    return sanitize(null);
  }
}
export function writeBoardView(
  project: string,
  value: BoardView,
  storage?: Writer,
) {
  try {
    (storage ?? localStorage).setItem(
      `astra-board-view:${project}`,
      JSON.stringify(sanitize(value)),
    );
  } catch {
    /* The board still works when browser storage is unavailable. */
  }
}
