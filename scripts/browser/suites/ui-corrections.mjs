/** Focus presentation, real Timeline row gestures and dated creation. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const input = join(runtime, "ui-command.json");
    async function create(title, schedule) {
      await writeFile(
        input,
        JSON.stringify({ title, status: "planned", schedule }),
      );
      const result = cli("command", "POST", base, "--json-file", input).result;
      return result.resource?.metadata?.id ?? result.id;
    }
    const ids = [];
    for (const title of ["First plan", "Second plan", "Third plan"])
      ids.push(await create(title, { start: "2026-09-07", end: "2026-09-09" }));
    const original = ids.map((id) => cli("get", `${base}/${id}`));
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const rows = () =>
      page
        .locator("[data-timeline-row]")
        .evaluateAll((elements) =>
          elements
            .map((el) => el.dataset.timelineRow)
            .filter((id) => id !== "astra-create-row"),
        );
    const grip = (id) => page.locator(`[data-timeline-row="${id}"] button`);
    async function drag(id, target, cancel = false) {
      const source = await grip(id).boundingBox();
      const destination = await grip(target).boundingBox();
      assert(source && destination);
      const x = source.x + source.width / 2;
      const y = source.y + source.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, destination.y + destination.height / 2, {
        steps: 10,
      });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    try {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "gantt", project: project.id, month: "2026-09" })}`,
      );
      await expect.poll(rows).toHaveLength(3);
      await expect(
        page.getByTitle("Nowa karta zaplanowana na wybrany dzień"),
      ).toHaveCount(0);
      await expect(page.getByText("Oś czasu shortcuts & editing")).toHaveCount(
        0,
      );
      const before = await rows();
      await drag(before[2], before[0], true);
      assert.deepEqual(await rows(), before);
      await drag(before[2], before[0]);
      await expect.poll(rows).toEqual([before[2], before[0], before[1]]);
      await page.reload();
      await expect.poll(rows).toEqual([before[2], before[0], before[1]]);
      await grip(before[2]).press("Alt+ArrowDown");
      await expect.poll(rows).toEqual([before[0], before[2], before[1]]);
      for (const [index, id] of ids.entries())
        assert.equal(
          cli("get", `${base}/${id}`).version,
          original[index].version,
          "Row ordering must not change source schedules or Board placement",
        );
      const empty = page.getByRole("button", {
        name: "Utwórz kartę na osi czasu",
      });
      await expect(empty).toBeVisible();
      const bar = await empty.boundingBox();
      // The displayed axis starts two days before the earliest September 1 anchor.
      await empty.click({ position: { x: 48 * 6 + 24, y: bar.height / 2 } });
      const dialog = page.getByRole("dialog", { name: "Utwórz element" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Początek", { exact: true })).toHaveValue(
        "2026-09-05",
      );
      await expect(dialog.getByLabel("Koniec", { exact: true })).toHaveValue(
        "2026-09-05",
      );
      await page
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await empty.focus();
      await empty.press("ArrowRight");
      await empty.press("Enter");
      await expect(dialog.getByLabel("Początek", { exact: true })).toHaveValue(
        "2026-09-02",
      );
      await page
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(grip(before[0])).toBeVisible();
      await grip(before[0]).press("Alt+ArrowDown");
      await expect.poll(rows).toEqual([before[2], before[0], before[1]]);
      await page.reload();
      await expect.poll(rows).toEqual([before[2], before[0], before[1]]);
      if (browser.browserType().name() === "chromium") {
        const session = await context.newCDPSession(page);
        const source = await grip(before[1]).boundingBox();
        const target = await grip(before[2]).boundingBox();
        const touch = async (type, y) =>
          session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints:
              type === "touchEnd"
                ? []
                : [{ x: source.x + source.width / 2, y }],
          });
        await touch("touchStart", source.y + source.height / 2);
        for (let step = 1; step <= 10; step++)
          await touch(
            "touchMove",
            source.y + source.height / 2 + ((target.y - source.y) * step) / 10,
          );
        await touch("touchEnd");
        await expect.poll(rows).toEqual([before[1], before[2], before[0]]);
        await session.detach();
      }
      assert(
        (await page.evaluate(() => document.documentElement.scrollWidth)) <=
          390,
      );
      if (browser.browserType().name() === "chromium")
        await page.screenshot({
          path: join(evidence, "timeline-390.png"),
          fullPage: true,
        });
      for (const view of ["focus", "projects"]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${config.origin}/?view=${view}`);
        const corners = await page.locator(".topbar").evaluate((el) => {
          const header = getComputedStyle(el),
            panel = getComputedStyle(el.closest(".workspace"));
          return {
            header: [header.borderTopLeftRadius, header.borderTopRightRadius],
            panel: [panel.borderTopLeftRadius, panel.borderTopRightRadius],
          };
        });
        assert.deepEqual(corners.header, corners.panel);
        if (browser.browserType().name() === "chromium")
          await page.screenshot({
            path: join(evidence, `${view}-1440.png`),
            fullPage: true,
          });
      }
      // Boards are as long as their cards: the page scrolls, never a column.
      for (const query of [
        `view=board&project=${config.projects[0].id}`,
        "view=board",
      ]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${config.origin}/?${query}`);
        await expect(page.locator("[data-board-card]").first()).toBeVisible();
        const layout = await page.evaluate(() => ({
          columns: [...document.querySelectorAll(".wx-column")].map((node) => {
            const cards = node.querySelector("[data-kanban-column-cards]");
            const last = [...node.querySelectorAll("[data-board-card]")].at(-1);
            return {
              heading: node.querySelector(".wx-title")?.textContent.trim(),
              inner: cards ? cards.scrollHeight - cards.clientHeight : 0,
              // The column ends a little below its last card and footer.
              slack: last
                ? node.getBoundingClientRect().bottom -
                  last.getBoundingClientRect().bottom
                : 0,
            };
          }),
          board: document.querySelector(".astra-board").getBoundingClientRect()
            .bottom,
          page: document.documentElement.scrollHeight,
        }));
        assert.equal(layout.columns.length, 5, query);
        assert(
          layout.columns.every(
            (column) =>
              /^\S.* · \d+$/.test(column.heading) &&
              column.inner === 0 &&
              column.slack < 120,
          ),
          JSON.stringify(layout),
        );
        assert(
          layout.page - (layout.board + (await page.evaluate(() => scrollY))) <
            160,
          `Nothing but the page's end follows the board: ${JSON.stringify(layout)}`,
        );
      }
      // A narrow window names each column above its cards, and a column that
      // was opened there can be closed again.
      await page.setViewportSize({ width: 680, height: 900 });
      await page.goto(
        `${config.origin}/?view=board&project=${config.projects[0].id}`,
      );
      await expect(
        page
          .locator(".astra-column-planned")
          .getByRole("heading", { name: /^Zaplanowane · \d+$/ }),
      ).toBeVisible();
      await page.locator('[data-board-column-chip="cancelled"]').click();
      const cancelled = page.locator(".astra-column-cancelled");
      await expect(
        cancelled.getByRole("heading", { name: /^Anulowane · \d+$/ }),
      ).toBeVisible();
      await expect(
        cancelled.locator("[data-board-card]").first(),
      ).toBeVisible();
      await cancelled
        .getByRole("button", { name: "Zwiń kolumnę", exact: true })
        .click();
      await expect(
        cancelled.getByRole("button", { name: "Rozwiń kolumnę", exact: true }),
      ).toBeVisible();
      await cancelled
        .getByRole("button", { name: "Rozwiń kolumnę", exact: true })
        .click();
      // The page ends with the column in view, not with a longer neighbour.
      const fitted = await page.evaluate(() => {
        const scroll = document.querySelector(".astra-board .date-scroll");
        const column = document.querySelector(".astra-column-cancelled");
        return [scroll.clientHeight, column.offsetHeight];
      });
      assert(Math.abs(fitted[0] - fitted[1]) <= 1, JSON.stringify(fitted));
      assert.deepEqual(errors, []);
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            errors,
            ids,
            versionsPreserved: ids.map(
              (id, index) =>
                cli("get", `${base}/${id}`).version === original[index].version,
            ),
          },
          null,
          2,
        ),
      );
      await context.close();
    }
  },
);
