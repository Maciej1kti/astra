/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHost } from "./browser/host.mjs";
import { artifactManifest } from "./browser/artifacts.mjs";
import { join, resolve } from "node:path";
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
const evidenceDir = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/planning-browser");
await mkdir(evidenceDir, { recursive: true });
const host = await createHost();
const { temp, folder, cli, origin } = host;
let browser;
try {
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
  // A refresh must not move a gesture target or remove its resizer while the
  // displayed source version is still usable. Hold a real response across input.
  await expect(locator()).toHaveAttribute("data-source-version", cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`).version);
  const retainedBox = await hitbox(locator());
  const calendarRead = /\/api\/v1\/views\/calendar\?/;
  let releaseCalendar;
  let finishCalendar;
  let calendarRouteError;
  const calendarGate = new Promise((resolve) => { releaseCalendar = resolve; });
  const calendarFinished = new Promise((resolve) => { finishCalendar = resolve; });
  await page.route(calendarRead, async (route) => {
    try {
      const response = await route.fetch();
      await calendarGate;
      await route.fulfill({ response });
    } catch (error) { calendarRouteError = error; }
    finally { finishCalendar(); }
  }, { times: 1 });
  try {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("Loading calendar…", { exact: true })).toBeVisible();
    assert.deepEqual(await locator().boundingBox(), retainedBox, "Background loading must not shift the calendar");
    await drag("end");
  } finally {
    releaseCalendar();
    await calendarFinished;
    await page.unroute(calendarRead);
  }
  if (calendarRouteError) throw calendarRouteError;
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
  await expect(locator()).toHaveAttribute("data-source-version", cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`).version);
  // Selection helpers have no application metadata. They must render safely
  // while a blank date range becomes an ordinary unsaved card draft.
  const blankDay = await hitbox(page.locator(".ec-body .ec-day").first());
  await page.mouse.move(blankDay.x + blankDay.width / 2, blankDay.y + blankDay.height - 4);
  await page.mouse.down();
  await page.mouse.move(blankDay.x + blankDay.width * 1.5, blankDay.y + blankDay.height - 4, { steps: 12 });
  await page.mouse.up();
  const selectedDraft = page.getByRole("dialog", { name: "Create resource", exact: true });
  await expect(selectedDraft.getByLabel("Start", { exact: true })).toHaveValue("2026-09-07");
  await expect(selectedDraft.getByLabel("End", { exact: true })).toHaveValue("2026-09-08");
  await selectedDraft.getByRole("button", { name: "Close editor", exact: true }).click();
  const discardSelection = selectedDraft.getByRole("button", { name: "Discard draft", exact: true });
  if (await discardSelection.isVisible()) await discardSelection.click();
  await selectedDraft.waitFor({ state: "hidden" });
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
    "PASS: real HTTPS Gantt rendering and narrow viewport, forecast, connector links, identical uncertain retry, disconnect preserving other edges, calendar day/week/month/agenda, native drag, both resize boundaries, stable gestures during a held background read, blank-range draft creation and Escape cancellation. No page errors, external assets or CSP violations. Screenshots are Chromium, not physical iPhone evidence.",
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
  try { await browser?.close(); } finally { await host.close(); }
  await artifactManifest(evidenceDir);
}
