/** Request scope, lazy reads and complete paginated card history on a real host. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const project = config.projects[0].id,
      card = config.cards[0];
    const base = `/api/v1/projects/${project}`;
    const command = join(runtime, "report.json");
    for (let index = 0; index < 55; index++) {
      await writeFile(
        command,
        JSON.stringify({
          kind: "note",
          summary: `History entry ${String(index + 1).padStart(2, "0")}`,
          target: { type: "card", id: card.id },
          author: { kind: "human", label: "Synthetic QA" },
          body: `## Lazy body ${index + 1}\n\nSynthetic history evidence.`,
        }),
        { mode: 0o600 },
      );
      cli("command", "POST", `${base}/updates`, "--json-file", command);
    }

    const requests = [],
      errors = [],
      results = [];
    try {
      const context = await newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname.startsWith("/api/"))
          requests.push(url.pathname + url.search);
      });
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project })}`,
      );
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
      const row = page.locator("main").getByText(card.title, { exact: true });
      await row.waitFor();
      let start = requests.length;
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/views/list?") &&
            new URL(response.url()).searchParams.get("type") === "card",
        ),
        page.getByRole("button", { name: "Refresh", exact: true }).click(),
      ]);
      await expect(
        page.getByText("Loading resources…", { exact: true }),
      ).toHaveCount(0);
      const refresh = requests
        .slice(start)
        .filter((path) => !path.includes("/events"));
      assert(
        refresh.some(
          (path) => path.includes("/views/list?") && path.includes("type=card"),
        ),
        JSON.stringify(refresh),
      );
      assert(
        refresh.every(
          (path) =>
            path === "/api/v1/projects?limit=200" ||
            path.startsWith("/api/v1/projects?") ||
            (path.startsWith("/api/v1/views/list?") &&
              path.includes("type=card")),
        ),
        JSON.stringify(refresh),
      );
      results.push({
        check: "List refresh reads only projects and cards",
        requests: refresh,
      });

      start = requests.length;
      await row.click();
      const dialog = page.getByRole("dialog", {
        name: "Edit resource",
        exact: true,
      });
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        card.title,
      );
      await expect
        .poll(
          () =>
            requests
              .slice(start)
              .filter((path) => path === "/api/v1/workspace/tag-suggestions")
              .length,
        )
        .toBe(1);
      const history = dialog
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: /^Card updates/ }) });
      assert.equal(
        requests
          .slice(start)
          .filter((path) => path.startsWith(`${base}/updates`)).length,
        0,
        "History must stay lazy until expanded",
      );
      assert.equal(
        requests
          .slice(start)
          .filter((path) =>
            new RegExp(`^${base}/(cards|milestones)(\\?|$)`).test(path),
          ).length,
        0,
        "Editor must not enumerate relation collections",
      );
      await history.locator("summary").click();
      await expect(history.locator("li")).toHaveCount(50);
      const first = await history.locator("li > button").allTextContents();
      assert.equal(
        requests.filter((path) => path.startsWith(`${base}/updates/`)).length,
        0,
        "Report bodies must stay lazy",
      );
      await history
        .getByRole("button", { name: "Next updates", exact: true })
        .click();
      await expect(history.locator("li")).toHaveCount(5);
      const second = await history.locator("li > button").allTextContents();
      assert.equal(new Set([...first, ...second]).size, 55);
      await expect(
        history.getByRole("button", { name: "Next updates", exact: true }),
      ).toHaveCount(0);
      await history.locator("li > button").first().click();
      await expect(
        history.getByRole("heading", { name: /^Lazy body / }),
      ).toBeVisible();
      await history
        .getByRole("button", { name: "Previous updates", exact: true })
        .click();
      await expect(history.locator("li")).toHaveCount(50);
      assert.deepEqual(
        await history.locator("li > button").allTextContents(),
        first,
      );
      const activity = requests.filter((path) =>
        path.startsWith(`${base}/updates?`),
      );
      for (const path of activity) {
        const params = new URL(path, config.origin).searchParams;
        assert.equal(params.get("target_type"), "card");
        assert.equal(params.get("target_id"), card.id);
        assert.equal(params.get("limit"), "50");
      }
      results.push({
        check: "Card history uses bounded target pages and lazy bodies",
        pageSizes: [first.length, second.length],
        uniqueReports: 55,
        requests: activity,
      });
      await dialog.getByLabel("Find by title", { exact: true }).fill("History");
      await dialog
        .getByRole("button", { name: "Find resources", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "History probe", exact: true }),
      ).toBeVisible();
      assert(
        requests.some(
          (path) =>
            path.startsWith("/api/v1/views/list?") &&
            path.includes("type=card") &&
            path.includes("q=History"),
        ),
      );
      results.push({
        check:
          "Relation search finds a card behind more than 50 matching reports",
      });
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      const tagReads = requests.filter(
        (path) => path === "/api/v1/workspace/tag-suggestions",
      ).length;
      await row.click();
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        card.title,
      );
      await dialog
        .getByRole("combobox", { name: "Labels", exact: true })
        .focus();
      await expect(
        dialog.getByRole("option", { name: "frontend", exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("Loading workspace tags…", { exact: true }),
      ).toHaveCount(0);
      assert.equal(
        requests.filter((path) => path === "/api/v1/workspace/tag-suggestions")
          .length,
        tagReads,
      );
      results.push({
        check: "Reopening editor reuses fresh workspace tag suggestions",
        tagReads,
      });
      assert.deepEqual(errors, []);
    } catch (error) {
      results.push({
        check: "Code health browser suite",
        error: String(error),
      });
      process.exitCode = 1;
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ results, errors }, null, 2) + "\n",
      );
      console.log(JSON.stringify({ suite: "code-health", results, errors }));
    }
  },
);
