/** Fresh editor reads begin before modal layout and retain catalog invalidation. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const project = config.projects[0];
    const base = `/api/v1/projects/${project.id}`;
    const file = join(runtime, "opening-command.json");
    const checks = [];
    const errors = [];
    async function mutate(method, path, payload, version) {
      await writeFile(file, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", file];
      if (version) args.push("--if-version", version);
      return cli(...args).result.resource;
    }
    const card = await mutate("POST", `${base}/cards`, {
      title: "Opening reader",
      body: "**Current source description.**",
    });
    const tagged = await mutate("POST", `${base}/cards`, {
      title: "Opening catalog owner",
      labels: ["Opening catalog before"],
    });
    const path = `${base}/cards/${card.metadata.id}`;
    const context = await newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.openingProbe = { reads: [], modals: [] };
      const fetch = window.fetch;
      window.fetch = function (input, ...args) {
        const path = new URL(
          typeof input === "string" ? input : (input.url ?? input),
          location.href,
        ).pathname;
        if (path.startsWith("/api/")) window.openingProbe.reads.push(path);
        return fetch.call(this, input, ...args);
      };
      const show = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        if (this.classList.contains("editor"))
          window.openingProbe.modals.push([...window.openingProbe.reads]);
        return show.call(this);
      };
    });
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const labels = dialog.getByRole("combobox", {
      name: "Labels",
      exact: true,
    });
    let releaseOld = () => {};
    try {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id })}`,
      );
      await expect(
        page
          .locator(".view-content .listrow")
          .filter({ hasText: card.metadata.title }),
      ).toBeVisible();
      await page.evaluate(() => {
        window.openingProbe = { reads: [], modals: [] };
      });
      const currentRead = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path &&
          response.status() === 200,
      );
      await page
        .locator(".view-content .listrow")
        .filter({ hasText: card.metadata.title })
        .click();
      const current = await (await currentRead).json();
      assert.equal(current.version, card.version);
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        current.metadata.title,
      );
      await expect(
        dialog.locator(".resource-description-rendered"),
      ).toContainText("Current source description.");
      await expect(dialog.locator(".card-project-name")).toHaveText(
        project.title,
      );
      await labels.fill("Opening catalog");
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog before",
          exact: true,
        }),
      ).toBeVisible();
      const probe = await page.evaluate(() => window.openingProbe);
      assert.equal(probe.reads.filter((value) => value === path).length, 1);
      assert.equal(probe.reads.filter((value) => value === base).length, 1);
      assert.equal(
        probe.reads.filter((value) => value === `${base}/tags`).length,
        1,
      );
      assert.equal(probe.modals.length, 1);
      assert.ok(
        probe.modals[0].includes(base),
        "Project transport starts before modal layout",
      );
      assert.ok(
        probe.modals[0].includes(`${base}/tags`),
        "Tag transport starts before modal layout",
      );
      checks.push({
        name: "Fresh source and single project/tag reads precede native modal layout",
        version: current.version,
      });
      await labels.fill("");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      assert.equal(cli("get", path).version, card.version);

      const changed = await mutate(
        "PATCH",
        path,
        { set: { title: "Opening current source" } },
        card.version,
      );
      await expect(
        page
          .locator(".view-content .listrow")
          .filter({ hasText: changed.metadata.title }),
      ).toBeVisible();
      let captured;
      const oldCaptured = new Promise((resolve) => {
        captured = resolve;
      });
      const oldBlocked = new Promise((resolve) => {
        releaseOld = resolve;
      });
      let first = true;
      let completedTags = 0;
      page.on("requestfinished", (request) => {
        if (new URL(request.url()).pathname === `${base}/tags`) completedTags++;
      });
      await page.route(`**${base}/tags`, async (route) => {
        if (!first) return route.continue();
        first = false;
        const response = await route.fetch();
        assert.ok(
          (await response.json()).tags.some(
            (tag) => tag.name === "Opening catalog before",
          ),
        );
        captured();
        await oldBlocked;
        await route.fulfill({ response });
      });
      const reopenedRead = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path &&
          response.status() === 200,
      );
      await page
        .locator(".view-content .listrow")
        .filter({ hasText: changed.metadata.title })
        .click();
      assert.equal(
        (await (await reopenedRead).json()).version,
        changed.version,
      );
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        changed.metadata.title,
      );
      await oldCaptured;
      await labels.fill("Opening catalog");
      await mutate(
        "PATCH",
        `${base}/cards/${tagged.metadata.id}`,
        { set: { labels: ["Opening catalog current"] } },
        tagged.version,
      );
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog current",
          exact: true,
        }),
      ).toBeVisible();
      releaseOld();
      await expect.poll(() => completedTags).toBeGreaterThanOrEqual(2);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog current",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog before",
          exact: true,
        }),
      ).toHaveCount(0);
      assert.equal(cli("get", path).version, changed.version);
      checks.push({
        name: "A delayed opening catalog cannot replace refreshed tags or a reopened source",
        version: changed.version,
      });
      if (browser.browserType().name() === "chromium")
        await page.screenshot({
          path: join(evidence, "opening-current-tags.png"),
        });
      await labels.fill("");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      assert.deepEqual(errors, []);
    } finally {
      releaseOld();
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checks, errors }, null, 2),
      );
      await context.close();
    }
  },
);
