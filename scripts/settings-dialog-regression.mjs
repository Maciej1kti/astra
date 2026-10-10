import { expect } from "@playwright/test";

/**
 * Settings save by themselves (ADR-078). Run `change`, wait until the save it
 * starts is acknowledged and the header says so. The header also reads
 * "Zapisano" before any change, so the response is what proves this save.
 */
export async function saveSettings(page, dialog, change) {
  const acknowledged = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/workspace/preferences" &&
      response.request().method() === "PATCH" &&
      response.ok(),
  );
  await change();
  await acknowledged;
  await expect(dialog.getByTestId("autosave-status")).toHaveText("Zapisano");
}

/** Settings stay open after a save; closing them reloads the workspace. */
export async function closeSettings(dialog) {
  await dialog
    .getByRole("button", { name: "Zamknij ustawienia", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}

/** Run against an already-open, paired Settings dialog in the browser suite. */
export async function checkSettingsDraftSafety(dialog) {
  const timezone = dialog.getByLabel("Strefa czasowa", { exact: true });
  const status = dialog.getByTestId("autosave-status");
  const logout = dialog.getByRole("button", {
    name: "Wyloguj tę przeglądarkę",
    exact: true,
  });
  await expect(timezone).toBeEnabled();
  await expect(status).toHaveText("Zapisano");
  await expect(
    dialog.getByRole("button", { name: "Zapisz ustawienia", exact: true }),
  ).toHaveCount(0);
  const savedTimezone = await timezone.inputValue();
  // A zone name still being typed cannot be saved, so it is an unsaved draft.
  await timezone.fill("Europe/Wars");
  await dialog.getByText("Dostęp przeglądarek", { exact: true }).click();
  await expect(logout).toBeDisabled();
  await expect(status).toHaveText("Niezapisane");
  await timezone.fill(savedTimezone);
  await expect(logout).toBeEnabled();
  await expect(status).toHaveText("Zapisano");
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
