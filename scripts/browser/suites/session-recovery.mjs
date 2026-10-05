/** Re-pairing over retained dialogs and event-stream recovery on a real host. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext, pair }) => {
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "session-recovery-command.json");
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
        ...extra,
      });
      return cli("get", `${base}/cards/${result.id}`);
    }
    function revokeAll() {
      for (const session of cli("sessions").items)
        cli("revoke-session", session.id);
    }
    const pairingHeading = (page) =>
      page.getByRole("heading", { name: "Połącz przeglądarkę", exact: true });
    const requestAccess = (page) =>
      page.getByRole("button", { name: /^Poproś o dostęp/ });
    async function sessionLost(page) {
      await expect(pairingHeading(page)).toBeVisible();
      await expect(
        page.getByText("Sesja wygasła.", { exact: false }).first(),
      ).toBeVisible();
    }
    // The host accepts five pairing requests per minute, including the runner's.
    const pairings = [Date.now()];
    async function pairingSlot() {
      const recent = pairings.filter((time) => Date.now() - time < 62000);
      if (recent.length >= 5)
        await new Promise((done) =>
          setTimeout(done, 62000 - (Date.now() - recent.at(-5))),
        );
      pairings.push(Date.now());
    }
    /** Pair again in place: a navigation would discard the retained dialog. */
    async function reconnect(page) {
      await pairingSlot();
      await requestAccess(page).click({ timeout: 5000 });
      const challenge = page.locator(".challenge");
      await expect(challenge).toBeVisible();
      const code = (await challenge.innerText()).trim();
      const matching = cli("pairings").items.filter(
        (entry) => entry.challenge === code,
      );
      assert.equal(matching.length, 1, "Expected one matching pairing");
      cli("approve", matching[0].id, "--challenge", matching[0].challenge);
      await page
        .getByRole("button", {
          name: "Przeglądarka została zatwierdzona",
          exact: true,
        })
        .click({ timeout: 5000 });
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(pairingHeading(page)).toHaveCount(0);
    }
    async function pairingFits(page) {
      const viewport = page.viewportSize();
      const button = await requestAccess(page).boundingBox();
      assert(button, "The pairing action must be rendered");
      assert(button.x >= 0 && button.x + button.width <= viewport.width);
      assert(button.y >= 0 && button.y + button.height <= viewport.height);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "The pairing layer must not scroll horizontally",
      );
      return { viewport, button };
    }
    async function snapshot(page, name) {
      // WebKit's screenshot preparation injects a stylesheet the app CSP blocks.
      if (webkit) return;
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.allSettled(
          document.getAnimations().map((animation) => animation.finished),
        );
      });
      await page.screenshot({ path: join(evidence, name) });
    }
    // Each scenario inherits the session its predecessor paired again in place.
    let session = join(runtime, "browser-state.json");
    // A page that already paired again has its pairing screen loaded, so the
    // next loss mounts that layer in the same pass as the dialogs it must cover.
    let kept = null;
    async function check(
      id,
      name,
      run,
      { paired = true, keepPage = false, samePage = false } = {},
    ) {
      const reused = samePage ? kept : null;
      if (!reused) await kept?.context.close();
      kept = null;
      const context =
        reused?.context ??
        (await newContext({
          storageState: paired && session ? session : undefined,
        }));
      const page = reused?.page ?? (await context.newPage());
      page.setDefaultTimeout(10000);
      const fault = (error) => errors.push({ id, message: error.message });
      page.on("pageerror", fault);
      const started = Date.now();
      try {
        if (paired && !session) {
          await pairingSlot();
          await pair(page, { requireRequest: true });
        }
        const detail = await run(page, context, !!reused);
        results.push({ id, name, status: "pass", detail });
        if (paired) {
          session = join(runtime, `session-recovery-${id}.json`);
          await context.storageState({ path: session });
        }
        if (keepPage) kept = { context, page };
      } catch (error) {
        if (paired) session = null;
        results.push({ id, name, status: "fail", error: String(error) });
        await snapshot(page, `${id}-failure.png`).catch(() => {});
      } finally {
        page.off("pageerror", fault);
        results.at(-1).ms = Date.now() - started;
        if (!kept) await context.close();
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
      "R01",
      "A never-paired browser is not told that its session expired",
      async (page) => {
        await page.goto(config.origin);
        await expect(pairingHeading(page)).toBeVisible();
        await expect(requestAccess(page)).toBeEnabled();
        await expect(
          page.getByText("Sesja wygasła", { exact: false }),
        ).toHaveCount(0);
        await expect(page.getByRole("alert")).toHaveCount(0);
        return { firstVisitNotice: "none" };
      },
      { paired: false },
    );

    await check(
      "R02",
      "An editor draft survives session loss and re-pairing in place",
      async (page) => {
        const card = await create("Recovery editor draft");
        const path = `${base}/cards/${card.metadata.id}`;
        await page.goto(
          `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card.metadata.id })}`,
        );
        const editor = page.getByRole("dialog", {
          name: "Edytuj element",
          exact: true,
        });
        const comment = editor.getByLabel("Napisz komentarz", { exact: true });
        await comment.fill("Retained through re-pairing");
        revokeAll();
        await sessionLost(page);
        await expect(comment).toHaveValue("Retained through re-pairing");
        await expect(comment).toBeDisabled();
        const layout = await pairingFits(page);
        await snapshot(page, "editor-draft-session-lost.png");
        await reconnect(page);
        await expect(editor).toBeVisible();
        await expect(comment).toHaveValue("Retained through re-pairing");
        await expect(comment).toBeEnabled();
        await expect(
          editor.getByText("Sesja wygasła", { exact: false }),
        ).toHaveCount(0);
        await editor
          .getByRole("button", { name: "Dodaj komentarz", exact: true })
          .click();
        await expect
          .poll(() =>
            (cli("get", path).metadata.comments ?? []).map((item) => item.body),
          )
          .toEqual(["Retained through re-pairing"]);
        await expect(comment).toHaveValue("");
        return { layout, draftSubmittedAfterRepair: true };
      },
    );

    await check(
      "R03",
      "An uncertain move keeps its request ID through re-pairing on a phone",
      async (page) => {
        const card = await create("Recovery uncertain move");
        const path = `${base}/cards/${card.metadata.id}`;
        const attempts = [];
        const statusReads = [];
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (
            request.method() === "GET" &&
            url.pathname.startsWith("/api/v1/commands/")
          )
            statusReads.push(url);
        });
        await page.route(`${config.origin}${path}`, async (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          const headers = route.request().headers();
          attempts.push({
            requestId: headers["x-request-id"],
            epoch: headers["x-command-epoch"],
            version: headers["if-match"],
            payload: route.request().postDataJSON(),
          });
          // The server commits; only the acknowledgement is lost.
          await route.fetch();
          await route.abort("failed").catch(() => {});
        });
        await page.goto(`${config.origin}/?view=board&project=${project}`);
        const handle = page
          .locator(`[data-board-card="${card.metadata.id}"]`)
          .getByRole("button");
        await expect(handle).toBeEnabled();
        await handle.press("Alt+ArrowUp");
        const dialog = page.getByRole("dialog", {
          name: "Przenieś kartę",
          exact: true,
        });
        const status = dialog.getByRole("button", {
          name: "Sprawdź stan",
          exact: true,
        });
        await expect(status).toBeVisible();
        await expect.poll(() => attempts.length).toBe(1);
        await expect(dialog).toContainText(attempts[0].requestId);
        await page.setViewportSize({ width: 390, height: 844 });
        revokeAll();
        await sessionLost(page);
        const layout = await pairingFits(page);
        await snapshot(page, "uncertain-move-session-lost-390.png");
        await reconnect(page);
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(attempts[0].requestId);
        await expect(status).toBeEnabled();
        await status.click();
        await expect(dialog).toHaveCount(0);
        assert.equal(attempts.length, 1, "Status must not resend the command");
        assert.equal(statusReads.length, 1);
        assert.equal(
          statusReads[0].pathname,
          `/api/v1/commands/${attempts[0].requestId}`,
        );
        assert.equal(
          statusReads[0].searchParams.get("epoch"),
          attempts[0].epoch,
        );
        assert.notEqual(cli("get", path).version, card.version);
        return { layout, requestId: attempts[0].requestId };
      },
      { keepPage: true },
    );

    await check(
      "R04",
      "Dialogs opening under the pairing layer stay below it at 320px",
      async (page, _context, continued) => {
        const candidate = config.projects[1];
        const path = `/api/v1/projects/${candidate.id}`;
        const before = cli("get", path);
        const attempts = [];
        let release;
        const held = new Promise((done) => {
          release = done;
        });
        await page.route(`${config.origin}${path}`, async (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          const headers = route.request().headers();
          attempts.push({
            requestId: headers["x-request-id"],
            epoch: headers["x-command-epoch"],
            version: headers["if-match"],
            payload: route.request().postDataJSON(),
          });
          if (attempts.length > 1) return route.continue();
          await held;
          // Revocation has already happened: the real host answers 401.
          const reply = await route.fetch();
          assert.equal(reply.status(), 401);
          await route.fulfill({ response: reply });
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
        // A reload would discard the pairing screen this page already loaded.
        if (continued)
          await page
            .getByRole("navigation", { name: "Widoki przestrzeni roboczej" })
            .getByRole("button", { name: "Projekty", exact: true })
            .click();
        else await page.goto(`${config.origin}/?view=projects`);
        const tile = page.locator(
          `[data-project-board-item="${candidate.id}"]`,
        );
        const trigger = tile.getByRole("button", {
          name: `Przenieś ${candidate.title}`,
          exact: true,
        });
        await trigger.focus();
        await trigger.press("Enter");
        await tile
          .getByRole("button", { name: "Przenieś do Wstrzymane", exact: true })
          .press("Enter");
        await expect.poll(() => attempts.length).toBe(1);
        await page
          .getByRole("button", {
            name: "Ustawienia przestrzeni roboczej",
            exact: true,
          })
          .click();
        const settings = page.getByRole("dialog", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        const timezone = settings.getByLabel("Strefa czasowa", { exact: true });
        await expect(timezone).toBeEnabled();
        const draft =
          (await timezone.inputValue()) === "UTC" ? "Europe/Warsaw" : "UTC";
        await timezone.fill(draft);
        await page.evaluate(() => {
          window.openedModals = [];
          const open = HTMLDialogElement.prototype.showModal;
          HTMLDialogElement.prototype.showModal = function () {
            window.openedModals.push(this.getAttribute("aria-label"));
            return open.call(this);
          };
        });
        await page.setViewportSize({ width: 320, height: 700 });
        revokeAll();
        await sessionLost(page);
        const dialog = page.getByRole("dialog", {
          name: "Przenieś projekt",
          exact: true,
        });
        await expect(dialog).toBeVisible();
        const opened = await page.evaluate(() => window.openedModals);
        const layer = "Połącz przeglądarkę ponownie";
        assert.equal(opened.at(-1), layer, JSON.stringify(opened));
        // With its screen loaded, pairing opens first and is raised again.
        if (continued) {
          assert.deepEqual(opened, [layer, "Przenieś projekt", layer]);
          await expect(requestAccess(page)).toBeFocused();
        }
        release();
        await expect(dialog).toContainText("Żądanie");
        const layout = await pairingFits(page);
        await snapshot(page, "late-dialog-session-lost-320.png");
        await reconnect(page);
        await expect(dialog).toContainText(attempts[0].requestId);
        const retry = dialog.getByRole("button", {
          name: "Ponów to samo polecenie",
          exact: true,
        });
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect.poll(() => cli("get", path).metadata.state).toBe("paused");
        await expect(dialog).toHaveCount(0);
        assert.equal(attempts.length, 2);
        assert.deepEqual(attempts[1], attempts[0]);
        assert.equal(attempts[0].version, `"${before.version}"`);
        await expect(timezone).toHaveValue(draft);
        await expect(timezone).toBeEnabled();
        await settings
          .getByRole("button", { name: "Zamknij ustawienia", exact: true })
          .click();
        await settings
          .getByRole("button", {
            name: "Odrzuć wersję roboczą ustawień",
            exact: true,
          })
          .click();
        await expect(settings).toHaveCount(0);
        return { layout, opened, identicalRetry: true };
      },
      { samePage: true },
    );

    await check(
      "R05",
      "Retained work can be inspected and copied before pairing again",
      async (page, context) => {
        await context
          .grantPermissions(["clipboard-read", "clipboard-write"])
          .catch(() => {});
        const card = await create("Recovery inspect draft");
        await page.goto(
          `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card.metadata.id })}`,
        );
        const editor = page.getByRole("dialog", {
          name: "Edytuj element",
          exact: true,
        });
        const comment = editor.getByLabel("Napisz komentarz", { exact: true });
        await comment.fill("Copied before pairing");
        await page.setViewportSize({ width: 390, height: 844 });
        revokeAll();
        await sessionLost(page);
        await page
          .getByRole("button", { name: "Pokaż zachowaną pracę", exact: true })
          .click();
        await expect(pairingHeading(page)).toHaveCount(0);
        await editor
          .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
          .click();
        await expect(
          editor
            .getByText(/Skopiowano wersję roboczą|Schowek jest niedostępny/)
            .first(),
        ).toBeVisible();
        await expect(comment).toHaveValue("Copied before pairing");
        await expect(comment).toBeDisabled();
        await editor
          .getByRole("button", { name: "Połącz ponownie", exact: true })
          .click();
        await expect(pairingHeading(page)).toBeVisible();
        await expect(requestAccess(page)).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(pairingHeading(page)).toBeVisible();
        await reconnect(page);
        await expect(comment).toHaveValue("Copied before pairing");
        await expect(comment).toBeEnabled();
        return { inspected: true };
      },
    );

    await check(
      "R06",
      "A refused event stream is replaced so later changes still arrive",
      async (page) => {
        const card = await create("Stream recovery before");
        const path = `${base}/cards/${card.metadata.id}`;
        const streams = [];
        await page.route("**/api/v1/events?**", async (route) => {
          streams.push(route.request().url());
          if (streams.length > 1) return route.continue();
          await route.fulfill({
            status: 503,
            json: {
              api_version: "1",
              error: { code: "STREAM_LIMIT", message: "Synthetic refusal" },
            },
          });
        });
        await page.goto(`${config.origin}/?view=list&project=${project}`);
        await expect(
          page
            .getByRole("button")
            .filter({ hasText: "Stream recovery before" })
            .first(),
        ).toBeVisible();
        await expect.poll(() => streams.length).toBeGreaterThanOrEqual(1);
        await expect(page.locator(".asidebottom")).toContainText(
          "Połączono z serwerem",
          { timeout: 15000 },
        );
        await mutate(
          "PATCH",
          path,
          { set: { title: "Stream recovery after" } },
          card.version,
        );
        await expect(
          page
            .getByRole("button")
            .filter({ hasText: "Stream recovery after" })
            .first(),
        ).toBeVisible();
        assert.equal(streams.length, 2, "Exactly one replacement stream");
        await expect(
          page.getByText("Sesja wygasła", { exact: false }),
        ).toHaveCount(0);
        return { streams: streams.length };
      },
    );

    await check(
      "R07",
      "Revocation still ends the session after the stream was replaced",
      async (page) => {
        let streams = 0;
        await page.route("**/api/v1/events?**", async (route) => {
          streams++;
          if (streams > 1) return route.continue();
          await route.fulfill({
            status: 503,
            json: { api_version: "1", error: { code: "STREAM_LIMIT" } },
          });
        });
        await page.goto(`${config.origin}/?view=list&project=${project}`);
        await expect(page.locator(".asidebottom")).toContainText(
          "Połączono z serwerem",
          { timeout: 15000 },
        );
        revokeAll();
        await sessionLost(page);
        const settled = streams;
        await page.waitForTimeout(2500);
        assert.equal(streams, settled, "An ended session must not reconnect");
        return { streams };
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
