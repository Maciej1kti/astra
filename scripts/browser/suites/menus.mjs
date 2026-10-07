/** Shared disclosure placement and focus through the normally paired application. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(async ({ config, evidence, newContext, browser }) => {
  const context = await newContext({ hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  const checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const route = (view, extra = {}) =>
    page.goto(
      `${config.origin}/?${new URLSearchParams({ view, project: config.projects[0].id, date: "2026-09-25", ...extra })}`,
    );
  async function open(trigger) {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const id = await trigger.getAttribute("aria-controls");
    const panel = page.locator(`[id="${id}"]`);
    await expect(panel).toBeVisible();
    return panel;
  }
  async function settledBounds(panel) {
    await panel.evaluate(async (element) => {
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      `Menu must stay in ${viewport.width} × ${viewport.height}: ${JSON.stringify(box)}`,
    );
    return box;
  }
  async function dismiss(trigger, panel) {
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await expect(panel).toBeHidden();
  }
  async function screenshot(name) {
    if (browser.browserType().name() === "chromium")
      await page.screenshot({ path: join(evidence, `${name}.png`) });
  }
  try {
    // A last-row menu must remain usable near the lower edge, above the dock.
    await page.setViewportSize({ width: 390, height: 360 });
    await route("projects");
    const projectActions = page.getByRole("button", {
      name: `Więcej działań dla ${config.projects[2].title}`,
      exact: true,
    });
    await projectActions.scrollIntoViewIfNeeded();
    await projectActions.evaluate((element) => {
      window.scrollBy(
        0,
        element.getBoundingClientRect().bottom - (innerHeight - 28),
      );
    });
    let panel = await open(projectActions);
    await settledBounds(panel);
    const deletion = panel.getByRole("button", {
      name: "Usuń projekt",
      exact: true,
    });
    await expect(deletion).toBeVisible();
    assert.equal(
      await deletion.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          ),
        );
      }),
      true,
      "Lower-edge project action must receive input above the workspace dock",
    );
    await expect(projectActions).toBeFocused();
    await page.keyboard.press(
      browser.browserType().name() === "webkit" ? "Alt+Tab" : "Tab",
    );
    await expect(panel.getByRole("button").first()).toBeFocused();
    await screenshot("project-menu-short");
    await dismiss(projectActions, panel);
    checks.push(
      "lower-edge project menus flip, receive input and preserve Tab/Escape focus",
    );
    panel = await open(projectActions);
    await panel
      .getByRole("button", { name: "Usuń projekt", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Usuń projekt",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("button", {
        name: "Trwale usuń projekt",
        exact: true,
      }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(projectActions).toBeFocused();
    checks.push(
      "opening and dismissing a modal from a menu restores the initiating trigger",
    );

    // The date field disclosure shares alignment and closing with action menus.
    await page.setViewportSize({ width: 1440, height: 900 });
    await route("calendar");
    await expect(page.locator(".ec")).toBeVisible();
    const date = page.getByRole("button", {
      name: "Wybierz datę kalendarza",
      exact: true,
    });
    panel = await open(date);
    let bounds = await settledBounds(panel);
    let anchor = await date.boundingBox();
    assert.ok(
      Math.abs(bounds.x - anchor.x) < 2,
      "Date disclosure aligns with the start of its trigger",
    );
    await page.keyboard.press("Tab");
    await expect(
      panel.getByLabel("Przejdź do daty", { exact: true }),
    ).toBeFocused();
    await panel.getByRole("button", { name: "Gotowe", exact: true }).click();
    await expect(date).toBeFocused();
    await expect(date).toHaveAttribute("aria-expanded", "false");
    checks.push(
      "calendar date disclosure retains start alignment, native field focus and Done focus restoration",
    );

    // An outgoing native popup must not select the desktop's horizontal axis.
    await page.setViewportSize({ width: 740, height: 320 });
    await route("updates");
    const sidebar = page.locator("aside");
    let selectedView = sidebar.getByRole("button", {
      name: "Aktualizacje",
      exact: true,
    });
    await expect(selectedView).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 390, height: 844 });
    const rotatedMore = sidebar.getByRole("button", {
      name: "Więcej widoków",
      exact: true,
    });
    panel = await open(rotatedMore);
    await expect(selectedView).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(rotatedMore).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 740, height: 320 });
    await expect(selectedView).toHaveAttribute("aria-current", "page");
    await expect(selectedView).toBeInViewport({ ratio: 1 });
    checks.push(
      "portrait popup dismissal and immediate desktop rotation reveal the selected sidebar view",
    );

    // Content growth, rotation and scroll all update the same anchored surface.
    await page.setViewportSize({ width: 390, height: 844 });
    await route("focus");
    const more = page.getByRole("button", {
      name: "Więcej widoków",
      exact: true,
    });
    panel = await open(more);
    await panel
      .locator("summary")
      .filter({ hasText: /^Dostosuj nawigację$/ })
      .click();
    await settledBounds(panel);
    await page.setViewportSize({ width: 640, height: 320 });
    await settledBounds(panel);
    await page.setViewportSize({ width: 390, height: 844 });
    await settledBounds(panel);
    const nav = page.getByRole("navigation", {
      name: "Widoki przestrzeni roboczej",
    });
    for (const button of await panel
      .getByRole("button", { name: /^Pokaż .* na pasku nawigacji$/ })
      .all()) {
      if ((await button.getAttribute("aria-pressed")) === "false")
        await button.click();
    }
    await more.scrollIntoViewIfNeeded();
    bounds = await settledBounds(panel);
    anchor = await more.boundingBox();
    assert.ok(
      Math.abs(
        bounds.x -
          Math.max(
            12,
            Math.min(
              anchor.x + anchor.width - bounds.width,
              390 - bounds.width - 12,
            ),
          ),
      ) < 2,
      "Expanded navigation menu follows its horizontally scrolled trigger",
    );
    await screenshot("navigation-menu-expanded");
    await dismiss(more, panel);
    panel = await open(more);
    await nav.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    checks.push(
      "navigation menu grows, rotates, scrolls with its anchor and closes on an outside control",
    );

    // Native top-layer menus remain reachable within the clipped card editor.
    await page.setViewportSize({ width: 320, height: 390 });
    await route("list", { type: "card", resource: config.cards[0].id });
    const editor = page.getByRole("dialog", {
      name: "Edytuj element",
      exact: true,
    });
    const status = editor.getByRole("button", { name: /^Status: / });
    panel = await open(status);
    await settledBounds(panel);
    await screenshot("card-status-menu-320");
    await panel
      .getByRole("button", { name: "Do sprawdzenia", exact: true })
      .click();
    await expect(status).toHaveAttribute("aria-expanded", "false");
    await expect(status).toBeFocused();
    await expect(editor.getByTestId("autosave-status")).toHaveText("Zapisano");
    const actions = editor.getByRole("button", {
      name: "Działania karty",
      exact: true,
    });
    panel = await open(actions);
    await settledBounds(panel);
    await screenshot("card-actions-menu-320");
    await dismiss(actions, panel);
    await expect(editor).toBeVisible();
    checks.push(
      "status and card action menus remain bounded in a clipped native editor and Escape preserves the editor",
    );

    assert.deepEqual(
      errors.filter(
        (error) =>
          browser.browserType().name() !== "webkit" ||
          !error.includes("ResizeObserver"),
      ),
      [],
    );
    await writeFile(
      join(evidence, "result.json"),
      JSON.stringify(
        { status: "pass", browser: browser.browserType().name(), checks },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify({ menus: "pass", checks: checks.length }));
  } finally {
    await context.close();
  }
});
