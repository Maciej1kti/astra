/** Compatibility runner for maintained portable regression suites. */
import { runSuites } from "../../scripts/browser/regressions.mjs";
const names = {"card-browser-checks": "card", "tag-browser-checks": "tags"};
const requested = process.argv.slice(2);
if (requested.some((name) => !(name in names))) throw new Error("Unknown browser suite");
await runSuites(requested.length ? requested.map((name) => names[name]) : Object.values(names));
