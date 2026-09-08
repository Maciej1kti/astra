// Runs only against audit-host.mjs synthetic data through normal browser pairing.
// Runtime cookies and connection details remain in the ignored .manual folder.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { verifyPlanningFixes } from "./planning-checks.mjs";

const root = resolve(import.meta.dirname, "../../..");
const runtime = resolve(root, process.env.ASTRA_AUDIT_RUNTIME ?? ".manual/audit-2026-09-08");
const output = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/regressions/planning");
const config = JSON.parse(
  await readFile(join(runtime, "connection.json"), "utf8"),
);
await mkdir(output, { recursive: true });

function cli(...args) {
  let output;
  try {
    output = execFileSync(
      join(root, "target", process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug", "projectctl"),
      ["--socket", config.socket, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    if (error.status !== 9) throw error;
    output = error.stdout;
  }
  const envelope = JSON.parse(output);
  assert.equal(envelope.ok, true, "Synthetic host CLI request must succeed");
  return envelope.data;
}

let storageState;
try {
  storageState = JSON.parse(
    await readFile(join(runtime, "browser-state.json"), "utf8"),
  );
} catch {}

const browser = await chromium.launch({ headless: true, executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  timezoneId: "Pacific/Honolulu",
  viewport: { width: 1440, height: 1000 },
  storageState,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(30000);
const started = new Date().toISOString();
let stage = "setup";
const pageErrors = [],
  consoleErrors = [],
  cspViolations = [],
  failedRequests = [],
  responseErrors = [],
  checkpoints = [];
const report = {
  started,
  status: "running",
  browser: browser.version(),
  timezone: "Pacific/Honolulu",
  fixture: { projectId: config.projects[0].id, cardId: config.cards[0].id },
  pageErrors,
  consoleErrors,
  cspViolations,
  failedRequests,
  responseErrors,
  checkpoints,
};

page.on("pageerror", (error) =>
  pageErrors.push({ stage, message: error.message }),
);
page.on("console", (message) => {
  if (message.type() === "error")
    consoleErrors.push({ stage, message: message.text() });
});
page.on("requestfailed", (request) =>
  failedRequests.push({
    stage,
    path: new URL(request.url()).pathname,
    error: request.failure()?.errorText,
  }),
);
page.on("response", (response) => {
  if (response.status() >= 400)
    responseErrors.push({
      stage,
      status: response.status(),
      path: new URL(response.url()).pathname,
    });
});
await page.exposeBinding("recordPlanningCsp", (_source, violation) =>
  cspViolations.push({ stage, ...violation }),
);
await page.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (event) => {
    void window.recordPlanningCsp({
      directive: event.violatedDirective,
      blocked: event.blockedURI,
      source: event.sourceFile,
      line: event.lineNumber,
      disposition: event.disposition,
    });
  });
});

async function checkpoint(name) {
  // Keep sticky navigation at the top of full-page evidence after trial clicks.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    calendarHeight: document
      .querySelector(".calendar-surface")
      ?.getBoundingClientRect().height,
    calendarScrollHeight: document.querySelector(".calendar-surface .ec-main")
      ?.scrollHeight,
    moreLinks: [...document.querySelectorAll(".ec-day-foot a")].map(
      (element) => element.textContent,
    ),
    calendarEvents: document.querySelectorAll("[data-calendar-item]").length,
    calendarLayout: document.querySelector('[aria-label="Calendar layout"]')
      ?.value,
    selectedTitle: document.querySelector(".selected-summary strong")
      ?.textContent,
  }));
  const screenshot = `${name}.png`;
  await page.screenshot({ path: join(output, screenshot), fullPage: true });
  checkpoints.push({ name, screenshot, ...metrics });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      checkpoint: name,
      calendarHeight: metrics.calendarHeight,
      documentWidth: metrics.documentWidth,
    }),
  );
}

