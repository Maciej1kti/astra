/** Timeline ordering is a per-project browser presentation preference. */
export function readTimelineOrder(project: string): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`astra-timeline-order:v1:${project}`) ?? "[]",
    );
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === "string"),
          ),
        ].slice(0, 10000)
      : [];
  } catch {
    return [];
  }
}

export function writeTimelineOrder(project: string, order: string[]): boolean {
  try {
    localStorage.setItem(
      `astra-timeline-order:v1:${project}`,
      JSON.stringify(order.slice(0, 10000)),
    );
    return true;
  } catch {
    return false;
  }
}

export function orderedTimelineRows<T extends { id: string }>(
  rows: T[],
  order: string[],
): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...rows].sort(
    (a, b) =>
      (positions.get(a.id) ?? order.length) -
      (positions.get(b.id) ?? order.length),
  );
}

export function moveTimelineRow(
  order: string[],
  id: string,
  destination: number,
): string[] {
  const result = [...order];
  const index = result.indexOf(id);
  if (index < 0 || destination < 0 || destination >= result.length)
    return result;
  result.splice(index, 1);
  result.splice(destination, 0, id);
  return result;
}
