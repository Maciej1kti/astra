/** Open the shared calendar date disclosure through its public control. */
import { expect } from "@playwright/test";

export async function calendarDate(page) {
  const input = page.getByLabel("Przejdź do daty", { exact: true });
  const toggle = page.getByRole("button", {
    name: "Wybierz datę kalendarza",
    exact: true,
  });
  // An inert outgoing panel can remain painted briefly after logical dismissal.
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return input;
}

export async function setCalendarDate(page, value) {
  await (await calendarDate(page)).fill(value);
  await page.getByRole("button", { name: "Gotowe", exact: true }).click();
}

export async function expectCalendarDate(page, value) {
  await expect(await calendarDate(page)).toHaveValue(value);
  await page.getByRole("button", { name: "Gotowe", exact: true }).click();
}

const layoutNames = {
  day: "Dzień",
  week: "Tydzień",
  month: "Miesiąc",
  agenda: "Agenda",
};

/** One segment of the Calendar layout control, by its protocol name. */
export const calendarLayout = (page, layout) =>
  page
    .getByRole("group", { name: "Układ kalendarza", exact: true })
    .getByRole("button", { name: layoutNames[layout], exact: true });

export async function setCalendarLayout(page, layout) {
  await calendarLayout(page, layout).click();
}

export async function expectCalendarLayout(page, layout) {
  await expect(calendarLayout(page, layout)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}
