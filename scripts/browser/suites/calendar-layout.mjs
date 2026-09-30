/** Dense month geometry, complete popups and unused optional formatting. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(async ({ config, cli, newContext, evidence }) => {
  const project = config.projects[0];
  const folder = join(project.folder, ".project/cards");
  const template = JSON.parse(
    await readFile(join(folder, `${config.cards[0].id}.json`), "utf8"),
  );
  const added = new Set();
  for (let index = 0; index < 300; index++) {
    const card = structuredClone(template);
    const id = randomUUID();
    added.add(id);
    Object.assign(card.metadata, {
      id,
      title: `Dense calendar fixture ${index}`,
      status: "planned",
      schedule:
        index < 100
          ? { start: "2026-09-07", end: "2026-09-09" }
          : index < 200
            ? { start: "2026-09-13", end: "2026-09-16" }
            : { start: "2026-09-22", end: "2026-09-22" },
    });
    // External writes are confined to the suite's disposable source fixture.
    await writeFile(join(folder, `${id}.json`), JSON.stringify(card));
  }
  const path = `/api/v1/views/calendar?project_id=${project.id}&from=2026-08-31&to=2026-10-04&limit=1000`;
  let expected;
  await expect
    .poll(
      () => {
        expected = cli("get", path);
        return (
          expected.page.freshness === "index_snapshot" &&
          expected.items.filter((item) => added.has(item.resource_id))
            .length === added.size
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const context = await newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const checkpoints = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const counts = { cell: 0, footer: 0, timeFormats: 0 };
    const rect = Element.prototype.getBoundingClientRect;
    window.calendarReadRect = (element) => rect.call(element);
    Element.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("ec-day")) counts.cell++;
      if (this.classList.contains("ec-day-foot")) counts.footer++;
      return rect.call(this);
    };
    const format = Intl.DateTimeFormat.prototype.formatRange;
    Intl.DateTimeFormat.prototype.formatRange = function (...args) {
      if (this.resolvedOptions().hour !== undefined) counts.timeFormats++;
      return format.apply(this, args);
    };
    window.calendarGeometry = counts;
  });
  const surface = page.locator(".calendar-surface");
  async function settled() {
    await expect(surface).toHaveAttribute("aria-busy", "false");
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
  }
  async function checkpoint(name) {
    await settled();
    const layout = await page.evaluate(() => {
      const root = document.querySelector(".ec-day-grid");
      const cells = [...root.querySelectorAll(".ec-body .ec-grid > .ec-day")];
      const events = [
        ...root.querySelectorAll(".ec-body > .ec-events > article"),
      ];
      const misplaced = [];
      let visible = 0;
      for (const element of events) {
        const style = getComputedStyle(element);
        if (style.visibility === "hidden") continue;
        visible++;
        const row = Number(style.gridRowStart);
        const column = Number(style.gridColumnStart);
        const day = cells[(row - 1) * 7 + column - 1];
        const event = window.calendarReadRect(element);
        const header = window.calendarReadRect(day.firstElementChild);
        const cell = window.calendarReadRect(day);
        const footer = window.calendarReadRect(day.lastElementChild);
        if (
          event.top < header.bottom - 1 ||
          event.bottom > cell.bottom - footer.height + 1
        )
          misplaced.push(element.textContent);
      }
      return {
        cells: cells.length,
        visible,
        hidden: events.length - visible,
        misplaced,
        height: window.calendarReadRect(root).height,
        counts: { ...window.calendarGeometry },
      };
    });
    checkpoints.push({ ...layout, name });
    assert.ok(layout.hidden > 250);
    assert.deepEqual(layout.misplaced, []);
    const actual = await surface
      .locator("[data-calendar-item]")
      .evaluateAll((elements) =>
        [
          ...new Set(elements.map((element) => element.dataset.calendarItem)),
        ].sort(),
      );
    assert.deepEqual(actual, expected.items.map((item) => item.item_id).sort());
    return layout;
  }
  try {
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "calendar", project: project.id, date: "2026-09-08", layout: "month" })}`,
    );
    await expect(surface.locator("[data-calendar-item]")).not.toHaveCount(0);
    const initial = await checkpoint("desktop");
    assert.ok(initial.visible > 0);
    // These bounds count actual browser geometry calls, not elapsed time. The
    // previous per-event/per-spanned-day reads exceed these limits on this fixture.
    assert.ok(initial.counts.cell < initial.cells * 8, JSON.stringify(initial));
    assert.ok(
      initial.counts.footer < initial.cells * 8,
      JSON.stringify(initial),
    );
    assert.equal(initial.counts.timeFormats, 0);
    for (const viewport of [
      { width: 1024, height: 640 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() =>
          surface
            .locator(".ec")
            .evaluate((element) => element.getBoundingClientRect().height),
        )
        .not.toBe(checkpoints.at(-1).height);
      await checkpoint(`${viewport.width}x${viewport.height}`);
    }
    const more = surface.getByRole("button", { name: /^\+\d+ more$/ }).first();
    const date = await more.evaluate((element) =>
      element.closest(".ec-day").querySelector("time").getAttribute("datetime"),
    );
    await more.focus();
    await more.press("Enter");
    const popup = surface.getByRole("dialog");
    await expect(popup).toBeVisible();
    const entries = expected.items.filter(
      (item) => item.start <= date && item.end >= date,
    );
    await expect
      .poll(() =>
        popup
          .locator("[data-calendar-item]")
          .evaluateAll((elements) =>
            elements.map((element) => element.dataset.calendarItem).sort(),
          ),
      )
      .toEqual(entries.map((item) => item.item_id).sort());
    const target = entries.find((item) => added.has(item.resource_id));
    const entry = popup
      .locator(`[data-calendar-item="${target.item_id}"]`)
      .locator("xpath=ancestor::article[1]");
    await expect(entry).toHaveAttribute("data-source-version", target.version);
    await entry.focus();
    await entry.press("Enter");
    const editor = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    await expect(editor.getByLabel("Title", { exact: true })).toHaveValue(
      target.title,
    );
    await editor
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await expect(editor).toBeHidden();
    if (await popup.count())
      await popup.getByRole("button", { name: /close/i }).click();
    await expect(surface.getByRole("dialog")).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally {
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify({ checkpoints, errors, addedCards: added.size }, null, 2),
    );
    await context.close();
  }
});
