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
    await setFocus([
      { project_id: project.id, card_id: pinned.metadata.id },
      { project_id: otherProject.id, card_id: otherPinned.metadata.id },
    ]);

    const context = await newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      requests.push(new URL(request.url()));
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
