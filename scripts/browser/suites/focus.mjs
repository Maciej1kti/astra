/** Focus layout and creation regressions against a real paired synthetic host. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const project = config.projects[2];
    const otherProject = config.projects[0];
    const base = `/api/v1/projects/${project.id}`;
    const commandFile = join(runtime, "focus-command.json");
    const focusFile = join(runtime, "focus.json");
    const suffix = Date.now().toString(36);
    const results = [];
    const errors = [];
    const requests = [];
    const focusWrites = [];

    await mkdir(evidence, { recursive: true });

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }

    async function createCard(projectId, payload) {
      const result = await mutate(
        "POST",
        `/api/v1/projects/${projectId}/cards`,
        payload,
      );
      const id =
        result.resource?.metadata?.id ?? result.resource?.id ?? result.id;
      assert.equal(typeof id, "string", "Card create must return an id");
      return cli("get", `/api/v1/projects/${projectId}/cards/${id}`);
    }

    async function setFocus(items) {
      const current = cli("focus", "get");
      await writeFile(focusFile, JSON.stringify({ items }), { mode: 0o600 });
      cli(
        "focus",
        "set",
        "--input",
        focusFile,
        "--if-version",
        current.version,
      );
    }

    function title(resource) {
      return resource.metadata.title;
    }

    function cardListRequest(url) {
      if (url.pathname !== "/api/v1/views/list") return false;
      return url.searchParams.get("type") === "card";
    }

    function focusButton(page) {
      return page.getByRole("button", { name: /Add card$/ });
    }

    function editor(page) {
      return page.getByRole("dialog", { name: /^(Create|Edit) resource$/ });
    }

    function section(page, name) {
      return page.getByRole("region", { name, exact: true });
    }

    async function routeFocus(page, params = {}) {
      const query = new URLSearchParams({ view: "focus", ...params });
      await page.goto(`${config.origin}/?${query}`);
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
      await expect(section(page, "In focus")).toBeVisible();
      await expect(section(page, "Needs my attention")).toBeVisible();
      await expect(section(page, "In motion")).toBeVisible();
    }

    function cardText(region, resource) {
      return region.getByText(title(resource), { exact: true });
    }

    function focusCards(page) {
      return section(page, "In focus").locator("[data-focus-card]");
    }

    function focusCard(page, id) {
      return section(page, "In focus").locator(
        `[data-focus-card="${id}"], [data-focus-card$=":${id}"]`,
      );
    }

    async function visibleFocusOrder(page) {
      return focusCards(page).evaluateAll((nodes) =>
        nodes.map((node) =>
          node.getAttribute("data-focus-card")?.split(":").at(-1),
        ),
      );
    }

    async function beginFocusDrag(page, movingId, targetId) {
      const moving = focusCard(page, movingId);
      const target = focusCard(page, targetId);
      const sourceBox = await moving.boundingBox();
      const targetBox = await target.boundingBox();
      assert(sourceBox, `Focus card ${movingId} must be rendered`);
      assert(targetBox, `Focus card ${targetId} must be rendered`);
      await page.mouse.move(
        sourceBox.x + sourceBox.width * 0.6,
        sourceBox.y + sourceBox.height / 2,
      );
      await page.mouse.down();
      await page.waitForTimeout(275);
      await page.mouse.move(
        targetBox.x + targetBox.width * 0.6,
        targetBox.y + 1,
        { steps: 8 },
      );
      try {
        await expect(page.locator("[data-focus-drag-preview]")).toBeVisible();
        await expect(page.locator("[data-focus-drop-indicator]")).toBeVisible();
      } catch (cause) {
        await page.mouse.up().catch(() => {});
        throw cause;
      }
    }

    async function check(id, name, run, page) {
      const started = Date.now();
      try {
        results.push({
          id,
          name,
          status: "pass",
          detail: await run(),
          ms: Date.now() - started,
        });
      } catch (cause) {
        results.push({
          id,
          name,
          status: "fail",
          error: String(cause),
          ms: Date.now() - started,
        });
        await page
          .screenshot({
            path: join(evidence, `${id}-failure.png`),
            fullPage: true,
          })
          .catch(() => {});
      } finally {
        console.log(JSON.stringify(results.at(-1)));
        await writeFile(
          join(evidence, "results.json"),
          JSON.stringify({ results, errors }, null, 2),
        );
      }
    }

    const pinned = await createCard(project.id, {
      title: `Pinned overdue ${suffix}`,
      status: "active",
      schedule: { start: "2025-12-01", end: "2026-01-01" },
    });
    const review = await createCard(project.id, {
      title: `Review without date ${suffix}`,
      status: "review",
    });
    const overdue = await createCard(project.id, {
      title: `Active overdue ${suffix}`,
      status: "active",
      schedule: { start: "2025-12-02", end: "2026-01-02" },
    });
    const reviewOverdue = await createCard(project.id, {
      title: `Review and overdue ${suffix}`,
      status: "review",
      schedule: { start: "2025-12-03", end: "2026-01-03" },
    });
    const ordinary = await createCard(project.id, {
      title: `Ordinary active ${suffix}`,
      status: "active",
    });
    const planned = await createCard(project.id, {
      title: `Planned excluded ${suffix}`,
      status: "planned",
    });
    const done = await createCard(project.id, {
      title: `Done excluded ${suffix}`,
      status: "done",
    });
    const otherPinned = await createCard(otherProject.id, {
      title: `Other project pin ${suffix}`,
      status: "active",
    });
    const orderFirst = await createCard(project.id, {
      title: `Focus order first ${suffix}`,
      status: "active",
    });
    const unavailable = await createCard(project.id, {
      title: `Temporarily unavailable focus pin ${suffix}`,
      status: "planned",
    });
    const hidden = await createCard(otherProject.id, {
      title: `Filtered focus pin ${suffix}`,
      status: "active",
    });
    const orderLast = await createCard(project.id, {
      title: `Focus order last ${suffix}`,
      status: "active",
    });
    await setFocus([
      { project_id: project.id, card_id: pinned.metadata.id },
      { project_id: otherProject.id, card_id: otherPinned.metadata.id },
    ]);

    const context = await newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      requests.push(url);
      if (
        request.method() === "PUT" &&
        url.pathname === "/api/v1/workspace/focus"
      ) {
        const headers = request.headers();
        focusWrites.push({
          requestId: headers["x-request-id"],
          epoch: headers["x-command-epoch"],
          version: headers["if-match"],
          payload: request.postDataJSON(),
        });
      }
    });

    try {
      await check(
        "F01",
        "Focus has three ordered sections with precedence and preserved reasons",
        async () => {
          requests.length = 0;
          await routeFocus(page);
          assert.deepEqual(
            await page.locator("[data-focus-section] h2").allTextContents(),
            ["In focus", "Needs my attention", "In motion"],
          );

          const focus = section(page, "In focus");
          const attention = section(page, "Needs my attention");
          const motion = section(page, "In motion");
          await expect(cardText(focus, pinned)).toBeVisible();
          await expect(cardText(focus, otherPinned)).toBeVisible();
          await expect(cardText(attention, overdue)).toBeVisible();
          await expect(cardText(attention, review)).toBeVisible();
          await expect(cardText(attention, reviewOverdue)).toBeVisible();
          await expect(cardText(motion, ordinary)).toBeVisible();

          await expect(cardText(attention, pinned)).toHaveCount(0);
          await expect(cardText(motion, pinned)).toHaveCount(0);
          await expect(cardText(motion, overdue)).toHaveCount(0);
          await expect(cardText(motion, review)).toHaveCount(0);
          await expect(cardText(motion, reviewOverdue)).toHaveCount(0);
          await expect(cardText(motion, planned)).toHaveCount(0);
          await expect(cardText(motion, done)).toHaveCount(0);

          const pinnedReasons = focus
            .getByRole("button")
            .filter({ hasText: title(pinned) })
            .locator('[aria-label="Attention reasons"] .badge');
          await expect(pinnedReasons).toHaveText(["Overdue"]);
          const combinedReasons = attention
            .getByRole("button")
            .filter({ hasText: title(reviewOverdue) })
            .locator('[aria-label="Attention reasons"] .badge');
          await expect(combinedReasons).toHaveText(["Overdue", "Review"]);
          assert.equal(
            await attention
              .getByText(title(reviewOverdue), { exact: true })
              .count(),
            1,
            "Grouped attention must render a target once",
          );
          await page.screenshot({
            path: join(evidence, "F01-desktop.png"),
            fullPage: true,
          });
          return {
            sections: ["In focus", "Needs my attention", "In motion"],
            pinnedReason: "Overdue",
            groupedReasons: ["Overdue", "Review"],
          };
        },
        page,
      );

      await check(
        "F02",
        "Focus reads active cards with bounded pagination and skips milestones",
        async () => {
          const cardReads = requests.filter(cardListRequest);
          assert(cardReads.length > 0, "Focus must read an active card page");
          for (const url of cardReads) {
            assert.equal(url.searchParams.get("status"), "active");
            assert(
              Number(url.searchParams.get("limit")) <= 200,
              `Card read must stay bounded: ${url}`,
            );
          }
          const milestones = requests.filter(
            (url) =>
              url.pathname === "/api/v1/views/list" &&
              url.searchParams.get("type") === "milestone",
          );
          assert.equal(milestones.length, 0, "Focus must not load milestones");
          assert(
            requests.some((url) => url.pathname === "/api/v1/workspace/focus"),
            "Focus must read the workspace focus resource",
          );
          assert(
            requests.some((url) => url.pathname === "/api/v1/views/attention"),
            "Focus must read attention rows",
          );
          return { activeReads: cardReads.length, milestoneReads: 0 };
        },
        page,
      );

      await check(
        "F03",
        "Project and title filters keep focus cards scoped",
        async () => {
          await routeFocus(page, {
            project: project.id,
            q: `Pinned overdue ${suffix}`,
          });
          await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
            project.id,
          );
          await expect(
            page.getByLabel("Filter loaded titles", { exact: true }),
          ).toHaveValue(`Pinned overdue ${suffix}`);
          await expect(
            cardText(section(page, "In focus"), pinned),
          ).toBeVisible();
          await expect(
            cardText(section(page, "In focus"), otherPinned),
          ).toHaveCount(0);
          await expect(
            cardText(section(page, "Needs my attention"), overdue),
          ).toHaveCount(0);
          return { project: project.id, titleFilter: title(pinned) };
        },
        page,
      );

      await check(
        "F04",
        "Focus add action stays at the viewport bottom and opens a centered editor",
        async () => {
          await routeFocus(page, { project: project.id });
          await page.evaluate(() => {
            document.documentElement.style.minHeight = "2200px";
          });
          const viewports = [
            { width: 1440, height: 1000 },
            { width: 390, height: 844 },
            { width: 320, height: 844 },
          ];
          for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: join(evidence, `F04-${viewport.width}-focus.png`),
            });
            const add = focusButton(page);
            await expect(add).toHaveCount(1);
            await expect(add).toBeVisible();
            const before = await add.boundingBox();
            assert(before, "Focus add action must have a hitbox");
            assert(
              before.x >= 0 &&
                before.y >= 0 &&
                before.x + before.width <= viewport.width &&
                before.y + before.height <= viewport.height,
              "Focus add action must remain inside the viewport",
            );
            assert(before.x + before.width > viewport.width - 110);
            assert(before.y + before.height > viewport.height - 110);
            await page.evaluate(() =>
              window.scrollTo(0, document.body.scrollHeight),
            );
            const after = await add.boundingBox();
            assert(after, "Focus add action must remain rendered after scroll");
            assert(
              after.x >= 0 &&
                after.y >= 0 &&
                after.x + after.width <= viewport.width &&
                after.y + after.height <= viewport.height,
              "Focus add action must remain inside the viewport after scroll",
            );
            assert(
              Math.abs(after.y - before.y) <= 2,
              "Add action must remain fixed",
            );
            await page.screenshot({
              path: join(evidence, `F04-${viewport.width}-action.png`),
              fullPage: false,
            });

            await add.click();
            const modal = editor(page);
            await expect(modal).toBeVisible();
            const modalBox = await modal.boundingBox();
            assert(modalBox, "Create editor must be rendered");
            await page.screenshot({
              path: join(evidence, `F04-${viewport.width}-editor.png`),
              fullPage: false,
            });
            assert(
              Math.abs(modalBox.x + modalBox.width / 2 - viewport.width / 2) <=
                6,
              `Editor must be centered at ${viewport.width}px`,
            );
            await page.keyboard.press("Escape");
            await expect(modal).toBeHidden();
            assert.equal(
              await page.evaluate(() =>
                document.activeElement?.classList.contains("focus-add-action"),
              ),
              true,
              "Escape must restore focus to the Focus add action",
            );
          }
          return {
            viewports: viewports.map(
              ({ width, height }) => `${width}x${height}`,
            ),
          };
        },
        page,
      );

      await check(
        "F05",
        "Focus add action creates one autosaved card in the selected project",
        async () => {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await routeFocus(page, { project: project.id });
          const beforePosts = requests.filter(
            (url) => url.pathname === `${base}/cards`,
          ).length;
          const createdTitle = `Focus created card ${suffix}`;
          await focusButton(page).click();
          const modal = editor(page);
          const post = page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              new URL(response.url()).pathname === `${base}/cards`,
          );
          await modal.getByLabel("Title", { exact: true }).fill(createdTitle);
          const response = await post;
          assert.equal(response.status(), 200);
          const body = await response.json();
          const id = body.result.id;
          await expect(modal.getByTestId("autosave-status")).toHaveText(
            "Saved",
          );
          await expect
            .poll(() => cli("get", `${base}/cards/${id}`).metadata.title)
            .toBe(createdTitle);
          const afterPosts = requests.filter(
            (url) => url.pathname === `${base}/cards`,
          ).length;
          assert.equal(
            afterPosts - beforePosts,
            1,
            "Creation must issue one POST",
          );
          await page.keyboard.press("Escape");
          await expect(modal).toBeHidden();
          return { id, project: project.id, postCount: 1, autosaved: true };
        },
        page,
      );

      await check(
        "F06",
        "Inline Focus drag reorders visible cards and keeps hidden or unavailable pins in place",
        async () => {
          const items = [
            { project_id: project.id, card_id: orderFirst.metadata.id },
            { project_id: project.id, card_id: unavailable.metadata.id },
            { project_id: otherProject.id, card_id: hidden.metadata.id },
            { project_id: project.id, card_id: orderLast.metadata.id },
          ];
          await setFocus(items);
          const observed = cli("focus", "get");
          let unavailableReads = 0;
          const unavailablePath = `${config.origin}${base}/cards/${unavailable.metadata.id}`;
          await page.route(unavailablePath, async (route) => {
            if (route.request().method() !== "GET") return route.continue();
            unavailableReads++;
            return route.fulfill({
              status: 503,
              json: {
                api_version: "1",
                error: {
                  code: "RESOURCE_UNAVAILABLE",
                  message: "Synthetic unavailable card read",
                },
              },
            });
          });
          await routeFocus(page, { project: project.id });
          const startOrder = [
            orderFirst.metadata.id,
            unavailable.metadata.id,
            orderLast.metadata.id,
          ];
          await expect.poll(() => visibleFocusOrder(page)).toEqual(startOrder);
          assert(
            unavailableReads > 0,
            "The unavailable detail read was exercised",
          );
          await expect(focusCard(page, unavailable.metadata.id)).toContainText(
            "Unavailable pinned card",
          );
          await expect(focusCard(page, hidden.metadata.id)).toHaveCount(0);

          const writesBefore = focusWrites.length;
          const longClick = focusCard(page, orderFirst.metadata.id);
          const clickBox = await longClick.boundingBox();
          assert(clickBox, "The Focus title must have a hitbox");
          await page.mouse.move(
            clickBox.x + clickBox.width / 2,
            clickBox.y + clickBox.height / 2,
          );
          await page.mouse.down();
          await page.waitForTimeout(300);
          await page.mouse.up();
          await expect(editor(page)).toBeVisible();
          assert.equal(
            focusWrites.length,
            writesBefore,
            "A held ordinary click must not write focus order",
          );
          await page.keyboard.press("Escape");
          await expect(editor(page)).toBeHidden();

          await beginFocusDrag(
            page,
            orderLast.metadata.id,
            orderFirst.metadata.id,
          );
          await page.keyboard.press("Escape");
          await page.mouse.up();
          await expect(page.locator("[data-focus-drag-preview]")).toHaveCount(
            0,
          );
          await expect(page.locator("[data-focus-drop-indicator]")).toHaveCount(
            0,
          );
          assert.equal(
            focusWrites.length,
            writesBefore,
            "Escape must cancel a drag without writing focus order",
          );
          await expect.poll(() => visibleFocusOrder(page)).toEqual(startOrder);

          await focusCard(page, orderFirst.metadata.id).click();
          await expect(editor(page)).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(editor(page)).toBeHidden();
          assert.equal(
            focusWrites.length,
            writesBefore,
            "A click after Escape must still open the card without reordering",
          );

          await beginFocusDrag(
            page,
            orderLast.metadata.id,
            orderFirst.metadata.id,
          );
          await page.mouse.move(8, 8, { steps: 8 });
          await expect(page.locator("[data-focus-drop-indicator]")).toHaveCSS(
            "display",
            "none",
          );
          await page.mouse.up();
          assert.equal(
            focusWrites.length,
            writesBefore,
            "Dropping outside the Focus stack must not write an order",
          );
          await expect.poll(() => visibleFocusOrder(page)).toEqual(startOrder);

          await beginFocusDrag(
            page,
            orderFirst.metadata.id,
            orderFirst.metadata.id,
          );
          await page.mouse.up();
          await expect(editor(page)).toHaveCount(0);
          assert.equal(
            focusWrites.length,
            writesBefore,
            "Dropping in the original slot must not write focus order",
          );

          const putResponse = page.waitForResponse(
            (response) =>
              response.request().method() === "PUT" &&
              new URL(response.url()).pathname === "/api/v1/workspace/focus",
          );
          await beginFocusDrag(
            page,
            orderLast.metadata.id,
            orderFirst.metadata.id,
          );
          await page.screenshot({
            path: join(evidence, "F06-drag-preview.png"),
          });
          await page.mouse.up();
          const response = await putResponse;
          assert.equal(response.status(), 200);
          const expected = [items[3], items[1], items[2], items[0]];
          const saved = cli("focus", "get");
          assert.deepEqual(saved.items, expected);
          assert.deepEqual(focusWrites.at(-1).payload, { items: expected });
          assert.equal(focusWrites.at(-1).version, `"${observed.version}"`);
          await page.reload();
          await expect
            .poll(() => visibleFocusOrder(page))
            .toEqual([
              orderLast.metadata.id,
              unavailable.metadata.id,
              orderFirst.metadata.id,
            ]);
          assert.deepEqual(cli("focus", "get").items, expected);
          for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth),
              width,
            );
            const boxes = await focusCards(page).evaluateAll((nodes) =>
              nodes.map((node) => {
                const { top, bottom, left, right } =
                  node.getBoundingClientRect();
                return { top, bottom, left, right };
              }),
            );
            for (let i = 0; i < boxes.length; i++) {
              assert(boxes[i].left >= 0 && boxes[i].right <= width);
              if (i) assert(boxes[i].top >= boxes[i - 1].bottom);
            }
            await page.screenshot({
              path: join(evidence, `F06-stack-${width}.png`),
            });
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          return {
            hiddenPinRetainedAtSlot: 2,
            unavailablePinRetainedAtSlot: 1,
            conditionalPointerWrite: true,
            persistedAfterReload: true,
            clickAndEscapeDidNotWrite: true,
            outsideDropDidNotWrite: true,
          };
        },
        page,
      );

      await check(
        "F07",
        "A competing Focus refresh stays deferred during drag and a stale write cannot overwrite it",
        async () => {
          const initialItems = [
            { project_id: project.id, card_id: orderFirst.metadata.id },
            { project_id: project.id, card_id: pinned.metadata.id },
            { project_id: project.id, card_id: orderLast.metadata.id },
          ];
          await setFocus(initialItems);
          const observed = cli("focus", "get");
          await routeFocus(page, { project: project.id });
          await expect
            .poll(() => visibleFocusOrder(page))
            .toEqual(initialItems.map((item) => item.card_id));
          const focusReadsBefore = requests.filter(
            (url) => url.pathname === "/api/v1/workspace/focus",
          ).length;
          const writesBefore = focusWrites.length;
          await beginFocusDrag(
            page,
            orderLast.metadata.id,
            orderFirst.metadata.id,
          );
          const competingItems = [
            initialItems[1],
            initialItems[0],
            initialItems[2],
          ];
          await mutate(
            "PUT",
            "/api/v1/workspace/focus",
            { items: competingItems },
            observed.version,
          );
          await expect
            .poll(
              () =>
                requests.filter(
                  (url) => url.pathname === "/api/v1/workspace/focus",
                ).length,
            )
            .toBeGreaterThan(focusReadsBefore);
          await expect
            .poll(() => visibleFocusOrder(page))
            .toEqual(initialItems.map((item) => item.card_id));
          await expect(page.locator("[data-focus-drag-preview]")).toBeVisible();
          const conflictResponse = page.waitForResponse(
            (response) =>
              response.request().method() === "PUT" &&
              new URL(response.url()).pathname === "/api/v1/workspace/focus",
          );
          await page.mouse.up();
          const response = await conflictResponse;
          assert.equal(response.status(), 412);
          assert.equal(focusWrites.length, writesBefore + 1);
          assert.equal(focusWrites.at(-1).version, `"${observed.version}"`);
          assert.deepEqual(
            cli("focus", "get").items,
            competingItems,
            "The stale drag must not overwrite the competing full order",
          );
          await expect(
            section(page, "In focus").getByRole("alert"),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Reload focus order", exact: true })
            .click();
          await expect
            .poll(() => visibleFocusOrder(page))
            .toEqual(competingItems.map((item) => item.card_id));
          assert.equal(
            focusWrites.length,
            writesBefore + 1,
            "Reloading after a conflict must not create another write",
          );
          return {
            deferredReadWhileHeld: true,
            conditionalVersionRejected: true,
            competingOrderPreserved: true,
          };
        },
        page,
      );

      await check(
        "F08",
        "Focus keeps an uncertain command identity across workspace navigation",
        async () => {
          const items = [
            { project_id: project.id, card_id: orderFirst.metadata.id },
            { project_id: project.id, card_id: orderLast.metadata.id },
          ];
          await setFocus(items);
          const observed = cli("focus", "get");
          await routeFocus(page, { project: project.id });
          await expect
            .poll(() => visibleFocusOrder(page))
            .toEqual(items.map((item) => item.card_id));

          const attempts = [];
          let interceptionError;
          let committedVersion;
          const focusPath = `${config.origin}/api/v1/workspace/focus`;
          await page.route(focusPath, async (route) => {
            if (route.request().method() !== "PUT") return route.continue();
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
              if (attempts.length > 1)
                assert.deepEqual(
                  attempt,
                  attempts[0],
                  "Focus retry must keep the original identity and payload",
                );
              const response = await route.fetch();
              assert.equal(response.status(), 200);
              if (attempts.length === 1) {
                committedVersion = cli("focus", "get").version;
                await route.abort("failed");
              } else await route.fulfill({ response });
            } catch (cause) {
              interceptionError = cause;
              await route.abort("failed").catch(() => {});
            }
          });
          const writesBefore = focusWrites.length;
          await beginFocusDrag(
            page,
            orderLast.metadata.id,
            orderFirst.metadata.id,
          );
          await page.mouse.up();
          await expect(
            page.getByRole("button", {
              name: "Retry same command",
              exact: true,
            }),
          ).toBeVisible();
          assert.equal(attempts.length, 1);
          assert.equal(interceptionError, undefined);
          assert.equal(attempts[0].version, `"${observed.version}"`);

          const navigation = page.getByRole("navigation", {
            name: "Workspace views",
          });
          await navigation
            .getByRole("button", { name: "Board", exact: true })
            .click();
          await expect(
            navigation.getByRole("button", { name: "Board", exact: true }),
          ).toHaveAttribute("aria-current", "page");
          await navigation
            .getByRole("button", { name: "Focus", exact: true })
            .click();
          await expect(focusCard(page, orderLast.metadata.id)).toBeVisible();
          const retry = page.getByRole("button", {
            name: "Retry same command",
            exact: true,
          });
          await expect(retry).toBeEnabled();
          await retry.click();
          await expect.poll(() => attempts.length).toBe(2);
          await expect(retry).toHaveCount(0);
          assert.equal(interceptionError, undefined);
          assert.equal(focusWrites.length, writesBefore + 2);
          assert.deepEqual(attempts[1], attempts[0]);
          const expected = [items[1], items[0]];
          assert.deepEqual(attempts[0].payload, { items: expected });
          assert.deepEqual(cli("focus", "get").items, expected);
          assert.equal(
            cli("focus", "get").version,
            committedVersion,
            "Retrying the committed command must not create a second focus version",
          );
          const command = cli(
            "get",
            `/api/v1/commands/${attempts[0].requestId}?epoch=${encodeURIComponent(attempts[0].epoch)}`,
          );
          assert.equal(command.state, "committed");
          await page.unroute(focusPath);
          return {
            retries: attempts.length,
            sameRequestIdAndEpoch: true,
            samePayloadAndVersion: true,
            navigationPreservedPendingCommand: true,
          };
        },
        page,
      );
    } finally {
      await page.close();
      await context.close();
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ results, errors }, null, 2),
      );
      if (results.some((result) => result.status === "fail"))
        process.exitCode = 1;
      if (errors.length) process.exitCode = 1;
    }
  },
);
