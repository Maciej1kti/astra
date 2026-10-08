/** Calendar layers follow current data without replacing native event geometry. */
import { setCalendarLayout } from "../calendar-controls.mjs";
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({
      reducedMotion: "no-preference",
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [],
      checks = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.calendarProbe = { effects: [], csp: [] };
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const a = animate.apply(this, args);
        if (this.closest(".calendar-surface"))
          window.calendarProbe.effects.push(a);
        return a;
      };
      document.addEventListener("securitypolicyviolation", (e) =>
        window.calendarProbe.csp.push(e.violatedDirective),
      );
    });
    const surface = page.locator(".calendar-surface");
    const settle = () =>
      page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.allSettled(
          document.getAnimations().map((a) => a.finished),
        );
      });
    const count = () =>
      page.evaluate(() => window.calendarProbe.effects.length);
    const inspect = async (name, from, agenda = false) => {
      await expect(surface).toHaveAttribute("aria-busy", "false");
      await settle();
      const layers = await page.evaluate(
        (from) =>
          window.calendarProbe.effects
            .slice(from)
            .filter((a) => a.effect.target.isConnected)
            .map((a) => {
              const node = a.effect.target,
                before = node.getBoundingClientRect();
              a.pause();
              a.currentTime = a.effect.getTiming().delay + 150;
              const after = node.getBoundingClientRect(),
                opacity = Number(getComputedStyle(node).opacity);
              a.finish();
              return {
                target: node.className,
                delay: a.effect.getTiming().delay,
                opacity,
                grid: node.matches(".ec-grid"),
                events: node.matches(".ec-events"),
                day: node.matches(".ec-list .ec-day"),
                empty: node.matches(".ec-no-events"),
                moved: Math.max(
                  ...["x", "y", "width", "height"].map((k) =>
                    Math.abs(before[k] - after[k]),
                  ),
                ),
                individual: node.matches(".calendar-item, .ec-event"),
              };
            }),
        from,
      );
      assert(
        layers.length >= 2 && layers.length <= 32,
        `${name}: bounded distinct layers: ${JSON.stringify(layers)}`,
      );
      assert(
        layers.every((l) => l.moved < 0.1 && !l.individual),
        `${name}: native event geometry stays fixed`,
      );
      assert(
        layers.some((l) => l.delay > 0 && l.opacity > 0 && l.opacity < 0.8),
      );
      assert(
        agenda
          ? layers.some((l) => l.day || l.empty)
          : layers.some((l) => l.grid) && layers.some((l) => l.events),
        `${name}: rendered content follows the surface`,
      );
      assert.deepEqual(await page.evaluate(() => window.calendarProbe.csp), []);
      checks.push({ name, layers });
      if (process.env.ASTRA_TEST_BROWSER !== "webkit") {
        await page.screenshot({ path: join(evidence, `${name}.png`) });
        if (["month", "mobile-month-agenda", "mobile-grid"].includes(name)) {
          for (const time of [220, 420]) {
            await page.evaluate(
              ({ from, time }) => {
                for (const a of window.calendarProbe.effects.slice(from)) {
                  a.pause();
                  a.currentTime = time;
                }
              },
              { from, time },
            );
            await page.screenshot({
              path: join(evidence, `${name}-${time}ms.png`),
            });
          }
          await page.evaluate((from) => {
            for (const a of window.calendarProbe.effects.slice(from))
              a.finish();
          }, from);
        }
      }
    };
    const inspectPopup = async (name, touch = false) => {
      const more = surface
        .getByRole("button", { name: /^\+\d+ więcej$/ })
        .first();
      if (touch) await more.tap();
      else await more.press("Enter");
      const popup = surface.locator(".ec-popup[open]");
      await expect(popup).toBeVisible();
      const layers = await popup.evaluate((node) =>
        node
          .getAnimations({ subtree: true })
          .filter((a) => a.animationName === "astra-fade")
          .map((a) => {
            const target = a.effect.target;
            a.finish();
            const settled = target.getBoundingClientRect();
            a.pause();
            a.currentTime = a.effect.getTiming().delay + 150;
            const sampled = target.getBoundingClientRect();
            const opacity = Number(getComputedStyle(target).opacity);
            a.finish();
            return {
              target: target.className,
              delay: a.effect.getTiming().delay,
              opacity,
              moved: Math.max(
                ...["x", "y", "width", "height"].map((key) =>
                  Math.abs(settled[key] - sampled[key]),
                ),
              ),
            };
          }),
      );
      assert.deepEqual(
        layers.map((l) => l.delay).sort((a, b) => a - b),
        [0, 100, 220],
      );
      assert(
        layers.every((l) => l.opacity > 0 && l.opacity < 0.8 && l.moved < 0.1),
      );
      checks.push({ name, layers });
      if (process.env.ASTRA_TEST_BROWSER !== "webkit")
        await page.screenshot({ path: join(evidence, `${name}.png`) });
      await popup.getByRole("button", { name: "Zamknij", exact: true }).click();
      await expect(popup).toHaveCount(0);
    };
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route("**/api/v1/views/calendar?*", async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.goto(
        `${config.origin}/?view=calendar&project=${config.projects[0].id}&date=2026-09-08&layout=month`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(surface).toHaveAttribute("aria-busy", "true");
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.equal(
        await count(),
        0,
        "Calendar content entrance waits for its current data",
      );
      release();
      await expect(page.locator(".calendar-item").first()).toBeAttached();
      await inspect("month", 0);
      await page.unroute("**/api/v1/views/calendar?*");
      await inspectPopup("desktop-popup");
      for (const mode of ["week", "day", "agenda"]) {
        const before = await count();
        await setCalendarLayout(page, mode);
        await inspect(mode, before, mode === "agenda");
      }
      const beforeProject = await count();
      await page
        .getByLabel("Projekt", { exact: true })
        .selectOption(config.projects[2].id);
      await expect(
        page.getByText("Brak elementów z datą w tym okresie.", { exact: true }),
      ).toBeVisible();
      await inspect("empty-project", beforeProject, true);
      await page
        .getByLabel("Projekt", { exact: true })
        .selectOption(config.projects[0].id);
      await expect(page.locator(".calendar-item").first()).toBeAttached();
      await settle();
      const beforeRefresh = await count();
      await page.getByRole("button", { name: "Odśwież", exact: true }).click();
      await expect(surface).toHaveAttribute("aria-busy", "false");
      await settle();
      assert.equal(
        await count(),
        beforeRefresh,
        "Refresh does not replay the calendar",
      );
      const sourcePath = `/api/v1/projects/${config.projects[0].id}/cards/${config.cards[0].id}`;
      const source = cli("get", sourcePath);
      const file = join(runtime, "calendar-motion-command.json");
      await writeFile(
        file,
        JSON.stringify({ set: { title: "Soft calendar source refresh" } }),
      );
      cli(
        "command",
        "PATCH",
        sourcePath,
        "--json-file",
        file,
        "--if-version",
        source.version,
      );
      await expect(
        page
          .locator(".calendar-item")
          .filter({ hasText: "Soft calendar source refresh" })
          .first(),
      ).toBeAttached();
      await settle();
      assert.equal(
        await count(),
        beforeRefresh,
        "A source write does not replay the calendar",
      );
      await page.locator(".calendar-item:visible").first().click();
      const editor = page.getByRole("dialog", {
        name: "Edytuj element",
        exact: true,
      });
      await expect(editor).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      let before = await count();
      await setCalendarLayout(page, "month");
      await inspect("mobile-month-agenda", before, true);
      await page.locator(".calendar-item:visible").first().tap();
      await expect(editor).toBeVisible();
      await editor
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .tap();
      await expect(page.locator(".app-dialog[open]")).toHaveCount(0);
      before = await count();
      await page
        .getByRole("button", { name: "Siatka miesiąca", exact: true })
        .click();
      await inspect("mobile-grid", before);
      await inspectPopup("mobile-popup", true);
      for (const mode of ["week", "day", "agenda"]) {
        const before = await count();
        await setCalendarLayout(page, mode);
        await inspect(`mobile-${mode}`, before, mode === "agenda");
      }
      const beforePeriod = await count();
      await page
        .getByRole("button", { name: "Następny okres kalendarza", exact: true })
        .click();
      await inspect("mobile-next-period", beforePeriod, true);
      const previous = await count();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setCalendarLayout(page, "week");
      await expect(surface).toHaveAttribute("aria-busy", "false");
      await settle();
      assert.equal(
        await count(),
        previous,
        "Reduced motion prevents every calendar layer",
      );
      assert.deepEqual(errors, []);
    } finally {
      release();
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checks, errors }, null, 2),
      );
    }
    console.log(JSON.stringify({ checks, errors }));
  },
);
