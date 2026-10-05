/** Unload guards, settings conflicts and recovery feedback shared by command dialogs. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext }) => {
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "command-recovery-command.json");
    const results = [];
    const errors = [];
    const webkit = process.env.ASTRA_TEST_BROWSER === "webkit";

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }
    async function create(title, extra = {}) {
      const result = await mutate("POST", `${base}/cards`, {
        title,
        status: "active",
        schedule: { start: "2026-09-08", end: "2026-09-09" },
        ...extra,
      });
      return cli("get", `${base}/cards/${result.id}`);
    }
    async function visit(page, parameters) {
      await page.goto(`${config.origin}/?${new URLSearchParams(parameters)}`);
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Połączono z serwerem",
      );
    }
    /** The handler's decision, independent of each engine's leave prompt. */
    const unloadGuarded = (page) =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    /** Lose the acknowledgement without letting the command reach the host. */
    async function loseCommand(page, pattern, method) {
      const attempts = [];
      await page.route(pattern, async (route) => {
        if (route.request().method() !== method) return route.continue();
        attempts.push(route.request().headers()["x-request-id"]);
        await route.abort("failed");
      });
      return attempts;
    }
    /** Success belongs in a status region; only failures may raise an alert. */
    async function copyFeedback(scope, success) {
      const outcome = scope
        .getByText(success, { exact: false })
        .or(scope.getByText("Schowek jest niedostępny", { exact: false }));
      await expect(outcome.first()).toBeVisible();
      const copied = await scope.getByText(success, { exact: false }).count();
      if (copied) {
        await expect(
          scope.getByRole("status").filter({ hasText: success }),
        ).toHaveCount(1);
        await expect(
          scope.getByRole("alert").filter({ hasText: success }),
        ).toHaveCount(0);
      }
      return copied ? "copied" : "clipboard unavailable";
    }
    async function snapshot(page, name) {
      if (!webkit) await page.screenshot({ path: join(evidence, name) });
    }
    async function check(id, name, run) {
      const context = await newContext();
      await context
        .grantPermissions(["clipboard-read", "clipboard-write"])
        .catch(() => {});
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) =>
        errors.push({ id, message: error.message }),
      );
      const started = Date.now();
      try {
        const detail = await run(page);
        results.push({ id, name, status: "pass", detail });
      } catch (error) {
        results.push({ id, name, status: "fail", error: String(error) });
        await snapshot(page, `${id}-failure.png`).catch(() => {});
      } finally {
        results.at(-1).ms = Date.now() - started;
        await context.close();
        console.log(JSON.stringify(results.at(-1)));
        await writeFile(
          join(evidence, "results.json"),
          JSON.stringify(
            { results, errors, browser: browser.version() },
            null,
            2,
          ),
        );
      }
    }

    await check(
      "C01",
      "An uncertain board move guards unload and reports copying as status",
      async (page) => {
        const card = await create("Recovery guard move");
        const attempts = await loseCommand(
          page,
          `${config.origin}${base}/cards/${card.metadata.id}`,
          "PATCH",
        );
        await visit(page, { view: "board", project });
        assert.equal(await unloadGuarded(page), false);
        const handle = page
          .locator(`[data-board-card="${card.metadata.id}"]`)
          .getByRole("button");
        await expect(handle).toBeEnabled();
        await handle.press("Alt+ArrowUp");
        const dialog = page.getByRole("dialog", {
          name: "Przenieś kartę",
          exact: true,
        });
        await expect(dialog).toContainText("Żądanie:");
        await expect(dialog).toContainText(attempts[0]);
        assert.equal(await unloadGuarded(page), true);
        await dialog
          .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
          .click();
        const copy = await copyFeedback(dialog, "Skopiowano propozycję.");
        await expect(dialog).toContainText(attempts[0]);
        return { requestId: attempts[0], copy };
      },
    );

    await check(
      "C02",
      "An uncertain date change guards unload and reports copying as status",
      async (page) => {
        const card = await create("Recovery guard dates");
        const attempts = await loseCommand(
          page,
          `${config.origin}${base}/cards/${card.metadata.id}`,
          "PATCH",
        );
        await visit(page, { view: "gantt", project, month: "2026-09" });
        await page
          .getByLabel("Wybrana karta", { exact: true })
          .selectOption(card.metadata.id);
        await page
          .getByRole("button", { name: "Edytuj zaplanowane daty", exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Zmień zaplanowane daty",
          exact: true,
        });
        await dialog
          .getByLabel("Zaplanowany koniec", { exact: true })
          .fill("2026-09-12");
        assert.equal(await unloadGuarded(page), false);
        await dialog
          .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
          .click();
        await expect(dialog).toContainText("Żądanie:");
        assert.equal(await unloadGuarded(page), true);
        await dialog
          .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
          .click();
        const copy = await copyFeedback(dialog, "Skopiowano propozycję.");
        return { requestId: attempts[0], copy };
      },
    );

    await check(
      "C03",
      "An uncertain tag rename guards unload",
      async (page) => {
        const source = `Guard ${Date.now().toString(36)}`;
        await create("Recovery guard tags", { labels: [source] });
        const attempts = await loseCommand(
          page,
          `${config.origin}${base}/tags/rename`,
          "POST",
        );
        await visit(page, { view: "list", project });
        await page
          .getByRole("button", { name: "Ustawienia przestrzeni roboczej" })
          .click();
        await page.getByRole("button", { name: "Zarządzaj tagami" }).click();
        const manager = page.getByRole("dialog", {
          name: "Zarządzaj tagami projektu",
        });
        await manager
          .getByRole("listitem")
          .filter({ hasText: source })
          .getByRole("button", { name: "Zmień nazwę / połącz" })
          .click();
        await manager.getByLabel("Tag docelowy").fill(`${source} renamed`);
        await manager.getByRole("button", { name: "Podgląd zmian" }).click();
        assert.equal(await unloadGuarded(page), false);
        await manager
          .getByRole("button", { name: "Zmień nazwę w tym projekcie" })
          .click();
        await expect(manager).toContainText("Identyfikator polecenia:");
        await expect(manager).toContainText(attempts[0]);
        assert.equal(await unloadGuarded(page), true);
        return { requestId: attempts[0] };
      },
    );

    await check(
      "C04",
      "A finished tag rename still refreshes when its catalog re-read fails",
      async (page) => {
        const source = `Reread ${Date.now().toString(36)}`;
        const target = `${source} renamed`;
        const card = await create("Recovery tag re-read", { labels: [source] });
        // Without a stream, the manager is the only source of this refresh.
        await page.route("**/api/v1/events?**", () => {});
        await page.goto(`${config.origin}/?view=list&project=${project}`);
        await expect(page.locator("header.topbar")).toBeVisible();
        await page.evaluate(() => {
          window.tagNotifications = 0;
          window.addEventListener(
            "tag-suggestions-changed",
            () => window.tagNotifications++,
          );
        });
        await page
          .getByRole("button", { name: "Ustawienia przestrzeni roboczej" })
          .click();
        await page.getByRole("button", { name: "Zarządzaj tagami" }).click();
        const manager = page.getByRole("dialog", {
          name: "Zarządzaj tagami projektu",
        });
        await manager
          .getByRole("listitem")
          .filter({ hasText: source })
          .getByRole("button", { name: "Zmień nazwę / połącz" })
          .click();
        await manager.getByLabel("Tag docelowy").fill(target);
        await manager.getByRole("button", { name: "Podgląd zmian" }).click();
        await expect(
          manager.getByRole("region", { name: "Podgląd zmiany nazwy tagu" }),
        ).toBeVisible();
        let refreshes = 0;
        page.on("request", (request) => {
          if (new URL(request.url()).pathname === "/api/v1/views/list")
            refreshes++;
        });
        const catalog = `${config.origin}${base}/tags`;
        await page.route(catalog, (route) =>
          route.fulfill({
            status: 503,
            json: {
              api_version: "1",
              error: { code: "RESOURCE_UNAVAILABLE", message: "Synthetic" },
            },
          }),
        );
        const before = refreshes;
        await manager
          .getByRole("button", { name: "Zmień nazwę w tym projekcie" })
          .click();
        await expect
          .poll(
            () =>
              cli("get", `${base}/cards/${card.metadata.id}`).metadata.labels,
          )
          .toEqual([target]);
        await expect(manager.getByRole("alert")).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.tagNotifications))
          .toBe(1);
        await expect.poll(() => refreshes - before).toBeGreaterThan(0);
        await expect(
          manager.getByRole("button", {
            name: "Zamknij zarządzanie tagami",
          }),
        ).toBeEnabled();
        await page.unroute(catalog);
        return { notified: true, refreshes: refreshes - before };
      },
    );

    await check(
      "C05",
      "An uncertain native registration guards unload",
      async (page) => {
        const selected = {
          plan_id: randomUUID(),
          project_id: randomUUID(),
          display_path: "/synthetic/recovery-native",
          warnings: [],
          changes: [],
        };
        await page.route(
          `${config.origin}/api/v1/native-folder-selections`,
          async (route) => {
            const input = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              json: {
                selection_id: input.selection_id,
                state: "selected",
                plan: selected,
                error: null,
              },
            });
          },
        );
        const attempts = await loseCommand(
          page,
          `${config.origin}/api/v1/registrations`,
          "POST",
        );
        await visit(page, { view: "projects" });
        await page.getByRole("button", { name: "＋ Dodaj projekt" }).click();
        const dialog = page.getByRole("dialog", {
          name: "Dodaj projekt",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "Wybierz folder…", exact: true })
          .click();
        await expect(dialog).toContainText(selected.display_path);
        assert.equal(await unloadGuarded(page), false);
        await dialog
          .getByRole("button", { name: "Dodaj projekt", exact: true })
          .click();
        await expect(dialog).toContainText("Żądanie:");
        await expect(dialog).toContainText(attempts[0]);
        assert.equal(await unloadGuarded(page), true);
        await dialog
          .getByRole("button", {
            name: "Kopiuj szczegóły rejestracji",
            exact: true,
          })
          .click();
        const copy = await copyFeedback(
          dialog,
          "Skopiowano szczegóły rejestracji.",
        );
        return { requestId: attempts[0], copy };
      },
    );

    await check(
      "C06",
      "An uncertain browsed registration guards unload while its dialog is closed",
      async (page) => {
        const rootFolder = join(config.temp, "recovery-root");
        await mkdir(join(rootFolder, "candidate"), {
          recursive: true,
          mode: 0o700,
        });
        cli("add-root", rootFolder, "--label", "Recovery root");
        const attempts = await loseCommand(
          page,
          `${config.origin}/api/v1/registrations`,
          "POST",
        );
        await visit(page, { view: "projects" });
        await page.getByRole("button", { name: "＋ Dodaj projekt" }).click();
        const native = page.getByRole("dialog", {
          name: "Dodaj projekt",
          exact: true,
        });
        await native
          .getByText("Zdalny serwer bez pulpitu?", { exact: true })
          .click();
        await native
          .getByRole("button", {
            name: "Przeglądaj zatwierdzone foldery",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Dodaj projekt",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "Otwórz folder: candidate" })
          .click();
        await dialog
          .getByRole("button", { name: "Wybierz ten folder", exact: true })
          .click();
        assert.equal(await unloadGuarded(page), false);
        await dialog
          .getByRole("button", { name: "Dodaj wybrany projekt", exact: true })
          .click();
        await expect(dialog).toContainText("Żądanie:");
        await expect(dialog).toContainText(attempts[0]);
        assert.equal(await unloadGuarded(page), true);
        await dialog
          .getByRole("button", { name: "Zamknij", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.equal(await unloadGuarded(page), true);
        return { requestId: attempts[0] };
      },
    );

    await check(
      "C07",
      "A settings conflict locks saving until current settings are loaded deliberately",
      async (page) => {
        const preferencesPath = "/api/v1/workspace/preferences";
        const original = cli("get", preferencesPath);
        const requests = [];
        page.on("request", (request) => {
          if (
            request.method() === "PATCH" &&
            new URL(request.url()).pathname === preferencesPath
          )
            requests.push({
              requestId: request.headers()["x-request-id"],
              version: request.headers()["if-match"],
              payload: request.postDataJSON(),
            });
        });
        await visit(page, { view: "list", project });
        await page
          .getByRole("button", {
            name: "Ustawienia przestrzeni roboczej",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        const timezone = dialog.getByLabel("Strefa czasowa", { exact: true });
        const week = dialog.getByLabel("Początek tygodnia", { exact: true });
        const save = dialog.getByRole("button", {
          name: "Zapisz ustawienia",
          exact: true,
        });
        await expect(timezone).toBeEnabled();
        const mine = original.timezone === "UTC" ? "Europe/Warsaw" : "UTC";
        const theirs =
          (original.preferences.week_start ?? "monday") === "monday"
            ? "sunday"
            : "monday";
        await timezone.fill(mine);
        const competing = await mutate(
          "PATCH",
          preferencesPath,
          { preferences: { week_start: theirs } },
          original.version,
        );
        await save.click();
        const reload = dialog.getByRole("button", {
          name: "Wczytaj aktualne ustawienia",
          exact: true,
        });
        await expect(reload).toBeVisible();
        await expect(save).toBeDisabled();
        await expect(timezone).toHaveValue(mine);
        await timezone.press("Control+Enter");
        assert.equal(requests.length, 1, "A conflict must not be resubmitted");
        assert.equal(requests[0].version, `"${original.version}"`);
        assert.equal(cli("get", preferencesPath).timezone, original.timezone);
        await snapshot(page, "settings-conflict.png");
        await reload.click();
        await expect(reload).toHaveCount(0);
        // Untouched fields follow the saved state; the edited one stays visible.
        await expect(week).toHaveValue(theirs);
        await expect(timezone).toHaveValue(mine);
        await expect(save).toBeEnabled();
        assert.equal(requests.length, 1, "Loading must not write");
        await save.click();
        await expect(dialog).toHaveCount(0);
        assert.equal(requests.length, 2);
        assert.notEqual(requests[1].requestId, requests[0].requestId);
        assert.equal(requests[1].version, `"${competing.version}"`);
        const stored = cli("get", preferencesPath);
        assert.equal(stored.timezone, mine);
        assert.equal(stored.preferences.week_start, theirs);
        await mutate(
          "PATCH",
          preferencesPath,
          {
            timezone: original.timezone,
            preferences: {
              week_start: original.preferences.week_start ?? "monday",
            },
          },
          stored.version,
        );
        return { requests };
      },
    );

    await check(
      "C08",
      "Pinning to Focus keeps unfinished checklist and tag entries",
      async (page) => {
        const card = await create("Recovery pin entries");
        await visit(page, {
          view: "list",
          project,
          type: "card",
          resource: card.metadata.id,
        });
        const editor = page.getByRole("dialog", {
          name: "Edytuj element",
          exact: true,
        });
        const item = editor.getByLabel("Nowa pozycja", { exact: true });
        const tag = editor.getByRole("combobox", { name: "Etykiety" });
        await item.fill("Unfinished checklist entry");
        await tag.fill("Unfinished tag");
        await page.keyboard.press("Escape");
        const pin = editor.getByRole("button", {
          name: "Przypnij do Focus",
          exact: true,
        });
        await expect(pin).toBeEnabled();
        await pin.click();
        await expect(
          editor.getByRole("button", { name: "Usuń z Focus", exact: true }),
        ).toBeEnabled();
        assert.equal(
          cli("get", `${base}/cards/${card.metadata.id}`).metadata.pinned,
          true,
        );
        await expect(item).toHaveValue("Unfinished checklist entry");
        await expect(tag).toHaveValue("Unfinished tag");
        return { retained: true };
      },
    );

    await check(
      "C09",
      "Copying an editor draft reports status without replacing its warnings",
      async (page) => {
        const card = await create("Recovery copy draft");
        await visit(page, {
          view: "list",
          project,
          type: "card",
          resource: card.metadata.id,
        });
        const editor = page.getByRole("dialog", {
          name: "Edytuj element",
          exact: true,
        });
        await editor
          .getByLabel("Napisz komentarz", { exact: true })
          .fill("Unsent comment");
        await editor
          .getByRole("button", { name: "Zamknij edytor", exact: true })
          .click();
        const discard = editor
          .getByRole("alert")
          .filter({ hasText: "Odrzucić niezapisaną wersję roboczą?" });
        await expect(discard).toBeVisible();
        await editor
          .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
          .click();
        const copy = await copyFeedback(editor, "Skopiowano wersję roboczą.");
        await expect(discard).toBeVisible();
        return { copy };
      },
    );

    await check(
      "C10",
      "Read failures are explained in Polish without raw error names",
      async (page) => {
        const board = "**/api/v1/views/board?**";
        await page.route(board, (route) =>
          route.fulfill({
            status: 502,
            contentType: "text/html",
            body: "<html><body>Bad gateway</body></html>",
          }),
        );
        await visit(page, { view: "board", project });
        const boardAlert = page
          .getByRole("alert")
          .filter({ hasText: /odpowied|Serwer|JSON|Error/ })
          .first();
        await expect(boardAlert).toBeVisible();
        const boardText = await boardAlert.innerText();
        assert.doesNotMatch(boardText, /Error|JSON|Unexpected|token/);
        assert.match(boardText, /nieprawidłową odpowiedź/);
        await page.unroute(board);

        const calendar = "**/api/v1/views/calendar?**";
        await page.route(calendar, (route) =>
          route.fulfill({
            status: 500,
            json: {
              api_version: "1",
              error: { code: "INTERNAL", message: "English detail" },
            },
          }),
        );
        await visit(page, { view: "calendar", project, month: "2026-09" });
        const calendarAlert = page
          .getByRole("alert")
          .filter({ hasText: /Serwer|Error/ })
          .first();
        await expect(calendarAlert).toBeVisible();
        const calendarText = await calendarAlert.innerText();
        assert.doesNotMatch(calendarText, /Error:|English/);
        assert.match(calendarText, /Serwer zgłosił problem/);
        return { boardText, calendarText };
      },
    );

    if (results.some((result) => result.status !== "pass") || errors.length)
      process.exitCode = 1;
    console.log(
      JSON.stringify({
        passed: results.filter((result) => result.status === "pass").length,
        total: results.length,
        errors,
      }),
    );
  },
);
