import { expect } from "@playwright/test";

/** Run against an already-open, paired Settings dialog in the browser suite. */
export async function checkSettingsDraftSafety(dialog) {
  const timezone = dialog.getByLabel("Timezone", { exact: true });
  await expect(timezone).toBeEnabled();
  const savedTimezone = await timezone.inputValue();
  await expect(
    dialog.getByRole("button", { name: "Save preferences", exact: true }),
  ).toBeDisabled();
  await timezone.fill(savedTimezone === "UTC" ? "Europe/Warsaw" : "UTC");
  await dialog.getByText("Browser access", { exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Sign out this browser", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Save preferences", exact: true }),
  ).toBeEnabled();
  await timezone.fill(savedTimezone);
  await expect(
    dialog.getByRole("button", { name: "Sign out this browser", exact: true }),
  ).toBeEnabled();
}

/** Call once a settings save is deliberately left with an uncertain outcome. */
export async function checkSettingsPendingFields(dialog) {
  for (const name of ["Timezone", "Week starts", "Default view"])
    await expect(dialog.getByLabel(name, { exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Retry same command", exact: true }),
  ).toBeEnabled();
}
