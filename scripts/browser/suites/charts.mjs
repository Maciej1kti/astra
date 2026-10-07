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
      name: "Panel liczników",
      exact: true,
    });
    const project = page.getByLabel("Projekt", { exact: true });
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
              ...(definition.rate ? { rate: definition.rate } : {}),
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
        name: `Wykres licznika: ${unit}`,
        exact: true,
      });
    const panel = (unit) =>
      dashboard.getByRole("region", {
        name: `Wykres w ${unit}`,
        exact: true,
      });
    const statRow = (name) =>
      dashboard.locator(`[data-chart-row][data-counter-name="${name}"]`);
    const statistic = (name, field) =>
      statRow(name).locator(`[data-chart-stat="${field}"]`);
    const segment = (group, name) =>
      dashboard
        .getByRole("group", { name: group, exact: true })
        .getByRole("button", { name, exact: true });
    // The phone form of a segmented control: its name carries the choice.
    const menu = (group) =>
      dashboard.getByRole("button", { name: new RegExp(`^${group}: `) });
    const option = (name) =>
      dashboard.getByRole("button", { name, exact: true });
    // Rates are counter configuration; the summary only shows them.
    const rate = (name) => statistic(name, "rate");
    /** Every period's legend reading, taken with the keyboard as a reader would. */
    async function plotValues(unit) {
      const slider = panel(unit).getByLabel(`Wskazany okres: ${unit}`, {
        exact: true,
      });
      const last = Number(await slider.getAttribute("max"));
      await slider.focus();
      await slider.press("Home");
      const rows = [];
      for (let index = 0; index <= last; index++) {
        await expect(slider).toHaveValue(String(index));
        rows.push(
          await panel(unit)
            .getByRole("listitem")
            .evaluateAll((items) =>
              items.map((item) => ({
                value:
                  item
                    .querySelector(".legend-value strong")
                    ?.textContent.trim() ?? null,
                note:
                  item
                    .querySelector(".legend-value small")
                    ?.textContent.trim() ?? "",
              })),
            ),
        );
        if (index < last) await slider.press("ArrowRight");
      }
      return rows;
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
      await expect(dashboard).toContainText(/brak liczników/i);
      const today = await dashboard.getAttribute("data-chart-to");
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
            rate: "2.5",
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
          rate: "100",
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
      await segment("Zakres dat", "7 dni").click();
      await expect(dashboard).toHaveAttribute("data-chart-from", day(6));
      await expect(segment("Zakres dat", "7 dni")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Explicit choices avoid depending on initial suggestion order.
      await dashboard
        .getByRole("button", { name: "Wyczyść wybór", exact: true })
        .click();
      await expect(
        dashboard.locator('[data-chart-summary="selected"]'),
      ).toHaveText(/^0/);
      await checkbox("Push-ups", "Synthetic training").check();
      await checkbox("Squats", "Synthetic training").check();
      await expect(chart("reps")).toBeVisible();
      await expect(dashboard.getByRole("img")).toHaveCount(1);
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);
      // Plugins are off until the profile switches them on.
      const totalsTile = dashboard.locator("[data-chart-totals]");
      await expect(statRow("Push-ups")).toBeVisible();
      await expect(totalsTile).toHaveCount(0);
      await expect(
        dashboard.getByRole("region", { name: "Rozliczenie", exact: true }),
      ).toHaveCount(0);
      const preferencesPath = "/api/v1/workspace/preferences";
      await writeFile(
        commandFile,
        JSON.stringify({
          preferences: { plugins: ["chart-totals", "chart-settlement"] },
        }),
        { mode: 0o600 },
      );
      cli(
        "command",
        "PATCH",
        preferencesPath,
        "--json-file",
        commandFile,
        "--if-version",
        cli("get", preferencesPath).version,
      );
      await expect(totalsTile).toBeVisible();
      const daily = await plotValues("reps");
      assert.deepEqual(
        daily.map((row) => row.map((cell) => cell.value)),
        [
          ["10", "20"],
          [null, null],
          ["0", null],
          [null, null],
          ["20", "20"],
          [null, null],
          ["30", "40"],
        ],
      );
      assert.deepEqual(
        daily[2].map((cell) => cell.note),
        ["", "Brak zapisu"],
        "A recorded zero is a value; a missing day says so",
      );
      await expect(dashboard.getByRole("combobox")).toHaveCount(0);
      await expect(dashboard.getByRole("table")).toHaveCount(0);
      await expect(dashboard.locator("[data-chart-row]")).toHaveCount(2);
      await expect(dashboard.getByText("Pokaż dane wykresu")).toHaveCount(0);
      const pushKey = `${config.projects[0].id}/${training.card.metadata.id}/${training.items[0].id}`;
      const pushSeries = chart("reps").locator(
        `[data-series-key="${pushKey}"]`,
      );
      await expect(pushSeries.locator("circle[data-point]")).toHaveCount(4);
      assert.equal(
        (await pushSeries.locator(".series-line").getAttribute("d")).match(
          /[ML]/g,
        ).length,
        4,
        "The recorded zero is a point on the line; missing dates have none",
      );
      await expect(dashboard.locator(".chart-svg rect")).toHaveCount(0);
      const colorOf = (key) =>
        chart("reps")
          .locator(`[data-series-key="${key}"] [data-point]`)
          .first()
          .evaluate((mark) => getComputedStyle(mark).fill);
      const squatKey = `${config.projects[0].id}/${training.card.metadata.id}/${training.items[1].id}`;
      const squatColor = await colorOf(squatKey);
      assert.notEqual(await colorOf(pushKey), squatColor);
      await checkbox("Push-ups", "Synthetic training").uncheck();
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(1);
      assert.equal(
        await colorOf(squatKey),
        squatColor,
        "A counter keeps its colour when another selection is removed",
      );
      await checkbox("Push-ups", "Synthetic training").check();
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);

      // Until a grouping is picked it follows the range: a year shows months.
      await segment("Zakres dat", "1 rok").click();
      await expect(segment("Grupuj według", "Miesiące")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(pushSeries.locator("circle[data-point]")).toHaveCount(
        new Set([6, 4, 2, 0].map((offset) => day(offset).slice(0, 7))).size,
      );
      await screenshot("chart-year-months");
      // A year of days keeps the same form: every recording joined by a line.
      await segment("Grupuj według", "Dni").click();
      await expect(pushSeries.locator("circle[data-point]")).toHaveCount(4);
      const path = await pushSeries.locator(".series-line").getAttribute("d");
      assert.deepEqual(
        [path.match(/M/g).length, path.match(/L/g).length],
        [1, 3],
        "Separated recorded days are joined into one line",
      );
      await screenshot("chart-year-lines");
      await segment("Zakres dat", "7 dni").click();
      await expect(segment("Grupuj według", "Dni")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(pushSeries.locator("circle[data-point]")).toHaveCount(4);
      await screenshot("chart-shared-unit-overlay");
      checks.push("project-scoped counter catalog and shared-unit overlay");
      await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
        "sumy dzienne",
      );
      await expect(statistic("Push-ups", "total")).toHaveText("60");
      await expect(statistic("Push-ups", "recorded")).toHaveText("4");
      await expect(statistic("Push-ups", "average")).toHaveText("15");
      await expect(statistic("Push-ups", "peak")).toHaveText("30");
      await expect(statistic("Squats", "total")).toHaveText("80");
      // A tile chooses its own values; the choice is saved with the profile.
      await expect(statistic("Squats", "difference")).toHaveCount(0);
      await statRow("Squats").click();
      const tileDialog = page.getByRole("dialog", {
        name: "Wartości kafla: Squats",
        exact: true,
      });
      const tileValue = (id) => tileDialog.locator(`input[value="${id}"]`);
      await expect(tileDialog.getByRole("checkbox")).toHaveCount(11);
      await expect(tileValue("total")).toBeChecked();
      await expect(tileValue("difference")).not.toBeChecked();
      await tileValue("difference").check();
      await tileValue("peak").uncheck();
      await tileValue("history-total").check();
      await screenshot("chart-tile-dialog");
      await tileDialog
        .getByRole("button", { name: "Zapisz", exact: true })
        .click();
      await expect(tileDialog).toHaveCount(0);
      await expect(statistic("Squats", "difference")).toHaveText("+20 reps");
      await expect(statistic("Squats", "history-total")).toHaveText("80");
      await expect(statistic("Squats", "peak")).toHaveCount(0);
      await expect(statistic("Push-ups", "peak")).toHaveText("30");
      await expect(statistic("Push-ups", "difference")).toHaveCount(0);
      const squatKey2 = `${config.projects[0].id}/${training.card.metadata.id}/${training.items[1].id}`;
      assert.deepEqual(cli("get", preferencesPath).preferences.chart_tiles, {
        [squatKey2]: [
          "total",
          "history-total",
          "recorded",
          "average",
          "difference",
          "rate",
          "value",
        ],
      });
      // Cancelling changes nothing.
      await statRow("Push-ups").click();
      const pushDialog = page.getByRole("dialog", {
        name: "Wartości kafla: Push-ups",
        exact: true,
      });
      await pushDialog.locator('input[value="total"]').uncheck();
      await pushDialog
        .getByRole("button", { name: "Anuluj", exact: true })
        .click();
      await expect(pushDialog).toHaveCount(0);
      await expect(statistic("Push-ups", "total")).toHaveText("60");
      await expect(
        dashboard.locator('[data-chart-summary="records"]'),
      ).toHaveText("7");

      await segment("Sumy na wykresie", "Narastająco").click();
      await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
        "suma narastająca",
      );
      const running = await pushSeries
        .locator(".series-line")
        .getAttribute("d");
      assert.equal(
        running.match(/M/g).length,
        1,
        "A running total is one line from its first recording",
      );
      assert.equal(
        running.match(/L/g).length,
        3,
        "A running total joins its recordings with straight lines",
      );
      await expect(pushSeries.locator("circle[data-point]")).toHaveCount(4);
      await screenshot("chart-running-total");
      const totals = await plotValues("reps");
      assert.deepEqual(
        totals.at(-1).map((cell) => cell.value),
        ["60", "80"],
      );
      assert.deepEqual(
        totals[1],
        [
          { value: "10", note: "bez zapisu" },
          { value: "20", note: "bez zapisu" },
        ],
        "A day without a recording shows the held total and says so",
      );
      await segment("Sumy na wykresie", "Sumy okresów").click();
      for (const [bucket, label, mode] of [
        ["week", "Tygodnie", "sumy tygodniowe"],
        ["month", "Miesiące", "sumy miesięczne"],
      ]) {
        await segment("Grupuj według", label).click();
        await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
          mode,
        );
        const cells = await plotValues("reps");
        assert.ok(cells.length >= 1 && cells.length <= 2);
        assert.deepEqual(
          [0, 1].map((column) =>
            cells.reduce((sum, row) => sum + Number(row[column].value ?? 0), 0),
          ),
          [60, 80],
          "Date grouping preserves sums across partial periods",
        );
        // A group clipped to one day by the range edge needs no coverage note.
        const notes = cells
          .flat()
          .filter((cell) => cell.value !== null)
          .map((cell) => cell.note);
        assert.ok(
          notes.some((note) => /^\d+ z \d+ dni$/.test(note)) &&
            notes.every((note) => note === "" || /^\d+ z \d+ dni$/.test(note)),
          "A grouped value says how many of its days were recorded",
        );
        await screenshot(`chart-grouped-${bucket}`);
      }
      await segment("Grupuj według", "Dni").click();
      await screenshot("chart-period-statistics");
      checks.push(
        "saved zero, missing-date gaps, cumulative totals and week/month sums",
      );

      await dashboard
        .getByLabel("Znajdź licznik", { exact: true })
        .fill("Work hours");
      await expect(checkbox("Work hours", "Synthetic paid work")).toBeVisible();
      await expect(checkbox("Push-ups", "Synthetic training")).toHaveCount(0);
      await expect(chart("reps").locator("[data-series-key]")).toHaveCount(2);
      await dashboard.getByLabel("Znajdź licznik", { exact: true }).fill("");
      await dashboard
        .getByRole("button", { name: "Wyczyść wybór", exact: true })
        .click();
      await expect(dashboard).toContainText(
        "Wybierz liczniki, aby rozpocząć porównanie.",
      );
      await checkbox("No recorded history", "Synthetic training").check();
      await expect(statistic("No recorded history", "total")).toHaveText("—");
      await expect(statistic("No recorded history", "recorded")).toHaveText(
        "0",
      );
      await expect(dashboard.getByRole("img")).toHaveCount(0);
      await expect(dashboard).toContainText("Brak zapisów w tym zakresie dat.");
      await checkbox("No recorded history", "Synthetic training").uncheck();
      await checkbox("Push-ups", "Synthetic training").check();
      await checkbox("Squats", "Synthetic training").check();
      await dashboard
        .getByLabel("Także zarchiwizowane", { exact: true })
        .check();
      await expect(
        checkbox("Retired repetitions", "Synthetic training"),
      ).toBeVisible();
      await checkbox("Retired repetitions", "Synthetic training").check();
      await expect(statistic("Retired repetitions", "total")).toHaveText("40");
      await dashboard
        .getByLabel("Także zarchiwizowane", { exact: true })
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
      await expect(rate("Push-ups")).toHaveText("2,5");
      await expect(statistic("Push-ups", "converted")).toHaveText("150");
      await expect(rate("Work hours")).toHaveText("100");
      await expect(statistic("Work hours", "converted")).toHaveText("1000");
      await expect(
        dashboard.locator('[data-chart-summary="converted"]'),
      ).toHaveText("1150 PLN");
      await expect(
        dashboard.getByRole("textbox", { name: /Stawka/ }),
      ).toHaveCount(0);
      await dashboard
        .getByLabel("Jednostka wynikowa", { exact: true })
        .fill("EUR");
      await dashboard
        .getByLabel("Jednostka wynikowa", { exact: true })
        .press("Tab");
      await expect(
        dashboard.locator('[data-chart-summary="converted"]'),
      ).toHaveText("1150 EUR");
      // Rates value the summary only; the plots keep their recorded units.
      await expect(dashboard.getByRole("img")).toHaveCount(2);
      await expect(chart("hours")).toBeVisible();
      await screenshot("chart-rates");
      checks.push(
        "keyboard counter selection, independent unit plots, counter rates read from their cards and combined converted total",
      );

      // Dashboard controls leave the durable source versions untouched.

      assert.deepEqual(
        sourceCards.map(({ path }) => cli("get", path).version),
        originalVersions,
        "Dashboard selections and filters must not rewrite counter sources",
      );

      const custom = segment("Zakres dat", "Własny");
      await expect(custom).toHaveAttribute("aria-expanded", "false");
      await custom.click();
      await expect(custom).toHaveAttribute("aria-expanded", "true");
      await expect(dashboard.getByLabel("Do", { exact: true })).toHaveValue(
        today,
      );
      await dashboard.getByLabel("Od", { exact: true }).fill(day(400));
      await dashboard
        .getByRole("button", { name: "Zastosuj zakres", exact: true })
        .click();
      await expect(dashboard.getByRole("alert")).toContainText("400 dni");
      await screenshot("chart-custom-range");
      await expect(statistic("Push-ups", "total")).toHaveText("60");
      await dashboard.getByLabel("Od", { exact: true }).fill(day(8));
      await dashboard
        .getByRole("button", { name: "Zastosuj zakres", exact: true })
        .press("Enter");
      await expect(dashboard.getByRole("alert")).toHaveCount(0);
      await expect(dashboard).toHaveAttribute("data-chart-from", day(8));
      await expect(custom).toHaveClass(/active/);
      await segment("Zakres dat", "7 dni").click();
      await expect(dashboard).toHaveAttribute("data-chart-from", day(6));
      await expect(custom).toHaveAttribute("aria-expanded", "false");

      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(chart("reps")).toBeVisible();
        const phone = width <= 700;
        await expect(dashboard.locator(".chart-segments")).toHaveCount(
          phone ? 0 : 3,
        );
        await expect(dashboard.locator(".chart-menu")).toHaveCount(
          phone ? 3 : 0,
        );
        const compactTargets = await dashboard
          .locator(
            ".chart-segments button, .chart-menu > .action-menu > button",
          )
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const box = button.getBoundingClientRect();
              return {
                top: Math.round(box.top + scrollY),
                height: box.height,
              };
            }),
          );
        assert.ok(
          compactTargets.length > 0 &&
            compactTargets.every((target) => target.height >= 44),
          `Chart shortcuts retain shared touch targets at ${width}px`,
        );
        if (phone) {
          assert.equal(
            new Set(compactTargets.map((target) => target.top)).size,
            1,
            `Range, grouping and totals share one row at ${width}px`,
          );
          const plotsEnd = await dashboard
            .locator(".chart-svg")
            .last()
            .evaluate((plot) => plot.getBoundingClientRect().bottom + scrollY);
          assert.ok(
            compactTargets.every((target) => target.top >= plotsEnd),
            `The controls sit below the plots at ${width}px`,
          );
          await menu("Grupuj według").click();
          await expect(option("Dni")).toHaveAttribute("aria-pressed", "true");
          await expect(option("Miesiące")).toBeInViewport({ ratio: 1 });
          if (browser.browserType().name() === "chromium") {
            await settle();
            await page.screenshot({
              path: join(evidence, `chart-phone-menu-${width}.png`),
            });
          }
          await option("Tygodnie").click();
          await expect(menu("Grupuj według")).toHaveAccessibleName(
            "Grupuj według: Tygodnie",
          );
          await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
            "sumy tygodniowe",
          );
          await menu("Grupuj według").click();
          await option("Dni").click();
          await menu("Sumy na wykresie").click();
          await option("Narastająco").click();
          await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
            "suma narastająca",
          );
          await menu("Sumy na wykresie").click();
          await option("Sumy okresów").click();
          await expect(panel("reps").locator("[data-plot-mode]")).toHaveText(
            "sumy dzienne",
          );
          await menu("Zakres dat").click();
          await option("Własny").click();
          await expect(dashboard.getByLabel("Od", { exact: true })).toHaveValue(
            day(6),
          );
          await screenshot(`chart-phone-controls-${width}`);
          await menu("Zakres dat").click();
          await option("30 dni").click();
          await expect(dashboard).toHaveAttribute("data-chart-from", day(29));
          await expect(chart("reps")).toBeVisible();
          await expect(
            menu("Zakres dat"),
            "A new range keeps the page where the reader chose it",
          ).toBeInViewport();
          await expect(dashboard.getByLabel("Od", { exact: true })).toHaveCount(
            0,
          );
          await menu("Zakres dat").click();
          await option("7 dni").click();
          await expect(dashboard).toHaveAttribute("data-chart-from", day(6));
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Chart has no page overflow at ${width}px`,
        );
        const plotTop = await dashboard
          .locator(".chart-svg")
          .first()
          .evaluate((plot) => plot.getBoundingClientRect().top + scrollY);
        const picker = dashboard.getByRole("button", { name: /^Liczniki/ });
        if (width >= 1440) {
          await expect(picker).toHaveCount(0);
          await expect(
            checkbox("Work hours", "Synthetic paid work"),
          ).toBeVisible();
        } else if (width <= 768) {
          assert.ok(
            plotTop < (phone ? 400 : 640),
            `The plot starts in the first screen at ${width}px, not at ${plotTop}px`,
          );
          await expect(picker).toHaveAttribute("aria-expanded", "false");
          await expect(
            checkbox("Work hours", "Synthetic paid work"),
          ).toHaveCount(0);
          await picker.click();
          await expect(picker).toHaveAttribute("aria-expanded", "true");
          await expect(
            checkbox("Work hours", "Synthetic paid work"),
          ).toBeChecked();
          await screenshot(`chart-picker-open-${width}`);
          await picker.click();
          await expect(
            checkbox("Work hours", "Synthetic paid work"),
          ).toHaveCount(0);
        }
        for (const field of ["total", "peak", "converted"]) {
          const box = await statistic("Work hours", field).boundingBox();
          assert.ok(
            box && box.x >= 0 && box.x + box.width <= width,
            `The ${field} statistic is not clipped at ${width}px`,
          );
        }
        await rate("Work hours").scrollIntoViewIfNeeded();
        await expect(rate("Work hours")).toBeInViewport();
        await screenshot(`chart-dashboard-${width}`);
        if (width <= 390 && browser.browserType().name() === "chromium") {
          await chart("reps").scrollIntoViewIfNeeded();
          await settle();
          await page.screenshot({
            path: join(evidence, `chart-phone-plot-${width}.png`),
          });
        }
      }
      const inspect = panel("reps").getByLabel("Wskazany okres: reps", {
        exact: true,
      });
      const readout = panel("reps")
        .getByRole("listitem")
        .filter({ hasText: "Push-ups" });
      await expect(readout).toContainText("30");
      await inspect.focus();
      await inspect.press("Home");
      await expect(inspect).toHaveValue("0");
      await inspect.press("ArrowRight");
      await expect(inspect).toHaveValue("1");
      await expect(readout).toContainText("Brak zapisu");
      await inspect.press("End");
      await expect(inspect).toHaveValue("6");
      await expect(readout).toContainText("30");
      await expect(readout).not.toContainText("Brak zapisu");
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
          .getByRole("button", { name: "Odśwież", exact: true })
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
      await expect(rate("Push-ups")).toHaveText("2,5");
      await expect(statistic("Push-ups", "converted")).toHaveText("187,5");
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
          .getByRole("button", { name: "Odśwież", exact: true })
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
      await expect(dashboard.getByRole("img")).toHaveCount(3);
      await expect(chart("min").locator("circle[data-point]")).toHaveCount(7);
      await screenshot("chart-workspace-comparison");
      checks.push(
        "rapid project switch discards obsolete reads and all-project scope exposes both projects",
      );

      await statRow("Push-ups").click();
      await page
        .getByRole("dialog", { name: "Wartości kafla: Push-ups", exact: true })
        .getByRole("button", { name: "Otwórz kartę licznika", exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Edytuj element",
        exact: true,
      });
      await expect(editor.getByLabel("Tytuł", { exact: true })).toHaveValue(
        "Synthetic training",
      );
      await editor
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(
        `${config.origin}/?view=focus&project=${config.projects[0].id}`,
      );
      const more = page.getByRole("button", {
        name: "Więcej widoków",
        exact: true,
      });
      await more.tap();
      await page
        .getByRole("button", { name: "Wykres", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/view=chart/);
      await expect(more).toHaveAttribute("aria-current", "page");
      await expect(dashboard).toBeVisible();
      await expect(rate("Work hours")).toHaveText("100");
      await expect(rate("Push-ups")).toHaveText("2,5");
      await expect(
        dashboard.getByLabel("Jednostka wynikowa", { exact: true }),
      ).toHaveValue("EUR");
      await page.reload();
      await expect(rate("Work hours")).toHaveText("100");
      await expect(
        dashboard.getByLabel("Jednostka wynikowa", { exact: true }),
      ).toHaveValue("EUR");
      await screenshot("chart-phone-more-and-reload");
      checks.push(
        "current source opens without edits, phone More keyboard navigation and the browser-local output unit survives reload",
      );

      // People are the last word of a counter's name; the lower value pays.
      // Rates come from the counters and totals from their whole history.
      await createCard(config.projects[0].id, "Synthetic bet", [
        {
          name: "Pompki Tomek",
          unit: "rep",
          rate: "1",
          values: [
            [day(900), 1000],
            [day(1), 300],
          ],
        },
        {
          name: "Pompki Maciek",
          unit: "rep",
          rate: "1",
          values: [[day(0), 33]],
        },
        {
          name: "Brzuszki Tomek",
          unit: "rep",
          rate: "0.25",
          values: [[day(2), 100]],
        },
        { name: "Brzuszki Maciek", unit: "rep", values: [[day(0), 15]] },
      ]);
      await page.reload();
      const picker = dashboard.getByRole("button", { name: /^Liczniki/ });
      await picker.click();
      await dashboard
        .getByRole("button", { name: "Wyczyść wybór", exact: true })
        .click();
      const settlement = dashboard.getByRole("region", {
        name: "Rozliczenie",
        exact: true,
      });
      await expect(settlement).toHaveCount(0);
      for (const name of [
        "Pompki Tomek",
        "Pompki Maciek",
        "Brzuszki Tomek",
        "Brzuszki Maciek",
      ])
        await checkbox(name, "Synthetic bet").check();
      await picker.click();
      // The plots show 30 days; the debt counts a recording 900 days old,
      // beyond what one range read can return.
      await expect(statistic("Pompki Tomek", "total")).toHaveText("300");
      await expect(settlement.locator("[data-chart-ledger]")).toHaveText(
        /^cała historia, od /,
      );
      const debt = settlement.locator("[data-chart-debt]");
      await expect(debt).toHaveCount(1);
      await expect(debt.locator("b")).toHaveText(["Maciek", "Tomek"]);
      await expect(debt.locator("strong")).toHaveText("1292,00EUR");
      await expect(
        settlement.locator('[data-chart-party="Tomek"] dd'),
      ).toHaveText("1325,00 EUR");
      await expect(settlement).toContainText("Liczniki bez stawki (1)");
      await expect(settlement).not.toContainText("Do wyrównania");
      await expect(settlement).not.toContainText("Osoba to");
      await expect(rate("Brzuszki Maciek")).toHaveText("—");
      const settled = await settlement.boundingBox();
      const firstPlot = await dashboard.getByRole("img").first().boundingBox();
      assert.ok(
        settled.y + settled.height <= firstPlot.y,
        "The settlement comes before the plots",
      );
      const cards = await dashboard
        .locator("[data-chart-row]")
        .evaluateAll((rows) =>
          rows.map((row) =>
            [...row.querySelectorAll(".tile-name, .tile-value")].map((cell) => {
              const box = cell.getBoundingClientRect();
              const own = row.getBoundingClientRect();
              return [
                cell.dataset.tileMetric ?? "name",
                Math.round(box.x - own.x),
                Math.round(box.y - own.y),
                Math.round(box.width),
              ].join();
            }),
          ),
        );
      assert.equal(cards.length, 4);
      assert.ok(
        cards.every((card) => card.join("|") === cards[0].join("|")),
        `Tiles with the same values have the same layout: ${JSON.stringify(cards)}`,
      );
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        "The settlement and summary fit a 390px phone",
      );
      await screenshot("chart-settlement-390");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await screenshot("chart-settlement-1440");
      checks.push(
        "settlement over the whole history by last-word person with counter rates: lower value pays the difference, unrated counters excluded, uniform phone cards",
      );

      // Switching a plugin off in Settings removes what it added.
      await expect(settlement).toBeVisible();
      await expect(totalsTile).toBeVisible();
      await page
        .getByRole("button", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        })
        .click();
      const settingsDialog = page.getByRole("dialog", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      });
      const pluginBox = (name) =>
        settingsDialog.getByRole("switch", { name: new RegExp(`^${name}`) });
      await expect(pluginBox("Razem na Wykresie")).toBeChecked();
      await expect(pluginBox("Rozliczenie na Wykresie")).toBeChecked();
      await pluginBox("Rozliczenie na Wykresie").uncheck();
      await screenshot("chart-plugin-settings");
      await settingsDialog
        .getByRole("button", { name: "Zapisz ustawienia", exact: true })
        .click();
      await expect(settingsDialog).toHaveCount(0);
      await expect(dashboard).toBeVisible();
      assert.deepEqual(cli("get", preferencesPath).preferences.plugins, [
        "chart-totals",
      ]);
      await expect(
        dashboard.getByRole("region", { name: "Rozliczenie", exact: true }),
      ).toHaveCount(0);
      checks.push(
        "plugins off by default, switched on for the profile and off in Settings; per-counter tile values saved conditionally",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.chartCsp), []);
      const writes = requests.filter((request) =>
        ["POST", "PATCH", "PUT", "DELETE"].includes(request.method),
      );
      assert.deepEqual(
        [...new Set(writes.map((request) => request.path))],
        ["/api/v1/workspace/preferences"],
        "Chart writes only the profile's preferences, never a source",
      );
      assert.equal(writes.length, 2, "One tile choice and one settings save");
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
