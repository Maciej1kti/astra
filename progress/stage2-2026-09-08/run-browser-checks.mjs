/** Run the new stage's independent real-browser suites sequentially. */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const suites = ["card-browser-checks", "tag-browser-checks"];
const chosen = process.argv.slice(2);
if (chosen.some((name) => !suites.includes(name))) throw new Error("Unknown stage 2 browser suite");
const results = [];
for (const suite of chosen.length ? chosen : suites) {
  let output = "";
  const started = Date.now();
  const child = spawn(process.execPath, [join(import.meta.dirname, `${suite}.mjs`)], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  const logs = join(import.meta.dirname, "checks");
  await mkdir(logs, { recursive: true });
  await writeFile(join(logs, `${suite}.log`), output);
  results.push({ suite, exitCode: code, milliseconds: Date.now() - started });
}
await writeFile(join(import.meta.dirname, "checks/browser-suites.json"), JSON.stringify(results, null, 2));
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
