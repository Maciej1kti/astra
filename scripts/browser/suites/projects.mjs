/** Project status board through ordinary paired reads and conditional commands. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const input = join(runtime, "projects-command.json");
    const projects = config.projects.map((project, index) => ({
      ...project,
      title: [
        "Active Projects project — a long wrapping title with Zażółć gęślą jaźń",
        "Paused Projects project",
        "Archived Projects project",
      ][index],
      state: ["active", "paused", "archived"][index],
      group: index === 2 ? "Projects archive" : "Projects work",
      path: `/api/v1/projects/${project.id}`,
    }));
    async function mutate(path, payload, version) {
      await writeFile(input, JSON.stringify(payload), { mode: 0o600 });
      return cli(
        "command",
        "PATCH",
        path,
        "--json-file",
        input,
        "--if-version",
        version,
      ).result.resource;
    }
    for (const project of projects)
      await mutate(
        project.path,
        {
          set: {
            name: project.title,
            state: project.state,
            folder: project.group,
          },
        },
        cli("get", project.path).version,
      );

    const context = await newContext({ hasTouch: true, colorScheme: "light" });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const checks = [],
      errors = [],
      requests = [],
      writes = [],
      activeReads = new Set();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfinished", (request) => activeReads.delete(request));
    page.on("requestfailed", (request) => activeReads.delete(request));
    page.on("request", (request) => {
      const url = new URL(request.url());
      const record = { method: request.method(), path: url.pathname, url };
      requests.push(record);
      if (
        record.method === "GET" &&
        record.path.startsWith("/api/v1/") &&
        record.path !== "/api/v1/events"
      )
        activeReads.add(request);
      if (
        record.method === "PATCH" &&
        /^\/api\/v1\/projects\/[^/]+$/.test(record.path)
      ) {
        const headers = request.headers();
        writes.push({
          path: record.path,
          requestId: headers["x-request-id"],
          epoch: headers["x-command-epoch"],
          version: headers["if-match"],
          payload: request.postDataJSON(),
        });
      }
    });
    await page.addInitScript(() => {
      window.projectsCsp = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        window.projectsCsp.push(event.effectiveDirective),
      );
    });
    const board = page.getByRole("region", {
      name: "Project status board",
      exact: true,
    });
    const column = (state) => board.locator(`[data-project-state="${state}"]`);
    const tile = (project) =>
      board.locator(`[data-project-board-item="${project.id}"]`);
    const handle = (project) =>
      tile(project).locator("[data-project-board-handle]");
    const moveMenu = (project) =>
      tile(project).getByRole("button", {
        name: `Move ${project.title}`,
        exact: true,
      });
    const moveDialog = page.getByRole("dialog", {
      name: "Move project",
      exact: true,
    });
    const editor = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    async function idle() {
      await expect.poll(() => activeReads.size).toBe(0);
    }
    async function openProjects(view = "projects") {
      await page.goto(`${config.origin}/?view=${view}`);
      await expect(board).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
      await idle();
    }
    async function expectState(project, state) {
      await expect(
        column(state).locator(`[data-project-board-item="${project.id}"]`),
      ).toBeVisible();
      assert.equal(cli("get", project.path).metadata.state, state);
    }
    async function menuMove(project, state, { touch = false } = {}) {
      const trigger = moveMenu(project);
      if (touch) await trigger.tap();
      else {
        await trigger.focus();
        await trigger.press("Enter");
      }
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const action = tile(project).getByRole("button", {
        name: `Move to ${state[0].toUpperCase()}${state.slice(1)}`,
        exact: true,
      });
      await expect(action).toBeEnabled();
      if (touch) await action.tap();
      else await action.press("Enter");
    }
    async function beginDrag(project, state) {
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await handle(project).scrollIntoViewIfNeeded();
      const source = await handle(project).boundingBox();
      const destination = await column(state).boundingBox();
      assert(
        source && destination,
        "Project grip and status column must be rendered",
      );
      const target = {
        x: destination.x + destination.width / 2,
        y: Math.min(destination.y + 90, destination.y + destination.height / 2),
      };
      await page.mouse.move(
        source.x + source.width / 2,
        source.y + source.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 12 });
      await expect(
        page.locator("[data-project-board-drag-preview]"),
      ).toBeVisible();
      return { source, target };
    }
    async function capture(name) {
      if (browser.browserType().name() !== "chromium") return;
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await expect
        .poll(() =>
          page
            .getByRole("navigation", {
              name: "Workspace views",
              exact: true,
            })
            .evaluate((navigation) => {
              const selected = navigation.querySelector(
                '[aria-current="page"]',
              );
              const indicator = navigation.querySelector(
                ".navigation-indicator",
              );
              if (!selected || !indicator) return Infinity;
              const item = selected.getBoundingClientRect();
              const surface = indicator.getBoundingClientRect();
              return Math.max(
                ...["x", "y", "width", "height"].map((property) =>
                  Math.abs(item[property] - surface[property]),
                ),
              );
            }),
        )
        .toBeLessThan(1.5);
      await page.screenshot({
        path: join(evidence, `${name}.png`),
        fullPage: true,
      });
    }
    function expectWrite(project, state, version) {
      const write = writes.at(-1);
      assert.equal(write.path, project.path);
      assert.equal(write.version, `"${version}"`);
      assert.deepEqual(write.payload, { set: { state } });
      assert.match(write.requestId, /^[a-f0-9-]{36}$/i);
      assert.equal(typeof write.epoch, "string");
      assert(write.epoch);
    }
    try {
      await openProjects("main");
      await expect(page).toHaveURL(/view=projects/);
      await expect(
        page
          .getByRole("navigation", { name: "Workspace views", exact: true })
          .getByRole("button", { name: "Projects", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByRole("button", { name: "Main", exact: true }),
      ).toHaveCount(0);
      const projectShortcut = page
        .getByRole("navigation", { name: "Workspace views", exact: true })
        .getByRole("button", { name: "Projects", exact: true });
      await expect(projectShortcut.locator("svg path")).toHaveAttribute(
        "d",
        "M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
      );
      checks.push(
        "legacy Main URLs resolve to the Projects board and select the existing Projects shortcut",
      );
      await expect(board.locator("[data-project-state] h2")).toHaveText([
        "Active",
        "Paused",
        "Archived",
      ]);
      for (const project of projects) await expectState(project, project.state);
      await expect(board.locator("[data-project-board-item]")).toHaveCount(3);
      assert.equal(
        requests.filter(
          ({ method, path, url }) =>
            method === "GET" &&
            (path.includes("/cards") ||
              path === "/api/v1/views/focus-cards" ||
              path === "/api/v1/views/board" ||
              (path === "/api/v1/views/list" &&
                url.searchParams.get("type") === "card")),
        ).length,
        0,
        "Project board items come from the project summaries without card reads",
      );
      await capture("projects-desktop-light");
      checks.push(
        "all three project states include archived projects without card reads",
      );

      const navigation = page.getByRole("navigation", {
        name: "Workspace views",
        exact: true,
      });
      await navigation
        .getByRole("button", { name: "Focus", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "In focus", exact: true }),
      ).toBeVisible();
      await idle();
      await expect(
        page
          .getByLabel("Folder", { exact: true })
          .locator('option[value="Projects archive"]'),
      ).toHaveCount(0);
      await navigation
        .getByRole("button", { name: "Projects", exact: true })
        .click();
      for (const project of projects) await expectState(project, project.state);
      await idle();
      await expect(
        navigation.getByRole("button", { name: "Main", exact: true }),
      ).toHaveCount(0);
      checks.push(
        "Focus restores ordinary project summaries and Projects restores the complete status board without a separate Main shortcut",
      );

      const folder = page.getByLabel("Folder", { exact: true });
      const search = page.getByLabel("Filter loaded titles", { exact: true });
      const readsBeforeFilters = requests.filter(
        ({ method }) => method === "GET",
      ).length;
      await folder.selectOption("Projects work");
      await expect(tile(projects[2])).toHaveCount(0);
      await expect(tile(projects[0])).toBeVisible();
      await expect(tile(projects[1])).toBeVisible();
      await search.fill("paused projects");
      await expect(tile(projects[1])).toBeVisible();
      await expect(tile(projects[0])).toHaveCount(0);
      await search.fill("missing Projects project");
      await expect(board.locator("[data-project-board-item]")).toHaveCount(0);
      await search.fill("");
      await folder.selectOption("");
      await expect(board.locator("[data-project-board-item]")).toHaveCount(3);
      // Search normally debounces transport; Projects already loaded titles stay local.
      await page.waitForTimeout(350);
      assert.equal(
        requests.filter(({ method }) => method === "GET").length,
        readsBeforeFilters,
        "Changing Projects title and folder filters must not request project or card pages",
      );
      checks.push(
        "title and folder filters remain local and combine correctly",
      );

      const freshProject = projects[2];
      const freshName = `${freshProject.title} updated externally`;
      await mutate(
        freshProject.path,
        { set: { name: freshName } },
        cli("get", freshProject.path).version,
      );
      const authoritative = cli("get", freshProject.path);
      const readsBeforeOpen = requests.filter(
        ({ method, path }) => method === "GET" && path === freshProject.path,
      ).length;
      await tile(freshProject)
        .locator("[data-project-board-open]")
        .press("Enter");
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(
        freshName,
      );
      assert.equal(
        cli("get", freshProject.path).version,
        authoritative.version,
      );
      assert.equal(
        requests.filter(
          ({ method, path }) => method === "GET" && path === freshProject.path,
        ).length,
        readsBeforeOpen + 1,
        "Opening a Projects summary must read the current project source exactly once",
      );
      freshProject.title = freshName;
      await editor
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await idle();
      checks.push("project tile opens its fresh source in the project editor");

      const moving = projects[0];
      const beforeCancelled = cli("get", moving.path);
      const writesBeforeCancelled = writes.length;
      await beginDrag(moving, "paused");
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(
        page.locator("[data-project-board-drag-preview]"),
      ).toHaveCount(0);
      await expectState(moving, "active");
      assert.equal(writes.length, writesBeforeCancelled);
      assert.equal(cli("get", moving.path).version, beforeCancelled.version);
      await tile(moving).locator("[data-project-board-open]").click();
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(
        moving.title,
      );
      await editor
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      assert.equal(writes.length, writesBeforeCancelled);
      await beginDrag(moving, "paused");
      await capture("projects-pointer-drag");
      await page.mouse.up();
      await expectState(moving, "paused");
      await expect(moveDialog).toHaveCount(0);
      expectWrite(moving, "paused", beforeCancelled.version);
      await idle();
      checks.push(
        "pointer status movement uses observed version and Escape performs no write",
      );

      const beforeKeyboard = cli("get", projects[1].path);
      await menuMove(projects[1], "archived");
      await expectState(projects[1], "archived");
      expectWrite(projects[1], "archived", beforeKeyboard.version);
      await idle();
      await page.reload();
      await expectState(projects[1], "archived");
      await expectState(moving, "paused");
      await idle();
      checks.push(
        "keyboard status menu moves projects and grouping persists on reload",
      );

      const conflicted = projects[1];
      const observed = cli("get", conflicted.path);
      let conflictAttempt, interceptionError;
      await page.route(`${config.origin}${conflicted.path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        try {
          conflictAttempt = writes.at(-1);
          await mutate(
            conflicted.path,
            { set: { state: "paused" } },
            observed.version,
          );
          const reply = await route.fetch();
          assert.equal(reply.status(), 412);
          assert.equal((await reply.json()).error.code, "VERSION_CONFLICT");
          await route.fulfill({ response: reply });
        } catch (cause) {
          interceptionError = cause;
          await route.abort("failed").catch(() => {});
        }
      });
      const writesBeforeConflict = writes.length;
      await menuMove(conflicted, "active");
      await expect(moveDialog).toBeVisible();
      await expect(moveDialog).toContainText("The project changed.");
      assert.equal(interceptionError, undefined);
      assert.equal(writes.length, writesBeforeConflict + 1);
      assert.equal(conflictAttempt.version, `"${observed.version}"`);
      assert.deepEqual(conflictAttempt.payload, { set: { state: "active" } });
      assert.equal(cli("get", conflicted.path).metadata.state, "paused");
      await moveDialog
        .getByRole("button", { name: "Close move project", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.unroute(`${config.origin}${conflicted.path}`);
      await page.reload();
      await expectState(conflicted, "paused");
      await idle();
      assert.equal(
        writes.length,
        writesBeforeConflict + 1,
        "Conflict recovery must not refetch and overwrite",
      );
      checks.push(
        "a competing conditional status write is preserved after stale proposal rejection",
      );

      const uncertain = projects[2];
      const beforeUncertain = cli("get", uncertain.path);
      const attempts = [];
      let committedVersion;
      interceptionError = undefined;
      await page.route(`${config.origin}${uncertain.path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        try {
          attempts.push(writes.at(-1));
          if (attempts.length > 1)
            assert.deepEqual(
              attempts.at(-1),
              attempts[0],
              "Status retry retains request ID, epoch, version and payload",
            );
          const reply = await route.fetch();
          assert.equal(reply.status(), 200);
          if (attempts.length === 1) {
            committedVersion = cli("get", uncertain.path).version;
            await route.abort("failed");
          } else await route.fulfill({ response: reply });
        } catch (cause) {
          interceptionError = cause;
          await route.abort("failed").catch(() => {});
        }
      });
      await menuMove(uncertain, "active");
      const retry = moveDialog.getByRole("button", {
        name: "Retry same command",
        exact: true,
      });
      await expect(retry).toBeEnabled();
      await expect(
        moveDialog.getByRole("button", { name: "Check status", exact: true }),
      ).toBeEnabled();
      assert.equal(interceptionError, undefined);
      assert.equal(attempts.length, 1);
      expectWrite(uncertain, "active", beforeUncertain.version);
      await expect(moveDialog).toContainText(attempts[0].requestId);
      await retry.click();
      await expect(moveDialog).toHaveCount(0);
      await expectState(uncertain, "active");
      assert.equal(interceptionError, undefined);
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0]);
      assert.equal(
        cli("get", uncertain.path).version,
        committedVersion,
        "Retry must not create a second source version",
      );
      assert.equal(
        cli(
          "get",
          `/api/v1/commands/${attempts[0].requestId}?epoch=${encodeURIComponent(attempts[0].epoch)}`,
        ).state,
        "committed",
      );
      await page.unroute(`${config.origin}${uncertain.path}`);
      await idle();
      checks.push(
        "lost response retries the identical committed command without a second version",
      );

      const beforeStatusRecovery = cli("get", uncertain.path);
      const statusAttempts = [];
      const requestsBeforeStatusRecovery = requests.length;
      interceptionError = undefined;
      await page.route(`${config.origin}${uncertain.path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        try {
          statusAttempts.push(writes.at(-1));
          const reply = await route.fetch();
          assert.equal(reply.status(), 200);
          committedVersion = cli("get", uncertain.path).version;
          await route.abort("failed");
        } catch (cause) {
          interceptionError = cause;
          await route.abort("failed").catch(() => {});
        }
      });
      await menuMove(uncertain, "paused");
      const checkStatus = moveDialog.getByRole("button", {
        name: "Check status",
        exact: true,
      });
      await expect(checkStatus).toBeEnabled();
      assert.equal(interceptionError, undefined);
      assert.equal(statusAttempts.length, 1);
      expectWrite(uncertain, "paused", beforeStatusRecovery.version);
      await checkStatus.click();
      await expect(moveDialog).toHaveCount(0);
      await expectState(uncertain, "paused");
      const statusReads = requests
        .slice(requestsBeforeStatusRecovery)
        .filter(
          ({ method, path }) =>
            method === "GET" && path.startsWith("/api/v1/commands/"),
        );
      assert.equal(statusReads.length, 1);
      assert.equal(
        statusReads[0].path,
        `/api/v1/commands/${statusAttempts[0].requestId}`,
      );
      assert.equal(
        statusReads[0].url.searchParams.get("epoch"),
        statusAttempts[0].epoch,
      );
      assert.equal(
        statusAttempts.length,
        1,
        "Checking status must not resend the project command",
      );
      assert.equal(cli("get", uncertain.path).version, committedVersion);
      await page.unroute(`${config.origin}${uncertain.path}`);
      await idle();
      checks.push(
        "Check status resolves a lost committed response using the original request ID and epoch",
      );

      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(board).toBeVisible();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `Projects has no page overflow at ${width}px`,
        );
        const targets = await board
          .locator("[data-project-board-handle], .action-menu > button")
          .evaluateAll((buttons) =>
            buttons.map((button) => ({
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            })),
          );
        assert(
          targets.every(
            ({ width: targetWidth, height }) =>
              targetWidth >= 44 && height >= 44,
          ),
          `Projects movement controls remain touch sized at ${width}px`,
        );
        if (width <= 390) await tile(moving).scrollIntoViewIfNeeded();
        await capture(`projects-light-${width}`);
      }
      const beforeTouchMenu = cli("get", uncertain.path);
      await page.setViewportSize({ width: 390, height: 1000 });
      await menuMove(uncertain, "archived", { touch: true });
      await expectState(uncertain, "archived");
      expectWrite(uncertain, "archived", beforeTouchMenu.version);
      await idle();
      checks.push(
        "320 and 390 px layouts retain reachable status menus and touch targets",
      );

      if (browser.browserType().name() === "chromium") {
        // A wide touch viewport keeps both status destinations on screen.
        await page.setViewportSize({ width: 1440, height: 1000 });
        const session = await context.newCDPSession(page);
        const source = await handle(uncertain).boundingBox();
        const destination = await column("active").boundingBox();
        assert(source && destination);
        const start = {
          x: source.x + source.width / 2,
          y: source.y + source.height / 2,
        };
        const end = {
          x: destination.x + destination.width / 2,
          y: destination.y + 90,
        };
        const touch = (type, point) =>
          session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints:
              type === "touchEnd" || type === "touchCancel" ? [] : [point],
          });
        const beforeTouchDrag = cli("get", uncertain.path);
        const writesBeforeTouchCancel = writes.length;
        await touch("touchStart", start);
        for (let step = 1; step <= 10; step++)
          await touch("touchMove", {
            x: start.x + ((end.x - start.x) * step) / 10,
            y: start.y + ((end.y - start.y) * step) / 10,
          });
        await expect(
          page.locator("[data-project-board-drag-preview]"),
        ).toBeVisible();
        await touch("touchCancel");
        await expect(
          page.locator("[data-project-board-drag-preview]"),
        ).toHaveCount(0);
        assert.equal(writes.length, writesBeforeTouchCancel);
        assert.equal(
          cli("get", uncertain.path).version,
          beforeTouchDrag.version,
        );
        await touch("touchStart", start);
        for (let step = 1; step <= 10; step++)
          await touch("touchMove", {
            x: start.x + ((end.x - start.x) * step) / 10,
            y: start.y + ((end.y - start.y) * step) / 10,
          });
        await touch("touchEnd");
        await expectState(uncertain, "active");
        expectWrite(uncertain, "active", beforeTouchDrag.version);
        await session.detach();
        await idle();
        checks.push(
          "Chromium touch drag changes status while touch cancellation performs no write",
        );
      }

      await page
        .getByRole("button", { name: "Workspace settings", exact: true })
        .click();
      const settings = page.getByRole("dialog", {
        name: "Workspace settings",
        exact: true,
      });
      await settings.getByLabel("Theme", { exact: true }).selectOption("dark");
      await settings
        .getByRole("button", { name: "Close settings", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await capture("projects-desktop-dark");
      await page.setViewportSize({ width: 320, height: 1000 });
      await capture("projects-phone-dark");
      await page
        .getByRole("button", { name: "Workspace settings", exact: true })
        .click();
      await expect(
        settings.getByLabel("Default view", { exact: true }),
      ).toBeEnabled();
      const defaultView = settings.getByLabel("Default view", { exact: true });
      await expect(defaultView.locator('option[value="main"]')).toHaveCount(0);
      await expect(defaultView.locator('option[value="projects"]')).toHaveText(
        "Projects",
      );
      await defaultView.selectOption("projects");
      await settings
        .getByRole("button", { name: "Save preferences", exact: true })
        .click();
      await expect(settings).toHaveCount(0);
      await idle();
      await page.goto(config.origin);
      await expect(board).toBeVisible();
      assert.equal(
        cli("get", "/api/v1/workspace/preferences").preferences.default_view,
        "projects",
      );
      await page.reload();
      await expect(board).toBeVisible();
      checks.push(
        "Projects is the durable default-view preference, Main has no option and light/dark rendered surfaces are captured",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.projectsCsp), []);
    } catch (cause) {
      await writeFile(
        join(evidence, "failure.txt"),
        await page.locator("body").ariaSnapshot(),
      );
      await capture("projects-failure").catch(() => {});
      throw cause;
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { checks, errors, engine: browser.browserType().name(), writes },
          null,
          2,
        ) + "\n",
      );
      await context.close();
    }
  },
);
