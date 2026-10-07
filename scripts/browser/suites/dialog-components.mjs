/** Shared native dialog lifecycle and creation surfaces in the real daemon. */
import { addTrigger } from "../add-menu.mjs";
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

await runBrowserSuite(async ({ config, evidence, browser, newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const checks = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshots = process.env.ASTRA_TEST_BROWSER !== "webkit";
  const snapshot = async (name) => {
    if (screenshots) {
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.allSettled(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished),
        );
      });
      await page.screenshot({
        path: join(evidence, `${name}.png`),
      });
    }
  };
  async function check(name, run) {
    try {
      checks.push({ name, status: "pass", detail: await run() });
    } catch (error) {
      checks.push({ name, status: "fail", error: String(error) });
      await snapshot(`failure-${checks.length}`).catch(() => {});
    }
    console.log(JSON.stringify(checks.at(-1)));
  }
  const nativeDialogs = page.locator("dialog[open]");
  try {
    await page.goto(`${config.origin}/?view=projects`);
    await expect(page.locator("header.topbar")).toBeVisible();

    await check(
      "Deferred settings retains its initiating keyboard focus",
      async () => {
        let release;
        let held = false;
        const loading = new Promise((resolve) => (release = resolve));
        const pattern = /\/Settings-[^/]+\.js(?:\?|$)/;
        await page.route(pattern, async (route) => {
          held = true;
          await loading;
          await route.continue();
        });
        const trigger = page.getByRole("button", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        try {
          await trigger.focus();
          await trigger.press("Enter");
          const dialog = page.getByRole("dialog", {
            name: "Ustawienia przestrzeni roboczej",
            exact: true,
          });
          await expect(
            dialog.getByText("Ładowanie…", { exact: true }),
          ).toBeVisible();
          assert(held, "The deferred module must be held before its handoff");
          release();
          await expect(
            dialog.getByLabel("Strefa czasowa", { exact: true }),
          ).toBeEnabled();
          // Without an agent directory the provider choice has no meaning.
          await expect(
            dialog.getByLabel("Dostawca agenta", { exact: true }),
          ).toHaveCount(0);
          await dialog
            .getByRole("button", { name: "Zamknij ustawienia" })
            .click();
          await expect(nativeDialogs).toHaveCount(0);
          await expect(trigger).toBeFocused();
          return { deferredHandoff: true, triggerRestored: true };
        } finally {
          release();
          await page.unroute(pattern);
        }
      },
    );

    await check(
      "Project registration replacement restores the original trigger",
      async () => {
        await expect(nativeDialogs).toHaveCount(0);
        const trigger = page.getByRole("button", { name: /Dodaj projekt/ });
        await trigger.focus();
        await trigger.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: "Dodaj projekt",
          exact: true,
        });
        const disclosure = dialog
          .locator("summary")
          .filter({ hasText: "Masz już folder" });
        await expect(disclosure).toBeVisible();
        await disclosure.click();
        const browse = dialog.getByRole("button", {
          name: "Dodaj istniejący folder",
        });
        await browse.focus();
        await browse.press("Enter");
        await expect(
          dialog.getByText("Wybierz folder projektu na tym serwerze.", {
            exact: false,
          }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(nativeDialogs).toHaveCount(0);
        await expect(trigger).toBeFocused();
        return { replacement: true, triggerRestored: true };
      },
    );

    await check(
      "Nested tags return focus to Settings before the workspace",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        const trigger = page.getByRole("button", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        await trigger.focus();
        await trigger.press("Enter");
        const settings = page.getByRole("dialog", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        const tagsTrigger = settings.getByRole("button", {
          name: "Zarządzaj tagami",
          exact: true,
        });
        await expect(tagsTrigger).toBeEnabled();
        await tagsTrigger.focus();
        await tagsTrigger.press("Enter");
        const tags = page.getByRole("dialog", {
          name: "Zarządzaj tagami projektu",
          exact: true,
        });
        await expect(tags.getByLabel("Projekt", { exact: true })).toBeEnabled();
        await snapshot("nested-tags-phone");
        await page.keyboard.press("Escape");
        await expect(tags).toHaveCount(0);
        await expect(tagsTrigger).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(nativeDialogs).toHaveCount(0);
        await expect(trigger).toBeFocused();
        return { nestedTriggerRestored: true, workspaceTriggerRestored: true };
      },
    );

    await check(
      "Card project selection shares bounded footer and replacement focus",
      async () => {
        await page.goto(`${config.origin}/?view=focus`);
        // Focus adds a card from the floating "+" menu, operated by keyboard here.
        const trigger = addTrigger(page);
        const openChooser = async () => {
          await trigger.focus();
          await trigger.press("Enter");
          await page
            .getByRole("menuitem", { name: "Karta", exact: true })
            .press("Enter");
        };
        const layouts = [];
        for (const viewport of [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
          { width: 320, height: 568 },
          { width: 740, height: 320 },
        ]) {
          await page.setViewportSize(viewport);
          await openChooser();
          const dialog = page.getByRole("dialog", {
            name: "Wybierz projekt dla karty",
            exact: true,
          });
          await expect(dialog).toBeVisible();
          const footer = dialog.locator(".dialog-footer");
          await expect(
            footer.getByRole("button", { name: "Kontynuuj", exact: true }),
          ).toBeDisabled();
          const metrics = await dialog.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            const footer = node
              .querySelector(".dialog-footer")
              .getBoundingClientRect();
            return {
              rect: rect.toJSON(),
              footer: footer.toJSON(),
              viewport: { width: innerWidth, height: innerHeight },
              documentWidth: document.documentElement.scrollWidth,
            };
          });
          assert(
            metrics.rect.x >= 0 && metrics.rect.right <= viewport.width + 1,
          );
          assert(metrics.footer.bottom <= viewport.height + 1);
          assert(metrics.documentWidth <= viewport.width + 1);
          layouts.push(metrics);
          await snapshot(`project-selection-${viewport.width}`);
          await page.keyboard.press("Escape");
          await expect(nativeDialogs).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
        await openChooser();
        const chooser = page.getByRole("dialog", {
          name: "Wybierz projekt dla karty",
          exact: true,
        });
        await chooser
          .getByLabel("Projekt", { exact: true })
          .selectOption(config.projects[0].id);
        const continueButton = chooser.getByRole("button", {
          name: "Kontynuuj",
          exact: true,
        });
        await continueButton.focus();
        await continueButton.press("Enter");
        const editor = page.getByRole("dialog", {
          name: "Utwórz element",
          exact: true,
        });
        await expect(editor.getByLabel("Tytuł", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(nativeDialogs).toHaveCount(0);
        await expect(trigger).toBeFocused();
        return {
          layouts,
          selectedProject: true,
          replacementTriggerRestored: true,
        };
      },
    );
  } finally {
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify({ checks, errors, browser: browser.version() }, null, 2),
    );
  }
  if (checks.some((entry) => entry.status !== "pass") || errors.length)
    process.exitCode = 1;
  assert.deepEqual(errors, []);
});
