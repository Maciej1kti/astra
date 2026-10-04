import { expect } from "@playwright/test";

/** Run against an already-open, paired Settings dialog in the browser suite. */
export async function checkSettingsDraftSafety(dialog) {
  const timezone = dialog.getByLabel("Strefa czasowa", { exact: true });
  await expect(timezone).toBeEnabled();
  const savedTimezone = await timezone.inputValue();
  await expect(
    dialog.getByRole("button", { name: "Zapisz ustawienia", exact: true }),
  ).toBeDisabled();
  await timezone.fill(savedTimezone === "UTC" ? "Europe/Warsaw" : "UTC");
  await dialog.getByText("Dostęp przeglądarek", { exact: true }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Wyloguj tę przeglądarkę",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Zapisz ustawienia", exact: true }),
  ).toBeEnabled();
  await timezone.fill(savedTimezone);
  await expect(
    dialog.getByRole("button", {
      name: "Wyloguj tę przeglądarkę",
      exact: true,
    }),
  ).toBeEnabled();
}

/** Call once a settings save is deliberately left with an uncertain outcome. */
export async function checkSettingsPendingFields(dialog) {
  for (const name of ["Strefa czasowa", "Początek tygodnia", "Widok domyślny"])
    await expect(dialog.getByLabel(name, { exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "Ponów to samo polecenie",
      exact: true,
    }),
  ).toBeEnabled();
}
