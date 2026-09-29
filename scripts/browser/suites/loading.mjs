/** Startup concurrency, immediate navigation and deferred component recovery. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(async ({ config, newContext, evidence }) => {
  const context = await newContext();
  const page = await context.newPage();
  const errors = [],
    requests = [],
    checks = [],
    failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(new URL(request.url())));
  page.on("requestfailed", (request) =>
    failedRequests.push({
      path: new URL(request.url()).pathname,
      error: request.failure()?.errorText,
    }),
  );
  const project = config.projects[0].id;
  let releaseBootstrap;
  const blockedBootstrap = new Promise((resolve) => {
    releaseBootstrap = resolve;
  });
  await page.route("**/api/v1/bootstrap", async (route) => {
    await blockedBootstrap;
    await route.continue();
  });
  try {
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view: "list", project })}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect
      .poll(() =>
        requests.some(
          (url) => url.pathname === "/api/v1/workspace/preferences",
        ),
      )
      .toBe(true);
    assert.equal(
      requests.some((url) =>
        /\/(Editor|Settings|RegistrationBrowser)-[^/]+\.js$/.test(url.pathname),
      ),
      false,
    );
    releaseBootstrap();
    await expect(page.locator(".view-content .listrow").first()).toBeVisible();
    checks.push(
      "Preferences travel alongside bootstrap; secondary UI is absent from startup",
    );

    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 5_000);
    const navigate = async (name, selector) => {
      await page
        .getByRole("navigation", { name: "Workspace views" })
        .getByRole("button", { name, exact: true })
        .click();
      await expect(page.locator(selector).first()).toBeVisible();
    };
    await navigate("Updates", ".view-content .updates .update");
    await navigate("List", ".view-content .listrow");
    const start = requests.length;
    const search = page.getByRole("textbox", {
      name: "Search content",
      exact: true,
    });
    await search.fill("neb");
    await page.clock.runFor(150);
    await search.fill("nebula-1");
    await page.clock.runFor(199);
    assert.equal(
      requests
        .slice(start)
        .filter((url) => url.pathname === "/api/v1/views/list").length,
      0,
    );
    await page.clock.runFor(1);
    await expect(page.locator(".view-content .listrow").first()).toBeVisible();
    const searches = requests
      .slice(start)
      .filter((url) => url.pathname === "/api/v1/views/list");
    assert.deepEqual(
      searches.map((url) => url.searchParams.get("q")),
      ["nebula-1"],
    );
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/views/list" &&
        url.searchParams.get("status") === "active"
      );
    });
    await page
      .getByLabel("Status filter", { exact: true })
      .selectOption("active");
    assert.equal((await filtered).status(), 200);
    checks.push(
      "Navigation and discrete filters read with timers paused; search typing coalesces",
    );
    await page.clock.resume();

    // Browsers may retain a failed module request until the document reloads.
    // Recovery must remain explicit, without trapping navigation or drafts.
    let failSettings = true;
    await page.route("**/assets/Settings-*.js", (route) =>
      failSettings
        ? route.fulfill({
            status: 503,
            headers: { "Cache-Control": "no-store" },
            body: "Temporarily unavailable",
          })
        : route.continue(),
    );
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Workspace settings",
      exact: true,
    });
    await expect(settings.getByRole("alert")).toContainText(
      "could not be loaded",
    );
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    await expect(settings.getByRole("alert")).toContainText(
      "could not be loaded",
    );
    failSettings = false;
    await Promise.all([
      page.waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
      }),
      settings.getByRole("button", { name: "Reload app", exact: true }).click(),
    ]);
    await expect(page.locator(".view-content .listrow").first()).toBeVisible();
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    await expect(settings.getByLabel("Theme", { exact: true })).toBeVisible();
    await settings
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    checks.push(
      "Failed secondary chunk remains closable and recovers through explicit reload",
    );
    const unpaired = await newContext({ storageState: undefined });
    const pairingPage = await unpaired.newPage();
    try {
      // Let the concurrent preferences read report session loss first.
      await pairingPage.route("**/api/v1/bootstrap", async (route) => {
        const response = await route.fetch();
        await new Promise((done) => setTimeout(done, 100));
        await route.fulfill({ response });
      });
      await pairingPage.goto(config.origin);
      await pairingPage
        .getByRole("button", { name: /^Request access/ })
        .click();
      const challenge = pairingPage.getByText(
        "Compare this challenge on the host machine:",
      );
      await expect(challenge).toBeVisible();
      await pairingPage.reload();
      await expect(challenge).toBeVisible();
      checks.push(
        "Concurrent unauthorized startup reads retain a pending pairing after reload",
      );
    } finally {
      await unpaired.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    releaseBootstrap();
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify(
        {
          checks,
          errors,
          failedRequests,
          assets: requests
            .filter((url) => url.pathname.startsWith("/assets/"))
            .map((url) => url.pathname),
        },
        null,
        2,
      ),
    );
    await context.close();
  }
});
