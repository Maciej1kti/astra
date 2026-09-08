import type { Edge } from "./planning";

/** Preserve server order while classifying each dependency exactly once. */
export function partitionEdges(edges: readonly Edge[], taskIds: Iterable<string>) {
  const visible = new Set(taskIds);
  const links: { id: string; source: string; target: string; type: "e2s" }[] = [];
  const hiddenEdges: Edge[] = [];
  for (const edge of edges) {
    if (visible.has(edge.from) && visible.has(edge.to))
      links.push({ id: `${edge.from}:${edge.to}`, source: edge.from, target: edge.to, type: "e2s" });
    else hiddenEdges.push(edge);
  }
  return { links, hiddenEdges };
}
