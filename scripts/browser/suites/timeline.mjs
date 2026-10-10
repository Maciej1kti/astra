/** Timeline bars: fluent date gestures saved without a dialog, and what a bar opens. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";
import {
  dragTimelineBar,
  revealTimelineBar,
  timelineCardById,
  timelineDay,
} from "../timeline.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const chromium = browser.browserType().name() === "chromium";
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const input = join(runtime, "timeline-command.json");
    async function command(method, path, payload, version) {
      await writeFile(input, JSON.stringify(payload));
      const args = ["command", method, path, "--json-file", input];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }
    async function create(title, schedule, extra = {}) {
      const result = await command("POST", base, {
        title,
        status: "active",
        ...(schedule ? { schedule } : {}),
        ...extra,
      });
      return result.resource?.metadata?.id ?? result.id;
    }
    const plan = await create("Drag plan", {
      start: "2026-09-08",
      end: "2026-09-10",
    });
    const other = await create("Second plan", {
      start: "2026-09-14",
      end: "2026-09-15",
    });
    await create("Waiting for dates");
    const path = `${base}/${plan}`;
    const schedule = () => cli("get", path).metadata.schedule;
    const url = `${config.origin}/?${new URLSearchParams({ view: "gantt", project: project.id, month: "2026-09" })}`;

    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH")
        writes.push({
          path: new URL(request.url()).pathname,
          id: request.headers()["x-request-id"],
          body: request.postDataJSON(),
        });
    });
    const body = timelineCardById(page, plan);
    const bar = page.locator(`.timeline-bar[data-card-id="${plan}"]`);
    const noDialog = () => expect(page.locator("dialog[open]")).toHaveCount(0);
    const shot = (name) =>
      chromium
        ? page.screenshot({ path: join(evidence, `${name}.png`) })
        : Promise.resolve();
    try {
      await page.goto(url);
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 8–10 wrz");
      await shot("timeline-1440");

      // One surface: the buttons inside a bar draw no box of their own, at
      // rest or under the pointer, and the bar casts no shadow until it is held.
      await bar.hover();
      const hovered = await bar.evaluate((element) => {
        const inner = [...element.querySelectorAll("button")].map((button) => {
          const style = getComputedStyle(button);
          return [style.borderTopWidth, style.backgroundColor, style.boxShadow];
        });
        return { inner, shadow: getComputedStyle(element).boxShadow };
      });
      for (const [border, background, shadow] of hovered.inner) {
        assert.equal(border, "0px");
        assert.equal(background, "rgba(0, 0, 0, 0)");
        assert.equal(shadow, "none");
      }
      assert.equal(hovered.shadow, "none", "A resting bar has no shadow");
      await shot("timeline-hover");

      // The bar follows the pointer between days and shows the dates it would save.
      const unit = await timelineDay(page);
      const start = await bar.boundingBox();
      await dragTimelineBar(page, bar, 1.4, { release: false });
      const held = await bar.boundingBox();
      assert(
        Math.abs(held.x - start.x - 1.4 * unit) < 2,
        "A held bar is not snapped to whole days",
      );
      await expect(bar).toHaveAttribute("data-dragging", "move");
      await expect(bar.locator(".flank.before")).toHaveText("9 wrz");
      await expect(bar.locator(".flank.after")).toHaveText("11 wrz · 3 dni");
      assert.equal(writes.length, 0, "A preview writes nothing");
      await shot("timeline-drag");
      await page.mouse.up();
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 9–11 wrz");
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-09", end: "2026-09-11" });
      await noDialog();
      assert.equal(writes.length, 1, "One drop is one command");
      assert.deepEqual(writes[0].body, {
        set: { schedule: { start: "2026-09-09", end: "2026-09-11" } },
      });
      // The bar rests exactly on its days once the settling movement ends.
      await expect
        .poll(async () => (await bar.boundingBox()).x - start.x)
        .toBe(unit);

      // Both ends resize, and neither goes below one day.
      await dragTimelineBar(page, bar, 2, { edge: "end" });
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 9–13 wrz");
      await dragTimelineBar(page, bar, 1, { edge: "start" });
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 10–13 wrz");
      await dragTimelineBar(page, bar, 9, { edge: "start" });
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 13 wrz");
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-13", end: "2026-09-13" });
      await dragTimelineBar(page, bar, 2, { edge: "end" });
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-13", end: "2026-09-15" });
      await noDialog();
      assert.equal(writes.length, 5);

      // Escape returns the bar and proposes nothing.
      const version = cli("get", path).version;
      await dragTimelineBar(page, bar, 3, { release: false });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(bar).not.toHaveAttribute("data-dragging");
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 13–15 wrz");
      assert.equal(cli("get", path).version, version);
      assert.equal(writes.length, 5);

      // A press that does not travel is a click, and a bar opens its card.
      await body.click();
      const editor = page.getByRole("dialog", { name: "Edytuj element" });
      await expect(editor.getByLabel("Tytuł", { exact: true })).toHaveValue(
        "Drag plan",
      );
      await page
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await noDialog();
      assert.equal(cli("get", path).version, version);
      // So does its title in the fixed column.
      await page.locator(`[data-timeline-row="${plan}"] .row-title`).click();
      await expect(editor).toBeVisible();
      await page
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await noDialog();

      // Keyboard steps move the bar at once and are saved as one command,
      // including steps taken while an earlier save is still on its way.
      await body.focus();
      await page.keyboard.down("Alt");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await expect(body).toHaveAccessibleName("Karta: Drag plan, 11–13 wrz");
      assert.equal(writes.length, 5, "Steps wait for the keys to rest");
      await page.keyboard.up("Alt");
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-11", end: "2026-09-13" });
      assert.equal(writes.length, 6);
      await expect(body).toBeFocused();
      await page.keyboard.press("Alt+ArrowRight");
      await page.keyboard.press("Alt+ArrowRight");
      await page.keyboard.press("Alt+Shift+ArrowLeft");
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-06", end: "2026-09-08" });
      await page
        .getByRole("button", { name: "Zmień koniec: Drag plan", exact: true })
        .press("Alt+ArrowRight");
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-06", end: "2026-09-09" });
      await noDialog();

      // A save refused because the card changed elsewhere is never forced: the
      // bar returns to the saved days and the dialog keeps the proposal.
      const observed = cli("get", path);
      await dragTimelineBar(page, bar, 2, { release: false });
      await command(
        "PATCH",
        path,
        { set: { title: "Changed elsewhere" } },
        observed.version,
      );
      await page.mouse.up();
      const dates = page.getByRole("dialog", {
        name: "Zmień zaplanowane daty",
      });
      await expect(
        dates.getByText("Aktualny zapisany harmonogram:", { exact: false }),
      ).toBeVisible();
      await expect(
        dates.getByLabel("Zaplanowany początek", { exact: true }),
      ).toHaveValue("2026-09-08");
      await dates.getByRole("button", { name: "Anuluj", exact: true }).click();
      await noDialog();
      await expect(body).toHaveAccessibleName(
        "Karta: Changed elsewhere, 6–9 wrz",
      );
      assert.deepEqual(schedule(), { start: "2026-09-06", end: "2026-09-09" });
      // The refreshed bar carries the new version and moves again.
      await dragTimelineBar(page, bar, 1);
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-07", end: "2026-09-10" });
      await noDialog();

      // Cards without dates stand above the axis and open as cards.
      const tray = page.getByRole("region", { name: "Karty bez harmonogramu" });
      await expect(tray).toContainText("Bez harmonogramu");
      await tray
        .getByRole("button", { name: "Waiting for dates", exact: true })
        .click();
      await expect(editor.getByLabel("Tytuł", { exact: true })).toHaveValue(
        "Waiting for dates",
      );
      await page
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await noDialog();

      // Navigation: the toolbar names the month in view and moves by months.
      const title = page.getByRole("button", {
        name: "Wybierz datę na osi czasu",
        exact: true,
      });
      await expect(title).toHaveText("wrzesień 2026");
      await page
        .getByRole("button", { name: "Następny miesiąc", exact: true })
        .click();
      await expect(title).toHaveText("październik 2026");
      await expect(page).toHaveURL(/month=2026-10/);
      // A plan left behind the view offers a way back to it.
      const jump = page.getByRole("button", {
        name: "Pokaż na osi: Second plan",
        exact: true,
      });
      await jump.click();
      await expect(
        page.locator(`.timeline-bar[data-card-id="${other}"]`),
      ).toBeInViewport();
      await expect(title).toHaveText("wrzesień 2026");
      // Changing the scale, and changing it back, keeps the same days in view.
      const second = page.locator(`.timeline-bar[data-card-id="${other}"]`);
      const scroller = page.locator(".astra-gantt .scroller");
      const position = () => scroller.evaluate((element) => element.scrollLeft);
      // The jump scrolls softly; measure once it has come to rest.
      await expect
        .poll(async () => {
          const before = await position();
          await page.waitForTimeout(150);
          return (await position()) === before;
        })
        .toBe(true);
      const days = await position();
      for (const scale of ["Tygodnie", "Miesiące", "Dni"]) {
        await page.getByRole("button", { name: scale, exact: true }).click();
        await expect(second).toBeInViewport();
        await expect(title).toHaveText("wrzesień 2026");
      }
      assert.equal(await position(), days);
      await page.getByRole("button", { name: "Tygodnie", exact: true }).click();
      await revealTimelineBar(bar);
      await dragTimelineBar(page, bar, 7);
      await expect
        .poll(schedule)
        .toEqual({ start: "2026-09-14", end: "2026-09-17" });
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Tygodnie", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Dni", exact: true }).click();
      await noDialog();

      // One system: the view is built from the shared toolbar, segments,
      // heading and buttons, and a bar is drawn from the same tokens as a
      // Calendar item. Whatever the tokens resolve to is what the bar shows.
      await page.mouse.move(5, 5);
      const resolved = () =>
        page.evaluate(() => {
          const chart = document.querySelector(".astra-gantt");
          const probe = (declaration) => {
            const element = document.createElement("div");
            element.style.cssText = `position:absolute;${declaration}`;
            chart.append(element);
            const style = getComputedStyle(element);
            const value = {
              fill: style.backgroundColor,
              height: style.height,
              radius: style.borderTopLeftRadius,
            };
            element.remove();
            return value;
          };
          const bar = document.querySelector(
            ".timeline-bar[data-kind='plan']:not(:hover):not(:focus-within)",
          );
          const style = getComputedStyle(bar);
          return {
            bar: {
              fill: style.backgroundColor,
              rule: style.borderLeftColor,
              height: style.height,
              radius: style.borderTopLeftRadius,
            },
            tokens: {
              fill: probe("background:var(--plan-bg)").fill,
              rule: probe("background:var(--success)").fill,
              height: probe("height:var(--calendar-chip-height)").height,
              radius: probe("border-radius:var(--radius-sm)").radius,
            },
            row: document.querySelector(".timeline-row").getBoundingClientRect()
              .height,
            rowToken: parseFloat(
              probe(
                "height:calc(var(--calendar-chip-height) + 2 * var(--space-5))",
              ).height,
            ),
            root: { ...document.documentElement.dataset },
          };
        });
      // WebKit leaves nothing focused after a click, so there may be no focus.
      await page.evaluate(() => document.activeElement?.blur?.());
      const standard = await resolved();
      assert.deepEqual(standard.bar, standard.tokens);
      assert.equal(standard.row, standard.rowToken);
      const toolbar = page.locator(".period-toolbar");
      await expect(toolbar).toHaveCount(1);
      await expect(toolbar.locator(".segments").getByRole("button")).toHaveText(
        ["Dni", "Tygodnie", "Miesiące", "Karty", "Cele"],
      );
      await expect(tray.locator(".sectiontitle h3")).toHaveText(
        "Bez harmonogramu",
      );
      await expect(tray.locator(".cards > .ui-button").first()).toBeVisible();
      // Another character, palette and spacing change the bar with the rest.
      await page.evaluate(() => {
        localStorage.setItem("astra-character:v1", "technical");
        localStorage.setItem("astra-light:v1", "chalk");
        localStorage.setItem("astra-density:v1", "roomy");
      });
      await page.reload();
      await expect(bar).toBeVisible();
      const restyled = await resolved();
      assert.equal(restyled.root.character, "technical");
      assert.equal(restyled.root.density, "roomy");
      assert.deepEqual(restyled.bar, restyled.tokens);
      assert.equal(restyled.row, restyled.rowToken);
      assert.notEqual(restyled.bar.radius, standard.bar.radius);
      assert(restyled.row > standard.row, "Roomy spacing gives rows more room");
      assert.equal(
        restyled.bar.height,
        standard.bar.height,
        "A bar keeps its height in every spacing",
      );
      await shot("timeline-technical-chalk-roomy");
      await page.evaluate(() => {
        for (const part of ["character", "light", "density"])
          localStorage.removeItem(`astra-${part}:v1`);
      });
      await page.reload();
      await expect(bar).toBeVisible();

      // Touch: a swipe scrolls the days, and only a hold picks a bar up.
      if (chromium) {
        const phone = await newContext({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        });
        const mobile = await phone.newPage();
        mobile.on("pageerror", (error) => errors.push(error.message));
        await mobile.goto(url);
        const touched = mobile.locator(`.timeline-bar[data-card-id="${plan}"]`);
        await expect(touched).toBeVisible();
        await revealTimelineBar(touched);
        const session = await phone.newCDPSession(mobile);
        const touch = (type, x, y) =>
          session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: type === "touchEnd" ? [] : [{ x, y }],
          });
        const scroller = mobile.locator(".astra-gantt .scroller");
        const scrollLeft = () => scroller.evaluate((el) => el.scrollLeft);
        const before = schedule();
        const day = await timelineDay(mobile);
        let box = await touched.boundingBox();
        let x = box.x + box.width / 2;
        let y = box.y + box.height / 2;
        const origin = await scrollLeft();
        await touch("touchStart", x, y);
        for (let step = 1; step <= 8; step++)
          await touch("touchMove", x - step * 8, y);
        await touch("touchEnd");
        await expect.poll(scrollLeft).toBeGreaterThan(origin);
        assert.deepEqual(schedule(), before, "A swipe changes no date");
        // A swipe keeps gliding; the next touch waits until it has stopped.
        await expect
          .poll(async () => {
            const earlier = await scrollLeft();
            await mobile.waitForTimeout(150);
            return (await scrollLeft()) === earlier;
          })
          .toBe(true);
        await scroller.evaluate((el, left) => (el.scrollLeft = left), origin);
        box = await touched.boundingBox();
        x = box.x + box.width / 2;
        y = box.y + box.height / 2;
        await touch("touchStart", x, y);
        await mobile.waitForTimeout(400);
        for (let step = 1; step <= 8; step++)
          await touch("touchMove", x + (step * day) / 8, y);
        await expect(touched).toHaveAttribute("data-dragging", "move");
        await touch("touchEnd");
        await expect
          .poll(schedule)
          .toEqual({ start: "2026-09-15", end: "2026-09-18" });
        await expect(mobile.locator("dialog[open]")).toHaveCount(0);
        assert(
          (await mobile.evaluate(() => document.documentElement.scrollWidth)) <=
            390,
        );
        await mobile.screenshot({ path: join(evidence, "timeline-390.png") });
        await session.detach();
        await phone.close();
      }
      assert.deepEqual(errors, []);
      console.log(
        "PASS: timeline bars move and resize by the pixel, save one command per gesture without a dialog, cancel on Escape, open their card on a click, batch keyboard steps, return a refused change with its proposal kept, show cards without dates above the axis, navigate by month and scale, and on touch scroll with a swipe and move after a hold.",
      );
    } finally {
      await context.close();
    }
  },
);
