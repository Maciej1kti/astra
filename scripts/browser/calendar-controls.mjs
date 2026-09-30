/** Open the shared calendar date disclosure through its public control. */
import { expect } from "@playwright/test";

export async function calendarDate(page) {
  const input = page.getByLabel("Go to date", { exact: true });
  if (!(await input.isVisible()))
    await page
      .getByRole("button", { name: "Choose calendar date", exact: true })
      .click();
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
