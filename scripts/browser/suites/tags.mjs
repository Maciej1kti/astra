/** Real paired browser -> HTTPS daemon -> synthetic source files. */
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "../../..");
const runtime = resolve(root, process.env.ASTRA_AUDIT_RUNTIME ?? ".manual/audit-2026-09-08");
const evidence = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/regressions/tags");
await mkdir(evidence, { recursive: true });
const config = JSON.parse(await readFile(join(runtime, "connection.json"), "utf8"));
const cli = (...args) => {
  let output;
  try { output = execFileSync(join(root, "target", process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug", "projectctl"), ["--socket", config.socket, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { if (error.status !== 9) throw error; output = error.stdout; }
  const envelope = JSON.parse(output);
  assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
  return envelope.data;
};
const commandFile = join(runtime, "stage2-tag-command.json");
async function mutate(method, path, payload, version) {
  await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
  const args = ["command", method, path, "--json-file", commandFile];
  if (version) args.push("--if-version", version);
  return cli(...args).result;
}
const project = config.projects[0].id;
const base = `/api/v1/projects/${project}`;
const get = (id) => cli("get", `${base}/cards/${id}`);
const create = async (payload) => (await mutate("POST", `${base}/cards`, payload)).id;
const catalog = () => cli("tags", "list");
const unique = (label) => `${label} ${Date.now().toString(36)}`;
let storageState;
try { storageState = JSON.parse(await readFile(join(runtime, "browser-state.json"), "utf8")); } catch {}
const browser = await chromium.launch({ headless: true, executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined });
const results = [], errors = [];
const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
const manager = () => page.getByRole("dialog", { name: "Manage tags", exact: true });
async function shot(name) { await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: false }); }
async function open() {
  await page.goto(`${config.origin}/?view=list&project=${project}`);
  await page.getByLabel("Project", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await page.getByRole("button", { name: "Manage tags", exact: true }).click();
  await manager().getByLabel("Find tags", { exact: true }).waitFor();
}
async function close() {
  if (!(await manager().count())) return;
  await manager().getByRole("button", { name: "Close tag manager", exact: true }).click();
  const discard = manager().getByRole("button", { name: "Close review", exact: true });
  if (await discard.isVisible()) await discard.click();
  await manager().waitFor({ state: "hidden" });
}
async function add(name) {
  await manager().getByLabel("New catalog tag", { exact: true }).fill(name);
  await manager().getByRole("button", { name: "Create tag", exact: true }).click();
  await expect(manager().getByLabel("New catalog tag", { exact: true })).toHaveValue("");
  assert(catalog().tags.some((tag) => tag.name === name && tag.managed));
}
async function preview(source, target) {
  await manager().getByLabel("Find tags", { exact: true }).fill(source);
  await manager().getByRole("button", { name: `Rename or merge tag ${source}`, exact: true }).click();
  await manager().getByLabel("Destination tag", { exact: true }).fill(target);
  await manager().getByRole("button", { name: "Preview changes", exact: true }).click();
  await manager().getByRole("region", { name: "Tag change preview" }).waitFor();
}
async function apply(count) {
  await manager().getByRole("button", { name: `Apply to ${count} ${count === 1 ? "card" : "cards"}`, exact: true }).click();
  await expect(manager().getByRole("button", { name: "Close tag manager" })).toBeEnabled();
}
async function check(id, name, run) {
  try { const detail = await run(); results.push({ id, name, status: "pass", detail }); }
  catch (cause) { results.push({ id, name, status: "fail", error: String(cause) }); await shot(`${id}-failure`).catch(() => {}); }
  finally { await close().catch(() => {}); console.log(JSON.stringify(results.at(-1))); await writeFile(join(evidence, "results.json"), JSON.stringify({ results, errors }, null, 2)); }
}

try {
  await page.goto(config.origin);
  const access = page.getByRole("button", { name: "Request access", exact: true });
  await access.or(page.getByLabel("Project", { exact: true })).waitFor();
  if (await access.isVisible()) {
    await access.click();
    await page.getByText("Compare this challenge on the host machine:").waitFor();
    const visible = await page.locator("body").innerText();
    const matching = cli("pairings").items.filter((item) => visible.includes(item.challenge));
    assert.equal(matching.length, 1);
    cli("approve", matching[0].id, "--challenge", matching[0].challenge);
    await page.getByRole("button", { name: "I approved this browser", exact: true }).click();
  }
  await page.getByLabel("Project", { exact: true }).waitFor();
  await context.storageState({ path: join(runtime, "browser-state.json") });

  await check("T01", "Catalog create and workspace suggestion on another project", async () => {
    const name = unique("Reusable design, QA");
    await open(); await add(name); await shot("T01-catalog"); await close();
    const other = config.projects[1].id;
    const card = (await mutate("POST", `/api/v1/projects/${other}/cards`, { title: unique("Workspace suggestion probe") })).id;
    await page.goto(`${config.origin}/?view=list&project=${other}&type=card&resource=${card}`);
    const editor = page.getByRole("dialog", { name: "Edit resource", exact: true });
    await editor.getByLabel("Labels", { exact: true }).fill(name.slice(0, 10));
    await editor.getByRole("option", { name, exact: true }).click();
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await editor.waitFor({ state: "hidden" });
    assert.deepEqual(cli("get", `/api/v1/projects/${other}/cards/${card}`).metadata.labels, [name]);
    return { name, crossProjectSuggestion: true };
  });

  await check("T02", "Merge preserves unrelated labels, includes archived cards and finishes catalog", async () => {
    const source = unique("Merge source"), target = unique("Merge target");
    const a = await create({ title: unique("Merge active card"), labels: [source, target, "Design, research", "Cafe\u0301"] });
    const b = await create({ title: unique("Merge archived card"), labels: [" preserved ", source], archived: true });
    await open(); await add(source); await add(target); await preview(source, target);
    await expect(manager().getByRole("heading", { name: "2 affected cards" })).toBeVisible();
    await shot("T02-merge-preview"); await apply(2);
    await manager().getByRole("button", { name: "Finish catalog change", exact: true }).click();
    await expect(manager().getByText("Tag change complete.", { exact: true })).toBeVisible();
    assert.deepEqual(get(a).metadata.labels, [target, "Design, research", "Cafe\u0301"]);
    assert.deepEqual(get(b).metadata.labels, [" preserved ", target]);
    assert.equal(get(b).metadata.archived, true);
    assert(!catalog().tags.some((tag) => tag.name === source));
    assert(catalog().tags.some((tag) => tag.name === target && tag.managed && tag.usage === 2));
    await shot("T02-merge-complete"); return { cards: [a, b], archivedPreserved: true };
  });

  await check("T03", "Concurrent card edit produces partial result without overwrite and requires new preview", async () => {
    const source = unique("Conflict source"), target = unique("Conflict target");
    const a = await create({ title: unique("Conflict card"), labels: [source, "Keep"] });
    const b = await create({ title: unique("Unaffected concurrent card"), labels: [source] });
    await open(); await add(source); await preview(source, target);
    const before = get(a);
    await mutate("PATCH", `${base}/cards/${a}`, { set: { labels: [...before.metadata.labels, "Concurrent addition"], title: "External title preserved" } }, before.version);
    await apply(2);
    await expect(manager().getByText("Card changed since preview. Review a new preview before retrying.", { exact: true })).toBeVisible();
    assert.equal(get(a).metadata.title, "External title preserved");
    assert.deepEqual(get(a).metadata.labels, [source, "Keep", "Concurrent addition"]);
    assert.deepEqual(get(b).metadata.labels, [target]);
    assert(catalog().tags.some((tag) => tag.name === source && tag.managed));
    await expect(manager().getByRole("button", { name: "Finish catalog change", exact: true })).toHaveCount(0);
    await shot("T03-partial-conflict");
    await manager().getByRole("button", { name: "Review new preview", exact: true }).click();
    await manager().getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(manager().getByRole("heading", { name: "1 affected card" })).toBeVisible();
    await apply(1);
    await manager().getByRole("button", { name: "Finish catalog change", exact: true }).click();
    await expect(manager().getByText("Tag change complete.", { exact: true })).toBeVisible();
    assert.deepEqual(get(a).metadata.labels, [target, "Keep", "Concurrent addition"]);
    return { conflictPreserved: true, explicitRepreview: true };
  });

  await check("T04", "Lost card response recovers with same command identity and one history entry", async () => {
    const source = unique("Uncertain source"), target = unique("Uncertain target");
    const a = await create({ title: unique("Uncertain merge card"), labels: [source] });
    const historyBefore = cli("get", `${base}/cards/${a}/history`).items.length;
    await open(); await add(source); await preview(source, target);
    const seen = [];
    const matcher = `**${base}/cards/${a}`;
    await page.route(matcher, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      seen.push({ id: route.request().headers()["x-request-id"], epoch: route.request().headers()["x-command-epoch"], body: route.request().postData(), version: route.request().headers()["if-match"] });
      const response = await route.fetch();
      if (seen.length === 1) { assert(response.ok()); return route.abort("failed"); }
      return route.fulfill({ response });
    });
    try {
      await apply(1);
      await expect(manager().getByRole("button", { name: "Retry same card command", exact: true })).toBeEnabled();
      assert.deepEqual(get(a).metadata.labels, [target]);
      await manager().getByRole("button", { name: "Retry same card command", exact: true }).click();
      await expect(manager().getByRole("button", { name: "Finish catalog change", exact: true })).toBeEnabled();
      assert.equal(seen.length, 2); assert.deepEqual(seen[0], seen[1]);
      assert.equal(cli("get", `${base}/cards/${a}/history`).items.length, historyBefore + 1);
      await shot("T04-idempotent-recovery");
      return { retries: seen.length, sameIdentity: true, oneHistoryEntry: true };
    } finally { await page.unroute(matcher); }
  });

  await check("T05", "Workspace version conflict preserves new tag draft until explicit refresh", async () => {
    const name = unique("Catalog conflict draft");
    await open();
    const before = cli("get", "/api/v1/workspace/preferences");
    await mutate("PATCH", "/api/v1/workspace/preferences", { preferences: { week_start: before.preferences.week_start === "sunday" ? "monday" : "sunday" } }, before.version);
    await manager().getByLabel("New catalog tag", { exact: true }).fill(name);
    await manager().getByRole("button", { name: "Create tag", exact: true }).click();
    await expect(manager().getByRole("alert")).toContainText("workspace changed");
    await expect(manager().getByLabel("New catalog tag", { exact: true })).toHaveValue(name);
    assert(!catalog().tags.some((tag) => tag.name === name));
    await manager().getByRole("button", { name: "Refresh catalog", exact: true }).click();
    await expect(manager().getByRole("button", { name: "Create tag", exact: true })).toBeEnabled();
    await manager().getByRole("button", { name: "Create tag", exact: true }).click();
    await expect(manager().getByLabel("New catalog tag", { exact: true })).toHaveValue("");
    assert(catalog().tags.some((tag) => tag.name === name && tag.managed));
    return { staleRejected: true, draftPreserved: true };
  });

  await check("T06", "Historical destination spelling and mobile dark layout remain usable", async () => {
    const source = unique("Exact source"), target = ` Historical ${Date.now().toString(36)} `;
    const a = await create({ title: unique("Literal destination card"), labels: [source, target, "Unrelated"] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await open(); await add(source); await preview(source, target);
    await expect(manager().getByLabel("Destination tag", { exact: true })).toHaveValue(target);
    assert.equal(await manager().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
    await shot("T06-mobile-dark-preview"); await apply(1);
    assert.deepEqual(get(a).metadata.labels, [target, "Unrelated"]);
    await manager().getByRole("button", { name: "Close tag manager", exact: true }).click();
    await expect(manager().getByRole("button", { name: "Keep reviewing", exact: true })).toBeFocused();
    await manager().getByRole("button", { name: "Keep reviewing", exact: true }).click();
    await expect(manager()).toBeVisible();
    return { exactDestination: true, horizontalOverflow: false, closeGuard: true };
  });
} finally {
  await writeFile(join(evidence, "results.json"), JSON.stringify({ results, errors, browser: browser.version() }, null, 2));
  console.log(JSON.stringify({ passed: results.filter((item) => item.status === "pass").length, total: results.length, errors, browser: browser.version() }));
  if (results.some((item) => item.status !== "pass") || errors.length) process.exitCode = 1;
  await browser.close();
}
