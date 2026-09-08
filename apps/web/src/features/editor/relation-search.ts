import { api, type Summary } from "../../lib/api/api.ts";

export async function searchRelations(
  project: string,
  type: string,
  search: string,
  exclude: string | undefined,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    project_id: project,
    type,
    q: search.trim(),
    limit: "50",
  });
  const page = await api<{ items: Summary[] }>(
    `/api/v1/views/list?${query}`,
    "GET",
    undefined,
    {},
    { signal },
  );
  return page.items.filter((item) => item.id !== exclude);
}
