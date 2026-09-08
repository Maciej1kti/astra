/** Maintained suites receive an explicit synthetic runtime from regressions.mjs. */
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHost, localClient, pair, root } from "./host.mjs";

export function isMain(url) {
  return (
    !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === url
  );
}

export async function readSuiteRuntime(env = process.env) {
  if (!env.ASTRA_AUDIT_RUNTIME || !env.ASTRA_EVIDENCE_DIR)
    throw new Error(
      "Run this suite through scripts/browser/regressions.mjs, or provide ASTRA_AUDIT_RUNTIME and ASTRA_EVIDENCE_DIR explicitly.",
    );
  const runtime = resolve(root, env.ASTRA_AUDIT_RUNTIME);
  const evidence = resolve(root, env.ASTRA_EVIDENCE_DIR);
  const config = JSON.parse(
    await readFile(join(runtime, "connection.json"), "utf8"),
  );
  if (typeof config.origin !== "string" || typeof config.socket !== "string")
    throw new Error(
      "The selected browser runtime must contain an origin and socket.",
    );
  await mkdir(evidence, { recursive: true });
  return { runtime, evidence, config, cli: localClient(config.socket) };
}

export async function withHost(run, { create = createHost } = {}) {
  const host = await create();
  try {
    return await run(host);
  } finally {
    await host.close();
  }
}

export async function withBrowser(
  run,
  {
    launch = () =>
      chromium.launch({
        headless: true,
        executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined,
      }),
  } = {},
) {
  const browser = await launch();
  try {
    return await run({
      browser,
      newContext: (options = {}) =>
        browser.newContext({
          ignoreHTTPSErrors: true,
          viewport: { width: 1440, height: 1000 },
          ...options,
        }),
    });
  } finally {
    // This also closes contexts/pages when setup, a scenario or reporting throws.
    await browser.close();
  }
}

export async function runBrowserSuite(run) {
  const selected = await readSuiteRuntime();
  return withBrowser(({ browser, newContext }) =>
    run({
      ...selected,
      browser,
      newContext: (options = {}) =>
        newContext({
          storageState: join(selected.runtime, "browser-state.json"),
          ...options,
        }),
      pair: (page, options) =>
        pair(
          page,
          {
            origin: selected.config.origin,
            cli: selected.cli,
          },
          options,
        ),
    }),
  );
}
