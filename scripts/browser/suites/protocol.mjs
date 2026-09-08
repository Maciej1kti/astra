/** Real stale-page responses after a concurrent save; no mocked API payloads. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const project = config.projects[0];
    const count = 350,
      ids = [];
    // Synthetic external sources exercise normal filesystem reconciliation on the host.
    for (let index = 0; index < count; index++) {
      const id = randomUUID();
      ids.push(id);
      const metadata = {
        id,
        title: `Pagination fixture ${String(index).padStart(3, "0")}`,
        kind: "outcome",
        status: "active",
        priority: "normal",
        archived: false,
        position: (((2n ** 128n - 1n) / BigInt(count + 1)) * BigInt(index + 1))
          .toString(16)
          .padStart(32, "0"),
        created_at: "2026-09-05T10:00:00Z",
        updated_at: "2026-09-05T10:00:00Z",
        schedule: { start: "2026-09-07", end: "2026-09-09" },
        due: { date: "2026-09-08", kind: "target" },
        review_on: "2026-09-08",
        blocked: { reason: "Synthetic pagination fixture" },
      };
      await writeFile(
        join(project.folder, ".project", "cards", `${id}.md`),
        `---\n${JSON.stringify(metadata)}\n---\nSynthetic content.\n`,
      );
    }
    const target = `/api/v1/projects/${project.id}/cards/${ids[0]}`;
    const commandFile = join(runtime, "pagination-command.json");
    const results = [],
      errors = [];

    try {
      await expect
        .poll(
          () =>
            cli(
              "get",
              `/api/v1/views/list?type=card&project_id=${project.id}&q=Pagination&limit=200`,
            ).items.length,
          { timeout: 30000 },
        )
        .toBe(200);
      const context = await newContext();
      const scenarios = [
        {
          view: "list",
          endpoint: "list",
          next: "Next page",
          notice: "This collection changed.",
          code: "CURSOR_STALE",
        },
        {
          view: "attention",
          endpoint: "attention",
          next: "Next attention page",
          notice: "Attention changed.",
          code: "PAGE_STALE",
        },
        {
          view: "board",
          endpoint: "board",
          next: "Next 50 in active",
          notice: "The board changed.",
          code: "PAGE_STALE",
        },
        {
          view: "gantt",
          endpoint: "gantt",
          next: "Next page of dated resources",
          notice: "The timeline changed.",
          code: "PAGE_STALE",
        },
        {
          view: "calendar",
          endpoint: "calendar",
          next: "Next page of dated resources",
          notice: "The calendar changed.",
          code: "PAGE_STALE",
        },
      ];
      for (const scenario of scenarios) {
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on("pageerror", (error) => errors.push(error.message));
        // Hold back automatic event-driven refresh so the user can request an old page.
        // HTTP reads and writes still reach the normally authenticated release daemon.
        await page.route(/\/api\/v1\/events\?/, (route) =>
          route.abort("failed"),
        );
        const params = new URLSearchParams({
          view: scenario.view,
          project: project.id,
          date: "2026-09-08",
          layout: "month",
          month: "2026-09",
        });
        await page.goto(`${config.origin}/?${params}`);
        const next = page.getByRole("button", {
          name: scenario.next,
          exact: true,
        });
        await expect(next).toBeEnabled();
        const before = cli("get", target);
        await writeFile(
          commandFile,
          JSON.stringify({
            set: { title: `Concurrent ${scenario.view} change` },
          }),
          { mode: 0o600 },
        );
        cli(
          "command",
          "PATCH",
          target,
          "--if-version",
          before.version,
          "--json-file",
          commandFile,
        );
        const stale = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === `/api/v1/views/${scenario.endpoint}` &&
            url.searchParams.has("cursor") &&
            response.status() === 409
          );
        });
        await next.click();
        assert.equal((await (await stale).json()).error.code, scenario.code);
        await expect(
          page.getByText(scenario.notice, { exact: false }),
        ).toBeVisible();
        await expect(next).toBeEnabled();
        // A new cursor must then advance successfully instead of looping on the stale page.
        const advanced = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === `/api/v1/views/${scenario.endpoint}` &&
            url.searchParams.has("cursor") &&
            response.status() === 200
          );
        });
        await next.click();
        await advanced;
        results.push({
          view: scenario.view,
          staleCode: scenario.code,
          recovery: "first page, then successful next page",
        });
        await page.close();
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      results.push({ check: "Protocol browser suite", error: String(error) });
      process.exitCode = 1;
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ results, errors }, null, 2) + "\n",
      );
      console.log(JSON.stringify({ suite: "protocol", results, errors }));
    }
  },
);
