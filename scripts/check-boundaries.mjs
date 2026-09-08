import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(root, "apps/web/src");

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(ts|svelte)$/.test(entry.name)) yield path;
  }
}

const violations = [];
for await (const path of files(resolve(sourceRoot, "lib"))) {
  const source = await readFile(path, "utf8");
  const script = path.endsWith(".svelte")
    ? (source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "")
    : source;
  for (const imported of ts.preProcessFile(script, true, true).importedFiles) {
    const target = imported.fileName;
    if (!target.startsWith(".")) continue;
    if (
      relative(sourceRoot, resolve(dirname(path), target)).startsWith(
        "features/",
      )
    )
      violations.push(
        `${relative(root, path)} imports feature implementation ${target}`,
      );
  }
}
if (violations.length) throw new Error(violations.join("\n"));
console.log("Shared frontend modules have no feature implementation imports.");
