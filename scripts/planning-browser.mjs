/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { annotateFailure } from "./browser/annotations.mjs";
import {
  setCalendarDate,
  setCalendarLayout,
} from "./browser/calendar-controls.mjs";
import {
  showTimelineDate,
  timelineCard,
  timelineEdge,
} from "./browser/timeline.mjs";
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
const evidenceDir = resolve(
  root,
  process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/planning-browser",
);
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
  await page.getByRole("button", { name: "Poproś o dostęp" }).click();
  await page.getByText("Porównaj ten kod na komputerze serwera:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page
    .getByRole("button", { name: "Przeglądarka została zatwierdzona" })
    .click();
  await page.getByRole("region", { name: "W Focus", exact: true }).waitFor();

  page.setDefaultTimeout(10000);
  const commandFile = join(temp, "command.json");
  const createCard = async (title, start, end) => {
    await writeFile(
      commandFile,
      JSON.stringify({ title, schedule: { start, end } }),
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
  await createCard("Build the field guide", "2026-09-08", "2026-09-10");
  const review = await createCard(
    "Review and publish",
    "2026-09-09",
    "2026-09-10",
  );
  await page.getByRole("button", { name: "Oś czasu", exact: true }).click();
  await page
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  await showTimelineDate(page, "2026-09-01");
  await timelineCard(page, "Build the field guide").waitFor();
  await page.screenshot({
    path: join(evidenceDir, "gantt-project.png"),
    fullPage: true,
  });
  const reviewPath = `/api/v1/projects/${plan.project_id}/cards/${review.id}`;
  const scheduleRequests = [];
  await page.route(`**${reviewPath}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    scheduleRequests.push({
      headers: route.request().headers(),
      payload: route.request().postDataJSON(),
    });
    if (scheduleRequests.length === 1)
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
  // One keyboard step on the end of the bar is saved at once. Its reply is
  // refused, so the dialog appears with the same command ready to repeat.
  await timelineEdge(page, "Review and publish", "end").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(
    page.getByLabel("Zaplanowany koniec", { exact: true }),
  ).toHaveValue("2026-09-11");
  await page
    .getByRole("button", { name: "Ponów to samo polecenie", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await expect.poll(() => scheduleRequests.length).toBe(2);
  for (const header of ["x-request-id", "x-command-epoch", "if-match"])
    assert.equal(
      scheduleRequests[0].headers[header],
      scheduleRequests[1].headers[header],
    );
  assert.deepEqual(scheduleRequests[0].payload, scheduleRequests[1].payload);
  // The repeated command is answered after its dialog has stepped aside.
  await expect
    .poll(() => cli("get", reviewPath).metadata.schedule)
    .toEqual({ start: "2026-09-09", end: "2026-09-11" });
  await page.unroute(`**${reviewPath}`);
  await expect(
    page.getByLabel("Dependency forecast", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Predecessor", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kalendarz", exact: true }).click();
  await setCalendarDate(page, "2026-09-07");
  await setCalendarLayout(page, "week");
  const locator = () =>
    page.getByRole("button", {
      name: "Zaplanowana praca: Design the field guide",
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
  const designPath = `/api/v1/projects/${plan.project_id}/cards/${design.id}`;
  const savedCalendar = async (start, end) => {
    await expect
      .poll(() => cli("get", designPath).metadata.schedule)
      .toEqual({ start, end });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(locator()).toHaveAttribute(
      "data-source-version",
      cli("get", designPath).version,
    );
  };
  await savedCalendar("2026-09-08", "2026-09-10");
  // A refresh must not move a gesture target or remove its resizer while the
  // displayed source version is still usable. Hold a real response across input.
  await expect(locator()).toHaveAttribute(
    "data-source-version",
    cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`)
      .version,
  );
  await hitbox(locator());
  // Refresh may scroll the document to its toolbar after editor focus returns.
  // Compare document coordinates, retaining sensitivity to widget layout shifts.
  const documentBox = () =>
    locator().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x + scrollX,
        y: box.y + scrollY,
        width: box.width,
        height: box.height,
      };
    });
  const retainedBox = await documentBox();
  const calendarRead = /\/api\/v1\/views\/calendar\?/;
  let releaseCalendar;
  let finishCalendar;
  let calendarRouteError;
  const calendarGate = new Promise((resolve) => {
    releaseCalendar = resolve;
  });
  const calendarFinished = new Promise((resolve) => {
    finishCalendar = resolve;
  });
  await page.route(
    calendarRead,
    async (route) => {
      try {
        const response = await route.fetch();
        await calendarGate;
        await route.fulfill({ response });
      } catch (error) {
        calendarRouteError = error;
      } finally {
        finishCalendar();
      }
    },
    { times: 1 },
  );
  try {
    await page.getByRole("button", { name: "Odśwież", exact: true }).click();
    await expect(
      page.getByText("Ładowanie kalendarza…", { exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      await documentBox(),
      retainedBox,
      "Background loading must not shift the calendar",
    );
    await drag("end");
  } finally {
    releaseCalendar();
    await calendarFinished;
    await page.unroute(calendarRead);
  }
  if (calendarRouteError) throw calendarRouteError;
  await savedCalendar("2026-09-08", "2026-09-11");
  await drag("start");
  await savedCalendar("2026-09-09", "2026-09-11");
  await expect(locator()).toHaveAttribute(
    "data-source-version",
    cli("get", `/api/v1/projects/${plan.project_id}/cards/${design.id}`)
      .version,
  );
  // Selection helpers have no application metadata. They must render safely
  // while a blank date range becomes an ordinary unsaved card draft.
  const blankDay = await hitbox(page.locator(".ec-all-day .ec-day").first());
  await page.mouse.move(
    blankDay.x + blankDay.width / 2,
    blankDay.y + blankDay.height - 4,
  );
  await page.mouse.down();
  await page.mouse.move(
    blankDay.x + blankDay.width * 1.5,
    blankDay.y + blankDay.height - 4,
    { steps: 12 },
  );
  await page.mouse.up();
  const selectedDraft = page.getByRole("dialog", {
    name: "Utwórz element",
    exact: true,
  });
  await expect(
    selectedDraft.getByLabel("Początek", { exact: true }),
  ).toHaveValue("2026-09-07");
  await expect(selectedDraft.getByLabel("Koniec", { exact: true })).toHaveValue(
    "2026-09-08",
  );
  await selectedDraft
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  const discardSelection = selectedDraft.getByRole("button", {
    name: "Odrzuć wersję roboczą",
    exact: true,
  });
  if (await discardSelection.isVisible()) await discardSelection.click();
  await selectedDraft.waitFor({ state: "hidden" });
  await setCalendarLayout(page, "day");
  await setCalendarDate(page, "2026-09-09");
  await locator().waitFor();
  await page.screenshot({
    path: join(evidenceDir, "calendar-day.png"),
    fullPage: true,
  });
  await setCalendarLayout(page, "agenda");
  await locator().first().waitFor();
  await page.screenshot({
    path: join(evidenceDir, "calendar-agenda.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await setCalendarLayout(page, "month");
  await page.screenshot({
    path: join(evidenceDir, "calendar-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Oś czasu", exact: true }).click();
  await timelineCard(page, "Build the field guide").waitFor();
  await page.screenshot({
    path: join(evidenceDir, "gantt-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      timelineCard(page, "Design the field guide").evaluate((element) => {
        const task = element.getBoundingClientRect();
        const viewport = element.closest(".scroller").getBoundingClientRect();
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
    "PASS: real HTTPS Gantt rendering and narrow viewport, recorded schedules, identical uncertain date retry, absence of dependency controls, calendar day/week/month/agenda, native drag, both resize boundaries, stable gestures during a held background read, blank-range draft creation and Escape cancellation. No page errors, external assets or CSP violations. Screenshots are Chromium, not physical iPhone evidence.",
  );
} catch (error) {
  annotateFailure("planning-browser", String(error?.stack ?? error));
  const activePage = browser?.contexts()[0]?.pages()[0];
  if (activePage) {
    await activePage.screenshot({
      path: join(evidenceDir, "planning-failure.png"),
      fullPage: true,
    });
    console.error(await activePage.locator("body").innerText());
    console.error(
      await activePage
        .locator(".astra-gantt,.scroller,.timeline-bar")
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
  try {
    await browser?.close();
  } finally {
    await host.close();
  }
  await artifactManifest(evidenceDir);
}
