/** Compact schedules and browser layout preferences on a normally paired release host. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const context = await newContext({
      timezoneId: "Pacific/Honolulu",
      hasTouch: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.layoutCsp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.layoutCsp.push(e.effectiveDirective),
      );
    });
    await page.clock.setFixedTime(new Date("2026-09-30T10:00Z"));
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}/cards`;
    const file = join(runtime, "layout-card.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "A calmer card",
        body: "A useful description.",
        status: "active",
        schedule: { start: "2026-09-28", end: "2026-10-02" },
      }),
    );
    const card = cli("command", "POST", base, "--json-file", file).result
      .resource;
    const path = `${base}/${card.metadata.id}`;
    const url = `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card.metadata.id })}`;
    const dialog = page.getByRole("dialog", {
      name: /^(Edit|Create) resource$/,
    });
    const toggle = dialog.getByRole("button", {
      name: "Edit schedule",
      exact: true,
    });
    const customize = dialog.getByRole("button", {
      name: "Customize card layout",
      exact: true,
    });
    const panel = dialog.locator(".card-layout-menu .action-menu-panel");
    const sections = (group) =>
      dialog
        .locator(`.card-${group} > [data-card-section]`)
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardSection));
    const closePanel = () =>
      panel.getByRole("button", { name: "Done arranging sections" }).click();
    try {
      await page.goto(url);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toContainText("2 days left");
      await expect(toggle).toContainText("Day 3");
      await expect(dialog.getByLabel("Start", { exact: true })).toBeHidden();
      assert.ok((await toggle.boundingBox()).height >= 44);
      await toggle.click();
      await expect(dialog.getByLabel("Start", { exact: true })).toBeVisible();
      await dialog.getByLabel("End", { exact: true }).fill("");
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await dialog.getByLabel("End", { exact: true }).fill("2026-10-02");
      await expect(toggle).toHaveAttribute("aria-disabled", "false");
      await expect(dialog.getByTestId("autosave-status")).toHaveText("Saved");
      await toggle.click();
      await expect(dialog.getByLabel("Start", { exact: true })).toBeHidden();
      assert.equal(
        cli("get", path).version,
        card.version,
        "Disclosure and reverted edits do not write the card",
      );

      const comment = dialog.getByLabel("Write a comment", { exact: true });
      await comment.fill("An unfinished comment");
      await dialog
        .getByLabel("New item", { exact: true })
        .fill("An unfinished checklist item");
      await dialog
        .getByRole("button", { name: "Add counter", exact: true })
        .click();
      await dialog
        .getByLabel("Counter name", { exact: true })
        .fill("An unfinished counter");
      await comment.evaluate((el) => (el.dataset.mountedProbe = "retained"));
      await customize.click();
      const moveComments = panel.getByRole("button", {
        name: "Move Comments up",
        exact: true,
      });
      await moveComments.focus();
      await moveComments.press("Enter");
      await expect(moveComments).toBeFocused();
      await moveComments.press("Enter");
      await moveComments.press("Enter");
      await expect(moveComments).toHaveAttribute("aria-disabled", "true");
      await expect
        .poll(() => sections("main"))
        .toEqual(["comments", "description", "checklist", "counters"]);
      await panel
        .getByRole("button", { name: "Move Labels up", exact: true })
        .click();
      await expect
        .poll(() => sections("sidebar"))
        .toEqual(["labels", "schedule"]);
      await expect(comment).toHaveValue("An unfinished comment");
      await expect(comment).toHaveAttribute("data-mounted-probe", "retained");
      await expect(dialog.getByLabel("New item", { exact: true })).toHaveValue(
        "An unfinished checklist item",
      );
      await expect(
        dialog.getByLabel("Counter name", { exact: true }),
      ).toHaveValue("An unfinished counter");
      assert.equal(
        cli("get", path).version,
        card.version,
        "Presentation preferences do not mutate card source",
      );
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(customize).toBeFocused();
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("New item", { exact: true }).fill("");
      await dialog.getByLabel("Write a comment", { exact: true }).fill("");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.reload();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect
        .poll(() => sections("main"))
        .toEqual(["comments", "description", "checklist", "counters"]);
      await expect
        .poll(() => sections("sidebar"))
        .toEqual(["labels", "schedule"]);

      for (const [width, height] of [
        [1440, 1000],
        [1024, 900],
        [768, 1024],
        [390, 844],
        [320, 740],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await customize.tap();
        await expect(panel).toBeVisible();
        const geometry = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            bottom: r.bottom,
            overflow: el.scrollWidth > el.clientWidth + 1,
          };
        });
        assert.ok(
          geometry.left >= 0 &&
            geometry.right <= width &&
            geometry.bottom <= height,
          JSON.stringify({ width, ...geometry }),
        );
        assert.equal(geometry.overflow, false);
        const move = panel.getByRole("button", {
          name: "Move Comments down",
          exact: true,
        });
        const bounds = await move.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44);
        await move.tap();
        await panel
          .getByRole("button", { name: "Move Comments up", exact: true })
          .tap();
        await closePanel();
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        await toggle.tap();
        await expect(dialog.getByLabel("Start", { exact: true })).toBeVisible();
        await toggle.tap();
        await expect(dialog.getByLabel("Start", { exact: true })).toBeHidden();
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 390, height: 844 });
      await customize.click();
      await panel
        .getByRole("button", { name: "Reset layout", exact: true })
        .click();
      await expect
        .poll(() => sections("main"))
        .toEqual(["description", "checklist", "counters", "comments"]);
      assert.equal(
        await dialog
          .locator(".card-body-grid")
          .evaluate(
            (el) =>
              el
                .getAnimations({ subtree: true })
                .filter((a) => a.playState === "running").length,
          ),
        0,
      );
      await closePanel();
      await toggle.click();
      assert.equal(
        await dialog
          .locator(".schedule-disclosure")
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page
        .locator(".heading")
        .getByRole("button", { name: /Add card$/ })
        .click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(dialog.getByLabel("Start", { exact: true })).toBeVisible();
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Creation keeps schedule open");
      await expect(dialog.getByTestId("autosave-status")).toHaveText("Saved");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.layoutCsp), []);
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page.goto(url);
      if (browser.browserType().name() === "chromium") {
        for (const [width, height] of [
          [1440, 1000],
          [768, 1024],
          [390, 844],
          [320, 740],
        ]) {
          await page.setViewportSize({ width, height });
          await customize.click();
          await page.screenshot({
            path: join(evidence, `layout-${width}.png`),
          });
          await closePanel();
        }
      }
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            engine: browser.browserType().name(),
            checks: [
              "relative workspace date",
              "collapsed and invalid schedules",
              "no presentation writes",
              "retained mounted drafts",
              "pointer and keyboard ordering",
              "local preference reload and reset",
              "320–1440px plus landscape",
              "reduced motion",
              "creation stays expanded",
              "strict CSP",
            ],
            errors,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await writeFile(
        join(evidence, "failure.txt"),
        await dialog.ariaSnapshot(),
      );
      throw error;
    } finally {
      await context.close();
    }
  },
);
