/** Startup concurrency, immediate navigation and deferred component recovery. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(async (suite) => {
  const { config, cli, runtime, newContext, evidence } = suite;
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
  let releaseCards;
  const blockedCards = new Promise((resolve) => {
    releaseCards = resolve;
  });
  await page.route("**/api/v1/views/list?*", async (route) => {
    await blockedCards;
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
    await expect
      .poll(() => requests.some((url) => url.pathname === "/api/v1/views/list"))
      .toBe(true);
    assert.equal(
      requests.some((url) => /\/Editor-[^/]+\.js$/.test(url.pathname)),
      false,
    );
    releaseCards();
    await expect
      .poll(() =>
        requests.some((url) => /\/Editor-[^/]+\.js$/.test(url.pathname)),
      )
      .toBe(true);
    await expect(page.locator(".view-content .listrow").first()).toBeVisible();
    checks.push(
      "Preferences travel alongside bootstrap; editor warms after the initial card read",
    );

    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 5_000);
    const navigate = async (name, selector) => {
      await page
        .getByRole("navigation", { name: "Widoki przestrzeni roboczej" })
        .getByRole("button", { name, exact: true })
        .click();
      await expect(page.locator(selector).first()).toBeVisible();
    };
    await navigate("Aktualizacje", ".view-content .updates .update");
    await navigate("Lista", ".view-content .listrow");
    const start = requests.length;
    const search = page.getByRole("textbox", {
      name: "Szukaj w treści",
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
      .getByLabel("Filtr statusu", { exact: true })
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
      .getByRole("button", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Ustawienia przestrzeni roboczej",
      exact: true,
    });
    await expect(settings.getByRole("alert")).toContainText(
      "Nie udało się wczytać",
    );
    await settings
      .getByRole("button", { name: "Zamknij", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      })
      .click();
    await expect(settings.getByRole("alert")).toContainText(
      "Nie udało się wczytać",
    );
    failSettings = false;
    await Promise.all([
      page.waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
      }),
      settings
        .getByRole("button", { name: "Odśwież aplikację", exact: true })
        .click(),
    ]);
    await expect(page.locator(".view-content .listrow").first()).toBeVisible();
    await page
      .getByRole("button", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      })
      .click();
    await expect(settings.getByLabel("Motyw", { exact: true })).toBeVisible();
    await settings
      .getByRole("button", { name: "Zamknij ustawienia", exact: true })
      .click();
    checks.push(
      "Failed secondary chunk remains closable and recovers through explicit reload",
    );
    for (const [view, asset, selector, endpoint] of [
      ["calendar", "CalendarView", "[data-calendar-item]", "calendar"],
      ["gantt", "GanttView", ".astra-gantt [data-card-id]", "gantt"],
      ["board", "Board", ".astra-board .wx-card", "board"],
    ]) {
      const planningContext = await newContext();
      const planningPage = await planningContext.newPage();
      planningPage.on("pageerror", (error) => errors.push(error.message));
      let release;
      const blocked = new Promise((resolve) => (release = resolve));
      let releasePreferences;
      const blockedPreferences = new Promise(
        (resolve) => (releasePreferences = resolve),
      );
      const planningReads = [];
      planningPage.on("request", (request) => {
        if (new URL(request.url()).pathname === `/api/v1/views/${endpoint}`)
          planningReads.push(request.url());
      });
      await planningPage.route("**/api/v1/bootstrap", async (route) => {
        await blocked;
        await route.continue();
      });
      await planningPage.route(
        "**/api/v1/workspace/preferences",
        async (route) => {
          await blockedPreferences;
          await route.continue();
        },
      );
      try {
        const requested = planningPage.waitForRequest((request) =>
          new URL(request.url()).pathname.startsWith(`/assets/${asset}-`),
        );
        await planningPage.goto(
          `${config.origin}/?${new URLSearchParams({ view, project, date: "2026-09-08", month: "2026-09" })}`,
          { waitUntil: "domcontentloaded" },
        );
        await requested;
        release();
        await expect(planningPage.locator(selector).first()).toBeVisible();
        checks.push(`${view} code loads before bootstrap completes`);

        // A widget can already have its page when preferences finish and
        // initialization republishes the same route object. That publication
        // is not a source invalidation or a different planning query.
        const editorWarmup = planningPage.waitForRequest((request) =>
          /\/Editor-[^/]+\.js$/.test(new URL(request.url()).pathname),
        );
        releasePreferences();
        await editorWarmup;
        assert.equal(
          planningReads.length,
          1,
          `${view}: an identical initial route must not read the page again`,
        );

        const filter = planningPage.getByRole("textbox", {
          name: "Filtruj wczytane tytuły",
          exact: true,
        });
        for (const value of ["Design", "Design system", ""]) {
          await filter.fill(value);
          await planningPage.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          assert.equal(
            planningReads.length,
            1,
            `${view}: a loaded-title filter must not reread the page`,
          );
        }

        const id = config.cards[0].id;
        const path = `/api/v1/projects/${project}/cards/${id}`;
        const observed = cli("get", path);
        const title = `Fresh ${view} startup card`;
        const payload = join(runtime, `${view}-startup-edit.json`);
        await writeFile(payload, JSON.stringify({ set: { title } }));
        let acknowledgedVersion;
        const rowsOf = (value) =>
          value.items ??
          value.rows ??
          value.columns.flatMap((column) => column.items);
        const refreshed = planningPage.waitForResponse(async (response) => {
          if (
            new URL(response.url()).pathname !== `/api/v1/views/${endpoint}` ||
            response.status() !== 200
          )
            return false;
          return rowsOf(await response.json()).some(
            (row) =>
              (row.resource_id ?? row.id) === id &&
              row.version === acknowledgedVersion,
          );
        });
        const committed = cli(
          "command",
          "PATCH",
          path,
          "--json-file",
          payload,
          "--if-version",
          observed.version,
        ).result.resource;
        acknowledgedVersion = committed.version;
        const pageValue = await (await refreshed).json();
        const current = rowsOf(pageValue).find(
          (row) => (row.resource_id ?? row.id) === id,
        );
        assert.equal(current.title, title);
        assert.equal(current.version, committed.version);
        if (view === "calendar") {
          // A source update can move this item below the month grid's visible
          // stack. The loaded-title filter must expose the current projection.
          await filter.fill(title);
          const entry = planningPage
            .locator(`[data-calendar-item="${current.item_id}"]`)
            .first();
          await expect(entry).toContainText(title);
          await expect(
            entry.locator("xpath=ancestor::article[1]"),
          ).toHaveAttribute("data-source-version", committed.version);
        } else if (view === "gantt") {
          await expect(
            planningPage.locator(`.timeline-bar[data-card-id="${id}"]`),
          ).toContainText(title);
        } else {
          await expect(
            planningPage.locator(selector).filter({ hasText: title }).first(),
          ).toContainText(title);
        }
        checks.push(
          `${view} ignores identical startup routes and loaded-title filters, then refreshes after an ordinary CLI edit`,
        );
      } finally {
        release();
        releasePreferences();
        await planningContext.close();
      }
    }
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
        .getByRole("button", { name: /^Poproś o dostęp/ })
        .click();
      const challenge = pairingPage.getByText(
        "Porównaj ten kod na komputerze serwera:",
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
    releaseCards();
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
