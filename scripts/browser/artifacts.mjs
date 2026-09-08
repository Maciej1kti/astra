/** Inventory bulk artifacts without including temporary runtime credentials. */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function artifactManifest(directory) {
  const files = [];
  async function walk(relative = "") {
    for (const entry of (await readdir(join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && name !== "manifest.json") {
        const bytes = await readFile(join(directory, name));
        files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      }
    }
  }
  await walk();
  const manifest = { files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
