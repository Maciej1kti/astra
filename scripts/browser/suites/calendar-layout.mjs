/** Dense month geometry, exact hidden counts and complete cross-week popups. */
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
  for (let index = 0; index < 330; index++) {
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
            : index < 300
              ? { start: "2026-09-22", end: "2026-09-22" }
              : { start: "2026-09-01", end: "2026-09-30" },
    });
    if (index < 80 && index % 2 === 0) {
      delete card.metadata.schedule;
      card.metadata.event = {
        start: `2026-09-07T${String(8 + (index % 12)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}`,
        duration_minutes: index % 4 === 0 ? 30 : 100,
      };
    }
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
    const counts = { cell: 0, header: 0, footer: 0, timeFormats: 0 };
    const rect = Element.prototype.getBoundingClientRect;
    window.calendarReadRect = (element) => rect.call(element);
    Element.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("ec-day")) counts.cell++;
      if (this.classList.contains("ec-day-head")) counts.header++;
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
    const layout = await page.evaluate((items) => {
      const root = document.querySelector(".ec-day-grid");
      const cells = [...root.querySelectorAll(".ec-body .ec-grid > .ec-day")];
      const events = [
        ...root.querySelectorAll(".ec-body > .ec-events > article"),
      ];
      const byId = new Map(items.map((item) => [item.item_id, item]));
      const shape = (element) => {
        const item = byId.get(
          element.querySelector("[data-calendar-item]").dataset.calendarItem,
        );
        const style = getComputedStyle(element);
        return JSON.stringify([
          style.gridRowStart,
          style.gridColumnStart,
          style.gridColumnEnd,
          item.kind,
          item.event?.start.slice(11).length,
          item.event && item.event.duration_minutes <= 30,
        ]);
      };
      const samples = new Map(
        events.map((element) => [shape(element), element]),
      );
      const chunks = [];
      for (let offset = 0; offset < cells.length; offset += 7) {
        const week = cells.slice(offset, offset + 7);
        for (const item of items) {
          const days = week.flatMap((cell, index) => {
            const date = cell.querySelector("time").dateTime;
            return item.start <= date && item.end >= date ? [index] : [];
          });
          if (days.length)
            chunks.push({
              item,
              row: offset / 7 + 1,
              column: days[0] + 1,
              span: days.length,
            });
        }
      }
      const probes = [];
      const naturalHeightMismatches = [];
      const expectedShapes = new Set();
      for (const chunk of chunks) {
        const { item, row, column, span } = chunk;
        const key = JSON.stringify([
          String(row),
          String(column),
          `span ${span}`,
          item.kind,
          item.event?.start.slice(11).length,
          item.event && item.event.duration_minutes <= 30,
        ]);
        expectedShapes.add(key);
        const sample = samples.get(key);
        if (!sample) {
          naturalHeightMismatches.push({
            reason: "Missing native sample",
            id: item.item_id,
            row,
            column,
            span,
          });
          continue;
        }
        // Independently reconstruct every source chunk, including those without
        // a main-grid DOM node, to test the reviewed equal-height grouping.
        const clone = sample.cloneNode(true);
        clone.style.gridColumn = `${column} / span ${span}`;
        clone.style.gridRow = String(row);
        clone.style.marginBlockStart = "0px";
        clone.style.visibility = "hidden";
        clone.querySelector("strong").textContent = item.title;
        const time = clone.querySelector(".item-time");
        const duration = time.querySelector(".time-duration");
        time.replaceChildren(
          document.createTextNode(
            item.event
              ? item.event.start.slice(11)
              : item.kind.endsWith("due")
                ? "Termin"
                : "Cały dzień",
          ),
          ...(duration ? [duration] : []),
        );
        if (item.event)
          clone.querySelector(".time-duration").textContent =
            ` · ${item.event.duration_minutes} min`;
        clone.querySelector("small").textContent = item.event
          ? `${item.event.duration_minutes} min`
          : item.kind.endsWith("due")
            ? "Termin"
            : item.start !== item.end
              ? "Plan wielodniowy"
              : "Zaplanowana praca";
        sample.parentElement.append(clone);
        probes.push({ sample, clone, item });
      }
      for (const { sample, clone, item } of probes) {
        const expected = window.calendarReadRect(clone).height;
        const actual = window.calendarReadRect(sample).height;
        // Browser CSS coordinates are quantized to 1/64 px; transformed rects
        // can differ slightly from equivalent border-box measurements.
        if (Math.abs(expected - actual) > 0.02)
          naturalHeightMismatches.push({ id: item.item_id, expected, actual });
      }
      for (const { clone } of probes) clone.remove();
      const misplaced = [];
      const visibleByDay = new Map();
      let visible = 0;
      for (const element of events) {
        const style = getComputedStyle(element);
        const row = Number(style.gridRowStart);
        const column = Number(style.gridColumnStart);
        const item = byId.get(
          element.querySelector("[data-calendar-item]").dataset.calendarItem,
        );
        if (element.dataset.sourceVersion !== item.version)
          throw new Error("Main-grid source version is stale");
        if (style.visibility === "hidden") continue;
        const span = Number(style.gridColumnEnd.split(" ")[1]);
        for (let index = 0; index < span; index++) {
          const day = (row - 1) * 7 + column - 1 + index;
          const entries = visibleByDay.get(day) ?? [];
          entries.push(item.item_id);
          visibleByDay.set(day, entries);
        }
        visible++;
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
      const incorrectHiddenCounts = cells.flatMap((cell, index) => {
        const more = cell.lastElementChild.querySelector('[role="button"]');
        const actual = Number(more?.textContent.match(/\d+/)?.[0] ?? 0);
        const date = cell.querySelector("time").dateTime;
        const expected =
          items.filter((item) => item.start <= date && item.end >= date)
            .length - (visibleByDay.get(index)?.length ?? 0);
        return actual === expected
          ? []
          : [{ date: cell.querySelector("time").dateTime, actual, expected }];
      });
      return {
        cells: cells.length,
        visible,
        hidden: chunks.length - visible,
        rendered: events.length,
        shapes: samples.size,
        expectedShapes: expectedShapes.size,
        visibleByDay: cells.map((cell, index) => ({
          date: cell.querySelector("time").dateTime,
          ids: visibleByDay.get(index) ?? [],
        })),
        misplaced,
        incorrectHiddenCounts,
        naturalHeightMismatches,
        naturalHeightProbes: probes.length,
        height: window.calendarReadRect(root).height,
        counts: { ...window.calendarGeometry },
      };
    }, expected.items);
    checkpoints.push({ ...layout, name });
    assert.ok(layout.hidden > 250);
    assert.deepEqual(layout.misplaced, []);
    assert.deepEqual(layout.incorrectHiddenCounts, []);
    assert.deepEqual(layout.naturalHeightMismatches, []);
    assert.equal(layout.shapes, layout.expectedShapes);
    assert.ok(layout.rendered <= layout.visible + layout.shapes);
    await verifyDays(layout);
    Object.assign(checkpoints.at(-1), layout);
    return layout;
  }
  async function verifyDays(layout) {
    const covered = new Set();
    let popups = 0;
    for (const [index, day] of layout.visibleByDay.entries()) {
      const entries = expected.items.filter(
        (item) => item.start <= day.date && item.end >= day.date,
      );
      const more = surface
        .locator(".ec-body .ec-grid > .ec-day")
        .nth(index)
        .getByRole("button", { name: /^\+\d+ więcej$/ });
      if (await more.count()) {
        await more.focus();
        await more.press("Enter");
        const popup = surface.getByRole("dialog");
        await expect(popup).toBeVisible();
        let actual;
        await expect
          .poll(async () => {
            actual = await popup
              .locator("[data-calendar-item]")
              .evaluateAll((elements) =>
                elements.map((element) => ({
                  id: element.dataset.calendarItem,
                  title: element.querySelector("strong").textContent,
                  version: element.closest("article").dataset.sourceVersion,
                })),
              );
            return actual.map((item) => item.id).sort();
          })
          .toEqual(entries.map((item) => item.item_id).sort());
        const byId = new Map(entries.map((item) => [item.item_id, item]));
        for (const item of actual) {
          assert.equal(item.title, byId.get(item.id).title);
          assert.equal(item.version, byId.get(item.id).version);
          covered.add(item.id);
        }
        popups++;
        await popup.getByRole("button", { name: /zamknij/i }).click();
        await expect(popup).toHaveCount(0);
      } else {
        assert.deepEqual(
          day.ids.toSorted(),
          entries.map((item) => item.item_id).sort(),
        );
        for (const id of day.ids) covered.add(id);
      }
    }
    assert.deepEqual(
      [...covered].sort(),
      expected.items.map((item) => item.item_id).sort(),
    );
    layout.popupDays = popups;
    layout.coveredItems = covered.size;
  }
  try {
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "calendar", project: project.id, date: "2026-09-08", layout: "month" })}`,
    );
    await expect(surface.locator("[data-calendar-item]")).not.toHaveCount(0);
    const initial = await checkpoint("desktop");
    assert.ok(initial.naturalHeightProbes > 250, JSON.stringify(initial));
    assert.ok(initial.visible > 0);
    // These bounds count actual browser geometry calls, not elapsed time. The
    // previous per-event/per-spanned-day reads exceed these limits on this fixture.
    assert.ok(initial.counts.cell < initial.cells * 8, JSON.stringify(initial));
    assert.ok(
      initial.counts.footer < initial.cells * 8,
      JSON.stringify(initial),
    );
    assert.equal(initial.counts.timeFormats, 0);
    await page.evaluate(() => {
      for (const key of Object.keys(window.calendarGeometry))
        window.calendarGeometry[key] = 0;
    });
    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/views/calendar" &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: "Odśwież", exact: true }).click();
    await (await refreshed).finished();
    const unchanged = await checkpoint("unchanged-refresh");
    assert.equal(unchanged.counts.header, 0, JSON.stringify(unchanged));
    assert.equal(unchanged.counts.cell, 0, JSON.stringify(unchanged));
    assert.equal(unchanged.counts.footer, 0, JSON.stringify(unchanged));

    const changedPath = `/api/v1/projects/${project.id}/cards/${config.cards[0].id}`;
    const observed = cli("get", changedPath);
    const payload = join(config.temp, "calendar-refresh-command.json");
    await writeFile(
      payload,
      JSON.stringify({ set: { title: "Calendar refresh source update" } }),
    );
    const committed = cli(
      "command",
      "PATCH",
      changedPath,
      "--json-file",
      payload,
      "--if-version",
      observed.version,
    );
    assert.equal(committed.status, "committed");
    const source = cli("get", changedPath);
    await expect
      .poll(
        () => {
          expected = cli("get", path);
          return expected.items.some(
            (item) =>
              item.resource_id === config.cards[0].id &&
              item.version === source.version,
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);
    const latest = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/views/calendar" &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: "Odśwież", exact: true }).click();
    await (await latest).finished();
    const changed = expected.items.find(
      (item) => item.resource_id === config.cards[0].id,
    );
    assert.equal(changed.title, "Calendar refresh source update");
    assert.equal(changed.version, source.version);
    // The changed item may be below the visible stack. Every day's popup is
    // checked against the current API title and version in this checkpoint.
    await checkpoint("changed-refresh");
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
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--text-label", "48px");
      document.documentElement.style.setProperty("--text-xs", "42px");
    });
    await page.evaluate(
      () =>
        new Promise((done) => {
          let remaining = 4;
          const frame = () =>
            --remaining ? requestAnimationFrame(frame) : done();
          requestAnimationFrame(frame);
        }),
    );
    await checkpoint("large-text-desktop");
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await page
        .getByRole("button", { name: "Siatka miesiąca", exact: true })
        .click();
      await checkpoint(`large-text-${viewport.width}`);
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--text-label");
      document.documentElement.style.removeProperty("--text-xs");
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await checkpoint("restored-text-desktop");
    const more = surface
      .getByRole("button", { name: /^\+\d+ więcej$/ })
      .first();
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
      name: "Edytuj element",
      exact: true,
    });
    await expect(editor.getByLabel("Tytuł", { exact: true })).toHaveValue(
      target.title,
    );
    await editor
      .getByRole("button", { name: "Zamknij edytor", exact: true })
      .click();
    await expect(editor).toBeHidden();
    if (await popup.count())
      await popup.getByRole("button", { name: /zamknij/i }).click();
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
