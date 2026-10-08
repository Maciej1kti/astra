/** Shared Timeline steps. Geometry is read from the rendered axis, never assumed. */
import assert from "node:assert/strict";

const pattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The button that opens a planned card; its name ends with the shown dates. */
export const timelineCard = (page, title) =>
  page.getByRole("button", {
    name: new RegExp(`^Karta: ${pattern(title)}, `),
  });

/** The same button by card id, for titles that change or repeat. */
export const timelineCardById = (page, id) =>
  page.locator(`.timeline-bar[data-card-id="${id}"] .bar-body`);

/** The whole bar of a planned card, which carries the move and resize gestures. */
export const timelineBar = (page, title) =>
  page.locator(".timeline-bar").filter({ has: timelineCard(page, title) });

export const timelineEdge = (page, title, edge) =>
  page.getByRole("button", {
    name: `${edge === "start" ? "Zmień początek" : "Zmień koniec"}: ${title}`,
    exact: true,
  });

/** Pixels one day takes at the current scale. */
export const timelineDay = (page) =>
  page
    .locator(".astra-gantt")
    .evaluate((chart) =>
      parseFloat(getComputedStyle(chart).getPropertyValue("--timeline-unit")),
    );

/** Jumps through the toolbar's date field, as a person choosing a month would. */
export async function showTimelineDate(page, date) {
  await page
    .getByRole("button", { name: "Wybierz datę na osi czasu", exact: true })
    .click();
  await page.getByLabel("Przejdź do daty", { exact: true }).fill(date);
  await page.getByRole("button", { name: "Gotowe", exact: true }).click();
}

/** Brings a bar clear of the fixed title column and of the view's edges. */
export async function revealTimelineBar(bar) {
  await bar.evaluate((element) =>
    element.scrollIntoView({ block: "nearest", inline: "nearest" }),
  );
}

/**
 * Presses a bar (or one of its ends) and travels a number of days. Without
 * `release` the pointer stays down so a scenario can interrupt the gesture.
 */
export async function dragTimelineBar(
  page,
  bar,
  days,
  { edge, release = true } = {},
) {
  await revealTimelineBar(bar);
  const box = await bar.boundingBox();
  assert(box, "The timeline bar must be rendered");
  const unit = await timelineDay(page);
  const x =
    edge === "start"
      ? box.x + 3
      : edge === "end"
        ? box.x + box.width - 3
        : box.x + Math.min(box.width / 2, unit);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + days * unit, y, { steps: 6 });
  if (release) await page.mouse.up();
}
