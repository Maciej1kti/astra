/** Compatibility entry point; maintained coverage lives in scripts/browser. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export { runCardChecks } from "../../scripts/browser/suites/card.mjs";
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { runSuites } = await import("../../scripts/browser/regressions.mjs");
  await runSuites(["card"]);
}
