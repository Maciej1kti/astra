export type ProjectionState = {
  page?: { freshness?: string };
  warnings?: { code?: string; message?: string }[];
  columns?: { page?: { freshness?: string } }[];
};
export function projectionNotice(value: ProjectionState) {
  if (
    value.warnings?.some((warning) => warning.code === "PROJECTION_RECONCILING")
  )
    return "Serwer odświeża dane projektów. Wyniki mogą być niekompletne do zakończenia odświeżania.";
  if (
    value.page?.freshness === "stale" ||
    value.columns?.some((column) => column.page?.freshness === "stale")
  )
    return "Wyświetlono zapisane wyniki podczas odświeżania danych projektów na serwerze.";
  return "";
}
