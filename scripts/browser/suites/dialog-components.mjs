/** Shared native dialog lifecycle and creation surfaces in the real daemon. */
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
          name: "Workspace settings",
          exact: true,
        });
        try {
          await trigger.focus();
          await trigger.press("Enter");
          const dialog = page.getByRole("dialog", {
            name: "Workspace settings",
            exact: true,
          });
          await expect(
            dialog.getByText("Loading…", { exact: true }),
          ).toBeVisible();
          assert(held, "The deferred module must be held before its handoff");
          release();
          await expect(
            dialog.getByLabel("Timezone", { exact: true }),
          ).toBeEnabled();
          await dialog.getByRole("button", { name: "Close settings" }).click();
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
        const trigger = page.getByRole("button", { name: /Add project/ });
        await trigger.focus();
        await trigger.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: "Add project",
          exact: true,
        });
        const disclosure = dialog
          .locator("summary")
          .filter({ hasText: "Remote host" });
        await expect(disclosure).toBeVisible();
        await disclosure.click();
        const browse = dialog.getByRole("button", {
          name: "Browse approved folders",
        });
        await browse.focus();
        await browse.press("Enter");
        await expect(
          dialog.getByText("Choose the project folder on this host.", {
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
          name: "Workspace settings",
          exact: true,
        });
        await trigger.focus();
        await trigger.press("Enter");
        const settings = page.getByRole("dialog", {
          name: "Workspace settings",
          exact: true,
        });
        const tagsTrigger = settings.getByRole("button", {
          name: "Manage tags",
          exact: true,
        });
        await expect(tagsTrigger).toBeEnabled();
        await tagsTrigger.focus();
        await tagsTrigger.press("Enter");
        const tags = page.getByRole("dialog", {
          name: "Manage project tags",
          exact: true,
        });
        await expect(tags.getByLabel("Project", { exact: true })).toBeEnabled();
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
        const trigger = page.getByRole("button", { name: /Add card/ });
        const layouts = [];
        for (const viewport of [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
          { width: 320, height: 568 },
          { width: 740, height: 320 },
        ]) {
          await page.setViewportSize(viewport);
          await trigger.focus();
          await trigger.press("Enter");
          const dialog = page.getByRole("dialog", {
            name: "Choose project for card",
            exact: true,
          });
          await expect(dialog).toBeVisible();
          const footer = dialog.locator(".dialog-footer");
          await expect(
            footer.getByRole("button", { name: "Continue", exact: true }),
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
        await trigger.press("Enter");
        const chooser = page.getByRole("dialog", {
          name: "Choose project for card",
          exact: true,
        });
        await chooser
          .getByLabel("Project", { exact: true })
          .selectOption(config.projects[0].id);
        const continueButton = chooser.getByRole("button", {
          name: "Continue",
          exact: true,
        });
        await continueButton.focus();
        await continueButton.press("Enter");
        const editor = page.getByRole("dialog", {
          name: "Create resource",
          exact: true,
        });
        await expect(editor.getByLabel("Title", { exact: true })).toBeVisible();
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
