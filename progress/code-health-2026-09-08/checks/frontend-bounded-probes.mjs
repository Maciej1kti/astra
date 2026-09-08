import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import ts from "typescript";

// Read-only synthetic reproductions. Run from any directory with Node 24:
// node progress/code-health-2026-09-08/checks/frontend-bounded-probes.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const apiSource = fs.readFileSync(path.join(root, "apps/web/src/lib/api.ts"), "utf8");
const apiJs = ts.transpileModule(apiSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { all } = await import(`data:text/javascript;base64,${Buffer.from(apiJs).toString("base64")}`);

let requests = 0;
globalThis.fetch = async () => {
  requests++;
  return {
    status: 200,
    ok: true,
    json: async () => ({
      items: Array.from({ length: 200 }, (_, i) => ({ id: String(requests * 200 + i) })),
      page: { next_cursor: "more" },
    }),
  };
};
let allResult;
try {
  await all("/mock/updates");
  throw new Error("The current bounded all() helper unexpectedly returned successfully.");
} catch (error) {
  allResult = { requests, fetchedItems: requests * 200, message: error.message };
  if (requests !== 100 || error.message !== "Result is too large. Narrow the project or search filter.") throw error;
}

// These are the expressions from GanttView.svelte:91-109, operating without
// Svelte reactivity or browser rendering. The graph is acyclic and respects the
// current UI page size (200) and schema maximum of 100 predecessors per card.
const tasks = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
const edges = tasks.flatMap((task, i) =>
  tasks.slice(Math.max(0, i - 100), i).map((previous) => ({ from: previous.id, to: task.id })),
);
const measurements = [];
for (let sample = 0; sample < 3; sample++) {
  const start = performance.now();
  const links = edges
    .filter((e) => tasks.some((t) => t.id === e.from) && tasks.some((t) => t.id === e.to))
    .map((e) => ({ source: e.from, target: e.to }));
  const hidden = edges.filter((e) => !links.some((l) => l.source === e.from && l.target === e.to));
  const originalMs = performance.now() - start;
  const replacementStart = performance.now();
  const ids = new Set(tasks.map((t) => t.id));
  const nextLinks = [], nextHidden = [];
  for (const e of edges) {
    if (ids.has(e.from) && ids.has(e.to)) nextLinks.push({ source: e.from, target: e.to });
    else nextHidden.push(e);
  }
  const linearMs = performance.now() - replacementStart;
  const equal = JSON.stringify([links, hidden]) === JSON.stringify([nextLinks, nextHidden]);
  if (!equal) throw new Error("Graph projection outputs differ.");
  measurements.push({ sample, originalMs: +originalMs.toFixed(2), linearMs: +linearMs.toFixed(2), equal });
}

console.log(JSON.stringify({
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  scope: "Synthetic read-only probes; not a browser or product performance benchmark.",
  all: allResult,
  gantt: { nodes: tasks.length, edges: edges.length, maxDependenciesPerCard: 100, measurements },
}, null, 2));
