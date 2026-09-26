/** Header feedback remains visible while a long card is scrolled. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const file = join(runtime, "header-card.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "Header stays visible",
        body: "Long description paragraph.\n\n".repeat(100),
        labels: ["Existing"],
      }),
    );
    const card = cli("command", "POST", base, "--json-file", file).result
      .resource;
    const path = `${base}/${card.metadata.id}`;
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const header = dialog.locator(".dialog-header");
    const messages = header.locator(".dialog-header-messages");
    const body = dialog.locator(".dialog-body");
    const comment = dialog.getByLabel("Write a comment", { exact: true });
    const title = header.getByLabel("Title", { exact: true });
    const open = async () => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id, type: "card", resource: card.metadata.id })}`,
      );
      await expect(title).toBeVisible();
    };
    const visibleInside = async (locator) => {
      assert.ok(
        await locator.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const outer = el.closest(".dialog-header").getBoundingClientRect();
          return (
            rect.top >= outer.top &&
            rect.bottom <= outer.bottom + 1 &&
            rect.top >= 0 &&
            rect.bottom <= window.innerHeight
          );
        }),
        "Feedback remains inside the visible header",
      );
    };
    try {
      await open();
      for (const size of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 320, height: 844 },
        { width: 740, height: 320 },
      ]) {
        await page.setViewportSize(size);
        await comment.scrollIntoViewIfNeeded();
        await expect
          .poll(() => body.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(500);
        const bounds = await header.evaluate((el) => {
          const rect = (selector) => {
            const r = el.querySelector(selector).getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
          };
          return {
            repo: rect(".dialog-heading"),
            actions: rect(".dialog-header-actions"),
            title: rect("textarea"),
            toolbar: rect(".card-header-toolbar"),
            save: rect(".save-indicator"),
            overflow: el.scrollWidth > el.clientWidth + 1,
          };
        });
        assert.ok(bounds.repo.right <= bounds.actions.x);
        assert.ok(bounds.title.y >= bounds.actions.bottom);
        assert.ok(bounds.toolbar.y >= bounds.title.bottom);
        assert.ok(bounds.save.x > bounds.toolbar.x);
        assert.equal(bounds.overflow, false);
        await expect(header.getByTestId("autosave-status")).toHaveClass(
          /saved/,
        );
        await expect(messages).toBeHidden();
        await header.getByRole("button", { name: /^Status:/ }).click();
        const done = header.getByRole("button", { name: "Done", exact: true });
        await done.scrollIntoViewIfNeeded();
        await done.click();
        await expect(
          header.getByRole("button", { name: "Status: Done", exact: true }),
        ).toBeVisible();
        await expect(header.getByTestId("autosave-status")).toHaveText("Saved");
        await page.screenshot({
          path: join(evidence, `header-${size.width}x${size.height}.png`),
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await comment.fill("Visible confirmation from the bottom of a long card");
      await dialog
        .getByRole("button", { name: "Add comment", exact: true })
        .click();
      const success = messages.getByText("Comment added.", { exact: true });
      await expect(success).toBeVisible();
      await visibleInside(success);
      assert.ok(await body.evaluate((el) => el.scrollTop > 500));
      // Client-side field errors are also routed to row four.
      const tags = dialog.getByRole("region", {
        name: "Card tags",
        exact: true,
      });
      const tagInput = tags.getByRole("combobox");
      await tagInput.fill("Existing");
      await tagInput.press("Enter");
      await expect(messages.getByRole("alert")).toContainText(/already/i);
      await visibleInside(messages.getByRole("alert"));
      await tagInput.fill("");
      // Autosave errors and recovery controls stay in the header after response loss.
      const matcher = `${config.origin}${path}`;
      await page.route(matcher, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        await route.fetch();
        await route.abort("failed");
      });
      await title.fill("Lost response header draft");
      await comment.scrollIntoViewIfNeeded();
      await expect(
        messages.getByRole("button", { name: "Check status", exact: true }),
      ).toBeVisible();
      await expect(messages.getByRole("alert")).toBeVisible();
      await visibleInside(messages.getByRole("alert"));
      await expect(
        messages.getByText("Comment added.", { exact: true }),
      ).toHaveCount(0);
      await expect(messages.locator(":scope > :first-child")).toHaveAttribute(
        "role",
        "alert",
      );
      await page.screenshot({ path: join(evidence, "header-error-390.png") });
      await page.unroute(matcher);
      await messages
        .getByRole("button", { name: "Check status", exact: true })
        .click();
      await expect(header.getByTestId("autosave-status")).toHaveText("Saved");
      await header
        .getByRole("button", { name: "Card actions", exact: true })
        .click();
      await header
        .getByRole("button", { name: "Delete card", exact: true })
        .click();
      await expect(
        messages.getByRole("button", {
          name: "Permanently delete card",
          exact: true,
        }),
      ).toBeVisible();
      await messages
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await comment.fill("Keep this draft");
      await header
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        messages.getByRole("button", { name: "Discard draft", exact: true }),
      ).toBeVisible();
      await messages
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(comment).toHaveValue("Keep this draft");
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            checks: [
              "three ordered rows",
              "conditional feedback row",
              "colored save indicator",
              "long body scrolling",
              "portrait and landscape",
              "scrollable status menu",
              "comment confirmation",
              "field errors",
              "lost response and recovery",
              "deletion and close prompts",
            ],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await page.screenshot({ path: join(evidence, "failure.png") });
      throw error;
    } finally {
      await context.close();
    }
  },
);
