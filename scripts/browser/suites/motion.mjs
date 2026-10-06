/** Real navigation, interrupted motion and native-layer lifecycle on a paired host. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";
await runBrowserSuite(async (fixture) => {
  const { config, evidence, newContext, browser } = fixture;
  const context = await newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [],
    checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.motionProbe = { scripted: [], styled: [], csp: [], animations: [] };
    document.addEventListener("securitypolicyviolation", (event) =>
      window.motionProbe.csp.push(event.violatedDirective),
    );
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      window.motionProbe.scripted.push({
        target: this.className,
        content: !!this.closest?.(".view-content, .app-dialog"),
        delay: options?.delay ?? 0,
        duration: options?.duration ?? 0,
      });
      const animation = animate.call(this, frames, options);
      window.motionProbe.animations.push(animation);
      return animation;
    };
    document.addEventListener("animationstart", (event) => {
      const started = event.target
        .getAnimations()
        .filter((animation) => animation.animationName === event.animationName);
      window.motionProbe.animations.push(...started);
      for (const animation of started) {
        const timing = animation.effect.getTiming();
        const style = getComputedStyle(event.target);
        window.motionProbe.styled.push({
          name: event.animationName,
          target: event.target.className,
          delay: timing.delay,
          duration: timing.duration,
          blurred: style.filter !== "none",
        });
      }
    });
  });
  const nav = page.getByRole("navigation", {
    name: "Widoki przestrzeni roboczej",
  });
  const editor = page.getByRole("dialog", {
    name: "Edytuj element",
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
    const direct = nav.getByRole("button", { name: view, exact: true });
    const more = nav.getByRole("button", {
      name: "Więcej widoków",
      exact: true,
    });
    const overflow = !(await direct.isVisible());
    if (overflow) await more.click();
    await direct.click();
    await expect(overflow ? more : direct).toHaveAttribute(
      "aria-current",
      "page",
    );
    if (overflow) await expect(more).toHaveAttribute("aria-expanded", "false");
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
  // Sample the actual rendered effect, independent of runner/CPU scheduling.
  const sample = (selector, name, time) =>
    page.evaluate(
      ({ selector, name, time }) => {
        const animation = window.motionProbe.animations.findLast(
          (animation) =>
            animation.effect?.target?.matches(selector) &&
            (!name || animation.animationName === name),
        );
        if (!animation) throw new Error(`No effect for ${selector}`);
        const timing = animation.effect.getTiming();
        animation.pause();
        animation.currentTime = time;
        const style = getComputedStyle(animation.effect.target);
        const result = {
          delay: timing.delay,
          duration: timing.duration,
          opacity: Number(style.opacity),
          moving: style.transform !== "none",
        };
        animation.finish();
        const settled = getComputedStyle(animation.effect.target);
        return {
          ...result,
          settledOpacity: Number(settled.opacity),
          settledFilter: settled.filter,
        };
      },
      { selector, name, time },
    );
  // One short arrival: no stagger, readable halfway through, nothing left behind.
  const brief = (effect, limit) => {
    assert.equal(effect.delay, 0, JSON.stringify(effect));
    assert(
      effect.duration > 0 && effect.duration <= limit,
      `Entrance lasts at most ${limit} ms: ${JSON.stringify(effect)}`,
    );
    assert(
      effect.opacity >= 0.5,
      `Content is readable halfway through: ${JSON.stringify(effect)}`,
    );
    assert.equal(effect.settledOpacity, 1);
    assert.equal(effect.settledFilter, "none");
  };
  const contentEffects = () =>
    page.evaluate(() => ({
      scripted: window.motionProbe.scripted.filter((item) => item.content),
      styled: window.motionProbe.styled,
    }));
  try {
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "list", project: config.projects[0].id })}`,
    );
    await expect(page.locator(".listrow").first()).toBeVisible();
    await indicatorMatches();
    const viewEntrance = await sample(".view-content", "astra-fade", 100);
    brief(viewEntrance, 200);
    const initial = await contentEffects();
    assert.deepEqual(
      initial.scripted,
      [],
      "Loaded content has no scripted cascade",
    );
    assert(
      initial.styled.every((item) => item.delay === 0 && !item.blurred),
      JSON.stringify(initial.styled),
    );
    await page.getByRole("button", { name: "Odśwież", exact: true }).click();
    await expect(
      page.getByText("Ładowanie danych…", { exact: true }),
    ).toHaveCount(0);
    await settle();
    assert.deepEqual(
      await contentEffects(),
      initial,
      "A data refresh must not start an entrance",
    );
    checks.push("one view fade; no cascade; refresh starts nothing");

    await select("Projekty");
    await settle();
    const selection = await sample(".navigation-indicator", "", 100);
    assert(
      selection.duration <= 280 && selection.moving,
      `The selection still travels at 100 ms and ends within 280 ms: ${JSON.stringify(selection)}`,
    );
    // Direct DOM clicks intentionally interrupt the moving selection before it settles.
    await nav
      .getByRole("button", { name: "Focus", exact: true })
      .evaluate((node) => node.click());
    await nav
      .getByRole("button", { name: "Lista", exact: true })
      .evaluate((node) => node.click());
    await expect(
      nav.getByRole("button", { name: "Lista", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await indicatorMatches();
    checks.push("rapid navigation ends at the actual selected view");

    const row = page.locator(".listrow").first();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(editor).toBeVisible();
    assert.equal(await editor.evaluate((node) => node.matches(":modal")), true);
    await settle();
    const dialogEntrance = await sample(".editor", "astra-dialog", 140);
    brief(dialogEntrance, 280);
    const opened = await contentEffects();
    assert.deepEqual(opened.scripted, [], "A dialog has no scripted layers");
    assert(
      opened.styled.every((item) => item.delay === 0 && !item.blurred),
      JSON.stringify(opened.styled),
    );
    await screenshot("desktop-editor");
    await editor
      .getByRole("combobox", { name: "Etykiety", exact: true })
      .fill("Layered label");
    await editor
      .getByRole("button", { name: "Dodaj tag", exact: true })
      .click();
    await expect(
      editor.getByRole("button", {
        name: "Usuń tag Layered label",
        exact: true,
      }),
    ).toBeVisible();
    await settle();
    assert(
      await page.evaluate(() =>
        window.motionProbe.animations.some(
          (a) =>
            a.animationName === "astra-confirm" &&
            a.effect?.target?.matches(".chip-added"),
        ),
      ),
      "An explicit tag add retains its own confirmation pulse",
    );
    assert.deepEqual(
      (await contentEffects()).scripted,
      [],
      "Editing starts no scripted entrance",
    );
    const layout = editor.getByRole("button", {
      name: "Dostosuj układ karty",
      exact: true,
    });
    await layout.click();
    await expect(editor.locator(".action-menu-panel")).toBeVisible();
    await settle();
    const menuEntrance = await sample(".action-menu-panel", "", 60);
    brief(menuEntrance, 120);
    checks.push({
      name: "Brief view, dialog and menu arrivals; moving selection",
      selection,
      viewEntrance,
      dialogEntrance,
      menuEntrance,
    });
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
      .getByRole("button", { name: "Projekty", exact: true })
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
    const before = await contentEffects();
    await select("Lista");
    await page.locator(".listrow").first().click();
    await expect(editor).toBeVisible();
    assert.equal(
      await editor.evaluate((node) => getComputedStyle(node).animationName),
      "none",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).toHaveCount(0);
    assert.deepEqual(
      await contentEffects(),
      before,
      "Reduced motion starts no entrance",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    checks.push(
      "live reduced-motion preference settles active effects and disables future effects",
    );

    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      await select("Projekty");
      await indicatorMatches();
      await select("Aktualizacje");
      await indicatorMatches();
      await select("Focus");
      await indicatorMatches();
      await select("Lista");
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
    await select("Projekty");
    await indicatorMatches();
    await screenshot("dark-mobile-projects");
    checks.push(
      "selection geometry and native layers at 1440/1024/768/390/320; dark appearance",
    );
    // Planning widgets arrive with their view; nothing is staged inside them.
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [view, surface] of [
      ["calendar", ".ec"],
      ["gantt", ".wx-gantt"],
      ["board", ".astra-board .wx-column"],
    ]) {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project: config.projects[0].id })}`,
      );
      await expect(page.locator(surface).first()).toBeVisible();
      await settle();
    }
    const planning = await contentEffects();
    assert.deepEqual(planning.scripted, [], "Widgets have no scripted layers");
    assert(
      planning.styled.every((item) => item.delay === 0 && !item.blurred),
      JSON.stringify(planning.styled),
    );
    checks.push("Calendar, Timeline and Board arrive without staged layers");
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
