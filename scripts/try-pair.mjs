/** Approve only the exact challenge explicitly supplied by the local owner. */
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname,"..");
const challenge = process.argv.slice(2).join(" ").trim();
if (!challenge) { console.error('Usage: npm run pair:try -- "CHALLENGE_FROM_BROWSER"'); process.exit(2); }
const cli = (...args) => JSON.parse(execFileSync(join(root,"target/release/projectctl"),["--socket",join(root,".manual/state/projectd.sock"),...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]})).data;
try {
  const matching = cli("pairings").items.filter(item => item.challenge === challenge);
  if (matching.length !== 1) throw new Error("No unique pending request matches that challenge. Compare the current browser challenge and try again.");
  cli("approve",matching[0].id,"--challenge",challenge);
  console.log("Approved the matching manual-test browser. Return to the browser to connect.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
