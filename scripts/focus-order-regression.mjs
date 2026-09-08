import { expect } from "@playwright/test";

/** Run against an open Arrange focus dialog with at least two pinned cards. */
export async function checkFocusOrderKeyboard(dialog) {
  const rows = dialog.locator("[data-focus-card]");
  await expect(rows.nth(1)).toBeVisible();
  const original = await rows.evaluateAll((items) =>
    items.map((item) => item.dataset.focusCard),
  );
  const moving = rows.nth(1);
  const id = await moving.getAttribute("data-focus-card");
  await moving.locator('[data-direction="-1"]').focus();
  await moving.locator('[data-direction="-1"]').press("Alt+ArrowUp");
  await expect(rows.first()).toHaveAttribute("data-focus-card", id);
  const movedRow = dialog.locator(`[data-focus-card="${id}"]`);
  await expect(movedRow.locator('[data-direction="1"]')).toBeFocused();
  await movedRow.locator('[data-direction="1"]').press("Alt+ArrowDown");
  await expect
    .poll(() =>
      rows.evaluateAll((items) => items.map((item) => item.dataset.focusCard)),
    )
    .toEqual(original);
  await expect(
    dialog.getByRole("button", { name: "Save focus order", exact: true }),
  ).toBeDisabled();
}
