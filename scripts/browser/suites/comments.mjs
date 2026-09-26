/** Card conversations through normal browser/CLI writes and durable source reads. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const commandFile = join(runtime, "comments-command.json");
    const mutate = async (method, path, payload, version) => {
      await writeFile(commandFile, JSON.stringify(payload));
      return cli(
        "command",
        method,
        path,
        "--json-file",
        commandFile,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    };
    const card = await mutate("POST", base, {
      title: "Card conversation",
      status: "active",
      body: "Description is separate",
      schedule: { start: "2026-09-26", end: "2026-09-27" },
    });
    const id = card.metadata.id;
    const path = `${base}/${id}`;
    const get = () => cli("get", path);
    const comments = () => get().metadata.comments ?? [];
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const section = dialog.getByRole("region", {
      name: "Card comments",
      exact: true,
    });
    const input = section.getByLabel("New comment", { exact: true });
    const add = section.getByRole("button", {
      name: "Add comment",
      exact: true,
    });
    const open = async (view = "list") => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project: project.id, type: "card", resource: id })}`,
      );
      await expect(input).toBeVisible();
    };
    try {
      await open();
      await input.fill(
        "**Human reply**\n\n<script>window.commentExecuted = true</script>",
      );
      await section
        .getByLabel("Comment author", { exact: true })
        .fill("Maciek");
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Conversation preserved");
      await expect(dialog.getByTestId("autosave-status")).toHaveText("Saved");
      assert.equal(comments().length, 0);
      await dialog
        .getByRole("button", { name: "Pin to focus", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Remove from focus", exact: true }),
      ).toBeEnabled();
      await expect(input).toHaveValue(/Human reply/);
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Discard draft", exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await add.click();
      await expect(input).toHaveValue("");
      await expect(section.locator("li")).toHaveCount(1);
      await expect(section.locator("li").first()).toContainText("Human");
      assert.equal(
        await page.evaluate(() => window.commentExecuted),
        undefined,
      );
      assert.equal(get().body, "Description is separate");
      const botFile = join(runtime, "bot-comment.md");
      await writeFile(botFile, "BotCommentNeedle: **verification passed**.");
      cli(
        "--project",
        project.folder,
        "card",
        "comment",
        id,
        "--body-file",
        botFile,
        "--author",
        "Codex",
        "--author-kind",
        "agent",
        "--if-version",
        get().version,
      );
      await page.reload();
      await expect(section.locator("li")).toHaveCount(2);
      await expect(section.locator("li").last()).toContainText("Bot");
      await expect(section.locator("li").last()).toContainText("Codex");
      assert.equal(comments()[0].author.kind, "human");
      assert.equal(comments()[1].author.kind, "agent");
      const source = await readFile(
        join(project.folder, ".project", "cards", `${id}.md`),
        "utf8",
      );
      assert.ok(
        source.includes("BotCommentNeedle") && source.includes("Human reply"),
      );
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await input.scrollIntoViewIfNeeded();
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        await page.screenshot({
          path: join(evidence, `comments-${width}.png`),
        });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      for (const view of ["list", "board", "focus"]) {
        await page.goto(
          `${config.origin}/?${new URLSearchParams({ view, project: project.id })}`,
        );
        const cardButton = page
          .getByRole("button")
          .filter({ hasText: "Conversation preserved" })
          .filter({ has: page.locator(".resource-metadata") })
          .first();
        await expect(cardButton).toContainText("2 comments");
        await cardButton.click();
        await expect(section.locator("li")).toHaveCount(2);
        await dialog
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
      }
      for (const view of ["calendar", "gantt"]) {
        await open(view);
        await expect(section.locator("li")).toHaveCount(2);
      }
      await input.fill("Exactly once despite response loss");
      const submitted = [];
      const matcher = `${config.origin}${path}`;
      await page.route(matcher, async (route) => {
        if (
          route.request().method() !== "PATCH" ||
          !route.request().postDataJSON()?.append_comment
        )
          return route.continue();
        submitted.push({
          headers: route.request().headers(),
          payload: route.request().postDataJSON(),
        });
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        if (submitted.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
      });
      await add.click();
      await expect(
        dialog.getByRole("button", { name: "Retry same command", exact: true }),
      ).toBeEnabled();
      await expect(input).toHaveValue("Exactly once despite response loss");
      assert.equal(comments().length, 3);
      await dialog
        .getByRole("button", { name: "Retry same command", exact: true })
        .click();
      await expect(input).toHaveValue("");
      assert.equal(comments().length, 3);
      assert.equal(submitted.length, 2);
      for (const key of ["x-request-id", "x-command-epoch", "if-match"])
        assert.equal(submitted[0].headers[key], submitted[1].headers[key]);
      assert.deepEqual(submitted[0].payload, submitted[1].payload);
      await page.unroute(matcher);
      await input.fill("Keep this unsent conflict reply");
      await page.route(matcher, async (route) => {
        if (
          route.request().method() !== "PATCH" ||
          !route.request().postDataJSON()?.append_comment
        )
          return route.continue();
        await mutate(
          "PATCH",
          path,
          {
            append_comment: {
              author: { kind: "agent", label: "Another bot" },
              body: "Concurrent source comment",
            },
          },
          get().version,
        );
        await route.continue();
      });
      await add.click();
      await expect(dialog).toContainText(/conflict|changed/i);
      await expect(input).toHaveValue("Keep this unsent conflict reply");
      await expect(add).toBeDisabled();
      assert.equal(comments().length, 4);
      assert.equal(comments().at(-1).body, "Concurrent source comment");
      await page.unroute(matcher);
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            checks: [
              "human browser and bot CLI attribution",
              "source Markdown history",
              "safe Markdown rendering",
              "unsent drafts survive autosave, pin and close",
              "all card editor entry points",
              "list/board/focus counts",
              "320/390px layout",
              "lost-response same-command retry",
              "concurrent comment conflict preserves draft",
            ],
            errors,
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
