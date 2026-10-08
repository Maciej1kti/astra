/** Real rejected commands, optionally losing their replies before status recovery. */
import { runBrowserSuite } from "../runtime.mjs";
import { timelineCardById } from "../timeline.mjs";
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
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Połączono z serwerem",
      );
    }

    /** A competing CLI write causes the real rejection; only its transport reply is lost. */
    async function rejectCommand(
      page,
      {
        path,
        method,
        lost,
        before,
        code,
        unavailable = false,
        autosave = false,
      },
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
              name: autosave
                ? /^(Check autosave status|Sprawdź stan)$/
                : "Sprawdź stan",
              exact: !autosave,
            });
            await expect(check).toBeEnabled();
            assert.equal(interceptionError, undefined);
            await dialog
              .getByRole("button", {
                name: autosave
                  ? /^(Ponów same autosave|Ponów to samo polecenie)$/
                  : "Ponów to samo polecenie",
                exact: !autosave,
              })
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
        name: "Edytuj element",
        exact: true,
      });
      const title = dialog.getByLabel("Tytuł", { exact: true });
      const body = dialog.getByLabel("Opis", { exact: true });
      const renderedBody = dialog.locator(".resource-description-rendered");
      async function expectBodyDraft() {
        if (await body.isVisible()) {
          await expect(body).toHaveValue("Autosaved body\nSecond line");
        } else {
          await expect(renderedBody).toBeVisible();
          await expect(renderedBody).toHaveText("Autosaved body\nSecond line");
        }
      }
      await expect(
        dialog.getByRole("button", { name: "Przypnij do Focus", exact: true }),
      ).toBeEnabled();
      const code = "VERSION_CONFLICT";
      const prepareRejection = () =>
        rejectCommand(page, {
          path,
          method: "PATCH",
          lost,
          code,
          unavailable,
          autosave: !focus,
          before: async () => {
            if (archived)
              await mutate(
                "PATCH",
                path,
                { set: { archived: true } },
                cli("get", path).version,
              );
            else if (focus)
              await mutate(
                "PATCH",
                path,
                { set: { pinned: true } },
                cli("get", path).version,
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
      let rejected = focus ? null : await prepareRejection();
      await title.fill("Autosaved title — Zażółć");
      await renderedBody.click();
      await body.fill("Autosaved body\nSecond line");
      if (focus) {
        await expect(dialog.getByTestId("autosave-status")).toHaveText(
          "Zapisano",
        );
        rejected = await prepareRejection();
        const observed = cli("get", path);
        await dialog
          .getByRole("button", { name: "Przypnij do Focus", exact: true })
          .click();
        await rejected.recover(dialog);
        assert.equal(rejected.attempts[0].version, `"${observed.version}"`);
      } else {
        await rejected.recover(dialog);
      }
      // Keep Description focused for resource cases: clicking recovery must
      // still work when leaving Markdown editing changes the dialog's height.
      await expect(title).toHaveValue("Autosaved title — Zażółć");
      await expectBodyDraft();
      if (focus) {
        await expect(dialog).toContainText(
          "Ten element zmienił się od otwarcia. Wersja robocza została zachowana.",
        );
        await expect(
          dialog.getByText("Aktualna zapisana wersja", {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(
          cli("get", path).metadata.title,
          "Autosaved title — Zażółć",
        );
      } else {
        if (unavailable)
          await expect(dialog).toContainText(
            "Aktualna zapisana wersja jest niedostępna. Wersja robocza została zachowana w edytorze.",
          );
        else {
          await expect(
            dialog.getByText("Aktualna zapisana wersja", {
              exact: true,
            }),
          ).toBeVisible();
          // The saved version is labelled text, not a dump of its JSON source.
          const current = dialog
            .locator("details")
            .filter({ hasText: "Aktualna zapisana wersja" });
          await current.locator("summary").click();
          const fields = current.locator("dl");
          await expect(fields.locator("dt").first()).toBeVisible();
          const shown = Object.fromEntries(
            await fields
              .locator("div")
              .evaluateAll((rows) =>
                rows.map((row) => [
                  row.querySelector("dt").textContent.trim(),
                  row.querySelector("dd").textContent.trim(),
                ]),
              ),
          );
          assert.equal(shown["Tytuł"], "Changed elsewhere");
          assert.equal(shown["Status"], "Aktywne");
          assert.equal(shown["Opis"], "Saved body");
          assert.equal(shown["Plan"], "8 września 2026 – 9 września 2026");
          assert.doesNotMatch(
            await fields.innerText(),
            /[{}]|"|\b(title|updated_at)\b|\d{4}-\d{2}-\d{2}T/,
          );
          await current
            .getByRole("button", {
              name: "Kopiuj aktualną wersję",
              exact: true,
            })
            .click();
          await expect(
            dialog
              .getByText("Skopiowano aktualną wersję.", { exact: true })
              .or(
                dialog.getByText("Schowek jest niedostępny", { exact: false }),
              )
              .first(),
          ).toBeVisible();
        }
        await expect(dialog.getByTestId("autosave-status")).toHaveText(
          "Niezapisane",
        );
        assert.equal(cli("get", path).metadata.title, "Changed elsewhere");
      }
      assert.equal(
        cli("get", path).body,
        focus ? "Autosaved body\nSecond line" : "Saved body",
      );
      if (!focus)
        assert.equal(rejected.attempts[0].version, `"${card.version}"`);
      return { code, attempts: rejected.attempts, draftPreserved: true };
    }

    async function dateCase(page, lost, unavailable = false) {
      const card = await create(`Outcome dates ${lost ? "lost" : "direct"}`);
      const path = `${base}/cards/${card.metadata.id}`;
      await open(page, "gantt", card);
      const bar = timelineCardById(page, card.metadata.id);
      await expect(bar).toBeVisible();
      const dialog = page.getByRole("dialog", {
        name: "Zmień zaplanowane daty",
        exact: true,
      });
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
      // Two keyboard steps move the plan and are saved as one change, without
      // a dialog. The dialog appears only because that save was refused.
      await bar.focus();
      await page.keyboard.down("Alt");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Alt");
      await expect(dialog).toBeVisible();
      await rejected.recover(dialog);
      if (unavailable)
        // The appended sentence must not run into the rejection message.
        await expect(dialog.getByRole("alert")).toHaveText(
          /\S Aktualny element jest niedostępny; proponowane daty pozostają tutaj\.$/,
        );
      else
        await expect(
          dialog.getByText("Aktualny zapisany harmonogram:", { exact: false }),
        ).toBeVisible();
      await expect(
        dialog.getByLabel("Zaplanowany początek", { exact: true }),
      ).toHaveValue("2026-09-10");
      await expect(
        dialog.getByLabel("Zaplanowany koniec", { exact: true }),
      ).toHaveValue("2026-09-11");
      await expect(
        dialog.getByRole("button", {
          name: "Zapisz zaplanowane daty",
          exact: true,
        }),
      ).toBeDisabled();
      assert.deepEqual(
        cli("get", path).metadata.schedule,
        card.metadata.schedule,
      );
      assert.equal(rejected.attempts[0].version, `"${card.version}"`);
      assert.deepEqual(rejected.attempts[0].payload, {
        set: { schedule: { start: "2026-09-10", end: "2026-09-11" } },
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
        name: "Przenieś kartę",
        exact: true,
      });
      await rejected.recover(dialog);
      await expect(dialog).toContainText(
        "Karta lub jej sąsiedzi się zmienili.",
      );
      await expect(
        dialog.getByRole("button", {
          name: "Potwierdź przeniesienie",
          exact: true,
        }),
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
