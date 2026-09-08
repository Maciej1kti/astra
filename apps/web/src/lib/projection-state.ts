export type ProjectionState = {
  page?: { freshness?: string };
  warnings?: { code?: string; message?: string }[];
  columns?: { page?: { freshness?: string } }[];
};
export function projectionNotice(value: ProjectionState) {
  if (value.warnings?.some((warning) => warning.code === "PROJECTION_RECONCILING"))
    return "The host is refreshing project data. These results may be incomplete until it finishes.";
  if (value.page?.freshness === "stale" || value.columns?.some((column) => column.page?.freshness === "stale"))
    return "Showing saved results while the host refreshes project data.";
  return "";
}
