/** Real source pagination when the agenda would otherwise render thousands of rows. */
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
  // These are external writes inside this suite's disposable project, never
  // application writes or edits to the owner's selected project.
  for (let index = 0; index < 205; index++) {
    const card = structuredClone(template);
    const id = randomUUID();
    added.add(id);
    Object.assign(card.metadata, {
      id,
      title: `Agenda page fixture ${index}`,
      status: "planned",
      schedule: { start: "2026-09-07", end: "2026-09-09" },
    });
    await writeFile(join(folder, `${id}.json`), JSON.stringify(card));
  }
  const fullPath = `/api/v1/views/calendar?project_id=${project.id}&from=2026-09-01&to=2026-09-30&limit=1000`;
  await expect
    .poll(
      () => {
        const result = cli("get", fullPath);
        return (
          result.page.freshness === "index_snapshot" &&
          result.items.filter((item) => added.has(item.resource_id)).length ===
            added.size
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const context = await newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  const pages = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const responseFor = (limit, paged = false) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/views/calendar" &&
        url.searchParams.get("limit") === String(limit) &&
        url.searchParams.has("cursor") === paged &&
        response.status() === 200
      );
    });
  async function agendaPage(response) {
    const value = await response.json();
    const expected = value.items.map((item) => item.item_id).sort();
    await expect
      .poll(() =>
        page
          .locator("[data-calendar-item]")
          .evaluateAll((elements) =>
            [...new Set(elements.map((el) => el.dataset.calendarItem))].sort(),
          ),
      )
      .toEqual(expected);
    await expect(page.locator(".calendar-surface")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    pages.push({ count: value.items.length, more: value.page.has_more });
    return value;
  }
  try {
    const firstRead = responseFor(200);
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "calendar", project: project.id, date: "2026-09-08", layout: "month" })}`,
    );
    const first = await agendaPage(await firstRead);
    assert.equal(first.items.length, 200);
    assert.equal(first.page.has_more, true);
    await expect(
      page.getByText("Wyświetlono 200 elementów z datą na tej stronie.", {
        exact: true,
      }),
    ).toBeVisible();

    const nextRead = responseFor(200, true);
    await page
      .getByRole("button", {
        name: "Następna strona elementów z datą",
        exact: true,
      })
      .click();
    const second = await agendaPage(await nextRead);
    assert.equal(second.page.has_more, false);
    const all = [...first.items, ...second.items];
    assert.equal(new Set(all.map((item) => item.item_id)).size, all.length);
    assert.equal(all.filter((item) => added.has(item.resource_id)).length, 205);

    const item = second.items[0];
    const event = page
      .locator(`[data-calendar-item="${item.item_id}"]`)
      .first()
      .locator("xpath=ancestor::article[1]");
    await expect(event).toHaveAttribute("data-source-version", item.version);
    await event.focus();
    await event.press("Enter");
    await expect(
      page.getByRole("dialog").getByLabel("Tytuł", { exact: true }),
    ).toHaveValue(item.title);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    const firstAgain = responseFor(200);
    await page
      .getByRole("button", { name: "Pierwsza strona", exact: true })
      .click();
    assert.deepEqual((await agendaPage(await firstAgain)).items, first.items);

    const gridRead = responseFor(1000);
    await page
      .getByRole("button", { name: "Siatka miesiąca", exact: true })
      .click();
    const grid = await (await gridRead).json();
    assert.equal(grid.items.length, all.length);
    assert.equal(grid.page.has_more, false);
    await expect(
      page.getByRole("button", { name: "Pierwsza strona", exact: true }),
    ).toHaveCount(0);

    const agendaRead = responseFor(200);
    await page
      .getByRole("button", { name: "Agenda miesiąca", exact: true })
      .click();
    assert.deepEqual((await agendaPage(await agendaRead)).items, first.items);
    assert.deepEqual(errors, []);
  } finally {
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify({ pages, errors, addedCards: added.size }, null, 2),
    );
    await context.close();
  }
});
