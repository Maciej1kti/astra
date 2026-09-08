/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { chromium, expect } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  realpath,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
async function hitbox(locator, attempt = 0) {
  try {
    await locator.waitFor({ state: "visible" });
    await expect(locator).toBeEnabled();
    await locator.scrollIntoViewIfNeeded();
    // Layout can settle after scrollIntoView or a preceding full-page screenshot.
    await locator.evaluate(
      (element) =>
        new Promise((resolve) => {
          let previous = "",
            stable = 0,
            frames = 0;
          const check = () => {
            const rect = element.getBoundingClientRect();
            const current = `${rect.x},${rect.y},${rect.width},${rect.height}`;
            stable = current === previous ? stable + 1 : 0;
            previous = current;
            if (stable >= 2 || ++frames >= 120) resolve(null);
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
    );
    const box = await locator.boundingBox();
    if (!box && attempt < 2) return hitbox(locator, attempt + 1);
    assert(
      box,
      "The gesture target must be rendered before sending pointer input",
    );
    return box;
  } catch (error) {
    if (attempt < 2 && /not attached|detached/.test(String(error)))
      return hitbox(locator, attempt + 1);
    throw error;
  }
}
const root = resolve(import.meta.dirname, "..");
const evidenceDir = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "progress/screenshots");
await mkdir(evidenceDir, { recursive: true });
const binaries = join(
  root,
  "target",
  process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug",
);
const temp = await realpath(
  await mkdtemp(join(await realpath("/tmp"), "lp-browser-")),
);
const state = join(temp, "state"),
  folder = join(temp, "Field notes");
await mkdir(state, { mode: 0o700 });
await mkdir(folder, { mode: 0o700 });
const socket = join(state, "projectd.sock");
const cli = (...args) => {
  let output;
  try {
    output = execFileSync(
      join(binaries, "projectctl"),
      ["--socket", socket, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // Registration returns an accepted job; the test explicitly checks its state.
    if (error.status !== 9) throw error;
    output = error.stdout;
  }
  const envelope = JSON.parse(output);
  assert.equal(envelope.api_version, "1");
  assert.equal(envelope.ok, true);
  return envelope.data;
};
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
  join(binaries, "projectd"),
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
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.addInitScript(() => {
    window.astraCspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.astraCspViolations.push(e.violatedDirective),
    );
  });
  const externalRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin)
      externalRequests.push(request.url());
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "Request access" }).click();
  await page.getByText("Compare this challenge on the host machine:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page.getByRole("button", { name: "I approved this browser" }).click();
  await page
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();

  page.setDefaultTimeout(10000);
  const commandFile = join(temp, "command.json");
  const createCard = async (title, start, end, depends = []) => {
    await writeFile(
      commandFile,
      JSON.stringify({ title, schedule: { start, end }, depends_on: depends }),
    );
    return cli(
      "command",
      "POST",
      `/api/v1/projects/${plan.project_id}/cards`,
      "--json-file",
      commandFile,
    ).result;
  };
  const design = await createCard(
    "Design the field guide",
    "2026-09-07",
    "2026-09-09",
  );
  const build = await createCard(
    "Build the field guide",
    "2026-09-08",
    "2026-09-10",
    [design.id],
  );
  const review = await createCard(
    "Review and publish",
    "2026-09-09",
    "2026-09-10",
    [build.id],
  );
  await page
    .getByLabel("Project", { exact: true })
    .selectOption(plan.project_id);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Month", { exact: true }).fill("2026-09");
  await page
    .getByRole("button", {
      name: "Move plan: Build the field guide",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: join(evidenceDir, "gantt-project.png"),
    fullPage: true,
  });
  const reviewPath = `/api/v1/projects/${plan.project_id}/cards/${review.id}`;
  const dependencyRequests = [];
  await page.route(`**${reviewPath}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    dependencyRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    if (dependencyRequests.length === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SERVER_BUSY",
            message: "Synthetic uncertain transport",
          },
        }),
      });
    return route.continue();
  });
  await page
    .getByRole("button", {
      name: "Connect from Design the field guide",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Connect from Review and publish",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save dependencies", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same command", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(dependencyRequests.length, 2);
  for (const header of ["x-request-id", "x-command-epoch", "if-match"])
    assert.equal(
      dependencyRequests[0].headers[header],
      dependencyRequests[1].headers[header],
    );
  assert.deepEqual(
    dependencyRequests[0].payload,
    dependencyRequests[1].payload,
  );
  assert.deepEqual(
    new Set(cli("get", reviewPath).metadata.depends_on),
    new Set([design.id, build.id]),
  );
  await page.unroute(`**${reviewPath}`);
  await page.getByText("Dependencies · 3", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Disconnect Design the field guide from Review and publish",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save dependencies", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(cli("get", reviewPath).metadata.depends_on, [build.id]);
  await page.getByLabel("Dependency forecast", { exact: true }).check();
  await page.screenshot({
    path: join(evidenceDir, "gantt-forecast.png"),
    fullPage: true,
  });
  await page.getByLabel("Dependency forecast", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Go to date", { exact: true }).fill("2026-09-07");
  await page
    .getByLabel("Calendar layout", { exact: true })
    .selectOption("week");
  const locator = () =>
    page.getByRole("button", {
      name: "Planned work: Design the field guide",
      exact: true,
    });
  await locator().waitFor();
  await page.screenshot({
    path: join(evidenceDir, "calendar-project.png"),
    fullPage: true,
  });
  const baseline = cli(
    "get",
    `/api/v1/projects/${plan.project_id}/cards/${design.id}`,
  );
  const drag = async (mode, cancel = false) => {
    const event = locator();
    await expect(event).toHaveClass(/ec-draggable/);
    await expect(event).toHaveAttribute(
      "data-source-version",
      cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`)
        .version,
    );
    const handle =
      mode === "move"
        ? event
        : event.locator(
            mode === "start"
              ? ".ec-resizer.ec-start"
              : ".ec-resizer:not(.ec-start)",
          );
    const box = await hitbox(handle);
    const day = await page.locator(".ec-body .ec-day").first().boundingBox();
    assert(day);
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + day.width, box.y + box.height / 2, { steps: 12 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  await drag("move", true);
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`)
      .version,
    baseline.version,
  );
  await drag("move");
  await expect(page.getByLabel("Planned start", { exact: true })).toHaveValue(
    "2026-09-08",
  );
  await expect(page.getByLabel("Planned end", { exact: true })).toHaveValue(
    "2026-09-10",
  );
  await page
    .getByRole("button", { name: "Save planned dates", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await drag("end");
  await expect(page.getByLabel("Planned start", { exact: true })).toHaveValue(
    "2026-09-08",
  );
  await expect(page.getByLabel("Planned end", { exact: true })).toHaveValue(
    "2026-09-11",
  );
  await page
    .getByRole("button", { name: "Save planned dates", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await drag("start");
  await expect(page.getByLabel("Planned start", { exact: true })).toHaveValue(
    "2026-09-09",
  );
  await expect(page.getByLabel("Planned end", { exact: true })).toHaveValue(
    "2026-09-11",
  );
  await page
    .getByRole("button", { name: "Save planned dates", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("Calendar layout", { exact: true }).selectOption("day");
  await page.getByLabel("Go to date", { exact: true }).fill("2026-09-09");
  await locator().waitFor();
  await page.screenshot({
    path: join(evidenceDir, "calendar-day.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Calendar layout", { exact: true })
    .selectOption("agenda");
  await locator().first().waitFor();
  await page.screenshot({
    path: join(evidenceDir, "calendar-agenda.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page
    .getByLabel("Calendar layout", { exact: true })
    .selectOption("month");
  await page.screenshot({
    path: join(evidenceDir, "calendar-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Move plan: Build the field guide",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: join(evidenceDir, "gantt-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .getByRole("button", {
          name: "Move plan: Design the field guide",
          exact: true,
        })
        .evaluate((element) => {
          const task = element.getBoundingClientRect();
          const viewport = element.closest(".chart").getBoundingClientRect();
          return task.right > viewport.left && task.left < viewport.right;
        }),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: join(evidenceDir, "gantt-narrow.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.astraCspViolations), []);
  assert.deepEqual(externalRequests, []);
  console.log(
    "PASS: real HTTPS Gantt rendering and narrow viewport, forecast, connector links, identical uncertain retry, disconnect preserving other edges, calendar day/week/month/agenda, native drag, both resize boundaries and Escape cancellation. No page errors, external assets or CSP violations. Screenshots are Chromium, not physical iPhone evidence.",
  );
} catch (error) {
  const activePage = browser?.contexts()[0]?.pages()[0];
  if (activePage) {
    await activePage.screenshot({
      path: join(evidenceDir, "planning-failure.png"),
      fullPage: true,
    });
    console.error(await activePage.locator("body").innerText());
    console.error(
      await activePage
        .locator(".chart,.wx-gantt,.wx-chart,.wx-bar")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            class: element.className,
            rect: element.getBoundingClientRect().toJSON(),
            scroll: element.scrollLeft,
            width: element.scrollWidth,
            style: element.getAttribute("style"),
          })),
        ),
    );
  }
  throw error;
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
