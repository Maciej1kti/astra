/** Full month-popup content, native pointer gestures and current source opening. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, newContext, evidence, browser }) => {
    const project = config.projects[0];
    const folder = join(project.folder, ".project/cards");
    const template = JSON.parse(
      await readFile(join(folder, `${config.cards[0].id}.json`), "utf8"),
    );
    const ids = [];
    const title =
      "AAAA popup plan with a long wrapping title — Zażółć gęślą jaźń 🧪";
    for (let index = 0; index < 30; index++) {
      const card = structuredClone(template);
      const id = randomUUID();
      ids.push(id);
      Object.assign(card.metadata, {
        id,
        title:
          index === 0
            ? title
            : `Popup fixture ${String(index).padStart(2, "0")}`,
        status: "planned",
        schedule: {
          start: "2026-09-07",
          end: index === 0 ? "2026-09-09" : "2026-09-14",
        },
      });
      // External writes are confined to this suite's disposable source fixture.
      await writeFile(join(folder, `${id}.json`), JSON.stringify(card));
    }
    const calendarPath = `/api/v1/views/calendar?project_id=${project.id}&from=2026-08-31&to=2026-10-04&limit=1000`;
    const sourcePath = `/api/v1/projects/${project.id}/cards/${ids[0]}`;
    await expect
      .poll(
        () =>
          cli("get", calendarPath).items.filter((item) =>
            ids.includes(item.resource_id),
          ).length,
        { timeout: 30000 },
      )
      .toBe(ids.length);
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    const errorStacks = [];
    const checkpoints = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      errorStacks.push(error.stack);
    });
    const surface = page.locator(".calendar-surface");
    const popup = surface.locator(".ec-popup[open]");
    const cell = (date) =>
      surface
        .locator(".ec-body .ec-grid > .ec-day")
        .filter({ has: page.locator(`time[datetime="${date}"]`) });
    async function settled() {
      await expect(surface).toHaveAttribute("aria-busy", "false");
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
    }
    async function open(date) {
      if (await popup.count())
        await popup.getByRole("button", { name: /close/i }).click();
      await settled();
      const items = cli("get", calendarPath).items.filter(
        (item) => item.start <= date && item.end >= date,
      );
      const more = cell(date).getByRole("button", { name: /^\+\d+ more$/ });
      await more.focus();
      await more.press("Enter");
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
        .toEqual(items.map((item) => item.item_id).sort());
      for (const entry of actual) {
        const item = items.find((item) => item.item_id === entry.id);
        assert.equal(entry.title, item.title);
        assert.equal(entry.version, item.version);
      }
      const target = popup.getByRole("button", {
        name: `Planned work: ${title}`,
        exact: true,
      });
      await expect(target).toHaveAttribute(
        "data-source-version",
        cli("get", sourcePath).version,
      );
      await target.evaluate((element) => {
        // Scroll this popup's list while keeping the calendar destinations visible.
        // WebKit's protocol scroll can move the entire document under the topbar.
        window.scrollTo(0, 0);
        const list = element.closest(".ec-events");
        const row = element.getBoundingClientRect();
        const area = list.getBoundingClientRect();
        list.scrollTop += row.top - area.top - (area.height - row.height) / 2;
      });
      await settled();
      const popupGeometry = await popup.evaluate((element) => {
        const grid = element
          .closest(".calendar-surface")
          .querySelector(".ec-body .ec-grid");
        return {
          popup: element.getBoundingClientRect().toJSON(),
          grid: grid.getBoundingClientRect().toJSON(),
        };
      });
      checkpoints.push({
        date,
        viewport: page.viewportSize(),
        entries: actual.length,
        popupGeometry: await popup.evaluate((element) => {
          const list = element.querySelector(".ec-events");
          const style = getComputedStyle(list);
          const popupStyle = getComputedStyle(element);
          return {
            popup: element.getBoundingClientRect().toJSON(),
            style: element.getAttribute("style"),
            list: list.getBoundingClientRect().toJSON(),
            scrollTop: list.scrollTop,
            scrollHeight: list.scrollHeight,
            clientHeight: list.clientHeight,
            overflow: style.overflowY,
            minHeight: style.minHeight,
            flexShrink: style.flexShrink,
            popupMargins: [popupStyle.marginTop, popupStyle.marginBottom],
            alignment: popupStyle.alignSelf,
            parent: element.parentElement.getBoundingClientRect().toJSON(),
            parentRows: getComputedStyle(element.parentElement)
              .gridTemplateRows,
          };
        }),
      });
      assert(
        popupGeometry.popup.top >= popupGeometry.grid.top - 1 &&
          popupGeometry.popup.bottom <= popupGeometry.grid.bottom + 1,
        "The popup must stay inside its currently measured calendar grid",
      );
      return target;
    }
    async function gesture(mode, from, to, cancel = false) {
      const target = await open(from);
      await expect(target).toHaveClass(/ec-draggable/);
      const handle =
        mode === "move"
          ? target
          : target.locator(
              mode === "start"
                ? ".ec-resizer.ec-start"
                : ".ec-resizer:not(.ec-start)",
            );
      await expect
        .poll(
          () =>
            handle.evaluate((element) => {
              const box = element.getBoundingClientRect();
              const hit = document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              );
              return hit === element || element.contains(hit);
            }),
          {
            message:
              "The actual native handle must receive pointer input after popup scrolling",
          },
        )
        .toBe(true);
      const source = await handle.boundingBox();
      const destination = await cell(to).boundingBox();
      assert(
        source && destination,
        "Native popup handles and destination cells must be rendered",
      );
      const points = await page.evaluate(
        ({ source, destination }) => {
          const from = {
            x: source.x + source.width / 2,
            y: source.y + source.height / 2,
          };
          const to = {
            x: destination.x + destination.width / 2,
            y: destination.y + destination.height / 2,
          };
          const hit = (point) =>
            document
              .elementFromPoint(point.x, point.y)
              ?.outerHTML.slice(0, 500);
          return {
            from,
            to,
            viewport: { width: innerWidth, height: innerHeight },
            fromHit: hit(from),
            toHit: hit(to),
            fromCalendar: !!document
              .elementFromPoint(from.x, from.y)
              ?.closest(".ec-popup"),
            toCalendar: !!document
              .elementFromPoint(to.x, to.y)
              ?.closest(".calendar-surface"),
          };
        },
        { source, destination },
      );
      checkpoints.at(-1).gesture = {
        mode,
        cancel,
        source,
        destination,
        points,
      };
      for (const point of [points.from, points.to])
        assert(
          point.x >= 0 &&
            point.y >= 0 &&
            point.x < points.viewport.width &&
            point.y < points.viewport.height,
          "Native gesture points must be inside the actual browser viewport",
        );
      assert(
        points.fromCalendar && points.toCalendar,
        "Pointer input must hit the popup and calendar, rather than the sticky header",
      );
      await page.mouse.move(
        source.x + source.width / 2,
        source.y + source.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        destination.x + destination.width / 2,
        destination.y + destination.height / 2,
        { steps: 12 },
      );
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    async function save(start, end) {
      await expect(
        page.getByRole("dialog", { name: "Change planned dates" }),
      ).toHaveCount(0);
      await expect
        .poll(() => cli("get", sourcePath).metadata.schedule)
        .toEqual({ start, end });

      await expect
        .poll(
          () =>
            cli("get", calendarPath).items.find(
              (item) => item.resource_id === ids[0],
            )?.version,
        )
        .toBe(cli("get", sourcePath).version);
    }
    try {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "calendar", project: project.id, date: "2026-09-07", layout: "month" })}`,
      );
      const baseline = cli("get", sourcePath);
      await gesture("move", "2026-09-07", "2026-09-10", true);
      await settled();
      assert.equal(cli("get", sourcePath).version, baseline.version);
      await expect(
        page.getByLabel("Planned start", { exact: true }),
      ).toHaveCount(0);
      const attempts = [];
      await page.route(`**${sourcePath}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        attempts.push({
          headers: route.request().headers(),
          payload: route.request().postDataJSON(),
        });
        if (attempts.length === 1) {
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "SERVER_BUSY",
                message: "Synthetic lost acknowledgement",
              },
            }),
          });
        }
        return route.continue();
      });
      await gesture("move", "2026-09-07", "2026-09-10");
      const recovery = page.getByRole("dialog", {
        name: "Change planned dates",
      });
      await expect(recovery).toBeVisible();
      await expect
        .poll(() => cli("get", sourcePath).metadata.schedule)
        .toEqual({ start: "2026-09-10", end: "2026-09-12" });
      await recovery
        .getByRole("button", { name: "Retry same command", exact: true })
        .click();
      await expect(recovery).toHaveCount(0);
      assert.equal(attempts.length, 2);
      for (const header of ["x-request-id", "x-command-epoch", "if-match"])
        assert.equal(attempts[0].headers[header], attempts[1].headers[header]);
      assert.deepEqual(attempts[0].payload, attempts[1].payload);
      await page.unroute(`**${sourcePath}`);
      await save("2026-09-10", "2026-09-12");
      await gesture("end", "2026-09-12", "2026-09-14");
      await save("2026-09-10", "2026-09-14");
      await gesture("start", "2026-09-10", "2026-09-07");
      await save("2026-09-07", "2026-09-14");
      const conflictBaseline = cli("get", sourcePath);
      await page.route(
        `**${sourcePath}`,
        async (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          const file = join(runtime, "calendar-competing-command.json");
          await writeFile(
            file,
            JSON.stringify({
              set: {
                priority:
                  conflictBaseline.metadata.priority === "high"
                    ? "normal"
                    : "high",
              },
            }),
          );
          cli(
            "command",
            "PATCH",
            sourcePath,
            "--json-file",
            file,
            "--if-version",
            conflictBaseline.version,
          );
          return route.continue();
        },
        { times: 1 },
      );
      await gesture("move", "2026-09-07", "2026-09-10");
      await expect(recovery).toBeVisible();
      await expect(recovery.getByText(/Current saved schedule:/)).toBeVisible();
      assert.deepEqual(
        cli("get", sourcePath).metadata.schedule,
        conflictBaseline.metadata.schedule,
      );
      await expect(
        recovery.getByLabel("Planned start", { exact: true }),
      ).toHaveValue("2026-09-10");
      await recovery
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await page.unroute(`**${sourcePath}`);
      for (const width of [1440, 390, 320]) {
        if (await popup.count())
          await popup.getByRole("button", { name: /close/i }).click();
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        if (width < 768)
          await page
            .getByRole("button", { name: "Month grid", exact: true })
            .click();
        const target = await open("2026-09-07");
        const geometry = await popup.evaluate((element) => {
          const popup = element.getBoundingClientRect();
          const events = [...element.querySelectorAll(".ec-event")].map(
            (row) => {
              const box = row.getBoundingClientRect();
              const title = row.querySelector("strong").getBoundingClientRect();
              return {
                height: box.height,
                titleHeight: title.height,
                width: box.width,
              };
            },
          );
          return {
            width: popup.width,
            left: popup.left,
            right: popup.right,
            documentWidth: document.documentElement.scrollWidth,
            events,
          };
        });
        assert(
          geometry.width > 0 &&
            geometry.right <= width + 1 &&
            geometry.left >= -1,
        );
        assert(geometry.documentWidth <= width);
        assert(
          geometry.events.every(
            (row) => row.height >= row.titleHeight && row.height > 0,
          ),
        );
        if (browser.browserType().name() === "chromium")
          await page.screenshot({
            path: join(evidence, `popup-${width}.png`),
            fullPage: false,
          });
        const freshTarget = await open("2026-09-07");
        const sourceRead = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === sourcePath &&
            response.status() === 200,
        );
        await freshTarget.focus();
        await freshTarget.press(width === 390 ? " " : "Enter");
        const source = await (await sourceRead).json();
        assert.equal(source.version, cli("get", sourcePath).version);
        await expect(
          page
            .getByRole("dialog", { name: "Edit resource", exact: true })
            .getByLabel("Title", { exact: true }),
        ).toHaveValue(title);
        await page
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", { name: "Edit resource", exact: true }),
        ).toBeHidden();
        checkpoints.at(-1).geometry = geometry;
      }
      assert.deepEqual(errors, []);
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checkpoints, errors, errorStacks }, null, 2) + "\n",
      );
      await context.close();
    }
  },
);
