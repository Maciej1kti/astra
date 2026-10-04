/** Counter visualization through ordinary paired reads and conditional source writes. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const context = await newContext({
      timezoneId: "America/Los_Angeles",
      hasTouch: true,
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [],
      checks = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) =>
      requests.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
      }),
    );
    await page.addInitScript(() => {
      window.chartCsp = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        window.chartCsp.push(event.effectiveDirective),
      );
    });
    const dashboard = page.getByRole("region", {
      name: "Counter dashboard",
      exact: true,
    });
    const project = page.getByLabel("Project", { exact: true });
    const commandFile = join(runtime, "chart-command.json");
    const mutate = async (method, path, payload, version) => {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      return cli(
        "command",
        method,
        path,
        "--json-file",
        commandFile,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    };
    const sourceCards = [];
    async function createCard(projectId, title, definitions) {
      const base = `/api/v1/projects/${projectId}/cards`;
      let card = await mutate("POST", base, {
        title,
        status: "active",
        body: "Temporary synthetic counter dashboard fixture.",
      });
      const path = `${base}/${card.metadata.id}`;
      const items = [];
      for (const definition of definitions) {
        card = await mutate(
          "PATCH",
          path,
          {
            configure_counter: {
              name: definition.name,
              unit: definition.unit,
              step: 1,
              archived: false,
            },
          },
          card.version,
        );
        const id = card.metadata.counters.at(-1).id;
        for (const [date, value] of definition.values) {
          card = await mutate(
            "PATCH",
            path,
            { record_counter: { id, date, value } },
            card.version,
          );
        }
        if (definition.archived) {
          card = await mutate(
            "PATCH",
            path,
            {
              configure_counter: {
                id,
                name: definition.name,
                unit: definition.unit,
                step: 1,
                archived: true,
              },
            },
            card.version,
          );
        }
        items.push({ ...definition, id, cardTitle: title });
      }
      const fixture = { path, card, items };
      sourceCards.push(fixture);
      return fixture;
    }
    const checkbox = (name, cardTitle) =>
      dashboard.getByRole("checkbox", {
        name: `${name} · ${cardTitle}`,
        exact: true,
      });
    const chart = (unit) =>
      dashboard.getByRole("img", {
        name: `Counter chart: ${unit}`,
        exact: true,
      });
    const panel = (unit) =>
      dashboard.getByRole("region", {
        name: `Chart in ${unit}`,
        exact: true,
      });
    const statRow = (name) =>
      dashboard.locator(`tr[data-counter-name="${name}"]`);
    const statistic = (name, field) =>
      statRow(name).locator(`[data-chart-stat="${field}"]`);
    const rate = (name, cardTitle) =>
      dashboard.getByLabel(`Rate for ${name} · ${cardTitle}`, { exact: true });
    async function tableValues(unit) {
      const table = panel(unit).getByRole("table");
      if (!(await table.isVisible()))
        await panel(unit).getByText("Show chart data", { exact: true }).click();
      return table.locator("tbody tr").evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(row.querySelectorAll("td"), (cell) => ({
            value: cell.firstChild.textContent.trim(),
            recording: cell.querySelector("small").textContent,
          })),
        ),
      );
    }
    const settle = () =>
      page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
    async function screenshot(name) {
      if (browser.browserType().name() !== "chromium") return;
      await settle();
      await page.screenshot({
        path: join(evidence, `${name}.png`),
        fullPage: true,
      });
    }
    try {
      await page.goto(
        `${config.origin}/?view=chart&project=${config.projects[2].id}`,
      );
      await expect(dashboard).toBeVisible();
      await expect(dashboard.getByRole("img")).toHaveCount(0);
      await expect(dashboard).toContainText(/no counters/i);
      const today = await dashboard
        .getByLabel("To date", { exact: true })
        .inputValue();
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
      const day = (offset) => {
        const date = new Date(`${today}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - offset);
        return date.toISOString().slice(0, 10);
      };
      await screenshot("chart-empty");
      checks.push(
        "empty project has discoverable Chart controls and no invented series",
      );

      const training = await createCard(
        config.projects[0].id,
        "Synthetic training",
        [
          {
            name: "Push-ups",
            unit: "reps",
            values: [
              [day(6), 10],
              [day(4), 0],
              [day(2), 20],
              [day(0), 30],
            ],
          },
          {
            name: "Squats",
            unit: "reps",
            values: [
              [day(6), 20],
              [day(2), 20],
              [day(0), 40],
            ],
          },
          {
            name: "Retired repetitions",
            unit: "reps",
            values: [[day(0), 40]],
            archived: true,
          },
          { name: "No recorded history", unit: "reps", values: [] },
        ],
      );
      await createCard(config.projects[0].id, "Synthetic paid work", [
        {
          name: "Work hours",
          unit: "hours",
          values: [
            [day(6), 2],
            [day(2), 3],
            [day(0), 5],
          ],
        },
      ]);
      await createCard(config.projects[1].id, "Synthetic reading", [
        {
          name: "Pages",
          unit: "pages",
          values: [
            [day(4), 10],
            [day(0), 20],
          ],
        },
      ]);
      await createCard(config.projects[0].id, "Synthetic study", [
        {
          name: "Study minutes",
          unit: "min",
          values: [35, 50, 0, 45, 60, 40, 55, 70, 30, 75, 60, 80, 65, 90].map(
            (value, index) => [day(13 - index), value],
          ),
        },
      ]);
      const originalVersions = sourceCards.map(
        ({ path }) => cli("get", path).version,
      );
      await project.selectOption(config.projects[0].id);
      await expect(checkbox("Push-ups", "Synthetic training")).toBeVisible();
      await expect(checkbox("Work hours", "Synthetic paid work")).toBeVisible();
      await expect(checkbox("Pages", "Synthetic reading")).toHaveCount(0);
      await expect(
        checkbox("Retired repetitions", "Synthetic training"),
      ).toHaveCount(0);
      await dashboard
        .getByRole("button", { name: "7 days", exact: true })
        .click();
      await expect(
        dashboard.getByLabel("From date", { exact: true }),
      ).toHaveValue(day(6));

      // Explicit choices avoid depending on initial suggestion order.
      await dashboard
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await expect(
        dashboard.locator('[data-chart-summary="selected"]'),
      ).toHaveText(/^0/);
      await checkbox("Push-ups", "Synthetic training").check();
      await checkbox("Squats", "Synthetic training").check();
      await expect(chart("reps")).toBeVisible();
      await expect(dashboard.getByRole("img")).toHaveCount(1);
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);
      assert.deepEqual(
        (await tableValues("reps")).map((row) => row.map((cell) => cell.value)),
        [
          ["10", "20"],
          ["—", "—"],
          ["0", "—"],
          ["—", "—"],
          ["20", "20"],
          ["—", "—"],
          ["30", "40"],
        ],
      );
      const recorded = await tableValues("reps");
      assert.equal(recorded[2][0].recording, "1/1 days recorded");
      assert.equal(recorded[1][0].recording, "0/1 days recorded");
      const pushKey = `${config.projects[0].id}/${training.card.metadata.id}/${training.items[0].id}`;
      assert.equal(
        await chart("reps")
          .locator(`[data-series-key="${pushKey}"] circle`)
          .count(),
        4,
        "The recorded zero has a point; missing dates do not",
      );
      const path = await chart("reps")
        .locator(`[data-series-key="${pushKey}"] path`)
        .getAttribute("d");
      assert.equal(
        path.match(/M/g).length,
        4,
        "Separated recorded days do not interpolate across missing values",
      );
      await screenshot("chart-shared-unit-overlay");
      checks.push("project-scoped counter catalog and shared-unit overlay");
      await expect(statistic("Push-ups", "total")).toHaveText("60");
      await expect(statistic("Push-ups", "recorded")).toHaveText("4");
      await expect(statistic("Push-ups", "average")).toHaveText("15");
      await expect(statistic("Push-ups", "peak")).toHaveText("30");
      await expect(statistic("Squats", "total")).toHaveText("80");
      await expect(statRow("Squats").locator("td").nth(4)).toContainText(
        "+20 reps",
      );
      await expect(
        dashboard.locator('[data-chart-summary="records"]'),
      ).toHaveText("7");

      await dashboard
        .getByRole("button", { name: "Running total", exact: true })
        .click();
      assert.deepEqual(
        (await tableValues("reps")).at(-1).map((cell) => cell.value),
        ["60", "80"],
      );
      assert.deepEqual(
        (await tableValues("reps"))[1].map((cell) => cell.value),
        ["—", "—"],
      );
      await dashboard
        .getByRole("button", { name: "Daily totals", exact: true })
        .click();
      for (const bucket of ["week", "month"]) {
        await dashboard
          .getByRole("combobox", { name: "Group by", exact: true })
          .selectOption(bucket);
        const cells = await tableValues("reps");
        assert.ok(cells.length >= 1 && cells.length <= 2);
        assert.deepEqual(
          [0, 1].map((column) =>
            cells.reduce(
              (sum, row) =>
                sum +
                (row[column].value === "—" ? 0 : Number(row[column].value)),
              0,
            ),
          ),
          [60, 80],
          "Date grouping preserves sums across partial periods",
        );
        await screenshot(`chart-grouped-${bucket}`);
      }
      await dashboard
        .getByRole("combobox", { name: "Group by", exact: true })
        .selectOption("day");
      await screenshot("chart-period-statistics");
      checks.push(
        "saved zero, missing-date gaps, cumulative totals and week/month sums",
      );

      await dashboard
        .getByLabel("Find a counter", { exact: true })
        .fill("Work hours");
      await expect(checkbox("Work hours", "Synthetic paid work")).toBeVisible();
      await expect(checkbox("Push-ups", "Synthetic training")).toHaveCount(0);
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);
      await dashboard.getByLabel("Find a counter", { exact: true }).fill("");
      await dashboard
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await expect(dashboard).toContainText(
        "Choose counters to start comparing.",
      );
      await checkbox("No recorded history", "Synthetic training").check();
      await expect(statistic("No recorded history", "total")).toHaveText("—");
      await expect(statistic("No recorded history", "recorded")).toHaveText(
        "0",
      );
      await expect(dashboard.getByRole("img")).toHaveCount(0);
      await expect(dashboard).toContainText(
        "No recordings in this date range.",
      );
      await checkbox("No recorded history", "Synthetic training").uncheck();
      await checkbox("Push-ups", "Synthetic training").check();
      await checkbox("Squats", "Synthetic training").check();
      await dashboard
        .getByLabel("Include archived counters", { exact: true })
        .check();
      await expect(
        checkbox("Retired repetitions", "Synthetic training"),
      ).toBeVisible();
      await checkbox("Retired repetitions", "Synthetic training").check();
      await expect(statistic("Retired repetitions", "total")).toHaveText("40");
      await dashboard
        .getByLabel("Include archived counters", { exact: true })
        .uncheck();
      await expect(
        checkbox("Retired repetitions", "Synthetic training"),
      ).toHaveCount(0);
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);
      checks.push(
        "search retains selected plots, no-history counters keep gaps, archived history is opt-in",
      );

      await checkbox("Squats", "Synthetic training").uncheck();
      await checkbox("Work hours", "Synthetic paid work").focus();
      await page.keyboard.press("Space");
      await expect(checkbox("Work hours", "Synthetic paid work")).toBeChecked();
      await expect(chart("reps")).toBeVisible();
      await expect(chart("hours")).toBeVisible();
      await expect(dashboard.getByRole("img")).toHaveCount(2);
      await dashboard
        .getByRole("combobox", { name: "Comparison scale", exact: true })
        .selectOption("relative");
      await expect(chart("% of own peak")).toBeVisible();
      await expect(dashboard.getByRole("img")).toHaveCount(1);
      assert.deepEqual(
        (await tableValues("% of own peak")).at(-1).map((cell) => cell.value),
        ["100", "100"],
      );
      await screenshot("chart-relative-units");

      await dashboard
        .getByRole("combobox", { name: "Comparison scale", exact: true })
        .selectOption("converted");
      await expect(dashboard).toContainText(
        "Add a rate to see converted values.",
      );
      await rate("Push-ups", "Synthetic training").fill("2.5");
      await expect(statistic("Push-ups", "converted")).toHaveText("150");
      await expect(chart("PLN").locator("[data-series-key]")).toHaveCount(1);
      await rate("Work hours", "Synthetic paid work").fill("100");
      await expect(statistic("Work hours", "converted")).toHaveText("1,000");
      await expect(
        dashboard.locator('[data-chart-summary="converted"]'),
      ).toHaveText("1,150 PLN");
      await expect(chart("PLN").locator("[data-series-key]")).toHaveCount(2);
      await rate("Work hours", "Synthetic paid work").fill("-1");
      await expect(rate("Work hours", "Synthetic paid work")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(chart("PLN").locator("[data-series-key]")).toHaveCount(1);
      await rate("Work hours", "Synthetic paid work").fill("0");
      await expect(rate("Work hours", "Synthetic paid work")).toHaveAttribute(
        "aria-invalid",
        "false",
      );
      await expect(statistic("Work hours", "converted")).toHaveText("0");
      await expect(chart("PLN").locator("[data-series-key]")).toHaveCount(2);
      await rate("Work hours", "Synthetic paid work").fill("100");
      await dashboard.getByLabel("Output unit", { exact: true }).fill("EUR");
      await dashboard.getByLabel("Output unit", { exact: true }).press("Tab");
      await expect(chart("EUR")).toBeVisible();
      await expect(
        dashboard.locator('[data-chart-summary="converted"]'),
      ).toHaveText("1,150 EUR");
      await screenshot("chart-converted-value");
      checks.push(
        "keyboard counter selection, independent unit scales, normalization, decimal/zero/invalid rates and combined converted total",
      );

      // Dashboard controls leave the durable source versions untouched.

      assert.deepEqual(
        sourceCards.map(({ path }) => cli("get", path).version),
        originalVersions,
        "Dashboard selections and filters must not rewrite counter sources",
      );

      await dashboard.getByLabel("From date", { exact: true }).fill(day(400));
      await dashboard
        .getByRole("button", { name: "Apply dates", exact: true })
        .click();
      await expect(dashboard.getByRole("alert")).toContainText(
        "up to 400 days",
      );
      await expect(statistic("Push-ups", "total")).toHaveText("60");
      await dashboard.getByLabel("From date", { exact: true }).fill(day(6));
      await dashboard
        .getByRole("button", { name: "Apply dates", exact: true })
        .press("Enter");
      await expect(dashboard.getByRole("alert")).toHaveCount(0);

      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(chart("EUR")).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Chart has no page overflow at ${width}px`,
        );
        await rate(
          "Work hours",
          "Synthetic paid work",
        ).scrollIntoViewIfNeeded();
        await expect(
          rate("Work hours", "Synthetic paid work"),
        ).toBeInViewport();
        await screenshot(`chart-dashboard-${width}`);
        if (width <= 390 && browser.browserType().name() === "chromium") {
          await chart("EUR").scrollIntoViewIfNeeded();
          await settle();
          await page.screenshot({
            path: join(evidence, `chart-phone-plot-${width}.png`),
          });
        }
      }
      await dashboard
        .getByRole("combobox", { name: "Comparison scale", exact: true })
        .selectOption("values");
      const inspect = panel("reps").getByLabel("Inspect reps date", {
        exact: true,
      });
      await inspect.focus();
      await inspect.press("Home");
      await expect(inspect).toHaveValue("0");
      await inspect.press("ArrowRight");
      await expect(inspect).toHaveValue("1");
      await expect(panel("reps")).toContainText("No recording");
      await inspect.press("End");
      await expect(inspect).toHaveValue("6");
      await expect(panel("reps")).toContainText("30 reps");
      await chart("reps").scrollIntoViewIfNeeded();
      const touchBox = await chart("reps").boundingBox();
      await chart("reps").tap({
        position: { x: touchBox.width * 0.08, y: touchBox.height / 2 },
      });
      await expect(inspect).toHaveValue("0");
      await chart("reps").tap({
        position: { x: touchBox.width * 0.95, y: touchBox.height / 2 },
      });
      await expect(inspect).toHaveValue("6");
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await screenshot("chart-dark-320");
      if (browser.browserType().name() === "chromium") {
        await chart("reps").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(evidence, "chart-phone-dark-plot-320.png"),
        });
      }
      checks.push(
        "valid date recovery, 320–1440px containment, keyboard inspection, actual touch inspection and dark/reduced-motion rendering",
      );

      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({
        colorScheme: "light",
        reducedMotion: "no-preference",
      });
      let releaseOld;
      const held = new Promise((resolve) => {
        releaseOld = resolve;
      });
      let fetched = false;
      let intercepted = false;
      const historyRoute = `${config.origin}/api/v1/views/counters?**`;
      await page.route(historyRoute, async (route) => {
        if (intercepted) return route.continue();
        intercepted = true;
        const response = await route.fetch();
        fetched = true;
        await held;
        await route.fulfill({ response });
      });
      try {
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect.poll(() => fetched).toBe(true);
        const current = cli("get", training.path);
        training.card = await mutate(
          "PATCH",
          training.path,
          {
            record_counter: {
              id: training.items[0].id,
              date: today,
              value: 45,
            },
          },
          current.version,
        );
        // Let the ordinary event stream deliver invalidation while the old read is held.
        await page.waitForTimeout(250);
      } finally {
        releaseOld();
      }
      await expect(statistic("Push-ups", "total")).toHaveText("75");
      await expect(statRow("Push-ups")).toHaveAttribute(
        "data-source-version",
        training.card.version,
      );
      await expect(checkbox("Push-ups", "Synthetic training")).toBeChecked();
      await expect(rate("Push-ups", "Synthetic training")).toHaveValue("2.5");
      await expect(statistic("Push-ups", "converted")).toHaveText("187.5");
      await page.unroute(historyRoute);
      checks.push(
        "source invalidation during an active read publishes the latest version and retains rates/selections",
      );

      let releaseProject;
      const oldProject = new Promise((resolve) => {
        releaseProject = resolve;
      });
      let projectFetched = false;
      let projectIntercepted = false;
      await page.route(historyRoute, async (route) => {
        if (projectIntercepted) return route.continue();
        projectIntercepted = true;
        const response = await route.fetch();
        projectFetched = true;
        await oldProject;
        await route.fulfill({ response }).catch(() => {});
      });
      try {
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect.poll(() => projectFetched).toBe(true);
        await project.selectOption(config.projects[1].id);
        await expect(checkbox("Pages", "Synthetic reading")).toBeVisible();
      } finally {
        releaseProject();
      }
      await expect(checkbox("Push-ups", "Synthetic training")).toHaveCount(0);
      await expect(project).toHaveValue(config.projects[1].id);
      await checkbox("Pages", "Synthetic reading").check();
      await expect(statistic("Pages", "total")).toHaveText("30");
      await page.unroute(historyRoute);
      await project.selectOption("");
      await expect(checkbox("Push-ups", "Synthetic training")).toBeVisible();
      await expect(checkbox("Pages", "Synthetic reading")).toBeVisible();
      await checkbox("Push-ups", "Synthetic training").check();
      await expect(statistic("Push-ups", "total")).toHaveText("75");
      await checkbox("Study minutes", "Synthetic study").check();
      await dashboard
        .getByRole("combobox", { name: "Comparison scale", exact: true })
        .selectOption("relative");
      await expect(
        chart("% of own peak").locator("[data-series-key]"),
      ).toHaveCount(3);
      await screenshot("chart-workspace-comparison");
      checks.push(
        "rapid project switch discards obsolete reads and all-project scope exposes both projects",
      );

      await statRow("Push-ups").getByRole("button").click();
      const editor = page.getByRole("dialog", {
        name: "Edit resource",
        exact: true,
      });
      await expect(editor.getByLabel("Title", { exact: true })).toHaveValue(
        "Synthetic training",
      );
      await editor
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(
        `${config.origin}/?view=focus&project=${config.projects[0].id}`,
      );
      const more = page.getByRole("button", {
        name: "More views",
        exact: true,
      });
      await more.tap();
      await page
        .getByRole("button", { name: "Chart", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/view=chart/);
      await expect(more).toHaveAttribute("aria-current", "page");
      await expect(dashboard).toBeVisible();
      await expect(rate("Work hours", "Synthetic paid work")).toHaveValue(
        "100",
      );
      await expect(rate("Push-ups", "Synthetic training")).toHaveValue("2.5");
      await expect(
        dashboard.getByLabel("Output unit", { exact: true }),
      ).toHaveValue("EUR");
      await page.reload();
      await expect(rate("Work hours", "Synthetic paid work")).toHaveValue(
        "100",
      );
      await expect(
        dashboard.getByLabel("Output unit", { exact: true }),
      ).toHaveValue("EUR");
      await screenshot("chart-phone-more-and-reload");
      checks.push(
        "current source opens without edits, phone More keyboard navigation and browser-local rates survive reload",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.chartCsp), []);
      assert.equal(
        requests.filter((request) =>
          ["POST", "PATCH", "PUT", "DELETE"].includes(request.method),
        ).length,
        0,
        "Chart controls are read-only source projections",
      );
    } catch (error) {
      await writeFile(
        join(evidence, "failure.txt"),
        await page.locator("body").ariaSnapshot(),
      );
      await screenshot("chart-failure").catch(() => {});
      throw error;
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { checks, errors, engine: browser.browserType().name() },
          null,
          2,
        ) + "\n",
      );
      await context.close();
    }
  },
);
