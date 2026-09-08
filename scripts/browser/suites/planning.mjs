// Runs against an explicitly selected synthetic runtime through normal browser pairing.
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { verifyPlanningFixes } from "./planning-checks.mjs";

await runBrowserSuite(
  async ({
    config,
    cli,
    runtime,
    evidence: output,
    browser,
    newContext,
    pair,
  }) => {
    const context = await newContext({ timezoneId: "Pacific/Honolulu" });
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
        calendarScrollHeight: document.querySelector(
          ".calendar-surface .ec-main",
        )?.scrollHeight,
        moreLinks: [...document.querySelectorAll(".ec-day-foot a")].map(
          (element) => element.textContent,
        ),
        calendarEvents: document.querySelectorAll("[data-calendar-item]")
          .length,
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
      await pair(page);
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
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
      assert(
        timelineCardTitle.trim(),
        "Timeline fixture title must be nonempty",
      );
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
          failure.stage === "verification" &&
          failure.error !== "net::ERR_ABORTED",
      );
      const unexpectedConsole = consoleErrors.filter(
        (error) => error.stage === "verification",
      );
      const unexpectedResponses = responseErrors.filter(
        (error) => error.stage === "verification",
      );
      assert.equal(
        pageErrors.length,
        0,
        "No browser page exceptions are allowed",
      );
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
    }
  },
);
