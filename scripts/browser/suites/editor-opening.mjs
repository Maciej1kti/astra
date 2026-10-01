/** Source/context reads overlap without publishing an editor before its source. */
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
    let tagged = await mutate("POST", `${base}/cards`, {
      title: "Opening catalog owner",
      labels: ["Opening catalog before"],
    });
    const path = `${base}/cards/${card.metadata.id}`;
    const context = await newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.openingProbe = { reads: [], modals: [], invalidations: 0 };
      window.addEventListener("tag-suggestions-changed", () => {
        window.openingProbe.invalidations++;
      });
      const fetch = window.fetch;
      window.fetch = function (input, ...args) {
        const path = new URL(
          typeof input === "string" ? input : (input.url ?? input),
          location.href,
        ).pathname;
        if (path.startsWith("/api/")) {
          window.openingProbe.reads.push(path);
          args[0]?.signal?.addEventListener(
            "abort",
            () => {
              (window.openingProbe.aborted ??= []).push(path);
            },
            { once: true },
          );
        }
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
    let releaseSource = () => {};
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
        window.openingProbe = { reads: [], modals: [], invalidations: 0 };
      });
      let capturedSource;
      const sourceCaptured = new Promise((resolve) => {
        capturedSource = resolve;
      });
      const sourceBlocked = new Promise((resolve) => {
        releaseSource = resolve;
      });
      await page.route(`**${path}`, async (route) => {
        const response = await route.fetch();
        capturedSource();
        await sourceBlocked;
        await route.fulfill({ response });
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
      await sourceCaptured;
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            ({ base }) =>
              [base, `${base}/tags`].every((path) =>
                window.openingProbe.reads.includes(path),
              ),
            { base },
          ),
        )
        .toBe(true);
      await expect(dialog).toHaveCount(0);
      releaseSource();
      const current = await (await currentRead).json();
      await page.unroute(`**${path}`);
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
      assert.equal(
        probe.reads[0],
        path,
        "Current source starts before optional context",
      );
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
        name: "Fresh project/tag reads overlap a held source; only its current version opens the editor",
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
      tagged = await mutate(
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

      await page.evaluate(() => {
        window.openingProbe = { reads: [], modals: [], invalidations: 0 };
      });
      let capturedAgain;
      const capturedBeforeEditor = new Promise((resolve) => {
        capturedAgain = resolve;
      });
      const blockedAgain = new Promise((resolve) => {
        releaseSource = resolve;
      });
      await page.route(`**${path}`, async (route) => {
        const response = await route.fetch();
        capturedAgain();
        await blockedAgain;
        await route.fulfill({ response });
      });
      const beforeEditorCatalog = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${base}/tags` &&
          response.status() === 200,
      );
      const sourceAfterTags = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path &&
          response.status() === 200,
      );
      await page
        .locator(".view-content .listrow")
        .filter({ hasText: changed.metadata.title })
        .click();
      await capturedBeforeEditor;
      assert.ok(
        (await (await beforeEditorCatalog).json()).tags.some(
          (tag) => tag.name === "Opening catalog current",
        ),
      );
      await expect(dialog).toHaveCount(0);
      tagged = await mutate(
        "PATCH",
        `${base}/cards/${tagged.metadata.id}`,
        {
          set: { labels: ["Opening catalog changed before source"] },
        },
        tagged.version,
      );
      await expect
        .poll(() => page.evaluate(() => window.openingProbe.invalidations))
        .toBeGreaterThan(0);
      releaseSource();
      assert.equal(
        (await (await sourceAfterTags).json()).version,
        changed.version,
      );
      await page.unroute(`**${path}`);
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        changed.metadata.title,
      );
      await labels.fill("Opening catalog");
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog changed before source",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("option", {
          name: "Opening catalog current",
          exact: true,
        }),
      ).toHaveCount(0);
      assert.equal(cli("get", path).version, changed.version);
      checks.push({
        name: "A catalog invalidated before editor creation is replaced by a fresh ordinary read",
        version: changed.version,
      });
      await labels.fill("");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const openingPaths = [path, base, `${base}/tags`];
      const claimed = new Set();
      const capturedCancelled = new Set();
      const failed = new Set();
      let handledCount = 0;
      let releaseCancelled = () => {};
      const cancelledBlocked = new Promise((resolve) => {
        releaseCancelled = resolve;
      });
      const cancelledMatcher = `**${base}**`;
      const requestFailed = (request) => {
        const pathname = new URL(request.url()).pathname;
        if (openingPaths.includes(pathname) && request.method() === "GET")
          failed.add(pathname);
      };
      page.on("requestfailed", requestFailed);
      await page.evaluate(() => {
        window.openingProbe = { reads: [], modals: [], invalidations: 0 };
      });
      await page.route(cancelledMatcher, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (
          !openingPaths.includes(pathname) ||
          claimed.has(pathname) ||
          route.request().method() !== "GET"
        )
          return route.continue();
        claimed.add(pathname);
        try {
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          if (pathname === path)
            assert.equal((await response.json()).version, changed.version);
          capturedCancelled.add(pathname);
          await cancelledBlocked;
          await route.fulfill({ response });
        } finally {
          handledCount++;
        }
      });
      try {
        await page
          .locator(".view-content .listrow")
          .filter({ hasText: changed.metadata.title })
          .click();
        await expect.poll(() => capturedCancelled.size).toBe(3);
        await expect(dialog).toHaveCount(0);
        await page.getByRole("button", { name: "Board", exact: true }).click();
        await expect.poll(() => failed.size).toBe(3);
        const aborted = await page.evaluate(() => window.openingProbe.aborted);
        assert.deepEqual(aborted.toSorted(), openingPaths.toSorted());
        releaseCancelled();
        await expect.poll(() => handledCount).toBe(3);
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Board", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        assert.equal(new URL(page.url()).searchParams.has("resource"), false);
        assert.equal(cli("get", path).version, changed.version);
        checks.push({
          name: "A view switch aborts all three native opening transports and cannot publish the held source",
          version: changed.version,
        });
      } finally {
        releaseCancelled();
        page.off("requestfailed", requestFailed);
        await page.unroute(cancelledMatcher);
      }
      assert.deepEqual(errors, []);
    } finally {
      releaseSource();
      releaseOld();
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checks, errors }, null, 2),
      );
      await context.close();
    }
  },
);
