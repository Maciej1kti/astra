/** Shared source state and personal profile selection through an ordinarily paired host. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext }) => {
    const context = await newContext();
    const ownerPage = await context.newPage();
    const tomekPage = await context.newPage();
    const errors = [];
    for (const page of [ownerPage, tomekPage])
      page.on("pageerror", (error) => errors.push(error.message));
    const results = [];
    const initial = cli("users");
    const owner = initial.items.find((user) => user.is_default);
    const tomek = randomUUID();
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const file = join(runtime, "shared-users-command.json");
    const asUser = (id, ...args) => cli(...args, "--user", id);
    async function mutate(id, method, path, payload, version) {
      await writeFile(file, JSON.stringify(payload));
      return asUser(
        id,
        "command",
        method,
        path,
        "--json-file",
        file,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    }
    async function check(id, run) {
      results.push({ id, detail: await run(), status: "pass" });
      console.log(JSON.stringify(results.at(-1)));
    }
    async function ready(page, name) {
      await expect(page.locator(".current-user")).toHaveText(name);
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
    }
    let card, counter, oldVersion;
    try {
      await check("rename-and-share", async () => {
        const renamed = cli(
          "user",
          "rename",
          owner.id,
          "--name",
          "Maciek",
          "--if-version",
          initial.version,
        );
        assert.equal(renamed.result.resource.id, owner.id);
        assert.equal(renamed.result.resource.name, "Maciek");
        cli("user", "create", "--id", tomek, "--name", "Tomek");
        const plan = asUser(tomek, "registration-plan", project.folder);
        assert.equal(plan.project_id, project.id);
        const registered = asUser(tomek, "register", plan.plan_id);
        if (registered.job_id)
          await expect
            .poll(() => asUser(tomek, "job", registered.job_id).state)
            .toBe("done");
        assert.deepEqual(
          asUser(tomek, "projects").items.map((item) => item.id),
          [project.id],
        );
        assert.equal(
          asUser(owner.id, "projects").items.length,
          config.projects.length,
        );
        card = await mutate(owner.id, "POST", base, {
          title: "Pompki",
          status: "active",
        });
        card = await mutate(
          owner.id,
          "PATCH",
          `${base}/${card.metadata.id}`,
          {
            configure_counter: {
              name: "Pompki",
              unit: "rep",
              step: 1,
              archived: false,
            },
          },
          card.version,
        );
        counter = card.metadata.counters[0];
        oldVersion = card.version;
        assert.equal(
          asUser(tomek, "get", `${base}/${card.metadata.id}`).version,
          oldVersion,
        );
        return {
          sameProjectId: true,
          sameCardAndVersion: true,
          ownerProjectsRetained: true,
        };
      });
      await check("profile-tabs-and-scope", async () => {
        await ownerPage.goto(`${config.origin}/?view=projects`);
        await ready(ownerPage, "Maciek");
        await tomekPage.goto(`${config.origin}/?view=projects`);
        await ready(tomekPage, "Maciek");
        await tomekPage
          .getByRole("button", { name: "Workspace settings", exact: true })
          .click();
        const settings = tomekPage.getByRole("dialog", {
          name: "Workspace settings",
          exact: true,
        });
        await settings
          .getByLabel("Current user", { exact: true })
          .selectOption(tomek);
        await settings
          .getByRole("button", { name: "Switch user", exact: true })
          .click();
        await ready(tomekPage, "Tomek");
        await ownerPage.reload();
        await ready(ownerPage, "Maciek");
        const unavailable = await tomekPage.evaluate(
          async ({ id, user }) => {
            const response = await fetch(`/api/v1/projects/${id}`, {
              headers: { "X-Astra-User": user },
            });
            return response.status;
          },
          { id: config.projects[0].id, user: tomek },
        );
        assert.equal(unavailable, 404);
        await tomekPage.goto(`${config.origin}/?view=projects`);
        await ready(tomekPage, "Tomek");
        await expect(
          tomekPage.getByText(project.title, { exact: true }).first(),
        ).toBeVisible();
        await expect(
          tomekPage.getByText(config.projects[0].title, { exact: true }),
        ).toHaveCount(0);
        return {
          tabSelectionsRetained: true,
          otherOwnerProjectsUnavailable: true,
        };
      });
      await check("shared-counter-increment", async () => {
        const params = new URLSearchParams({
          view: "list",
          project: project.id,
          type: "card",
          resource: card.metadata.id,
        });
        await tomekPage.goto(`${config.origin}/?${params}`);
        await ready(tomekPage, "Tomek");
        const region = tomekPage.getByRole("region", {
          name: "Card counters",
          exact: true,
        });
        const row = region.getByRole("group", {
          name: "Counter: Pompki",
          exact: true,
        });
        const value = row.getByLabel("Pompki value", { exact: true });
        await expect(value).toHaveAttribute("aria-valuenow", "0");
        await value.focus();
        await tomekPage.keyboard.press("ArrowRight");
        await expect(value).toHaveAttribute("aria-valuenow", "1");
        const date = await region.getAttribute("data-counter-today");
        assert.deepEqual(
          asUser(owner.id, "get", `${base}/${card.metadata.id}`).metadata
            .counters[0].values,
          {},
        );
        await row
          .getByRole("button", { name: "Confirm Pompki", exact: true })
          .click();
        await expect(row.locator(".draft-hint")).toHaveCount(0);
        const maciekCopy = asUser(
          owner.id,
          "get",
          `${base}/${card.metadata.id}`,
        );
        const tomekCopy = asUser(tomek, "get", `${base}/${card.metadata.id}`);
        assert.equal(maciekCopy.version, tomekCopy.version);
        assert.equal(maciekCopy.metadata.counters[0].values[date], 1);
        const source = JSON.parse(
          await readFile(
            join(
              project.folder,
              ".project",
              "cards",
              `${card.metadata.id}.json`,
            ),
            "utf8",
          ),
        );
        assert.equal(source.metadata.counters[0].id, counter.id);
        assert.equal(source.metadata.counters[0].values[date], 1);
        await ownerPage.goto(`${config.origin}/?${params}`);
        await ready(ownerPage, "Maciek");
        await expect(
          ownerPage.getByLabel("Pompki value", { exact: true }),
        ).toHaveAttribute("aria-valuenow", "1");
        await tomekPage.setViewportSize({ width: 320, height: 844 });
        await expect(value).toHaveAttribute("aria-valuenow", "1");
        await value.scrollIntoViewIfNeeded();
        assert.equal(
          await tomekPage.evaluate(() => document.documentElement.scrollWidth),
          320,
        );
        if (browser.browserType().name() === "chromium") {
          await tomekPage.bringToFront();
          await tomekPage.screenshot({
            path: join(evidence, "tomek-shared-counter-320.png"),
            fullPage: true,
            animations: "disabled",
          });
        }
        return {
          unit: counter.unit,
          step: counter.step,
          sharedValue: 1,
          sourceCopies: 1,
        };
      });
      await check("shared-version-conflict", async () => {
        const time = Date.now().toString(16).padStart(12, "0");
        const random = randomUUID();
        const requestId = `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`;
        const response = await ownerPage.evaluate(
          async ({ user, path, version, requestId }) => {
            const bootstrap = await (
              await fetch("/api/v1/bootstrap", {
                headers: { "X-Astra-User": user },
              })
            ).json();
            const response = await fetch(path, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "X-Astra-User": user,
                "X-CSRF-Token": bootstrap.csrf_token,
                "X-Command-Epoch": bootstrap.command_epoch,
                "X-Request-ID": requestId,
                "If-Match": `"${version}"`,
              },
              body: JSON.stringify({
                set: { title: "Stale edit must not win" },
              }),
            });
            return { status: response.status, body: await response.json() };
          },
          {
            user: owner.id,
            path: `${base}/${card.metadata.id}`,
            version: oldVersion,
            requestId,
          },
        );
        assert.equal(response.status, 412);
        assert.equal(response.body.error.code, "VERSION_CONFLICT");
        assert.equal(
          asUser(owner.id, "get", `${base}/${card.metadata.id}`).metadata.title,
          "Pompki",
        );
        return { staleMaciekEditRejectedAfterTomekWrite: true };
      });
      await check("shared-live-refresh", async () => {
        await ownerPage.goto(
          `${config.origin}/?view=list&project=${project.id}`,
        );
        await ready(ownerPage, "Maciek");
        await expect(
          ownerPage.getByText("Pompki", { exact: true }).first(),
        ).toBeVisible();
        const current = asUser(tomek, "get", `${base}/${card.metadata.id}`);
        await mutate(
          tomek,
          "PATCH",
          `${base}/${card.metadata.id}`,
          {
            set: { title: "Pompki together" },
          },
          current.version,
        );
        await expect(
          ownerPage.getByText("Pompki together", { exact: true }).first(),
        ).toBeVisible();
        assert.equal(
          asUser(owner.id, "get", `${base}/${card.metadata.id}`).metadata
            .counters[0].id,
          counter.id,
        );
        return { peerSourceWriteRefreshesOpenViewWithoutReload: true };
      });
      assert.deepEqual(errors, []);
    } catch (error) {
      results.push({ status: "fail", error: String(error) });
      throw error;
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ) + "\n",
      );
    }
  },
);