try {
  await page.goto(config.origin);
  const navigation = page.getByRole("navigation", { name: "Workspace views" });
  const request = page.getByRole("button", { name: /Request access/ });
  const approved = page.getByRole("button", {
    name: "I approved this browser",
    exact: true,
  });
  await navigation.or(request).or(approved).waitFor({ state: "visible" });
  if (!(await navigation.isVisible())) {
    if (await request.isVisible()) await request.click();
    await approved.waitFor({ state: "visible" });
    const body = await page.locator("body").innerText();
    const matches = cli("pairings").items.filter((pairing) =>
      body.includes(pairing.challenge),
    );
    assert.equal(
      matches.length,
      1,
      "Exactly one pairing challenge must match this browser",
    );
    cli("approve", matches[0].id, "--challenge", matches[0].challenge);
    await approved.click();
  }
  await navigation.waitFor({ state: "visible" });
  await expect(page.locator(".asidebottom")).toContainText("Connected to host");
  await context.storageState({ path: join(runtime, "browser-state.json") });
  const workspaceToday = (
    await page.locator(".topbar .date").innerText()
  ).trim();
  assert.match(workspaceToday, /^\d{4}-\d{2}-\d{2}$/);
  report.workspaceToday = workspaceToday;
  report.browserDate = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA").format(new Date()),
  );
  stage = "verification";
  const project = config.projects[0].id;
  const timelineCard = cli(
    "get",
    `/api/v1/projects/${project}/cards/${config.cards[0].id}`,
  );
  const timelineCardTitle = timelineCard.metadata.title;
  assert.equal(
    typeof timelineCardTitle,
    "string",
    "Timeline fixture must expose its saved title",
  );
  assert(timelineCardTitle.trim(), "Timeline fixture title must be nonempty");
  report.checks = await verifyPlanningFixes(page, {
    calendarUrl: `${config.origin}/?view=calendar&project=${project}&date=2026-09-08&layout=month`,
    workspaceToday,
    fixtureDate: "2026-09-08",
    timelineUrl: `${config.origin}/?view=gantt&project=${project}&month=2026-09`,
    timelineCardId: config.cards[0].id,
    timelineCardTitle,
    onCheckpoint: checkpoint,
  });
  const unexpectedRequests = failedRequests.filter(
    (failure) =>
      failure.stage === "verification" && failure.error !== "net::ERR_ABORTED",
  );
  const unexpectedConsole = consoleErrors.filter(
    (error) => error.stage === "verification",
  );
  const unexpectedResponses = responseErrors.filter(
    (error) => error.stage === "verification",
  );
  assert.equal(pageErrors.length, 0, "No browser page exceptions are allowed");
  assert.equal(cspViolations.length, 0, "No CSP violations are allowed");
  assert.equal(
    unexpectedConsole.length,
    0,
    "No verification console errors are allowed",
  );
  assert.equal(
    unexpectedResponses.length,
    0,
    "No verification HTTP errors are allowed",
  );
  assert.equal(
    unexpectedRequests.length,
    0,
    "Only navigation-aborted requests are expected",
  );
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = String(error);
  report.stack = error.stack;
  await checkpoint("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  report.completed = new Date().toISOString();
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    join(output, "README.md"),
    `# Planning browser verification\n\nStatus: **${report.status}**.\n\nChromium ${report.browser}, Pacific/Honolulu, desktop 1440 × 1000 and emulated phone 390 × 844.\n\nThe browser used normal pairing and an isolated synthetic host. Self-signed HTTPS was accepted only by the test browser; production CSP/auth/TLS policy was unchanged. Physical iPhone behavior is not claimed.\n\nSee [results.json](results.json) for assertions, layout metrics, page/console/CSP/network telemetry and any failure. Screenshots are captured at named workflow checkpoints.\n`,
  );
  console.log(
    JSON.stringify({
      status: report.status,
      error: report.error,
      screenshots: checkpoints.length,
      pageErrors: pageErrors.length,
      cspViolations: cspViolations.length,
    }),
  );
  stage = "teardown";
  await browser.close();
}
