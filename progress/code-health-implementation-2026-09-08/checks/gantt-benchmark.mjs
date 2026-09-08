// Same synthetic DAG as the audit, compared with the actual extracted implementation.
import { partitionEdges } from "../../../apps/web/src/lib/gantt-projection.ts";
import assert from "node:assert/strict";
const tasks = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
const edges = tasks.flatMap((task, i) => tasks.slice(Math.max(0, i - 100), i).map((previous) => ({ from: previous.id, to: task.id })));
const measurements = [];
for (let sample = 0; sample < 5; sample++) {
  let start = performance.now();
  const links = edges.filter((edge) => tasks.some((task) => task.id === edge.from) && tasks.some((task) => task.id === edge.to))
    .map((edge) => ({ source: edge.from, target: edge.to }));
  const hidden = edges.filter((edge) => !links.some((link) => link.source === edge.from && link.target === edge.to));
  const beforeMs = performance.now() - start;
  start = performance.now();
  const next = partitionEdges(edges, tasks.map((task) => task.id));
  const afterMs = performance.now() - start;
  assert.deepEqual(next.links.map(({ source, target }) => ({ source, target })), links);
  assert.deepEqual(next.hiddenEdges, hidden);
  measurements.push({ beforeMs, afterMs, equivalent: true });
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, architecture: process.arch, nodes: tasks.length, edges: edges.length, measurements,
  scope: "Pure JavaScript projection, not widget rendering or end-to-end browser latency." }, null, 2));
