/** Compact navigation and browser presentation preferences on a paired release host. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, evidence, newContext, browser }) => {
    const context = await newContext({ hasTouch: true, colorScheme: "light" });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [],
      checks = [];
    const labels = {
      focus: "Focus",
      projects: "Projects",
      board: "Board",
      calendar: "Calendar",
      gantt: "Timeline",
      list: "List",
      updates: "Updates",
      chart: "Chart",
    };
    const defaults = Object.keys(labels);
    const key = "astra-navigation-layout:v1";
    const originalPreferences = cli("get", "/api/v1/workspace/preferences");
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.navigationCsp = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        window.navigationCsp.push(event.effectiveDirective),
      );
    });
    const nav = page.getByRole("navigation", { name: "Workspace views" });
    const more = nav.getByRole("button", { name: "More views", exact: true });
    const order = page.getByRole("list", { name: "Navigation order" });
    const move = (view, direction) =>
      order.getByRole("button", {
        name: `Move ${labels[view]} ${direction}`,
        exact: true,
      });
    const visibility = (view) =>
      order.getByRole("button", {
        name: `Show ${labels[view]} on navigation bar`,
        exact: true,
      });
    const readOrder = () =>
      order
        .locator("[data-navigation-item]")
        .evaluateAll((items) =>
          items.map((item) => item.dataset.navigationItem),
        );
    const readBar = () =>
      nav
        .getByRole("button")
        .evaluateAll(
          (buttons, names) =>
            buttons
              .map((button) => button.getAttribute("aria-label"))
              .filter((name) => names.includes(name)),
          Object.values(labels),
        );
    const savedLayout = () =>
      page.evaluate(
        (storageKey) => JSON.parse(localStorage.getItem(storageKey)),
        key,
      );
    const settle = () =>
      page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
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
    const screenshot = async (name) => {
      if (browser.browserType().name() !== "chromium") return;
      await expect(
        page.getByText(
          /^(Loading resources…|Loading planning view…|Loading board…|Loading date views…|Loading calendar…|Loading timeline…)$/,
        ),
      ).toHaveCount(0);
      await settle();
      await page.screenshot({ path: join(evidence, `${name}.png`) });
    };
    const openMore = async ({ touch = false } = {}) => {
      if ((await more.getAttribute("aria-expanded")) !== "true") {
        if (touch) await more.tap();
        else await more.click();
      }
      await expect(more).toHaveAttribute("aria-expanded", "true");
      const id = await more.getAttribute("aria-controls");
      assert.ok(id, "More must identify the panel it controls");
      const panel = page.locator(`[id="${id}"]`);
      await expect(panel).toBeVisible();
      return panel;
    };
    const customize = async (options) => {
      const panel = await openMore(options);
      const summary = panel
        .locator("summary")
        .filter({ hasText: /^Customize navigation$/ });
      if (
        !(await summary.evaluate((element) => element.closest("details").open))
      ) {
        if (options?.touch) await summary.tap();
        else await summary.click();
      }
      await expect(order).toBeVisible();
      await expect(order.locator("[data-navigation-item]")).toHaveCount(
        defaults.length,
      );
      return panel;
    };
    const closeMore = async () => {
      await page.keyboard.press("Escape");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toBeFocused();
      await expect(order).toBeHidden();
    };
    const route = async (view) => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project: config.projects[0].id, date: "2026-09-25" })}`,
      );
      await expect(nav).toBeVisible();
      if (view === "calendar") await expect(page.locator(".ec")).toBeVisible();
    };
    const checkBounds = async (locator, width, height, message) => {
      await locator.evaluate(async (element) => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      const bounds = await locator.boundingBox();
      assert.ok(bounds, message);
      assert.ok(
        bounds.x >= -1 &&
          bounds.y >= -1 &&
          bounds.x + bounds.width <= width + 1 &&
          bounds.y + bounds.height <= height + 1,
        `${message} at ${width} × ${height}: ${JSON.stringify(bounds)}`,
      );
      return bounds;
    };
    const checkTapTarget = async (locator, message) => {
      const bounds = await locator.boundingBox();
      assert.ok(
        bounds && bounds.width >= 44 && bounds.height >= 44,
        `${message}: ${JSON.stringify(bounds)}`,
      );
    };
    const indicatorMatches = async () => {
      await settle();
      await expect
        .poll(() =>
          nav.evaluate((element) => {
            const active = element.querySelector('[aria-current="page"]');
            const indicator = element.querySelector(".navigation-indicator");
            if (!active || !indicator) return Infinity;
            const selected = active.getBoundingClientRect(),
              surface = indicator.getBoundingClientRect();
            return Math.max(
              ...["x", "y", "width", "height"].map((property) =>
                Math.abs(selected[property] - surface[property]),
              ),
            );
          }),
        )
        .toBeLessThan(1.5);
    };
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await route("focus");
      await expect.poll(readBar).toEqual(["Focus", "Projects"]);
      await expect(more).toHaveText("More");
      await expect(
        nav.getByRole("button", { name: "Focus", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(more).not.toHaveAttribute("aria-current", "page");
      const dock = await page.locator(".app > aside").boundingBox();
      assert.ok(
        dock.width < 358,
        `Default dock should be shorter than the screen: ${JSON.stringify(dock)}`,
      );
      await screenshot("navigation-default-390");
      checks.push(
        "mobile default shows Focus, Projects and More in a shorter dock",
      );

      let panel = await openMore();
      for (const view of defaults.slice(2))
        await expect(
          panel.getByRole("button", { name: labels[view], exact: true }),
        ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Focus", exact: true }),
      ).toHaveCount(0);
      await expect(
        panel.getByRole("button", { name: "Projects", exact: true }),
      ).toHaveCount(0);
      await panel
        .getByRole("button", { name: "Calendar", exact: true })
        .click();
      await expect(page).toHaveURL(/view=calendar/);
      await expect(page.locator(".ec")).toBeVisible();
      await expect(more).toHaveAttribute("aria-current", "page");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect.poll(readBar).toEqual(["Focus", "Projects"]);
      checks.push(
        "hidden Calendar navigates through More and marks More as current",
      );

      await more.focus();
      await more.press("Enter");
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Tab");
      await closeMore();
      await openMore();
      await page.locator("header.topbar").click({ position: { x: 4, y: 4 } });
      await expect(more).toHaveAttribute("aria-expanded", "false");
      checks.push(
        "keyboard opening, Escape focus restoration and outside dismissal",
      );

      await customize();
      await expect.poll(readOrder).toEqual(defaults);
      await expect(move("focus", "earlier")).toBeDisabled();
      await expect(move("chart", "later")).toBeDisabled();
      await move("calendar", "earlier").focus();
      await move("calendar", "earlier").press("Enter");
      await expect(move("calendar", "earlier")).toBeFocused();
      await expect
        .poll(readOrder)
        .toEqual([
          "focus",
          "projects",
          "calendar",
          "board",
          "gantt",
          "list",
          "updates",
          "chart",
        ]);
      await move("calendar", "earlier").click();
      await visibility("calendar").click();
      await expect(visibility("calendar")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await visibility("projects").click();
      await expect(visibility("projects")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await move("focus", "later").click();
      const changedOrder = [
        "calendar",
        "focus",
        "projects",
        "board",
        "gantt",
        "list",
        "updates",
        "chart",
      ];
      await expect.poll(readOrder).toEqual(changedOrder);
      await closeMore();
      await expect.poll(readBar).toEqual(["Calendar", "Focus"]);
      await expect(
        nav.getByRole("button", { name: "Calendar", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(more).not.toHaveAttribute("aria-current", "page");
      const persisted = await savedLayout();
      assert.deepEqual(persisted.order, changedOrder);
      assert.deepEqual([...persisted.visible].sort(), ["calendar", "focus"]);
      await page.reload();
      await expect.poll(readBar).toEqual(["Calendar", "Focus"]);
      assert.deepEqual(await savedLayout(), persisted);
      await customize();
      await expect.poll(readOrder).toEqual(changedOrder);
      await expect(visibility("calendar")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(visibility("projects")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await screenshot("navigation-customized-390");
      checks.push(
        "earlier/later and visibility controls preserve order, focus and browser reload preference",
      );

      await visibility("calendar").click();
      await visibility("focus").click();
      for (const view of defaults)
        await expect(visibility(view)).toHaveAttribute("aria-pressed", "false");
      await closeMore();
      await expect.poll(readBar).toEqual([]);
      await expect(more).toBeVisible();
      await expect(more).toHaveAttribute("aria-current", "page");
      await page.reload();
      await expect.poll(readBar).toEqual([]);
      panel = await openMore();
      for (const view of defaults)
        await expect(
          panel.getByRole("button", { name: labels[view], exact: true }),
        ).toBeVisible();
      await panel
        .getByRole("button", { name: "Projects", exact: true })
        .click();
      await expect(page).toHaveURL(/view=projects/);
      await expect(more).toHaveAttribute("aria-current", "page");
      panel = await customize();
      await panel
        .getByRole("button", { name: "Reset navigation", exact: true })
        .click();
      await expect.poll(readOrder).toEqual(defaults);
      await expect(visibility("focus")).toHaveAttribute("aria-pressed", "true");
      await expect(visibility("projects")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      for (const view of defaults.slice(2))
        await expect(visibility(view)).toHaveAttribute("aria-pressed", "false");
      await closeMore();
      await expect.poll(readBar).toEqual(["Focus", "Projects"]);
      await expect(
        nav.getByRole("button", { name: "Projects", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      checks.push(
        "all-hidden state persists, retains every route in More and recovers through Reset",
      );

      for (const [width, height] of [
        [320, 740],
        [390, 844],
        [640, 320],
        [768, 1024],
        [844, 390],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width, height });
        await route("calendar");
        assert.ok(
          (await page.evaluate(() => document.documentElement.scrollWidth)) <=
            width + 1,
          `No page overflow at ${width} × ${height}`,
        );
        if (width <= 700) {
          await expect.poll(readBar).toEqual(["Focus", "Projects"]);
          await expect(more).toHaveAttribute("aria-current", "page");
          for (const name of ["Focus", "Projects"])
            await checkBounds(
              nav.getByRole("button", { name, exact: true }),
              width,
              height,
              `${name} stays in the viewport`,
            );
          await checkBounds(more, width, height, "More stays in the viewport");
          await checkTapTarget(more, "More touch target");
          panel = await customize();
          await checkBounds(
            panel,
            width,
            height,
            "Navigation panel stays in the viewport",
          );
          await move("focus", "later").scrollIntoViewIfNeeded();
          await checkTapTarget(move("focus", "later"), "Reorder touch target");
          await checkTapTarget(visibility("focus"), "Visibility touch target");
          await screenshot(`navigation-panel-${width}x${height}`);
          await closeMore();
        } else {
          await expect(more).toBeVisible();
          await expect.poll(readBar).toEqual(Object.values(labels));
          await expect(
            nav.getByRole("button", { name: "Calendar", exact: true }),
          ).toHaveAttribute("aria-current", "page");
          await expect(
            nav.getByRole("button", { name: "Calendar", exact: true }),
          ).toBeInViewport({ ratio: 1 });
        }
        await screenshot(`navigation-${width}x${height}`);
      }
      checks.push(
        "320/390 px, short mobile landscape, tablet and desktop landscape; complete desktop sidebar",
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      panel = await openMore({ touch: true });
      await panel.getByRole("button", { name: "List", exact: true }).tap();
      await expect(page).toHaveURL(/view=list/);
      await expect(more).toHaveAttribute("aria-current", "page");
      await customize({ touch: true });
      await visibility("list").tap();
      await move("list", "earlier").tap();
      await expect
        .poll(readOrder)
        .toEqual([
          "focus",
          "projects",
          "board",
          "calendar",
          "list",
          "gantt",
          "updates",
          "chart",
        ]);
      await closeMore();
      await expect.poll(readBar).toEqual(["Focus", "Projects", "List"]);
      await expect(
        nav.getByRole("button", { name: "List", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      assert.equal(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
        true,
      );
      await screenshot("navigation-touch-reduced-motion-390");
      checks.push(
        "touch navigation, visibility and reorder controls under reduced motion",
      );

      await page.emulateMedia({ reducedMotion: "no-preference" });
      await customize();
      for (const view of defaults)
        if ((await visibility(view).getAttribute("aria-pressed")) !== "true")
          await visibility(view).click();
      await closeMore();
      const fullOrder = [
        "focus",
        "projects",
        "board",
        "calendar",
        "list",
        "gantt",
        "updates",
        "chart",
      ];
      await expect.poll(readBar).toEqual(fullOrder.map((view) => labels[view]));
      assert.equal(
        await nav.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
        true,
        "All shortcuts use horizontal dock scrolling",
      );
      await more.scrollIntoViewIfNeeded();
      await expect(more).toBeInViewport({ ratio: 1 });
      assert.ok((await nav.evaluate((element) => element.scrollLeft)) > 0);
      await nav
        .getByRole("button", { name: "List", exact: true })
        .evaluate((element) => {
          element.dataset.navigationProbe = "retained";
        });
      panel = await customize({ touch: true });
      await expect(
        panel.getByText("All views are on the navigation bar.", {
          exact: true,
        }),
      ).toBeVisible();
      await move("list", "earlier").click();
      await move("list", "earlier").click();
      await expect
        .poll(readOrder)
        .toEqual([
          "focus",
          "projects",
          "list",
          "board",
          "calendar",
          "gantt",
          "updates",
          "chart",
        ]);
      await closeMore();
      const activeList = nav.getByRole("button", { name: "List", exact: true });
      await expect(activeList).toHaveAttribute(
        "data-navigation-probe",
        "retained",
      );
      await activeList.scrollIntoViewIfNeeded();
      await indicatorMatches();
      await more.scrollIntoViewIfNeeded();
      await expect(more).toBeInViewport({ ratio: 1 });
      await screenshot("navigation-all-visible-390");
      checks.push(
        "all shortcuts scroll with reachable More; reorder retains mounted active button and matching indicator",
      );

      await page.evaluate(
        (storageKey) => localStorage.setItem(storageKey, "{broken"),
        key,
      );
      await page.reload();
      await expect.poll(readBar).toEqual(["Focus", "Projects"]);
      await expect(more).toHaveAttribute("aria-current", "page");
      await indicatorMatches();
      await customize();
      await expect.poll(readOrder).toEqual(defaults);
      await closeMore();
      await page.evaluate(
        (storageKey) =>
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              order: ["calendar", "calendar", "unknown", "focus", null, 42],
              visible: "invalid",
            }),
          ),
        key,
      );
      await page.reload();
      await expect.poll(readBar).toEqual(["Focus", "Projects"]);
      await customize();
      const normalizedOrder = [
        "calendar",
        "focus",
        "projects",
        "board",
        "gantt",
        "list",
        "updates",
        "chart",
      ];
      await expect.poll(readOrder).toEqual(normalizedOrder);
      for (const view of defaults)
        await expect(visibility(view)).toHaveAttribute(
          "aria-pressed",
          ["focus", "projects"].includes(view) ? "true" : "false",
        );
      await visibility("calendar").click();
      const recovered = await savedLayout();
      assert.deepEqual(recovered.order, normalizedOrder);
      assert.equal(new Set(recovered.order).size, defaults.length);
      assert.deepEqual(recovered.visible, ["calendar", "focus", "projects"]);
      await closeMore();
      await expect.poll(readBar).toEqual(["Calendar", "Focus", "Projects"]);
      await indicatorMatches();
      checks.push(
        "malformed storage restores defaults and duplicate/unknown routes normalize to unique valid shortcuts on reload",
      );

      assert.equal(
        cli("get", "/api/v1/workspace/preferences").version,
        originalPreferences.version,
        "Navigation presentation does not write workspace preferences",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.navigationCsp), []);
      checks.push(
        "no source preference writes, application errors or CSP violations",
      );
    } catch (error) {
      await writeFile(
        join(evidence, "failure.txt"),
        await page.locator("body").ariaSnapshot(),
      );
      await screenshot("navigation-failure");
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
