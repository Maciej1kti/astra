/** Real navigation, interrupted motion and native-layer lifecycle on a paired host. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(async ({ config, evidence, newContext, browser }) => {
  const context = await newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [],
    checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.motionProbe = { scenes: [], csp: [] };
    document.addEventListener("securitypolicyviolation", (event) =>
      window.motionProbe.csp.push(event.violatedDirective),
    );
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (options?.fill === "backwards")
        window.motionProbe.scenes.push({
          target: this.className,
          delay: options.delay,
          duration: options.duration,
        });
      return animate.call(this, frames, options);
    };
  });
  const nav = page.getByRole("navigation", { name: "Workspace views" });
  const editor = page.getByRole("dialog", {
    name: "Edit resource",
    exact: true,
  });
  const settle = () =>
    page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
  const select = async (view) => {
    await nav.getByRole("button", { name: view, exact: true }).click();
    await expect(
      nav.getByRole("button", { name: view, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  };
  const indicatorMatches = async () => {
    await settle();
    const rects = await nav.evaluate((node) => {
      const read = (selector) => {
        const { x, y, width, height } = node
          .querySelector(selector)
          .getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        active: read('[aria-current="page"]'),
        indicator: read(".navigation-indicator"),
      };
    });
    for (const key of ["x", "y", "width", "height"])
      assert(
        Math.abs(rects.active[key] - rects.indicator[key]) < 1.5,
        JSON.stringify(rects),
      );
  };
  const screenshot = async (name) => {
    // WebKit's screenshot preparation injects styles prohibited by the real CSP.
    if (process.env.ASTRA_TEST_BROWSER !== "webkit")
      await page.screenshot({ path: join(evidence, `${name}.png`) });
  };
  try {
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "list", project: config.projects[0].id })}`,
    );
    await expect(page.locator(".listrow").first()).toBeVisible();
    await indicatorMatches();
    const initial = await page.evaluate(() => window.motionProbe.scenes);
    assert(initial.length > 1 && initial.length <= 24);
    assert(initial.some((item) => item.delay > 0));
    assert(Math.max(...initial.map((item) => item.delay)) <= 160);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByText("Loading resources…", { exact: true }),
    ).toHaveCount(0);
    await settle();
    assert.equal(
      await page.evaluate(() => window.motionProbe.scenes.length),
      initial.length,
      "A data refresh must not replay the entrance",
    );
    checks.push("bounded readiness cascade; refresh retains the scene");

    await select("Projects");
    // Direct DOM clicks intentionally interrupt the moving selection before it settles.
    await nav
      .getByRole("button", { name: "Focus", exact: true })
      .evaluate((node) => node.click());
    await nav
      .getByRole("button", { name: "List", exact: true })
      .evaluate((node) => node.click());
    await expect(
      nav.getByRole("button", { name: "List", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await indicatorMatches();
    checks.push("rapid navigation ends at the actual selected view");

    const row = page.locator(".listrow").first();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(editor).toBeVisible();
    assert.equal(await editor.evaluate((node) => node.matches(":modal")), true);
    await settle();
    await screenshot("desktop-editor");
    const layout = editor.getByRole("button", {
      name: "Customize card layout",
      exact: true,
    });
    await layout.click();
    await expect(editor.locator(".action-menu-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(layout).toBeFocused();
    await expect(layout).toHaveAttribute("aria-expanded", "false");
    await layout.click();
    await expect(editor.locator(".action-menu-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(layout).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(row).toBeFocused();
    await expect(page.locator("dialog")).toHaveCount(0);
    checks.push(
      "keyboard opening, reversible menus, native close and restored focus",
    );

    // Switch preferences while animations are active; no delayed cascade may return.
    await nav
      .getByRole("button", { name: "Projects", exact: true })
      .evaluate((node) => node.click());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await indicatorMatches();
    assert.equal(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) => a.playState === "running" || a.playState === "pending",
            ).length,
      ),
      0,
    );
    const sceneCount = await page.evaluate(
      () => window.motionProbe.scenes.length,
    );
    await select("List");
    await page.locator(".listrow").first().click();
    await expect(editor).toBeVisible();
    assert.equal(
      await editor.evaluate((node) => getComputedStyle(node).animationName),
      "none",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => window.motionProbe.scenes.length),
      sceneCount,
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    checks.push(
      "live reduced-motion preference settles active effects and disables future effects",
    );

    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      await select("Updates");
      await indicatorMatches();
      await select("List");
      await indicatorMatches();
      assert(
        (await page.evaluate(() => document.documentElement.scrollWidth)) <=
          width + 1,
      );
      await page.locator(".listrow").first().click();
      await expect(editor).toBeVisible();
      await settle();
      const bounds = await editor.boundingBox();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
      await screenshot(`editor-${width}`);
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await select("Projects");
    await indicatorMatches();
    await screenshot("dark-mobile-projects");
    checks.push(
      "selection geometry and native layers at 1440/1024/768/390/320; dark appearance",
    );
    assert.deepEqual(await page.evaluate(() => window.motionProbe.csp), []);
    assert.deepEqual(errors, []);
  } finally {
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify({ checks, errors, browser: browser.version() }, null, 2),
    );
  }
  console.log(JSON.stringify({ checks, errors }));
});
