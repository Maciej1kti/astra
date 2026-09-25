/** Responsive controls and real touch scrolling against a normally paired host. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({ hasTouch: true, colorScheme: "light" });
    const page = await context.newPage();
    const project = config.projects[0].id;
    const results = [],
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const settle = (locator) =>
      locator.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished)),
      );
    const screenshot = (name) =>
      page.screenshot({ path: join(evidence, `${name}.png`) });
    const route = async (view, extra = {}) => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project, month: "2026-09", date: "2026-09-25", ...extra })}`,
      );
      await page.getByRole("navigation", { name: "Workspace views" }).waitFor();
      await expect(
        page.getByText(
          /^(Loading resources…|Loading planning view…|Loading board…|Loading date views…|Loading calendar…|Loading timeline…)$/,
        ),
      ).toHaveCount(0);
      if (view === "board")
        await expect(
          page.locator(".astra-board .add-card").first(),
        ).toBeEnabled();
      if (view === "calendar") await page.locator(".ec").waitFor();
      if (view === "gantt") await page.locator(".wx-gantt").waitFor();
      await settle(page.locator(".view-content"));
    };
    try {
      for (const width of [320, 390, 768, 1024]) {
        await page.setViewportSize({ width, height: width > 700 ? 1024 : 844 });
        for (const view of [
          "focus",
          "projects",
          "board",
          "calendar",
          "gantt",
          "list",
          "updates",
        ]) {
          await route(view);
          const layout = await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          assert.ok(
            layout.scroll <= width + 1,
            `${view}: ${JSON.stringify(layout)}`,
          );
          if (view === "calendar") {
            const today = await page
              .getByRole("button", { name: "Today", exact: true })
              .boundingBox();
            assert.ok(
              today.width >= 60,
              "Today must not shrink to a clipped label",
            );
          }
          if (view === "list" && width <= 700) {
            const toggle = page.getByRole("button", {
              name: "Filters",
              exact: true,
            });
            await expect(
              page.getByLabel("Status filter", { exact: true }),
            ).toBeHidden();
            for (const name of ["Project", "Resource type"]) {
              const box = await page
                .getByLabel(name, { exact: true })
                .boundingBox();
              assert.ok(box.width >= 130, `${name} must remain readable`);
            }
            await toggle.click();
            await page
              .getByLabel("Status filter", { exact: true })
              .selectOption("active");
            await expect(page).toHaveURL(/status=active/);
            await page.getByRole("button", { name: /^Filters\s*1$/ }).click();
            await expect(
              page.getByLabel("Status filter", { exact: true }),
            ).toBeHidden();
            await page.reload();
            await page.getByRole("button", { name: /^Filters\s*1$/ }).click();
            await expect(
              page.getByLabel("Status filter", { exact: true }),
            ).toHaveValue("active");
            await settle(page.locator(".list-filter-fields"));
            await screenshot(`${width}-list-filters`);
            await page
              .getByRole("button", { name: "Clear filters", exact: true })
              .click();
            await expect(
              page.getByLabel("Status filter", { exact: true }),
            ).toHaveValue("");
          }
          await screenshot(`${width}-${view}`);
          results.push({ width, view, noPageOverflow: true });
        }
      }
      const payload = join(runtime, "vertical-modal.json");
      await writeFile(
        payload,
        JSON.stringify({
          title: "Vertical scroll and motion probe",
          body:
            `Long text: ${"unbroken".repeat(60)}\n\n| Resource | Detail |\n| --- | --- |\n| ${"reference".repeat(30)} | Wrap this cell |\n\n` +
            "A readable paragraph keeps this modal taller than the viewport.\n\n".repeat(
              60,
            ),
        }),
        { mode: 0o600 },
      );
      const card = cli(
        "command",
        "POST",
        `/api/v1/projects/${project}/cards`,
        "--json-file",
        payload,
      ).result.resource.metadata;
      const cdp = await context.newCDPSession(page);
      for (const width of [320, 390, 768, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        await route("list");
        await page
          .getByLabel("Search content", { exact: true })
          .fill(card.title);
        await page
          .getByRole("button", { name: new RegExp(card.title) })
          .click();
        const dialog = page.locator("dialog:modal");
        await settle(dialog);
        const body = dialog.locator(".dialog-body");
        const before = await body.evaluate((el) => ({
          left: el.getBoundingClientRect().left,
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
          top: el.scrollTop,
        }));
        assert.ok(
          before.scrollWidth <= before.width + 1,
          JSON.stringify(before),
        );
        const box = await body.boundingBox();
        const x = box.x + box.width / 2,
          y = Math.min(box.y + box.height - 40, 760);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let step = 1; step <= 8; step++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x - (70 * step) / 8, y: y - (190 * step) / 8 }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => body.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(before.top);
        const after = await body.evaluate((el) => ({
          left: el.getBoundingClientRect().left,
          x: el.scrollLeft,
          pageX: scrollX,
        }));
        assert.equal(after.x, 0);
        assert.equal(after.pageX, 0);
        assert.equal(after.left, before.left);
        await screenshot(`${width}-vertical-modal`);
        await page
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
        results.push({
          width,
          verticalTouchScroll: true,
          noHorizontalMovement: true,
        });
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await route("projects");
      await page.locator(".projectopen").first().click();
      assert.equal(
        await page
          .locator("dialog:modal")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator(".projectopen").first().click();
      await expect(page.locator("dialog:modal")).toHaveCSS(
        "animation-name",
        "astra-reveal",
      );
      await settle(page.locator("dialog:modal"));
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      results.push({ reducedMotion: true, dialogMotion: true });
      assert.deepEqual(errors, []);
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ results, errors }, null, 2),
      );
      await context.close();
    }
    console.log(JSON.stringify({ responsive: results.length, errors }));
  },
);
