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
import { checkFocusOrderKeyboard } from "../../focus-order-regression.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext, pair }) => {
    const mode = process.argv[2] ?? "all";
    const resultsFile = join(
      evidence,
      mode === "all" ? "results.json" : `results-${mode}.json`,
    );
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
    const snapshot = async (name) =>
      page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
    async function check(id, name, run) {
      if (mode === "without-focus" && id === "focus-order") return;
      if (mode === "focus-only" && id !== "focus-order") return;
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
      await page.getByLabel("Project", { exact: true }).waitFor();
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
    }
    async function settings() {
      await page
        .getByRole("button", { name: "Workspace settings", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Workspace settings",
        exact: true,
      });
      await expect(
        dialog.getByLabel("Timezone", { exact: true }),
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

    let originalFocus, expectedFocus;
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
        priority: "urgent",
        labels: [
          "Research, discovery",
          "Zażółć gęślą jaźń",
          "LongTagWithoutSpacesForTestingMobileWrapping1234",
        ],
        due: { date: "2026-09-02", kind: "hard" },
        schedule: { start: "2026-09-10", end: "2026-09-15" },
        review_on: "2026-09-08",
        blocked: {
          reason:
            "Waiting for synthetic approval of the interface and its fully spelled-out acceptance criteria across all supported views.",
        },
      });
      const secondary = await mutate("POST", `${base}/cards`, {
        title: "Board target-date regression",
        status: "active",
        priority: "low",
        due: { date: "2026-09-20", kind: "target" },
        schedule: { start: "2026-09-08", end: "2026-09-08" },
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
          await expect(primaryCard).toContainText("Urgent priority");
          for (const text of [
            "Hard deadline",
            "2026-09-02",
            "Plan",
            "2026-09-10",
            "2026-09-15",
            "Review",
            "2026-09-08",
            "Research, discovery",
            "Blocked:",
          ])
            await expect(primaryCard).toContainText(text);
          await expect(primaryCard.locator(".tag")).toHaveCount(3);
          await expect(primaryCard.locator("button")).toHaveCount(1);
          await expect(
            page.locator(`[data-board-card="${secondary.id}"]`),
          ).toContainText("Target date");
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
              .getByLabel("Theme", { exact: true })
              .selectOption(theme);
            await dialog
              .getByRole("button", { name: "Close settings", exact: true })
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
            .getByRole("button", { name: "Collapse column", exact: true })
            .click();
          await expect(primaryCard).toHaveCount(0);
          await active
            .getByRole("button", { name: "Expand column", exact: true })
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
          const timezone = dialog.getByLabel("Timezone", { exact: true });
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
            .getByText("Pending command:", { exact: false })
            .waitFor();
          await checkSettingsPendingFields(dialog);
          await dialog
            .getByRole("button", { name: "Retry same command", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Retry same command",
              exact: true,
            }),
          ).toBeEnabled();
          assert.equal(requests.length, 2);
          assert.deepEqual(requests[0], requests[1]);
          await snapshot("settings-pending-command");
          await dialog
            .getByRole("button", { name: "Close settings", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", { name: "Keep editing", exact: true }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Keep editing", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", { name: "Close settings", exact: true }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Close settings", exact: true })
            .click();
          await dialog
            .getByRole("button", {
              name: "Discard settings draft",
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
        "Updates stays visible after a direct mobile URL and reload",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await route("updates");
          await page.reload();
          const selected = page
            .getByRole("navigation", { name: "Workspace views" })
            .getByRole("button", { name: "Updates", exact: true });
          await expect(selected).toHaveAttribute("aria-current", "page");
          await expect(page.locator(".asidebottom")).toContainText(
            "Connected to host",
          );
          await expect(
            page.getByText("Loading resources…", { exact: true }),
          ).toBeHidden();
          await snapshot("mobile-direct-updates");
          await expect(selected).toBeInViewport({ ratio: 1 });
          return selected.boundingBox();
        },
      );

      await check(
        "focus-order",
        "Focus order keyboard focus, discard guard and mobile footer",
        async () => {
          originalFocus = cli("get", "/api/v1/workspace/focus");
          const items = [
            ...originalFocus.items,
            { project_id: project, card_id: primary.id },
            { project_id: project, card_id: secondary.id },
          ];
          await mutate(
            "PUT",
            "/api/v1/workspace/focus",
            { items },
            originalFocus.version,
          );
          expectedFocus = items;
          await route("focus");
          await page
            .getByRole("button", { name: "Arrange focus", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Arrange focus",
            exact: true,
          });
          await checkFocusOrderKeyboard(dialog);
          const rows = dialog.locator("[data-focus-card]");
          await rows.nth(1).locator('[data-direction="-1"]').click();
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
            await snapshot(`focus-order-${width}`);
          }
          await dialog
            .getByRole("button", { name: "Close focus order", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", { name: "Keep editing", exact: true }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Keep editing", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Close focus order",
              exact: true,
            }),
          ).toBeFocused();
          await dialog
            .getByRole("button", { name: "Close focus order", exact: true })
            .press("Control+Enter");
          await dialog.waitFor({ state: "hidden" });
          const saved = cli("get", "/api/v1/workspace/focus");
          const expected = [...items];
          [expected[0], expected[1]] = [expected[1], expected[0]];
          assert.deepEqual(saved.items, expected);
          expectedFocus = expected;
          return { widths, keyboardOrderSaved: true };
        },
      );
      await check(
        "A08",
        "Mobile Sign out directly ends the synthetic browser session",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await route("board");
          const signOut = page.getByRole("button", {
            name: "Sign out",
            exact: true,
          });
          await expect(signOut).toBeInViewport({ ratio: 1 });
          await snapshot("mobile-sign-out-available");
          await signOut.click();
          await expect(
            page.getByRole("heading", {
              name: "Connect your browser",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Request access" }),
          ).toBeVisible();
          await expect(page.getByLabel("Project", { exact: true })).toHaveCount(
            0,
          );
          await snapshot("mobile-signed-out");
          return {
            directMobileSignOut: true,
            pairedWorkspaceNoLongerVisible: true,
          };
        },
      );
    } finally {
      if (originalFocus) {
        const current = cli("get", "/api/v1/workspace/focus");
        assert.deepEqual(
          current.items,
          expectedFocus,
          "Do not replace focus changes made by another actor during the regression",
        );
        await mutate(
          "PUT",
          "/api/v1/workspace/focus",
          { items: originalFocus.items },
          current.version,
        );
      }
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
