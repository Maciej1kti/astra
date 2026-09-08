import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { measureInitialBundle } from "../check-bundle.mjs";

test("initial bundle measurement follows static imports, deduplicates CSS and excludes lazy views", async () => {
  const manifest = {
    "index.html": { isEntry: true, file: "entry.js", css: ["shared.css"], imports: ["shared"], dynamicImports: ["planning"] },
    shared: { file: "shared.js", css: ["shared.css"], imports: ["cycle"] },
    cycle: { file: "cycle.js", imports: ["shared"] },
    planning: { file: "planning.js", css: ["planning.css"] },
  };
  const result = await measureInitialBundle(manifest, async (file) => Buffer.from(file.repeat(100)));
  assert.deepEqual(result.assets.map((asset) => asset.file), ["cycle.js", "entry.js", "shared.css", "shared.js"]);
  assert.equal(result.gzipBytes, result.assets.reduce((total, { file }) => total + gzipSync(Buffer.from(file.repeat(100)), { level: 9 }).length, 0));
  await assert.rejects(measureInitialBundle({}, async () => Buffer.alloc(0)), /no entry point/);
  await assert.rejects(measureInitialBundle({ entry: { isEntry: true, file: "entry.js", imports: ["absent"] } }, async () => Buffer.alloc(0)), /Missing static/);
});
