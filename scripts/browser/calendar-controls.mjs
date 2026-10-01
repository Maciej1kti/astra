/** Open the shared calendar date disclosure through its public control. */
import { expect } from "@playwright/test";

export async function calendarDate(page) {
  const input = page.getByLabel("Go to date", { exact: true });
  const toggle = page.getByRole("button", {
    name: "Choose calendar date",
    exact: true,
  });
  // An inert outgoing panel can remain painted briefly after logical dismissal.
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return input;
}

export async function setCalendarDate(page, value) {
  await (await calendarDate(page)).fill(value);
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

export async function expectCalendarDate(page, value) {
  await expect(await calendarDate(page)).toHaveValue(value);
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
