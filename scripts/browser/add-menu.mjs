/** The floating "+" opens while pressed and chooses where the pointer is released. */
export const addTrigger = (target) =>
  target.getByRole("button", { name: "Dodaj", exact: true });

/** Press and hold the "+", slide onto a choice and release there, as a finger does. */
export async function holdAndChoose(page, choice) {
  const trigger = addTrigger(page);
  const start = await trigger.boundingBox();
  if (!start) throw new Error("The add button has no box");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // The resting place counts at once, while the choice still slides out to it.
  const slot = page.locator(`[data-slot="${choice}"]`);
  await slot.waitFor({ state: "visible" });
  const box = await slot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
}
