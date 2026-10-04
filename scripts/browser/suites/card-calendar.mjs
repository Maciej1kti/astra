/** Range calendar uses the existing draft/autosave and restores modal focus. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";
await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({ timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = config.projects[0].id,
      file = join(runtime, "calendar-card.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "An intentional schedule",
        status: "active",
        schedule: { start: "2026-09-28", end: "2026-10-02" },
      }),
    );
    const card = cli(
      "command",
      "POST",
      `/api/v1/projects/${project}/cards`,
      "--json-file",
      file,
    ).result.resource;
    const path = `/api/v1/projects/${project}/cards/${card.metadata.id}`;
    const get = () => cli("get", path);
    const editor = page.getByRole("dialog", {
      name: "Edytuj element",
      exact: true,
    });
    const calendar = page.getByRole("dialog", {
      name: "Wybierz daty karty",
      exact: true,
    });
    const openCalendar = () =>
      editor.getByRole("button", { name: /Wybierz daty/ }).click();
    const day = (date) => calendar.locator(`[data-calendar-day="${date}"]`);
    await page.route(
      `${config.origin}/api/v1/workspace/preferences`,
      async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        body.preferences.week_start = "sunday";
        await route.fulfill({ response, json: body });
      },
    );
    try {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card.metadata.id })}`,
      );
      await editor
        .getByRole("button", { name: "Edytuj harmonogram", exact: true })
        .click();
      await openCalendar();
      await expect(calendar.locator("thead th").first()).toHaveText("Nd");
      await expect(calendar.getByRole("grid")).toHaveAttribute(
        "aria-multiselectable",
        "true",
      );
      await day("2026-09-30").click();
      await day("2026-10-05").click();
      await expect(calendar).toContainText("6 dni zaplanowanych");
      assert.equal(
        get().version,
        card.version,
        "Calendar exploration is local until Apply",
      );
      await calendar
        .getByRole("button", { name: "Anuluj", exact: true })
        .click();
      await expect(
        editor.getByRole("button", { name: /Wybierz daty/ }),
      ).toBeFocused();
      assert.equal(get().version, card.version);
      await openCalendar();
      await day("2026-09-30").click();
      await day("2026-10-05").click();
      await calendar
        .getByRole("button", { name: "Zastosuj daty", exact: true })
        .click();
      await expect(calendar).toHaveCount(0);
      await expect(editor.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      assert.deepEqual(get().metadata.schedule, {
        start: "2026-09-30",
        end: "2026-10-05",
      });

      await openCalendar();
      await day("2026-09-30").focus();
      await day("2026-09-30").press("PageDown");
      await expect(day("2026-10-30")).toBeFocused();
      await day("2026-10-30").press("ArrowRight");
      await expect(day("2026-10-31")).toBeFocused();
      await day("2026-10-31").press("Escape");
      await expect(calendar).toHaveCount(0);
      await expect(editor).toBeVisible();

      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await openCalendar();
        await expect(calendar).toBeVisible();
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        const geometry = await calendar.evaluate((el) => ({
          width: el.getBoundingClientRect().width,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          children: Array.from(el.children).map((child) => ({
            tag: child.tagName,
            cls: child.className,
            width: child.getBoundingClientRect().width,
            scroll: child.scrollWidth,
          })),
          overflow: el.scrollWidth > el.clientWidth + 1,
        }));
        assert(
          !geometry.overflow,
          `No calendar overflow at ${width}: ${JSON.stringify(geometry)}`,
        );
        const cells = await calendar
          .locator("[data-calendar-day]")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
          );
        assert(
          cells.every((cell) => cell.width >= 43.9 && cell.height >= 44),
          `Calendar touch targets at ${width}`,
        );
        await page.screenshot({
          path: join(evidence, `calendar-${width}.png`),
        });
        await calendar
          .getByRole("button", { name: "Zamknij kalendarz", exact: true })
          .click();
      }
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await openCalendar();
      await page.screenshot({ path: join(evidence, "calendar-dark.png") });
      await calendar
        .getByRole("button", { name: "Wyczyść", exact: true })
        .click();
      await calendar
        .getByRole("button", { name: "Usuń harmonogram", exact: true })
        .click();
      await expect(editor.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      assert.equal(get().metadata.schedule, undefined);
      await openCalendar();
      await expect(calendar.locator('[aria-selected="true"]')).toHaveCount(0);
      await expect(calendar.locator("td.in-range")).toHaveCount(0);
      await calendar
        .getByRole("button", { name: "Anuluj", exact: true })
        .click();
      await page.setViewportSize({ width: 844, height: 390 });
      await openCalendar();
      await calendar
        .getByRole("button", { name: "Dzisiaj", exact: true })
        .click();
      await expect(
        calendar.getByRole("button", { name: "Zastosuj daty", exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: join(evidence, "calendar-landscape.png") });
      await calendar
        .getByRole("button", { name: "Anuluj", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });

      // Event date selection preserves the existing time/duration fields.
      await editor.getByLabel("Początek", { exact: true }).fill("2026-10-01");
      await editor
        .getByLabel("Godzina rozpoczęcia", { exact: true })
        .fill("09:30");
      await editor
        .getByLabel("Czas trwania (minuty)", { exact: true })
        .fill("90");
      await expect(editor.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      await openCalendar();
      await expect(calendar.getByRole("grid")).toHaveAttribute(
        "aria-multiselectable",
        "false",
      );
      await day("2026-10-02").click();
      await calendar
        .getByRole("button", { name: "Zastosuj daty", exact: true })
        .click();
      await expect(editor.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      assert.deepEqual(get().metadata.event, {
        start: "2026-10-02T09:30",
        duration_minutes: 90,
      });
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          suite: "card-calendar",
          range: true,
          event: true,
          keyboard: true,
          widths: [1440, 1024, 768, 390, 320],
        }),
      );
    } catch (error) {
      await page
        .screenshot({ path: join(evidence, "failure.png") })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  },
);
