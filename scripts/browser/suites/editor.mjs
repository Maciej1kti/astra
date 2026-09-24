/** Real paired browser and synthetic audit-host source files. No authentication bypass. */
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isMain, runBrowserSuite } from "../runtime.mjs";
import assert from "node:assert/strict";

export async function runEditorChecks({
  page,
  config,
  cli,
  evidenceDir,
  runtimeDir,
}) {
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  const project = config.projects[0].id,
    otherProject = config.projects[1].id;
  const base = `/api/v1/projects/${project}`;
  const unique = (name) => `${name} ${Date.now().toString(36)}`;
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(12000);
  const commandFile = join(runtimeDir, "repair-browser-command.json");
  const dialog = () =>
    page.getByRole("dialog", { name: /^(Edit|Create) resource$/ });
  const title = () => dialog().getByLabel("Title", { exact: true });
  const tags = () => dialog().getByLabel("Labels", { exact: true });
  const get = (id) => cli("get", `${base}/cards/${id}`);
  async function mutate(method, path, payload, version) {
    await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
    const args = ["command", method, path, "--json-file", commandFile];
    if (version) args.push("--if-version", version);
    const result = cli(...args).result;
    return result.resource?.metadata ?? result;
  }
  const create = (payload, projectId = project) =>
    mutate("POST", `/api/v1/projects/${projectId}/cards`, payload);
  async function close() {
    if (!(await dialog().count())) return;
    await dialog()
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    const discard = dialog().getByRole("button", {
      name: "Discard draft",
      exact: true,
    });
    if (await discard.isVisible()) await discard.click();
    await dialog().waitFor({ state: "hidden" });
  }
  async function route(view = "list", extra = {}) {
    await close();
    const params = new URLSearchParams({ view, project, ...extra });
    await page.goto(`${config.origin}/?${params}`);
    await page.getByLabel("Project", { exact: true }).waitFor();
    await expect(page.locator(".asidebottom")).toContainText(
      "Connected to host",
    );
  }
  async function open(id) {
    await route("list", { type: "card", resource: id });
    await title().waitFor();
    await expect(
      dialog().getByRole("button", {
        name: /^(Pin to focus|Remove from focus)$/,
      }),
    ).toBeEnabled();
  }
  async function waitForAutosaveACK() {
    await expect(dialog().getByTestId("autosave-status")).toHaveText("Saved");
  }
  async function screenshot(name) {
    await page.screenshot({
      path: join(evidenceDir, `${name}.png`),
      fullPage: !(await dialog().isVisible()),
    });
  }
  async function waitForSignal(signal, label) {
    let timeout;
    try {
      return await Promise.race([
        signal,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Timed out waiting for ${label}`)),
            12000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  async function check(id, name, run) {
    const started = Date.now();
    try {
      const detail = await run();
      results.push({
        id,
        name,
        status: "pass",
        detail,
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
      await screenshot(`${id}-failure`).catch(() => {});
    } finally {
      await close().catch(() => {});
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        join(evidenceDir, "results.json"),
        JSON.stringify({ results, errors }, null, 2),
      );
    }
  }

  await check(
    "A01",
    "Pin and remove pin preserve autosaved title and body",
    async () => {
      const card = await create({
        title: "Repair draft probe",
        body: "Saved baseline",
      });
      await open(card.id);
      await title().fill("Repair draft — preserved after pin");
      await dialog().locator(".resource-description-rendered").click();
      await dialog()
        .getByLabel("Description", { exact: true })
        .fill("Autosaved body — Zażółć gęślą jaźń.");
      await waitForAutosaveACK();
      await dialog()
        .getByRole("button", { name: "Pin to focus", exact: true })
        .click();
      await expect(
        dialog().getByRole("button", {
          name: "Remove from focus",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(title()).toHaveValue("Repair draft — preserved after pin");
      assert.equal(
        get(card.id).metadata.title,
        "Repair draft — preserved after pin",
      );
      await dialog()
        .getByRole("button", { name: "Remove from focus", exact: true })
        .click();
      await expect(
        dialog().getByRole("button", { name: "Pin to focus", exact: true }),
      ).toBeEnabled();
      await dialog().locator(".resource-description-rendered").click();
      await expect(
        dialog().getByLabel("Description", { exact: true }),
      ).toHaveValue("Autosaved body — Zażółć gęślą jaźń.");
      await screenshot("A01-preserved-draft");
      await waitForAutosaveACK();
      assert.equal(
        get(card.id).metadata.title,
        "Repair draft — preserved after pin",
      );
      assert.equal(get(card.id).body, "Autosaved body — Zażółć gęślą jaźń.");
      return { card: card.id, persistedByAutosave: true };
    },
  );

  await check(
    "A01-recovery",
    "A committed card pin with its browser response lost recovers without closing",
    async () => {
      const card = await create({ title: "Repair focus recovery probe" });
      await open(card.id);
      await title().fill("Autosaved after focus response loss");
      await waitForAutosaveACK();
      let writes = 0,
        requestId,
        epoch,
        interceptionError;
      const matcher = `**/api/v1/projects/${project}/cards/${card.id}`;
      await page.route(matcher, async (intercept) => {
        if (
          intercept.request().method() !== "PATCH" ||
          intercept.request().postDataJSON()?.set?.pinned !== true
        )
          return intercept.continue();
        writes++;
        requestId = intercept.request().headers()["x-request-id"];
        epoch = intercept.request().headers()["x-command-epoch"];
        try {
          const committed = await intercept.fetch();
          assert.equal(committed.ok(), true);
          await intercept.abort("failed");
        } catch (error) {
          // Surface an interception failure in this test rather than as an
          // unhandled page route callback that terminates the entire suite.
          interceptionError = error;
        }
      });
      try {
        await dialog()
          .getByRole("button", { name: "Pin to focus", exact: true })
          .click();
        // Pending controls appear as soon as the request starts. Wait until the
        // completed interception has released the in-flight command first.
        await expect(
          dialog().getByRole("button", { name: "Check status", exact: true }),
        ).toBeEnabled();
        assert.equal(interceptionError, undefined);
        await expect(title()).toHaveValue(
          "Autosaved after focus response loss",
        );
        await expect(title()).toBeDisabled();
        assert(
          cli("get", "/api/v1/workspace/focus").items.some(
            (item) => item.card_id === card.id,
          ),
        );
        await dialog()
          .getByRole("button", { name: "Check status", exact: true })
          .click();
        await expect(
          dialog().getByRole("button", {
            name: "Remove from focus",
            exact: true,
          }),
        ).toBeEnabled();
        await expect(title()).toBeEnabled();
        await expect(title()).toHaveValue(
          "Autosaved after focus response loss",
        );
        assert.equal(writes, 1);
        assert.equal(
          cli("get", `/api/v1/commands/${requestId}?epoch=${epoch}`).state,
          "committed",
        );
        assert.equal(
          get(card.id).metadata.title,
          "Autosaved after focus response loss",
        );
        await screenshot("A01-recovered-focus-draft");
        return { committedBeforeLostResponse: true, writes, requestId };
      } finally {
        await page.unroute(matcher);
      }
    },
  );

  await check(
    "A01-conflict",
    "A card pin conflict preserves the autosaved draft",
    async () => {
      const card = await create({ title: "Repair focus conflict probe" });
      await open(card.id);
      await title().fill("Autosaved focus conflict draft");
      await waitForAutosaveACK();
      await mutate(
        "PATCH",
        `/api/v1/projects/${project}/cards/${card.id}`,
        { set: { pinned: true } },
        get(card.id).version,
      );
      await dialog()
        .getByRole("button", { name: "Pin to focus", exact: true })
        .click();
      await expect(dialog().getByRole("alert")).toContainText(
        "changed since you opened it",
      );
      await expect(title()).toHaveValue("Autosaved focus conflict draft");
      await expect(
        dialog().getByText("Current saved version · your draft stays above", {
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(
        get(card.id).metadata.title,
        "Autosaved focus conflict draft",
      );
      return "A competing card pin kept the autosaved title and displayed the source conflict.";
    },
  );

  await check(
    "A02",
    "An unrelated title save preserves exact source tags including commas and Unicode",
    async () => {
      const labels = ["Research, discovery", " QA ", "Café", "Cafe\u0301"];
      const card = await create({ title: "Repair literal tags probe", labels });
      await open(card.id);
      await expect(
        dialog()
          .getByRole("list", { name: "Selected tags", exact: true })
          .locator("li"),
      ).toHaveCount(labels.length);
      await title().fill("Repair literal tags — renamed");
      await waitForAutosaveACK();
      assert.deepEqual(get(card.id).metadata.labels, labels);
      await open(card.id);
      await screenshot("A02-exact-tags");
      return { labels: get(card.id).metadata.labels };
    },
  );

  await check(
    "A10",
    "Tag chips add literal names, reject duplicates locally and support keyboard suggestions",
    async () => {
      await create({
        title: "Repair source suggestion",
        labels: ["Existing, suggested tag"],
      });
      const card = await create({
        title: "Repair tag controls",
        labels: ["qa"],
      });
      await open(card.id);
      const before = get(card.id).version;
      await tags().fill("qa");
      await tags().press("Enter");
      await expect(dialog().getByRole("alert")).toContainText(
        "already on the card",
      );
      await expect(tags()).toHaveAttribute("aria-invalid", "true");
      assert.equal(get(card.id).version, before);
      await tags().fill("x".repeat(49));
      await tags().press("Enter");
      await expect(dialog().getByRole("alert")).toContainText("48 characters");
      await tags().fill("Existing, suggested");
      await expect(
        dialog().getByRole("option", {
          name: "Existing, suggested tag",
          exact: true,
        }),
      ).toBeVisible();
      await tags().press("ArrowDown");
      await tags().press("Enter");
      await expect(
        dialog().getByRole("button", {
          name: "Remove tag Existing, suggested tag",
          exact: true,
        }),
      ).toBeVisible();
      await tags().fill("Nowy, ważny tag");
      await tags().press("Enter");
      await dialog()
        .getByRole("button", { name: "Remove tag qa", exact: true })
        .click();
      await screenshot("A10-tag-chips");
      await waitForAutosaveACK();
      assert.deepEqual(get(card.id).metadata.labels, [
        "Existing, suggested tag",
        "Nowy, ważny tag",
      ]);
      return "Source suggestion and a new comma-containing tag saved; duplicate and long-name attempts left the source version unchanged.";
    },
  );

  await check(
    "A10-limits-mobile",
    "The 20-tag limit is recoverable and chip controls remain reachable at 390px",
    async () => {
      const labels = Array.from(
        { length: 20 },
        (_, index) => `Repair tag ${index + 1}`,
      );
      const card = await create({ title: "Repair tag limit", labels });
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await open(card.id);
        await tags().fill("another");
        await tags().press("Enter");
        await expect(dialog().getByRole("alert")).toContainText("20 tags");
        await dialog()
          .getByRole("button", { name: "Remove tag Repair tag 1", exact: true })
          .click();
        await tags().fill("😀".repeat(48));
        await tags().press("Enter");
        await expect(
          dialog()
            .getByRole("list", { name: "Selected tags", exact: true })
            .locator("li"),
        ).toHaveCount(20);
        const metrics = await dialog().evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        assert(
          metrics.scrollWidth <= metrics.width + 1,
          JSON.stringify(metrics),
        );
        const target = await dialog()
          .getByRole("button", { name: "Remove tag Repair tag 2", exact: true })
          .boundingBox();
        assert(
          target.width >= 44 && target.height >= 44,
          JSON.stringify(target),
        );
        await screenshot("A10-mobile-tag-limit");
        await waitForAutosaveACK();
        assert.equal(get(card.id).metadata.labels.length, 20);
        assert.equal([...get(card.id).metadata.labels.at(-1)].length, 48);
        return { metrics, removalTarget: target };
      } finally {
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    },
  );

  await check(
    "A01-undo",
    "Versioned CLI undo restores the prior card source while the API history remains available",
    async () => {
      const card = await create({ title: "Repair undo baseline" });
      const first = get(card.id);
      await mutate(
        "PATCH",
        `${base}/cards/${card.id}`,
        { set: { title: "Repair undo prior edit" } },
        first.version,
      );
      const prior = get(card.id);
      await mutate(
        "PATCH",
        `${base}/cards/${card.id}`,
        { set: { title: "Repair undo saved edit" } },
        prior.version,
      );
      const current = get(card.id);
      const history = cli("get", `${base}/cards/${card.id}/history`).items;
      const entry = history.find(
        (item) => item.can_undo && item.changed_fields.includes("title"),
      );
      assert(entry, "the saved title edit should be undoable");
      await mutate(
        "PATCH",
        `${base}/cards/${card.id}`,
        { undo: { history_entry_id: entry.id } },
        current.version,
      );
      assert.equal(get(card.id).metadata.title, "Repair undo prior edit");
      await open(card.id);
      await expect(title()).toHaveValue("Repair undo prior edit");
      await close();
      return { apiHistory: true, versionedUndo: true };
    },
  );

  await check(
    "A03",
    "A milestone List selection cannot change Board, Calendar or Timeline creation type",
    async () => {
      await route();
      await page
        .getByLabel("Resource type", { exact: true })
        .selectOption("milestones");
      for (const view of ["Board", "Calendar", "Timeline"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect(
          page.locator(".heading").getByRole("button", { name: /Add card$/ }),
        ).toBeVisible();
        await page
          .locator(".heading")
          .getByRole("button", { name: /Add card$/ })
          .click();
        await expect(dialog().getByLabel("Kind", { exact: true })).toHaveCount(
          0,
        );
        await close();
      }
      return "All three planning views create card drafts.";
    },
  );

  await check(
    "A04",
    "Archive filter retrieves archived cards, survives reload and restores them",
    async () => {
      const card = await create({
        title: unique("Repair archive retrieval"),
        status: "active",
        priority: "high",
        labels: ["Archive, literal"],
      });
      const row = () =>
        page.locator("main").getByText(card.title, { exact: true });
      const archivedEmpty = () =>
        page.getByText(
          "No archived cards match this selection. Clear filters to see more archived cards.",
          { exact: true },
        );
      await open(card.id);
      const priority = dialog().getByLabel("Priority", { exact: true });
      assert.deepEqual(
        await priority
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value)),
        ["normal", "high"],
      );
      for (const value of ["normal", "high"]) {
        await priority.selectOption(value);
        await waitForAutosaveACK();
        assert.equal(get(card.id).metadata.priority, value);
      }
      await dialog().getByText("Card lifecycle", { exact: true }).click();
      await dialog().getByLabel("Archived", { exact: true }).check();
      await waitForAutosaveACK();
      assert.equal(get(card.id).metadata.archived, true);
      await route();
      await page.getByLabel("Search content", { exact: true }).fill(card.title);
      assert.deepEqual(
        await page
          .getByLabel("Priority filter", { exact: true })
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value)),
        ["", "normal", "high"],
      );
      await expect(
        page.getByText(
          "No items match this selection. Try another project or clear the filters.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(row()).not.toBeVisible();
      await page
        .getByLabel("Card visibility", { exact: true })
        .selectOption("true");
      await expect(row()).toBeVisible();
      await page
        .getByLabel("Status filter", { exact: true })
        .selectOption("done");
      await expect(archivedEmpty()).toBeVisible();
      await expect(row()).not.toBeVisible();
      await page
        .getByLabel("Status filter", { exact: true })
        .selectOption("active");
      await expect(row()).toBeVisible();
      await page
        .getByLabel("Priority filter", { exact: true })
        .selectOption("normal");
      await expect(archivedEmpty()).toBeVisible();
      await expect(row()).not.toBeVisible();
      await page
        .getByLabel("Priority filter", { exact: true })
        .selectOption("high");
      await page
        .getByLabel("Tag filter", { exact: true })
        .fill("Archive, literal");
      await expect(row()).toBeVisible();
      await page.reload();
      await expect(
        page.getByLabel("Card visibility", { exact: true }),
      ).toHaveValue("true");
      await expect(
        page.getByLabel("Status filter", { exact: true }),
      ).toHaveValue("active");
      await expect(
        page.getByLabel("Priority filter", { exact: true }),
      ).toHaveValue("high");
      await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue(
        "Archive, literal",
      );
      await expect(row()).toBeVisible();
      // A substring is not the exact stored tag, even though the literal name
      // contains a comma. This must exclude the otherwise matching card.
      await page.getByLabel("Tag filter", { exact: true }).fill("Archive");
      await expect(archivedEmpty()).toBeVisible();
      await expect(row()).not.toBeVisible();
      await page
        .getByLabel("Tag filter", { exact: true })
        .fill("Archive, literal");
      await row().click();
      await dialog().getByText("Card lifecycle", { exact: true }).click();
      await dialog().getByLabel("Archived", { exact: true }).uncheck();
      await waitForAutosaveACK();
      assert.equal(get(card.id).metadata.archived, false);
      await page
        .getByLabel("Card visibility", { exact: true })
        .selectOption("false");
      await expect(row()).toBeVisible();
      await page.reload();
      await expect(
        page.getByLabel("Card visibility", { exact: true }),
      ).toHaveValue("false");
      await expect(
        page.getByLabel("Status filter", { exact: true }),
      ).toHaveValue("active");
      await expect(
        page.getByLabel("Priority filter", { exact: true }),
      ).toHaveValue("high");
      await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue(
        "Archive, literal",
      );
      await expect(row()).toBeVisible();
      assert.deepEqual(get(card.id).metadata.labels, ["Archive, literal"]);
      await screenshot("A04-restored-archive");
      return {
        archivedThenRestored: true,
        statusAndPriorityExclusions: true,
        exactCommaTagFilter: true,
        filtersPersistedAcrossReloads: true,
      };
    },
  );

  await check(
    "A04-literal-spaces",
    "Exact tag filtering preserves source labels with outer spaces across reload",
    async () => {
      const card = await create({
        title: unique("Repair literal spaced tag"),
        labels: [" QA "],
      });
      await route();
      await page.getByLabel("Search content", { exact: true }).fill(card.title);
      const row = page.locator("main").getByText(card.title, { exact: true });
      await expect(row).toBeVisible();
      await page.getByLabel("Tag filter", { exact: true }).fill(" QA ");
      await expect(row).toBeVisible();
      await expect(page).toHaveURL(
        (url) => url.searchParams.get("label") === " QA ",
      );
      await page.reload();
      await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue(
        " QA ",
      );
      await expect(row).toBeVisible();
      await page.getByLabel("Tag filter", { exact: true }).fill("QA");
      await expect(
        page.getByText(
          "No items match this selection. Try another project or clear the filters.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(row).not.toBeVisible();
      await page.getByLabel("Tag filter", { exact: true }).fill(" QA ");
      await expect(row).toBeVisible();
      assert.deepEqual(get(card.id).metadata.labels, [" QA "]);
      return "The exact source name including both outer spaces matches; its trimmed spelling does not.";
    },
  );

  await check(
    "A07-late-open",
    "Late card reads cannot open an inspector after changing view or project",
    async () => {
      const card = await create({ title: unique("Repair delayed card read") });
      const path = `${base}/cards/${card.id}`;
      const matcher = `**${path}`;
      for (const destination of ["view", "project"]) {
        await route();
        await page
          .getByLabel("Search content", { exact: true })
          .fill(card.title);
        const row = page.locator("main").getByText(card.title, { exact: true });
        await expect(row).toBeVisible();
        let release,
          notifyReady,
          notifyHandled,
          interceptionError,
          intercepted = false;
        const released = new Promise((resolve) => {
          release = resolve;
        });
        const ready = new Promise((resolve) => {
          notifyReady = resolve;
        });
        const handled = new Promise((resolve) => {
          notifyHandled = resolve;
        });
        await page.route(matcher, async (intercept) => {
          if (intercept.request().method() !== "GET")
            return intercept.continue();
          intercepted = true;
          try {
            const response = await intercept.fetch();
            assert.equal(response.ok(), true);
            notifyReady();
            await released;
            await intercept.fulfill({ response });
          } catch (error) {
            interceptionError = error;
            notifyReady();
          } finally {
            notifyHandled();
          }
        });
        try {
          await row.click();
          await waitForSignal(ready, "the held resource response");
          assert.equal(interceptionError, undefined);
          if (destination === "view") {
            await page
              .getByRole("button", { name: "Board", exact: true })
              .click();
            await expect(
              page.getByRole("button", { name: "Board", exact: true }),
            ).toHaveAttribute("aria-current", "page");
          } else {
            await page
              .getByLabel("Project", { exact: true })
              .selectOption(otherProject);
            await expect(
              page.getByLabel("Project", { exact: true }),
            ).toHaveValue(otherProject);
          }
          const responseReceived = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === path &&
              response.request().method() === "GET",
          );
          release();
          const response = await responseReceived;
          await response.finished();
          await waitForSignal(handled, "the released resource response");
          assert.equal(interceptionError, undefined);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          await expect(dialog()).toHaveCount(0);
          if (destination === "view")
            await expect(
              page.getByRole("button", { name: "Board", exact: true }),
            ).toHaveAttribute("aria-current", "page");
          else
            await expect(
              page.getByLabel("Project", { exact: true }),
            ).toHaveValue(otherProject);
          assert.equal(new URL(page.url()).searchParams.has("resource"), false);
        } finally {
          release();
          if (intercepted)
            await waitForSignal(handled, "resource interceptor cleanup");
          await page.unroute(matcher);
        }
      }
      return "Both a view switch and a project switch stay in place after the held real resource response is released.";
    },
  );

  await check(
    "A07",
    "Browser Back waits for an unresolved autosave before leaving the editor",
    async () => {
      await route("focus");
      await page.getByRole("button", { name: "Board", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Board", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.getByRole("button", { name: "Calendar", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Calendar", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.goBack();
      await expect(
        page.getByRole("button", { name: "Board", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      const card = await create({ title: unique("Repair browser Back draft") });
      await route();
      await page.getByLabel("Search content", { exact: true }).fill(card.title);
      await page.locator("main").getByText(card.title, { exact: true }).click();
      const path = `${config.origin}${base}/cards/${card.id}`;
      let autosaveStartedResolve;
      const autosaveStarted = new Promise(
        (resolve) => (autosaveStartedResolve = resolve),
      );
      let releaseAutosave;
      const autosaveReleased = new Promise(
        (resolve) => (releaseAutosave = resolve),
      );
      await page.route(path, async (intercept) => {
        if (intercept.request().method() !== "PATCH")
          return intercept.continue();
        autosaveStartedResolve();
        await autosaveReleased;
        return intercept.continue();
      });
      try {
        await title().fill("Pending browser Back autosave");
        await waitForSignal(autosaveStarted, "browser Back autosave");
        await page.goBack();
        await expect(dialog()).toBeVisible();
        await expect(title()).toHaveValue("Pending browser Back autosave");
        assert.equal(get(card.id).metadata.title, card.title);
        releaseAutosave();
        await expect
          .poll(() => get(card.id).metadata.title)
          .toBe("Pending browser Back autosave");
        await expect(dialog()).toBeHidden();
        await expect(page).toHaveURL(
          (url) =>
            url.searchParams.get("view") === "list" &&
            !url.searchParams.has("resource"),
        );
        await screenshot("A07-kept-navigation-draft");
        return "View history stays open until the pending autosave is acknowledged.";
      } finally {
        releaseAutosave();
        await page.unroute(path);
      }
    },
  );

  await check(
    "A07-save",
    "Autosave before Browser Back persists the draft and completes navigation",
    async () => {
      const card = await create({ title: unique("Repair Back save probe") });
      await route();
      await page.getByLabel("Search content", { exact: true }).fill(card.title);
      await page.locator("main").getByText(card.title, { exact: true }).click();
      const savedTitle = `${card.title} — saved after navigation request`;
      await title().fill(savedTitle);
      await waitForAutosaveACK();
      await page.goBack();
      assert.equal(get(card.id).metadata.title, savedTitle);
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("view") === "list" &&
          !url.searchParams.has("resource"),
      );
      await expect(
        page.locator("main").getByText(savedTitle, { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Board", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Board", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.goBack();
      await expect(
        page.getByRole("button", { name: "List", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.locator("main").getByText(savedTitle, { exact: true }).click();
      await expect(title()).toHaveValue(savedTitle);
      await page.goBack();
      await page.goForward();
      await expect(title()).toHaveValue(savedTitle);
      await expect(page).toHaveURL(
        (url) => url.searchParams.get("resource") === card.id,
      );
      await screenshot("A07-save-and-history");
      return "The destination is applied after confirmed autosave; subsequent view history and rapid clean card Back/Forward remain usable.";
    },
  );

  await check(
    "A09",
    "Loaded Focus pins obey project and title filters",
    async () => {
      const own = await create({
        title: unique("Repair focus selected project"),
      });
      const other = await create(
        { title: unique("Repair focus other project") },
        otherProject,
      );
      for (const [projectId, card] of [
        [project, own],
        [otherProject, other],
      ]) {
        const path = `/api/v1/projects/${projectId}/cards/${card.id}`;
        await mutate(
          "PATCH",
          `/api/v1/projects/${projectId}/cards/${card.id}`,
          { set: { pinned: true } },
          cli("get", path).version,
        );
      }
      await route("focus");
      const pins = page.getByRole("region", { name: "In focus", exact: true });
      await expect(
        pins.getByRole("heading", { name: own.title, exact: true }),
      ).toBeVisible();
      await expect(
        pins.getByRole("heading", { name: other.title, exact: true }),
      ).not.toBeVisible();
      await page.getByLabel("Project", { exact: true }).selectOption("");
      await expect(
        pins.getByRole("heading", { name: other.title, exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Filter loaded titles", { exact: true })
        .fill(other.title);
      await expect(
        pins.getByRole("heading", { name: own.title, exact: true }),
      ).not.toBeVisible();
      await expect(
        pins.getByRole("heading", { name: other.title, exact: true }),
      ).toBeVisible();
      await screenshot("A09-scoped-focus");
      return "Presence was established before asserting exclusions in each scope.";
    },
  );

  await writeFile(
    join(evidenceDir, "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  return { results, errors };
}

if (isMain(import.meta.url))
  await runBrowserSuite(
    async ({
      config,
      cli,
      runtime: runtimeDir,
      evidence: evidenceDir,
      browser,
      newContext,
      pair,
    }) => {
      const context = await newContext();
      const page = await context.newPage();
      await pair(page);
      await context.storageState({
        path: join(runtimeDir, "browser-state.json"),
      });
      const outcome = await runEditorChecks({
        page,
        config,
        cli,
        evidenceDir,
        runtimeDir,
      });
      if (
        outcome.results.some((result) => result.status !== "pass") ||
        outcome.errors.length
      )
        process.exitCode = 1;
      console.log(
        JSON.stringify({
          passed: outcome.results.filter((result) => result.status === "pass")
            .length,
          total: outcome.results.length,
          errors: outcome.errors,
          browser: browser.version(),
          evidenceDir,
        }),
      );
    },
  );
