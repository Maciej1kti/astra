import { api, type ReadOptions } from "./api.ts";
import type { CounterSeriesPage } from "../contracts/api.generated";

export type CounterQuery = {
  project: string;
  from: string;
  to: string;
  includeArchived: boolean;
};

export function getCounterSeries(
  query: CounterQuery,
  cursor: string | null = null,
  options: ReadOptions = {},
) {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
    include_archived: String(query.includeArchived),
    limit: "100",
  });
  if (query.project) params.set("project_id", query.project);
  if (cursor) params.set("cursor", cursor);
  return api<CounterSeriesPage>(
    `/api/v1/views/counters?${params}`,
    "GET",
    undefined,
    {},
    options,
  );
}
