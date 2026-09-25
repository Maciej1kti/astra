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
          const header = page.locator("header.topbar");
          await expect(header).toHaveCount(1);
          await expect(page.locator("footer.topbar")).toHaveCount(0);
          const headerBox = await header.boundingBox();
          const mainBox = await page.locator("main").boundingBox();
          assert.ok(
            headerBox.y + headerBox.height <= mainBox.y + 1,
            "Workspace header must precede every view, including Focus",
          );
          await expect(
            page.locator("main").getByLabel("Project", { exact: true }),
          ).toHaveCount(0);
          if (view !== "projects") {
            const picker = header.getByLabel("Project", { exact: true });
            await expect(
              page.getByLabel("Project", { exact: true }),
            ).toHaveCount(1);
            await expect(picker).toHaveValue(project);
            await expect(picker).toBeInViewport({ ratio: 1 });
            const box = await picker.boundingBox();
            assert.ok(
              box.width >= 130 && box.height >= 44,
              "Header project picker must remain readable and tappable",
            );
          }
          if (view === "focus" && width <= 700) {
            const actions = header.getByRole("button", {
              name: "Workspace actions",
              exact: true,
            });
            await actions.click();
            await expect(
              header.getByRole("button", {
                name: "Host diagnostics",
                exact: true,
              }),
            ).toBeInViewport({ ratio: 1 });
            await expect(
              header.getByRole("button", { name: "Sign out", exact: true }),
            ).toBeInViewport({ ratio: 1 });
            await page.keyboard.press("Escape");
            await expect(actions).toBeFocused();
            await expect(actions).toHaveAttribute("aria-expanded", "false");
            await actions.click();
            await header
              .getByRole("button", { name: "Host diagnostics", exact: true })
              .click();
            await expect(
              page.getByRole("dialog", {
                name: "Host diagnostics",
                exact: true,
              }),
            ).toBeVisible();
            await page
              .getByRole("button", { name: "Close diagnostics", exact: true })
              .click();
            await expect(actions).toBeFocused();
            await expect(actions).toHaveAttribute("aria-expanded", "false");
          }
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
            await expect(
              page.getByLabel("Resource type", { exact: true }),
            ).toHaveCount(0);
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
          results.push({
            width,
            view,
            noPageOverflow: true,
            headerAboveContent: true,
            singleProjectPicker: view !== "projects",
          });
        }
      }
      await route("list", { project: "" });
      const picker = page
        .locator("header.topbar")
        .getByLabel("Project", { exact: true });
      await expect(page.locator(".listrow").first()).toBeVisible();
      await picker.selectOption(config.projects[2].id);
      await expect(page).toHaveURL(
        new RegExp(`project=${config.projects[2].id}`),
      );
      await expect(
        page.getByText(
          "No cards match this selection. Try another project or clear the filters.",
          { exact: true },
        ),
      ).toBeVisible();
      await page.reload();
      await expect(picker).toHaveValue(config.projects[2].id);
      await page.goBack();
      await expect(picker).toHaveValue("");
      await expect(page.locator(".listrow").first()).toBeVisible();
      await page.goForward();
      await expect(picker).toHaveValue(config.projects[2].id);
      await picker.selectOption(project);
      await expect(page.locator(".listrow").first()).toBeVisible();
      await page.getByRole("button", { name: "Focus", exact: true }).click();
      await expect(picker).toHaveValue(project);
      await expect(page).toHaveURL(/view=focus/);
      results.push({
        headerProjectSelection: true,
        reloadAndHistory: true,
        viewNavigationPreservesProject: true,
      });
      for (const [width, height] of [
        [844, 390],
        [740, 320],
      ]) {
        await page.setViewportSize({ width, height });
        await route("focus");
        const sidebar = page.locator("aside");
        await expect(sidebar.getByText("Astra", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          sidebar.getByText("WORKSPACE", { exact: true }),
        ).toHaveCount(0);
        await expect(sidebar.getByRole("button").first()).toHaveText("Focus");
        await expect(
          sidebar.getByRole("button", { name: "Focus", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        const initial = await sidebar.evaluate((el) => el.scrollTop);
        const bounds = await sidebar.boundingBox();
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height - 40;
        const touch = await context.newCDPSession(page);
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let step = 1; step <= 10; step++) {
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - (200 * step) / 10 }],
          });
        }
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => sidebar.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(initial);
        await expect(
          sidebar.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        await sidebar
          .getByRole("button", { name: "Updates", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Updates", exact: true }),
        ).toBeVisible();
        await screenshot(`${width}-${height}-sidebar`);
        await page.setViewportSize({ width: 390, height: 844 });
        const active = sidebar.getByRole("button", {
          name: "Updates",
          exact: true,
        });
        await expect(active).toBeInViewport({ ratio: 1 });
        await page.setViewportSize({ width, height });
        await expect(active).toBeInViewport({ ratio: 1 });
        await page.reload();
        await expect(active).toHaveAttribute("aria-current", "page");
        await expect(active).toBeInViewport({ ratio: 1 });
        await touch.detach();
        results.push({
          width,
          height,
          sidebarTouchScroll: true,
          rotationAndReloadRevealActiveView: true,
        });
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
