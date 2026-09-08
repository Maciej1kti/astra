import { apiCode } from "./api.ts";
import type { ProjectionState } from "./projection-state";
export type Page<T> = ProjectionState & {
  items: T[];
  page: { next_cursor: string | null; freshness?: string };
};

export function isStalePage(error: unknown) {
  return ["CURSOR_STALE", "PAGE_STALE"].includes(apiCode(error) ?? "");
}

/** Refresh the requested page if still valid; an invalid snapshot starts over explicitly. */
export async function cursorPage<T>(
  read: (cursor: string | null) => Promise<T>,
  cursor: string | null,
) {
  try {
    return { value: await read(cursor), reset: false };
  } catch (error) {
    if (!cursor || !isStalePage(error)) throw error;
    return { value: await read(null), reset: true };
  }
}

export function cardActivityPath(
  project: string,
  card: string,
  cursor: string | null = null,
) {
  const params = new URLSearchParams({
    target_type: "card",
    target_id: card,
    limit: "50",
  });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/projects/${project}/updates?${params}`;
}
