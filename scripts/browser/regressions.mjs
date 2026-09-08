/** Portable browser regressions: every suite owns a fresh normally paired host. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHost, pair, root, writeRuntime } from "./host.mjs";
import { seed } from "./fixture.mjs";
import { artifactManifest } from "./artifacts.mjs";

const suites = ["card", "tags", "editor", "dialogs", "planning", "code-health", "protocol"];

export async function runSuites(selected = suites) {
  if (selected.some((suite) => !suites.includes(suite))) throw new Error(`Choose browser suites: ${suites.join(", ")}`);
  const evidence = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/regressions");
  await mkdir(evidence, { recursive: true });
  const results = [];
  let stopped = false;
  for (const suite of selected) {
    const start = Date.now();
    const output = join(evidence, suite);
    await mkdir(output, { recursive: true });
    let host, browser, child;
    const stopChild = () => { stopped = true; child?.kill("SIGTERM"); };
    process.once("SIGTERM", stopChild);
    process.once("SIGINT", stopChild);
    try {
      host = await createHost();
      const config = await seed(host);
      const runtime = await writeRuntime(host, config);
      browser = await chromium.launch({ headless: true, executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined });
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      await pair(await context.newPage(), host);
      await context.storageState({ path: join(runtime, "browser-state.json") });
      await browser.close(); browser = undefined;
      if (stopped) throw new Error("Browser regression run interrupted");
      let log = "";
      child = spawn(process.execPath, [join(import.meta.dirname, "suites", `${suite}.mjs`)], {
        cwd: root, env: { ...process.env, ASTRA_AUDIT_RUNTIME: runtime, ASTRA_EVIDENCE_DIR: output },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => { log += chunk; process.stdout.write(chunk); });
      child.stderr.on("data", (chunk) => { log += chunk; process.stderr.write(chunk); });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 300000);
      let code;
      try { code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); }); }
      finally { clearTimeout(timeout); }
      await writeFile(join(output, "run.log"), log);
      results.push({ suite, code, milliseconds: Date.now() - start });
    } catch (error) {
      results.push({ suite, code: 1, error: String(error), milliseconds: Date.now() - start });
    } finally {
      process.off("SIGTERM", stopChild); process.off("SIGINT", stopChild);
      child?.kill("SIGTERM");
      try { await browser?.close(); } finally { await host?.close(); }
      await writeFile(join(evidence, "results.json"), JSON.stringify(results, null, 2) + "\n");
    }
    if (stopped) break;
  }
  if (results.some((run) => run.code !== 0)) process.exitCode = 1;
  await artifactManifest(evidence);
  console.log(JSON.stringify({ browserSuites: results }));
  return results;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runSuites(process.argv.length > 2 ? process.argv.slice(2) : suites);
}
