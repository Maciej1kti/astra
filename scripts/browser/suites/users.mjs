/** Trusted profiles keep content scopes separate on an ordinarily paired host. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext }) => {
    const context = await newContext();
    const page = await context.newPage();
    const retained = await context.newPage();
    page.setDefaultTimeout(12000);
    retained.setDefaultTimeout(12000);
    const errors = [];
    for (const tab of [page, retained])
      tab.on("pageerror", (error) => errors.push(error.message));
    const results = [];
    const owner = cli("users").items.find((user) => user.is_default);
    assert(owner, "Existing data must have a default Owner profile");
    const name = "Trusted colleague — browser QA";
    let profile;
    let project;
    let card;
    async function ready(tab = page) {
      await expect(tab.locator("header.topbar")).toBeVisible();
      await expect(tab.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
    }
    async function screenshot(name) {
      if (browser.browserType().name() === "webkit") return;
      await page.bringToFront();
      await expect(
        page.getByText("Loading resources…", { exact: true }),
      ).toHaveCount(0);
      await page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
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
      await page.screenshot({ path: join(evidence, name), fullPage: true });
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
        dialog.getByLabel("Current user", { exact: true }),
      ).toBeEnabled();
      return dialog;
    }
    async function selectedFetch(path, id) {
      return page.evaluate(
        async ({ path, id }) => {
          const response = await fetch(path, {
            headers: { "X-Astra-User": id },
          });
          return { status: response.status, body: await response.json() };
        },
        { path, id },
      );
    }
    async function check(id, run) {
      const start = Date.now();
      try {
        results.push({
          id,
          status: "pass",
          detail: await run(),
          ms: Date.now() - start,
        });
      } catch (error) {
        results.push({
          id,
          status: "fail",
          error: String(error),
          ms: Date.now() - start,
        });
        if (browser.browserType().name() !== "webkit")
          await page
            .screenshot({
              path: join(evidence, `${id}-failure.png`),
              fullPage: true,
            })
            .catch(() => {});
      }
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ) + "\n",
      );
      if (results.at(-1).status === "fail") throw new Error(`${id} failed`);
    }
    try {
      await page.goto(`${config.origin}/?view=projects`);
      await ready();
      await retained.goto(`${config.origin}/?view=projects`);
      await ready(retained);
      await check("create-profile", async () => {
        const dialog = await settings();
        await expect(
          dialog.getByLabel("Current user", { exact: true }),
        ).toHaveValue(owner.id);
        await dialog.getByLabel("New user name", { exact: true }).fill(name);
        const requests = [];
        await page.route("**/api/v1/users", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const request = route.request();
          requests.push({
            body: request.postData(),
            id: request.headers()["x-request-id"],
            epoch: request.headers()["x-command-epoch"],
            user: request.headers()["x-astra-user"],
          });
          if (requests.length > 1) return route.continue();
          const response = await route.fetch();
          assert.equal(response.status(), 201);
          await route.abort("failed");
        });
        await page.route("**/api/v1/commands/**", (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "SERVER_BUSY" } }),
          }),
        );
        await dialog
          .getByRole("button", { name: "Add user", exact: true })
          .click();
        await expect
          .poll(() => cli("users").items.find((user) => user.name === name)?.id)
          .toBeTruthy();
        await expect(
          dialog.getByText("User creation is awaiting confirmation.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Switch user", exact: true }),
        ).toBeDisabled();
        await page.unroute("**/api/v1/commands/**");
        await dialog
          .getByRole("button", { name: "Retry same command", exact: true })
          .click();
        await expect(
          dialog.getByText(
            "User added. Switch to their workspace when you are ready.",
            { exact: true },
          ),
        ).toBeVisible();
        assert.equal(requests.length, 2);
        assert.deepEqual(requests[0], requests[1]);
        assert.equal(requests[0].user, owner.id);
        await page.unroute("**/api/v1/users");
        profile = cli("users").items.find((user) => user.name === name);
        assert(!profile.is_default);
        await expect(
          dialog
            .getByLabel("Current user", { exact: true })
            .locator("option", { hasText: name }),
        ).toHaveCount(1);
        await expect(
          dialog.getByLabel("Current user", { exact: true }),
        ).toHaveValue(profile.id);
        const profileCli = (...args) => cli(...args, "--user", profile.id);
        const folder = join(config.temp, "Colleague project");
        await mkdir(folder, { mode: 0o700 });
        const plan = profileCli(
          "registration-plan",
          folder,
          "--name",
          "Colleague project",
        );
        const registered = profileCli("register", plan.plan_id);
        if (registered.job_id)
          await expect
            .poll(() => profileCli("job", registered.job_id).state)
            .toBe("done");
        project = plan.project_id;
        const payload = join(runtime, "user-card.json");
        await writeFile(
          payload,
          JSON.stringify({ title: "Colleague-only work", status: "active" }),
          { mode: 0o600 },
        );
        card = profileCli(
          "command",
          "POST",
          `/api/v1/projects/${project}/cards`,
          "--json-file",
          payload,
        ).result.resource.metadata.id;
        const roots = join(config.temp, "Colleague approved root");
        await mkdir(roots, { mode: 0o700 });
        profileCli("add-root", roots, "--label", "Colleague folders");
        assert.equal(profileCli("projects").items.length, 1);
        assert.equal(cli("projects").items.length, config.projects.length);
        return {
          profile: profile.id,
          ownerPreserved: true,
          separateProject: project,
          lostAcknowledgementReplayed: true,
        };
      });

      await check("keyboard-switch", async () => {
        const dialog = page.getByRole("dialog", {
          name: "Workspace settings",
          exact: true,
        });
        const timezone = dialog.getByLabel("Timezone", { exact: true });
        const original = await timezone.inputValue();
        await dialog
          .getByLabel("Current user", { exact: true })
          .selectOption(profile.id);
        await timezone.fill(original === "UTC" ? "Europe/Warsaw" : "UTC");
        await expect(
          dialog.getByRole("button", { name: "Switch user", exact: true }),
        ).toBeDisabled();
        await timezone.fill(original);
        await expect(
          dialog.getByRole("button", { name: "Switch user", exact: true }),
        ).toBeEnabled();
        await page.setViewportSize({ width: 320, height: 844 });
        const metrics = await dialog.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return {
            viewport: innerWidth,
            x: bounds.x,
            right: bounds.right,
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
        assert(metrics.x >= 0 && metrics.right <= metrics.viewport);
        assert.equal(metrics.scrollWidth, metrics.viewport);
        await screenshot("users-settings-320.png");
        const navigation = page.waitForEvent("load");
        await dialog
          .getByRole("button", { name: "Switch user", exact: true })
          .focus();
        await page.keyboard.press("Enter");
        await navigation;
        await ready();
        await expect(page.locator(".current-user")).toHaveText(name);
        await page.goto(`${config.origin}/?view=projects`);
        await ready();
        await expect(
          page.getByText("Colleague project", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByText(config.projects[0].title, { exact: true }),
        ).toHaveCount(0);
        return {
          dirtySwitchBlocked: true,
          keyboardSwitch: true,
          narrow: metrics,
        };
      });

      await check("profile-read-scope", async () => {
        const own = await selectedFetch(
          `/api/v1/projects/${project}/cards/${card}`,
          profile.id,
        );
        assert.equal(own.status, 200);
        const foreign = await selectedFetch(
          `/api/v1/projects/${config.projects[0].id}`,
          profile.id,
        );
        assert.equal(foreign.status, 404);
        const reverse = await selectedFetch(
          `/api/v1/projects/${project}`,
          owner.id,
        );
        assert.equal(reverse.status, 404);
        const roots = await selectedFetch("/api/v1/roots", profile.id);
        assert.equal(roots.status, 200);
        assert.equal(roots.body.items.length, 1);
        assert.equal(roots.body.items[0].label, "Colleague folders");
        const ownerRoots = await selectedFetch("/api/v1/roots", owner.id);
        assert.equal(ownerRoots.body.items.length, 0);
        return { foreignResourceNotInWorkspace: true, rootsSeparate: true };
      });

      await check("profile-comment-attribution", async () => {
        await page.goto(
          `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card })}`,
        );
        const dialog = page.getByRole("dialog", {
          name: "Edit resource",
          exact: true,
        });
        const section = dialog.getByRole("region", {
          name: "Card comments",
          exact: true,
        });
        await section
          .getByRole("textbox", { name: "Write a comment", exact: true })
          .fill("Reply from this selected profile");
        await section
          .getByRole("button", { name: "Add comment", exact: true })
          .click();
        await expect
          .poll(
            () =>
              cli(
                "get",
                `/api/v1/projects/${project}/cards/${card}`,
                "--user",
                profile.id,
              ).metadata.comments?.length,
          )
          .toBe(1);
        const comment = cli(
          "get",
          `/api/v1/projects/${project}/cards/${card}`,
          "--user",
          profile.id,
        ).metadata.comments[0];
        assert.equal(comment.author.kind, "human");
        assert.equal(comment.author.label, name);
        await expect(section.getByText(name, { exact: true })).toBeVisible();
        await dialog
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await page.goto(`${config.origin}/?view=projects`);
        await ready();
        return { selectedProfileAuthor: true };
      });

      await check("reload-and-tabs", async () => {
        await page.reload();
        await ready();
        await expect(page.locator(".current-user")).toHaveText(name);
        const bootstrap = await selectedFetch("/api/v1/bootstrap", profile.id);
        assert.equal(bootstrap.body.user.id, profile.id);
        await retained.reload();
        await ready(retained);
        await expect(retained.locator(".current-user")).toHaveText(owner.name);
        await expect(
          retained.getByText(config.projects[0].title, { exact: true }).first(),
        ).toBeVisible();
        const fresh = await context.newPage();
        fresh.on("pageerror", (error) => errors.push(error.message));
        await fresh.goto(`${config.origin}/?view=projects`);
        await ready(fresh);
        await expect(fresh.locator(".current-user")).toHaveText(name);
        await fresh.close();
        await screenshot("users-projects-320.png");
        return {
          reloadKeepsProfile: true,
          existingTabKeepsOwner: true,
          newTabUsesLatestChoice: true,
        };
      });

      await check("board-draft-switch-guard", async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${config.origin}/?view=board&project=${project}`);
        await ready();
        await page
          .getByRole("button", { name: "Add card in planned", exact: true })
          .click();
        const title = page.getByPlaceholder("Card title…", { exact: true });
        await title.fill("Unsubmitted board card title");
        const dialog = await settings();
        await dialog
          .getByLabel("Current user", { exact: true })
          .selectOption(owner.id);
        await expect(
          dialog.getByRole("button", { name: "Switch user", exact: true }),
        ).toBeDisabled();
        await dialog
          .getByRole("button", { name: "Close settings", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("dialog")).toHaveCount(0);
        await expect(title).toHaveValue("Unsubmitted board card title");
        await expect(page.locator(".current-user")).toHaveText(name);
        await title.fill("");
        await expect(title).toHaveValue("");
        const clean = await settings();
        await clean
          .getByLabel("Current user", { exact: true })
          .selectOption(owner.id);
        await expect(
          clean.getByRole("button", { name: "Switch user", exact: true }),
        ).toBeEnabled();
        await clean
          .getByRole("button", { name: "Close settings", exact: true })
          .click();
        await expect(clean).toHaveCount(0);
        return {
          unsubmittedTitlePreserved: true,
          clearingTitleAllowsSwitch: true,
        };
      });

      await check("unknown-profile-recovery", async () => {
        const sessions = cli("sessions")
          .items.map((session) => session.id)
          .sort();
        const unknown = await context.newPage();
        unknown.on("pageerror", (error) => errors.push(error.message));
        await unknown.goto(config.origin);
        await ready(unknown);
        await unknown.evaluate(
          (id) => sessionStorage.setItem("astra-user", id),
          randomUUID(),
        );
        await unknown.reload();
        const reset = unknown.getByRole("button", {
          name: "Use default user",
          exact: true,
        });
        await expect(reset).toBeVisible();
        await expect(unknown.locator("header.topbar")).toHaveCount(0);
        await reset.click();
        await ready(unknown);
        await expect(unknown.locator(".current-user")).toHaveText(owner.name);
        await expect(page.locator(".current-user")).toHaveText(name);
        assert.deepEqual(
          cli("sessions")
            .items.map((session) => session.id)
            .sort(),
          sessions,
        );
        await unknown.close();
        return {
          explicitDefaultRecovery: true,
          pairedSessionRetained: true,
          otherTabSelectionRetained: true,
        };
      });
      assert.deepEqual(errors, []);
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ) + "\n",
      );
      await context.close();
    }
  },
);
