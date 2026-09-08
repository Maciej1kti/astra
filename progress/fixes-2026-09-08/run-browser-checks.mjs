/** Sequential audit regressions against the isolated, normally paired synthetic host. */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const runs = [];
const available = ["editor-browser-checks", "planning-check-runner", "board-dialog-browser-checks"];
const requested = process.argv.slice(2);
if (requested.some((name) => !available.includes(name))) throw new Error("Choose a known audit regression suite.");
for (const name of requested.length ? requested : available) {
  const started = new Date().toISOString();
  const log = createWriteStream(join(import.meta.dirname, `${name}-run.txt`));
  console.log(`Running ${name}`);
  const child = spawn(process.execPath, [join(import.meta.dirname, `${name}.mjs`)], {
    cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject); child.on("exit", resolve);
  });
  await new Promise((resolve) => log.end(resolve));
  runs.push({ name, started, finished: new Date().toISOString(), exitCode });
  console.log(`${name}: ${exitCode === 0 ? "PASS" : "FAIL"}`);
  await writeFile(join(import.meta.dirname, "browser-runs.json"), JSON.stringify(runs, null, 2));
}
if (runs.some((run) => run.exitCode !== 0)) process.exitCode = 1;
