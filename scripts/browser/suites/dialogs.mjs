/** Real release CSP, browser interactions and synthetic writes in audit-host. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  checkSettingsDraftSafety,
  checkSettingsPendingFields,
} from "../../settings-dialog-regression.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext, pair }) => {
    const resultsFile = join(evidence, "results.json");
    async function mutate(method, path, value, version) {
      const payload = join(runtime, "board-dialog-command.json");
      await writeFile(payload, JSON.stringify(value), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", payload];
      if (version) args.push("--if-version", version);
      const result = cli(...args).result;
      return result.resource?.metadata ?? result;
    }
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const context = await newContext({ storageState: undefined });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const results = [],
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.boardDialogCsp = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        window.boardDialogCsp.push({
          directive: event.violatedDirective,
          source: event.sourceFile,
          blocked: event.blockedURI,
        }),
      );
    });
    const snapshot = async (name) => {
      if (process.env.ASTRA_TEST_BROWSER !== "webkit")
        await page.screenshot({
          path: join(evidence, `${name}.png`),
          fullPage: true,
        });
    };
    async function check(id, name, run) {
      const started = Date.now();
      try {
        results.push({
          id,
          name,
          status: "pass",
          detail: await run(),
          ms: Date.now() - started,
        });
      } catch (e) {
        results.push({
          id,
          name,
          status: "fail",
          error: String(e),
          ms: Date.now() - started,
        });
        await snapshot(`${id}-failure`).catch(() => {});
      }
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        resultsFile,
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ),
      );
    }
    async function route(view) {
      await page.goto(`${config.origin}/?view=${view}&project=${project}`);
      await page.locator("header.topbar").waitFor();
      await expect(page.locator(".asidebottom")).toContainText(
        "Połączono z serwerem",
      );
    }
    async function settings() {
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
      await expect(
        dialog.getByLabel("Strefa czasowa", { exact: true }),
      ).toBeEnabled();
      return dialog;
    }
    async function layoutMetrics(dialog) {
      return dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const body = node.querySelector(".dialog-body");
        const footer = node.querySelector("footer").getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          rect: rect.toJSON(),
          footer: footer.toJSON(),
          bodyWidth: body.clientWidth,
          bodyScrollWidth: body.scrollWidth,
        };
      });
    }

    try {
      await pair(page, {
        requireRequest: true,
        deviceName:
          "Synthetic Board and Settings browser — long device label for mobile layout verification",
      });
      const primary = await mutate("POST", `${base}/cards`, {
        title:
          "Board metadata regression — a long synthetic title with readable planning and tag details",
        status: "active",
        priority: "high",
        labels: [
          "Research, discovery",
          "Zażółć gęślą jaźń",
          "LongTagWithoutSpacesForTestingMobileWrapping1234",
        ],
        schedule: { start: "2026-09-10", end: "2026-09-15" },
      });
      const primaryCard = page.locator(`[data-board-card="${primary.id}"]`);

      await check(
        "A11",
        "Board uses strict release CSP without inline theme violations",
        async () => {
          const response = await page.goto(
            `${config.origin}/?view=board&project=${project}`,
          );
          const csp = response.headers()["content-security-policy"];
          assert(csp.includes("style-src 'self'"));
          assert(!csp.includes("unsafe-inline"));
          await expect(primaryCard).toBeVisible();
          await expect(
            page.locator(".astra-board .wx-theme"),
          ).not.toHaveAttribute("style");
          await expect(primaryCard).toContainText("Wysoki priorytet");
          for (const text of ["Plan", "Research, discovery"])
            await expect(primaryCard).toContainText(text);
          // The range reads as a short date and keeps its machine value.
          await expect(
            primaryCard.locator('time[datetime="2026-09-10"]'),
          ).toHaveText(/^10–15 wrz( 2026)?$/);
          await expect(primaryCard.locator(".tag")).toHaveCount(3);
          await expect(primaryCard.locator("button")).toHaveCount(1);
          assert.deepEqual(
            await page.evaluate(() => window.boardDialogCsp),
            [],
          );
          return {
            csp,
            singleCardAction: true,
            metadataMeaningsRetained: true,
          };
        },
      );

      await check(
        "board-visual",
        "Board light/dark metadata, narrow overflow, collapse and gesture cancellation",
        async () => {
          const metrics = [];
          for (const theme of ["light", "dark"]) {
            const dialog = await settings();
            await dialog
              .getByLabel("Motyw", { exact: true })
              .selectOption(theme);
            await dialog
              .getByRole("button", { name: "Zamknij ustawienia", exact: true })
              .click();
            for (const width of [1440, 390, 320]) {
              await page.setViewportSize({
                width,
                height: width === 1440 ? 1000 : 844,
              });
              await primaryCard.scrollIntoViewIfNeeded();
              const measure = await page.evaluate(() => ({
                width: innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                csp: window.boardDialogCsp,
                cardBorder: getComputedStyle(
                  document.querySelector(".astra-board .wx-card"),
                ).borderTopWidth,
                cardBackground: getComputedStyle(
                  document.querySelector(".astra-board .wx-card"),
                ).backgroundColor,
                columnBackground: getComputedStyle(
                  document.querySelector(".astra-board .wx-column"),
                ).backgroundColor,
              }));
              assert.equal(measure.width, measure.documentWidth);
              assert.equal(measure.cardBorder, "1px");
              assert.notEqual(measure.cardBackground, measure.columnBackground);
              assert.deepEqual(measure.csp, []);
              metrics.push({ theme, ...measure });
              await snapshot(`board-${theme}-${width}`);
            }
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          const active = page.locator(".astra-column-active");
          await active
            .getByRole("button", { name: "Zwiń kolumnę", exact: true })
            .click();
          await expect(primaryCard).toHaveCount(0);
          await active
            .getByRole("button", { name: "Rozwiń kolumnę", exact: true })
            .click();
          await primaryCard.scrollIntoViewIfNeeded();
          const source = await primaryCard.boundingBox();
          const target = await page
            .locator(".astra-column-planned [data-kanban-column-cards]")
            .boundingBox();
          await page.mouse.move(source.x + source.width / 2, source.y + 18);
          await page.mouse.down();
          await page.mouse.move(target.x + target.width / 2, target.y + 20, {
            steps: 12,
          });
          await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
          await snapshot("board-drag-before-cancel");
          await page.keyboard.press("Escape");
          await page.mouse.up();
          await expect(page.locator("[data-board-drag-preview]")).toHaveCount(
            0,
          );
          assert.equal(
            cli("get", `${base}/cards/${primary.id}`).metadata.status,
            "active",
          );
          assert.deepEqual(
            await page.evaluate(() => window.boardDialogCsp),
            [],
          );
          return { metrics, cancelledDragPreservedStatus: true };
        },
      );

      await check(
        "settings-draft",
        "Settings protects drafts and preserves uncertain command identity",
        async () => {
          await route("focus");
          const dialog = await settings();
          await checkSettingsDraftSafety(dialog);
          const widths = [];
          for (const width of [1440, 390, 320]) {
            await page.setViewportSize({
              width,
              height: width === 1440 ? 1000 : 844,
            });
            const metrics = await layoutMetrics(dialog);
            assert(metrics.rect.x >= 0 && metrics.rect.right <= width);
            assert(metrics.footer.bottom <= metrics.viewport.height);
            assert.equal(metrics.bodyWidth, metrics.bodyScrollWidth);
            widths.push(metrics);
            await snapshot(`settings-${width}`);
          }
          const timezone = dialog.getByLabel("Strefa czasowa", { exact: true });
          const original = await timezone.inputValue();
          await timezone.fill(original === "UTC" ? "Europe/Warsaw" : "UTC");
          const requests = [];
          const pattern = "**/api/v1/workspace/preferences";
          await page.route(pattern, async (route) => {
            if (route.request().method() !== "PATCH") return route.continue();
            const headers = route.request().headers();
            requests.push({
              body: route.request().postData(),
              requestId: headers["x-request-id"],
              epoch: headers["x-command-epoch"],
              version: headers["if-match"],
            });
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "SERVER_BUSY" } }),
            });
          });
          await timezone.press("Control+Enter");
          await dialog
            .getByText("Oczekujące polecenie:", { exact: false })
            .waitFor();
          await checkSettingsPendingFields(dialog);
          await dialog
            .getByRole("button", {
              name: "Ponów to samo polecenie",
              exact: true,
            })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Ponów to samo polecenie",
              exact: true,
            }),
          ).toBeEnabled();
          assert.equal(requests.length, 2);
          assert.deepEqual(requests[0], requests[1]);
          await snapshot("settings-pending-command");
          await dialog
            .getByRole("button", { name: "Zamknij ustawienia", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Kontynuuj edycję",
              exact: true,
            }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Kontynuuj edycję", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Zamknij ustawienia",
              exact: true,
            }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Zamknij ustawienia", exact: true })
            .click();
          await dialog
            .getByRole("button", {
              name: "Odrzuć wersję roboczą ustawień",
              exact: true,
            })
            .click();
          await page.unroute(pattern);
          assert.equal(
            cli("get", "/api/v1/workspace/preferences").timezone,
            original,
          );
          return {
            widths,
            identicalRetry: true,
            persistedPreferencesUnchanged: true,
          };
        },
      );

      await check(
        "mobile-initial-nav",
        "More represents Updates after a direct mobile URL and reload",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await route("updates");
          await page.reload();
          const navigation = page.getByRole("navigation", {
            name: "Widoki przestrzeni roboczej",
          });
          const selected = navigation.getByRole("button", {
            name: "Więcej widoków",
            exact: true,
          });
          await expect(selected).toHaveAttribute("aria-current", "page");
          await expect(
            navigation.getByRole("button", {
              name: "Aktualizacje",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(page.locator(".asidebottom")).toContainText(
            "Połączono z serwerem",
          );
          await expect(
            page.getByText("Ładowanie danych…", { exact: true }),
          ).toBeHidden();
          await expect(
            page.getByRole("heading", { name: "Aktualizacje", exact: true }),
          ).toBeVisible();
          await page.evaluate(async () => {
            await new Promise(requestAnimationFrame);
            await Promise.allSettled(
              document.getAnimations().map((animation) => animation.finished),
            );
          });
          await snapshot("mobile-direct-updates");
          // Chromium can report a fractional final pixel at the mobile viewport edge.
          await expect(selected).toBeInViewport({ ratio: 0.99 });
          const bounds = await selected.boundingBox();
          await selected.click();
          const updates = navigation.getByRole("button", {
            name: "Aktualizacje",
            exact: true,
          });
          await expect(updates).toHaveAttribute("aria-current", "page");
          await expect(updates).toBeInViewport({ ratio: 1 });
          await updates.click();
          await expect(selected).toHaveAttribute("aria-expanded", "false");
          await expect(selected).toHaveAttribute("aria-current", "page");
          return bounds;
        },
      );

      await check(
        "updates-detail",
        "Existing updates open as readable records with working read state",
        async () => {
          await mutate("POST", `${base}/updates`, {
            kind: "result",
            summary: "Report detail probe",
            body: "**Visible report body**",
            author: { kind: "human", label: "QA owner" },
            target: { type: "project", id: project },
            evidence: [
              { type: "commit", value: "abc1234", label: "Do sprawdzenia" },
            ],
          });
          await route("updates");
          const card = page.getByRole("button", {
            name: /Report detail probe/,
          });
          await expect(card).toBeVisible();
          await card.click();
          const dialog = page.getByRole("dialog", {
            name: "Szczegóły aktualizacji",
          });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByText("Visible report body")).toBeVisible();
          await expect(dialog.getByText("QA owner")).toBeVisible();
          await expect(dialog.getByText("abc1234")).toBeVisible();
          await expect(dialog.locator("input, textarea, select")).toHaveCount(
            0,
          );
          await snapshot("updates-detail");
          await dialog
            .getByRole("button", { name: "Oznacz jako przeczytane" })
            .click();
          await expect(
            dialog.getByRole("button", { name: "Oznacz jako nieprzeczytane" }),
          ).toBeVisible();
          await dialog
            .getByRole("button", { name: "Zamknij edytor", exact: true })
            .click();
          await expect(dialog).toBeHidden();
          await expect(card).toContainText("Przeczytane");
        },
      );

      await check(
        "A14",
        "Escape closes the tag manager and allows it to reopen with focus restored",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await route("board");
          await settings();
          await page
            .getByRole("button", { name: "Zarządzaj tagami", exact: true })
            .click();
          const tags = page.getByRole("dialog", {
            name: "Zarządzaj tagami projektu",
          });
          await expect(
            tags.getByLabel("Projekt", { exact: true }),
          ).toBeEnabled();
          await page.keyboard.press("Escape");
          await expect(tags).toHaveCount(0);
          await expect(
            page.getByRole("button", { name: "Zarządzaj tagami", exact: true }),
          ).toBeFocused();
          await page
            .getByRole("button", { name: "Zarządzaj tagami", exact: true })
            .click();
          await expect(tags).toBeVisible();
          await tags
            .getByRole("button", { name: "Zamknij zarządzanie tagami" })
            .click();
          await expect(tags).toHaveCount(0);
          return {
            escapeUnmounts: true,
            reopenWorks: true,
            settingsFocusRestored: true,
          };
        },
      );

      await check(
        "A08",
        "Mobile workspace actions expose Sign out and end the synthetic browser session",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await route("board");
          await page
            .getByRole("button", {
              name: "Działania przestrzeni roboczej",
              exact: true,
            })
            .click();
          const signOut = page.getByRole("button", {
            name: "Wyloguj",
            exact: true,
          });
          await expect(signOut).toBeInViewport({ ratio: 1 });
          await snapshot("mobile-sign-out-available");
          await signOut.click();
          await expect(
            page.getByRole("heading", {
              name: "Połącz przeglądarkę",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Poproś o dostęp" }),
          ).toBeVisible();
          await expect(page.getByLabel("Projekt", { exact: true })).toHaveCount(
            0,
          );
          await snapshot("mobile-signed-out");
          return {
            mobileMenuSignOut: true,
            pairedWorkspaceNoLongerVisible: true,
          };
        },
      );
    } finally {
      await writeFile(
        resultsFile,
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ),
      );
    }
    if (results.some((result) => result.status !== "pass") || errors.length)
      process.exitCode = 1;
    console.log(
      JSON.stringify({
        passed: results.filter((r) => r.status === "pass").length,
        total: results.length,
        errors,
      }),
    );
  },
);
