/** Real rejected commands, optionally losing their replies before status recovery. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "command-outcomes.json");
    const results = [];
    const errors = [];

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }

    async function create(label) {
      const result = await mutate("POST", `${base}/cards`, {
        title: label,
        status: "active",
        body: "Saved body",
        schedule: { start: "2026-09-08", end: "2026-09-09" },
      });
      return cli("get", `${base}/cards/${result.id}`);
    }

    async function open(page, view, card) {
      const params = new URLSearchParams({ view, project, month: "2026-09" });
      if (view === "list") {
        params.set("type", "card");
        params.set("resource", card.metadata.id);
      }
      await page.goto(`${config.origin}/?${params}`);
      await expect(page.getByLabel("Project", { exact: true })).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
    }

    /** A competing CLI write causes the real rejection; only its transport reply is lost. */
    async function rejectCommand(
      page,
      { path, method, lost, before, code, unavailable = false },
    ) {
      const attempts = [];
      const statusReads = [];
      let interceptionError;
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          request.method() === "GET" &&
          url.pathname.startsWith("/api/v1/commands/")
        )
          statusReads.push(url);
      });
      await page.route(`${config.origin}${path}`, async (route) => {
        if (
          unavailable &&
          attempts.length &&
          route.request().method() === "GET"
        )
          return route.fulfill({
            status: 503,
            json: { api_version: "1", error: { code: "RESOURCE_UNAVAILABLE" } },
          });
        if (route.request().method() !== method) return route.continue();
        const request = route.request();
        const headers = request.headers();
        const attempt = {
          requestId: headers["x-request-id"],
          epoch: headers["x-command-epoch"],
          version: headers["if-match"],
          payload: request.postDataJSON(),
        };
        attempts.push(attempt);
        try {
          if (attempts.length === 1) await before();
          else
            assert.deepEqual(
              attempt,
              attempts[0],
              "Retry changed command identity or draft",
            );
          const reply = await route.fetch();
          assert.equal(reply.status(), code === "VERSION_CONFLICT" ? 412 : 409);
          assert.equal((await reply.json()).error.code, code);
          if (lost) await route.abort("failed");
          else await route.fulfill({ response: reply });
        } catch (cause) {
          interceptionError = cause;
          await route.abort("failed").catch(() => {});
        }
      });
      return {
        attempts,
        async recover(dialog) {
          if (lost) {
            const check = dialog.getByRole("button", {
              name: "Check status",
              exact: true,
            });
            await expect(check).toBeEnabled();
            assert.equal(interceptionError, undefined);
            await dialog
              .getByRole("button", { name: "Retry same command", exact: true })
              .click();
            await expect.poll(() => attempts.length).toBe(2);
            await expect(check).toBeEnabled();
            assert.equal(interceptionError, undefined);
            await expect(dialog).toContainText(attempts[0].requestId);
            const stored = cli(
              "get",
              `/api/v1/commands/${attempts[0].requestId}?epoch=${attempts[0].epoch}`,
            );
            assert.equal(stored.state, "rejected");
            assert.equal(
              stored.error?.error?.code,
              code,
              JSON.stringify(stored),
            );
            await check.click();
            await expect(check).toHaveCount(0);
            assert.equal(statusReads.length, 1);
            assert.equal(
              statusReads[0].pathname,
              `/api/v1/commands/${attempts[0].requestId}`,
            );
            assert.equal(
              statusReads[0].searchParams.get("epoch"),
              attempts[0].epoch,
            );
          } else {
            await expect.poll(() => attempts.length).toBe(1);
          }
          assert.equal(interceptionError, undefined);
        },
      };
    }

    async function editorCase(
      page,
      lost,
      focus = false,
      archived = false,
      unavailable = false,
    ) {
      const card = await create(
        `Outcome ${focus ? "focus" : "resource"} ${lost ? "lost" : "direct"} ${archived}`,
      );
      const path = `${base}/cards/${card.metadata.id}`;
      await open(page, "list", card);
      const dialog = page.getByRole("dialog", {
        name: "Edit resource",
        exact: true,
      });
      const title = dialog.getByLabel("Title", { exact: true });
      const body = dialog.getByLabel(/^Description/);
      await expect(
        dialog.getByRole("button", { name: "Pin to focus", exact: true }),
      ).toBeEnabled();
      await title.fill("Unsaved title — Zażółć");
      await body.fill("Unsaved body\nSecond line");
      const focusBefore = focus ? cli("get", "/api/v1/workspace/focus") : null;
      const code = archived ? "FOCUS_TARGET_ARCHIVED" : "VERSION_CONFLICT";
      const rejected = await rejectCommand(page, {
        path: focus ? "/api/v1/workspace/focus" : path,
        method: focus ? "PUT" : "PATCH",
        lost,
        code,
        unavailable,
        before: async () => {
          if (archived)
            await mutate(
              "PATCH",
              path,
              { set: { archived: true } },
              card.version,
            );
          else if (focus)
            await mutate(
              "PUT",
              "/api/v1/workspace/focus",
              {
                items: [
                  ...focusBefore.items,
                  { project_id: project, card_id: card.metadata.id },
                ],
              },
              focusBefore.version,
            );
          else
            await mutate(
              "PATCH",
              path,
              { set: { title: "Changed elsewhere" } },
              card.version,
            );
        },
      });
      await dialog
        .getByRole("button", {
          name: focus ? "Pin to focus" : "Save changes",
          exact: true,
        })
        .click();
      await rejected.recover(dialog);
      await expect(title).toHaveValue("Unsaved title — Zażółć");
      await expect(body).toHaveValue("Unsaved body\nSecond line");
      if (focus) {
        await expect(dialog).toContainText(
          "Focus changed elsewhere. Your draft is preserved.",
        );
        await expect(
          dialog.getByRole("button", {
            name: archived ? "Pin to focus" : "Remove from focus",
            exact: true,
          }),
        ).toBeEnabled();
        if (archived)
          await expect(dialog).toContainText("FOCUS_TARGET_ARCHIVED");
        await expect(title).toBeEnabled();
        assert.equal(cli("get", path).metadata.title, card.metadata.title);
      } else {
        if (unavailable)
          await expect(dialog).toContainText(
            "The current saved version is unavailable. Your draft is preserved above.",
          );
        else {
          await expect(
            dialog.getByText("Current saved version · your draft stays above", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.locator("pre")).toContainText(
            "Changed elsewhere",
          );
        }
        await expect(
          dialog.getByRole("button", { name: "Save changes", exact: true }),
        ).toBeDisabled();
        assert.equal(cli("get", path).metadata.title, "Changed elsewhere");
      }
      assert.equal(cli("get", path).body, "Saved body");
      assert.equal(
        rejected.attempts[0].version,
        `"${focus ? focusBefore.version : card.version}"`,
      );
      return { code, attempts: rejected.attempts, draftPreserved: true };
    }

    async function dateCase(page, lost, unavailable = false) {
      const card = await create(`Outcome dates ${lost ? "lost" : "direct"}`);
      const path = `${base}/cards/${card.metadata.id}`;
      await open(page, "gantt", card);
      await page
        .getByLabel("Selected card", { exact: true })
        .selectOption(card.metadata.id);
      await page
        .getByRole("button", { name: "Edit planned dates", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Change planned dates",
        exact: true,
      });
      await dialog
        .getByLabel("Planned start", { exact: true })
        .fill("2026-09-10");
      await dialog
        .getByLabel("Planned end", { exact: true })
        .fill("2026-09-12");
      const rejected = await rejectCommand(page, {
        path,
        method: "PATCH",
        lost,
        code: "VERSION_CONFLICT",
        unavailable,
        before: () =>
          mutate(
            "PATCH",
            path,
            { set: { title: "Dates changed elsewhere" } },
            card.version,
          ),
      });
      await dialog
        .getByRole("button", { name: "Save planned dates", exact: true })
        .click();
      await rejected.recover(dialog);
      if (unavailable)
        await expect(dialog).toContainText(
          "The current resource is unavailable; your proposed dates remain here.",
        );
      else
        await expect(
          dialog.getByText("Current saved schedule:", { exact: false }),
        ).toBeVisible();
      await expect(
        dialog.getByLabel("Planned start", { exact: true }),
      ).toHaveValue("2026-09-10");
      await expect(
        dialog.getByLabel("Planned end", { exact: true }),
      ).toHaveValue("2026-09-12");
      await expect(
        dialog.getByRole("button", { name: "Save planned dates", exact: true }),
      ).toBeDisabled();
      assert.deepEqual(
        cli("get", path).metadata.schedule,
        card.metadata.schedule,
      );
      assert.equal(rejected.attempts[0].version, `"${card.version}"`);
      assert.deepEqual(rejected.attempts[0].payload, {
        set: { schedule: { start: "2026-09-10", end: "2026-09-12" } },
      });
      return { attempts: rejected.attempts, draftPreserved: true };
    }

    async function moveCase(page, lost) {
      const card = await create(`Outcome move ${lost ? "lost" : "direct"}`);
      const path = `${base}/cards/${card.metadata.id}`;
      await open(page, "board", card);
      const handle = page
        .locator(`[data-board-card="${card.metadata.id}"]`)
        .getByRole("button");
      await expect(handle).toBeEnabled();
      const rejected = await rejectCommand(page, {
        path,
        method: "PATCH",
        lost,
        code: "VERSION_CONFLICT",
        before: () =>
          mutate(
            "PATCH",
            path,
            { set: { title: "Move changed elsewhere" } },
            card.version,
          ),
      });
      await handle.press("Alt+ArrowUp");
      const dialog = page.getByRole("dialog", {
        name: "Move card",
        exact: true,
      });
      await rejected.recover(dialog);
      await expect(dialog).toContainText("The card or its neighbors changed.");
      await expect(
        dialog.getByRole("button", { name: "Confirm move", exact: true }),
      ).toBeDisabled();
      await expect(dialog).toContainText(card.metadata.title);
      const stored = cli("get", path);
      assert.equal(stored.metadata.position, card.metadata.position);
      assert.equal(stored.metadata.status, card.metadata.status);
      assert.equal(rejected.attempts[0].version, `"${card.version}"`);
      return { attempts: rejected.attempts, proposalPreserved: true };
    }

    for (const [name, scenario] of [
      ["resource", (page, lost) => editorCase(page, lost)],
      ["focus", (page, lost) => editorCase(page, lost, true)],
      ["dates", dateCase],
      ["move", moveCase],
      ["focus-archived", (page, lost) => editorCase(page, lost, true, true)],
      [
        "resource-refresh-unavailable",
        (page, lost) => editorCase(page, lost, false, false, true),
      ],
      ["dates-refresh-unavailable", (page, lost) => dateCase(page, lost, true)],
    ]) {
      for (const lost of [false, true]) {
        const id = `${name}-${lost ? "status-after-lost-reply" : "direct"}`;
        const context = await newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", (error) =>
          errors.push({ id, message: error.message }),
        );
        try {
          const detail = await scenario(page, lost);
          results.push({ id, status: "pass", detail });
        } catch (error) {
          results.push({ id, status: "fail", error: String(error) });
          await page
            .screenshot({ path: join(evidence, `${id}.png`) })
            .catch(() => {});
        } finally {
          await context.close();
          console.log(JSON.stringify(results.at(-1)));
          await writeFile(
            join(evidence, "results.json"),
            JSON.stringify({ results, errors }, null, 2),
          );
        }
      }
    }
    if (results.some((result) => result.status !== "pass") || errors.length)
      process.exitCode = 1;
  },
);
