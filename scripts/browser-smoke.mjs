/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { chromium, devices } from "@playwright/test";
import { mkdtemp, mkdir, realpath, readFile, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const temp = await realpath(
  await mkdtemp(join(await realpath("/tmp"), "lp-browser-")),
);
const state = join(temp, "state"),
  folder = join(temp, "Field notes");
await mkdir(state, { mode: 0o700 });
await mkdir(folder, { mode: 0o700 });
const socket = join(state, "projectd.sock");
const cli = (...args) =>
  JSON.parse(
    execFileSync(
      join(root, "target/debug/projectctl"),
      ["--socket", socket, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ).body;
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(temp, "key.pem"),
    "-out",
    join(temp, "cert.pem"),
    "-subj",
    "/CN=localhost",
    "-days",
    "1",
  ],
  { stdio: "ignore" },
);
const reserve = http.createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const proxy = https.createServer(
  {
    key: await readFile(join(temp, "key.pem")),
    cert: await readFile(join(temp, "cert.pem")),
  },
  (incoming, outgoing) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    request.on("error", () => {
      outgoing.writeHead(503);
      outgoing.end();
    });
    incoming.pipe(request);
    outgoing.on("close", () => request.destroy());
  },
);
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const origin = `https://localhost:${proxy.address().port}`;
const daemon = spawn(
  join(root, "target/debug/projectd"),
  ["--data-dir", state, "--public-origin", origin, "--port", String(port)],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let daemonLog = "";
daemon.stderr.on("data", (data) => (daemonLog += data));
let browser;
try {
  let ready = false,
    lastFailure;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      cli("hello");
      ready = true;
      break;
    } catch (error) {
      lastFailure = error.stderr?.toString() ?? error.message;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert(ready, daemonLog + lastFailure);
  const plan = cli("registration-plan", folder, "--name", "Field notes");
  cli("register", plan.plan_id);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "Request access" }).click();
  await page.getByText("Compare this challenge on the host machine:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page.getByRole("button", { name: "I approved this browser" }).click();
  await page
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption(plan.project_id);
  await page.getByRole("button", { name: "Add card", exact: false }).click();
  await page.getByLabel("Title", { exact: true }).fill("Ship the field guide");
  await page.getByLabel("Start", { exact: true }).fill("2026-09-07");
  await page.getByLabel("End", { exact: true }).fill("2026-09-12");
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-15");
  await page
    .getByLabel("Description Markdown source")
    .fill('A real browser write.\n\n<script>alert("untrusted")</script>');
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  await page.getByText("Connected to host", { exact: false }).waitFor();
  await mkdir(join(root, "progress/screenshots"), { recursive: true });
  await page.screenshot({
    path: join(root, "progress/screenshots/desktop-board.png"),
    fullPage: true,
  });
  const cards = cli("get", `/api/v1/projects/${plan.project_id}/cards`).items;
  assert.equal(cards.length, 1);
  const path = `/api/v1/projects/${plan.project_id}/cards/${cards[0].id}`;
  const resource = cli("get", path);
  assert.equal(resource.metadata.title, "Ship the field guide");
  assert.equal(resource.metadata.schedule.end, "2026-09-12");
  const second = await browser.newContext({
    ignoreHTTPSErrors: true,
    ...devices["iPhone 13"],
    storageState: await context.storageState(),
  });
  const mobile = await second.newPage();
  await mobile.goto(origin);
  await mobile
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();
  await mobile.getByRole("button", { name: "Board", exact: true }).click();
  await mobile.getByRole("heading", { name: "Ship the field guide" }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Ship the revised guide");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await mobile
    .getByLabel("Title", { exact: true })
    .fill("Keep my mobile draft");
  await mobile.getByRole("button", { name: "Save changes" }).click();
  await mobile
    .getByText("Current saved version · your draft stays above")
    .waitFor();
  assert.equal(
    await mobile.getByLabel("Title", { exact: true }).inputValue(),
    "Keep my mobile draft",
  );
  assert.equal(cli("get", path).metadata.title, "Ship the revised guide");
  await mobile.screenshot({
    path: join(root, "progress/screenshots/mobile-conflict.png"),
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Close editor" }).click();
  for (const view of ["Calendar", "Timeline", "List", "Updates", "Projects"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: HTTPS pairing, real file creation, desktop and mobile emulation, concurrent edit conflict, draft preservation, seven views.",
  );
  console.log(
    "This is Chromium device emulation, not physical iPhone or Safari evidence.",
  );
} finally {
  await browser?.close();
  daemon.kill("SIGTERM");
  await new Promise((r) => {
    if (daemon.exitCode !== null) r();
    else daemon.once("exit", r);
  });
  proxy.closeAllConnections();
  await new Promise((r) => proxy.close(r));
  await rm(temp, { recursive: true, force: true });
}
