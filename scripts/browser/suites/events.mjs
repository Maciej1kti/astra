/** Timed event persistence and civil clocks through the real paired application. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({ timezoneId: "Pacific/Honolulu" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const project = config.projects[2].id;
    const base = `/api/v1/projects/${project}/cards`;
    const file = join(runtime, "event-command.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "Timed review",
        event: { start: "2026-09-30T09:30", duration_minutes: 90 },
      }),
    );
    const result = cli("command", "POST", base, "--json-file", file).result;
    const id = result.resource.metadata.id;
    const path = `${base}/${id}`;
    const get = () => cli("get", path).metadata;
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const route = async (params) => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "calendar", project, ...params })}`,
      );
      await page.locator("header.topbar").waitFor();
    };
    try {
      await route({ view: "list", type: "card", resource: id });
      await expect(
        dialog.getByLabel("Start time", { exact: true }),
      ).toHaveValue("09:30");
      await expect(
        dialog.getByLabel("Duration (minutes)", { exact: true }),
      ).toHaveValue("90");
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Timed review renamed");
      await expect.poll(() => get().title).toBe("Timed review renamed");
      assert.deepEqual(get().event, {
        start: "2026-09-30T09:30",
        duration_minutes: 90,
      });
      await dialog.getByLabel("Start time", { exact: true }).fill("23:30");
      await expect.poll(() => get().event.start).toBe("2026-09-30T23:30");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await route({});
      await page.getByLabel("Go to date").fill("2026-09-30");
      await page.getByLabel("Go to date").press("Tab");
      await page.getByLabel("Calendar layout").selectOption("week");
      const event = page
        .locator(`[data-calendar-item="${id}:card_event"]`)
        .first();
      await expect(event).toContainText("23:30");
      await expect(page.locator(".ec-time-grid")).toBeVisible();
      const sidebar = page.locator(".ec-body .ec-sidebar");
      await expect(sidebar).toBeVisible();
      assert.equal(
        await sidebar.evaluate((el) => getComputedStyle(el).position),
        "sticky",
      );
      const bounds = await sidebar.boundingBox();
      const surface = await page.locator(".calendar-surface").boundingBox();
      assert.ok(bounds.x >= surface.x && bounds.x < surface.x + surface.width);
      await page
        .getByRole("button", {
          name: "Event 23:30 · 90 min: Timed review renamed",
          exact: true,
        })
        .first()
        .press("Alt+ArrowRight");
      const proposal = page.getByRole("dialog", { name: "Change event time" });
      await expect(proposal).toBeVisible();
      await expect(proposal.getByLabel("Planned start")).toHaveValue(
        "2026-10-01",
      );
      await proposal.getByLabel("Duration (minutes)").fill("30");
      await proposal.getByRole("button", { name: "Save event time" }).click();
      await expect(proposal).toBeHidden();
      assert.deepEqual(get().event, {
        start: "2026-10-01T23:30",
        duration_minutes: 30,
      });
      await page.getByLabel("Go to date").fill("2026-10-01");
      await page.getByLabel("Go to date").press("Tab");
      await page.getByLabel("Calendar layout").selectOption("day");
      await expect(event).toContainText("30 min");
      await expect(async () => {
        await event.scrollIntoViewIfNeeded();
        await expect(event).toBeInViewport();
      }).toPass({ timeout: 5000 });
      await page.screenshot({
        path: join(evidence, "desktop-event-day.png"),
        fullPage: true,
      });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(page.locator(".ec-time-grid")).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await expect(async () => {
          await event.scrollIntoViewIfNeeded();
          await expect(event).toBeInViewport();
        }).toPass({ timeout: 5000 });
        await page.screenshot({
          path: join(evidence, `event-day-${width}.png`),
          fullPage: true,
        });
      }
      await route({ view: "list", type: "card", resource: id });
      await dialog.getByLabel("Start", { exact: true }).fill("2026-10-03");
      await expect.poll(() => get().event.start).toBe("2026-10-03T23:30");
      await dialog.getByLabel("Start time", { exact: true }).fill("");
      await expect.poll(() => get().event).toBe(undefined);
      assert.deepEqual(get().schedule, {
        start: "2026-10-03",
        end: "2026-10-03",
      });
      await dialog.getByLabel("Start time", { exact: true }).fill("10:00");
      await expect.poll(() => get().event?.start).toBe("2026-10-03T10:00");
      assert.equal(get().schedule, undefined);
      await page.reload();
      await expect(
        dialog.getByLabel("Start time", { exact: true }),
      ).toHaveValue("10:00");
      await expect(
        dialog.getByLabel("Duration (minutes)", { exact: true }),
      ).toHaveValue("30");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await route({ date: "2026-10-02", layout: "day" });
      await expect(page.locator(".ec-body .ec-day")).toHaveCount(1);
      const day = await page.locator(".ec-body .ec-day").boundingBox();
      await expect(page.locator(".calendar-surface")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      const header = await page.locator(".ec-header").boundingBox();
      await page.mouse.click(
        day.x + day.width / 2,
        header.y + header.height + 100,
      );
      const draft = page.getByRole("dialog", {
        name: "Create resource",
        exact: true,
      });
      await expect(draft).toBeVisible();
      await expect(draft.getByLabel("Start", { exact: true })).toHaveValue(
        "2026-10-02",
      );
      await expect(draft.getByLabel("Start time", { exact: true })).toHaveValue(
        /^\d{2}:\d{2}$/,
      );
      await expect(
        draft.getByLabel("Duration (minutes)", { exact: true }),
      ).toHaveValue("60");
      await draft
        .getByLabel("Title", { exact: true })
        .fill("Created from an hour slot");
      await expect(dialog.getByTestId("autosave-status")).toHaveText("Saved");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(
        page
          .locator("[data-calendar-item]")
          .filter({ hasText: "Created from an hour slot" }),
      ).toHaveCount(1);
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            timezone: "Pacific/Honolulu",
            checks: [
              "timed source creation",
              "unrelated autosave preservation",
              "cross-midnight event",
              "keyboard movement with observed version",
              "duration proposal",
              "hourly day/week",
              "320/390px overflow",
              "atomic plan/event conversion",
              "reload persistence",
              "hour-slot draft creation and save",
            ],
            errors,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await page.screenshot({
        path: join(evidence, "failure.png"),
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  },
);
