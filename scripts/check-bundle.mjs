/** Enforce the compressed initial JavaScript/CSS budget, including static imports. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const INITIAL_BUNDLE_LIMIT = 300 * 1024;

export async function measureInitialBundle(manifest, readAsset) {
  const visited = new Set(),
    files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing static bundle import: ${key}`);
    if (/\.(js|css)$/.test(chunk.file)) files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (!entries.length)
    throw new Error("The frontend manifest has no entry point.");
  for (const entry of entries) visit(entry);
  const assets = await Promise.all(
    [...files].sort().map(async (file) => ({
      file,
      gzipBytes: gzipSync(await readAsset(file), { level: 9 }).length,
    })),
  );
  return {
    assets,
    gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    limitBytes: INITIAL_BUNDLE_LIMIT,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const dist = new URL("../apps/web/dist/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL(".vite/manifest.json", dist), "utf8"),
  );
  const result = await measureInitialBundle(manifest, (file) =>
    readFile(new URL(file, dist)),
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.gzipBytes > result.limitBytes)
    throw new Error("Initial JavaScript/CSS exceeds the 300 KiB gzip budget.");
}
