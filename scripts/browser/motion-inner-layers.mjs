/** Dialog fields, menu items and disclosure rows enter one by one, not as a block. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function checkInnerLayers({ page, config, settle }) {
  const layers = (selector) =>
    page.evaluate(
      (selector) =>
        window.motionProbe.animations
          .filter(
            (animation) =>
              animation.id.startsWith("astra-layer-") &&
              animation.effect?.target?.isConnected &&
              animation.effect.target.matches(selector),
          )
          .map((animation) => animation.effect.getTiming().delay),
      selector,
    );
  const rising = (delays, message) => {
    assert(delays.length >= 2, `${message}: ${JSON.stringify(delays)}`);
    assert(
      delays.slice(0, 5).every((delay, i) => !i || delay > delays[i - 1]),
      `${message} in turn: ${JSON.stringify(delays)}`,
    );
  };
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    `${config.origin}/?${new URLSearchParams({ view: "list", project: config.projects[0].id })}`,
  );
  await expect(page.locator(".listrow").first()).toBeVisible();
  await settle();

  // A dialog's fields follow the block that holds them.
  await page
    .getByRole("button", {
      name: "Ustawienia przestrzeni roboczej",
      exact: true,
    })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Ustawienia przestrzeni roboczej",
    exact: true,
  });
  await expect(
    settings.getByLabel("Strefa czasowa", { exact: true }),
  ).toBeEnabled();
  await settle();
  const blocks = await layers("dialog[open] .dialog-body > *");
  const fields = await layers("dialog[open] .dialog-body > * > *");
  assert(blocks.length >= 2, "Settings blocks enter as layers");
  assert(fields.length >= 4, `Settings fields enter: ${fields.length}`);
  assert(
    Math.min(...fields) >= Math.min(...blocks) + 100,
    `Fields follow their block: ${JSON.stringify({ blocks, fields })}`,
  );
  assert(Math.max(...fields) <= 560);

  // A disclosure opened later reveals its content softly.
  const disclosure = settings.locator("details").first();
  await disclosure.locator("summary").click();
  assert.equal(
    await disclosure
      .locator(":scope > :not(summary)")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
    "astra-reveal",
  );
  await settle();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // Phone: the header menu and the navigation menu stagger their items.
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", {
      name: "Działania przestrzeni roboczej",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Wyloguj", exact: true }),
  ).toBeVisible();
  await settle();
  rising(
    await layers("header .action-menu-panel > *"),
    "Header menu items enter",
  );
  await page.keyboard.press("Escape");

  const more = page.getByRole("button", {
    name: "Więcej widoków",
    exact: true,
  });
  await more.click();
  const customize = page.locator(".navigation-customization");
  await expect(customize).toBeVisible();
  await settle();
  rising(
    await layers(".navigation-panel > .navigation-menu-link"),
    "Navigation menu links enter",
  );
  assert.deepEqual(
    await layers(".navigation-panel"),
    [],
    "The menu wrapper is not a layer of its own",
  );
  await customize.locator("summary").click();
  await expect(customize.locator(".layout-order > li").first()).toBeVisible();
  await expect
    .poll(async () => (await layers(".layout-order > li")).length)
    .toBeGreaterThan(1);
  await settle();
  rising(await layers(".layout-order > li"), "Customization rows enter");

  // Reduced motion: nothing starts.
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const started = () =>
    page.evaluate(
      () =>
        window.motionProbe.animations.filter((animation) =>
          animation.id.startsWith("astra-layer-"),
        ).length,
    );
  const before = await started();
  await more.click();
  await expect(customize).toBeVisible();
  assert.equal(await started(), before, "Reduced motion starts no menu layer");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return {
    name: "Dialog fields, header and navigation menu items and customization rows enter in turn",
    blocks,
    fields,
  };
}
