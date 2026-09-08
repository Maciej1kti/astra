/** Real paired browser and synthetic audit-host source files. No authentication bypass. */
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

export async function runEditorChecks({ page, config, cli, evidenceDir, runtimeDir }) {
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  const project = config.projects[0].id, otherProject = config.projects[1].id;
  const base = `/api/v1/projects/${project}`;
  const unique = (name) => `${name} ${Date.now().toString(36)}`;
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(12000);
  const commandFile = join(runtimeDir, "repair-browser-command.json");
  const dialog = () => page.getByRole("dialog", { name: /^(Edit|Create) resource$/ });
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
  const create = (payload, projectId = project) => mutate("POST", `/api/v1/projects/${projectId}/cards`, payload);
  async function close() {
    if (!(await dialog().count())) return;
    await dialog().getByRole("button", { name: "Close editor", exact: true }).click();
    const discard = dialog().getByRole("button", { name: "Discard draft", exact: true });
    if (await discard.isVisible()) await discard.click();
    await dialog().waitFor({ state: "hidden" });
  }
  async function route(view = "list", extra = {}) {
    await close();
    const params = new URLSearchParams({ view, project, ...extra });
    await page.goto(`${config.origin}/?${params}`);
    await page.getByLabel("Project", { exact: true }).waitFor();
    await expect(page.locator(".asidebottom")).toContainText("Connected to host");
  }
  async function open(id) {
    await route("list", { type: "card", resource: id });
    await title().waitFor();
    await expect(dialog().getByRole("button", { name: /^(Pin to focus|Remove from focus)$/ })).toBeEnabled();
  }
  async function save() {
    await dialog().getByRole("button", { name: "Save changes", exact: true }).click();
    await dialog().waitFor({ state: "hidden" });
  }
  async function screenshot(name) {
    await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: !(await dialog().isVisible()) });
  }
  async function waitForSignal(signal, label) {
    let timeout;
    try {
      return await Promise.race([signal, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 12000);
      })]);
    } finally { clearTimeout(timeout); }
  }
  async function check(id, name, run) {
    const started = Date.now();
    try {
      const detail = await run();
      results.push({ id, name, status: "pass", detail, ms: Date.now() - started });
    } catch (cause) {
      results.push({ id, name, status: "fail", error: String(cause), ms: Date.now() - started });
      await screenshot(`${id}-failure`).catch(() => {});
    } finally {
      await close().catch(() => {});
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(join(evidenceDir, "results.json"), JSON.stringify({ results, errors }, null, 2));
    }
  }

  await check("A01", "Pin and remove pin preserve an unsaved title and body", async () => {
    const card = await create({ title: "Repair draft probe", body: "Saved baseline" });
    await open(card.id);
    await title().fill("Repair draft — preserved after pin");
    await dialog().getByLabel(/^Description/).fill("Unsaved body — Zażółć gęślą jaźń.");
    await dialog().getByRole("button", { name: "Pin to focus", exact: true }).click();
    await expect(dialog().getByRole("button", { name: "Remove from focus", exact: true })).toBeEnabled();
    await expect(title()).toHaveValue("Repair draft — preserved after pin");
    assert.equal(get(card.id).metadata.title, "Repair draft probe");
    await dialog().getByRole("button", { name: "Remove from focus", exact: true }).click();
    await expect(dialog().getByRole("button", { name: "Pin to focus", exact: true })).toBeEnabled();
    await expect(dialog().getByLabel(/^Description/)).toHaveValue("Unsaved body — Zażółć gęślą jaźń.");
    await screenshot("A01-preserved-draft");
    await save();
    assert.equal(get(card.id).metadata.title, "Repair draft — preserved after pin");
    assert.equal(get(card.id).body, "Unsaved body — Zażółć gęślą jaźń.");
    return { card: card.id, persistedOnlyOnSave: true };
  });

  await check("A01-recovery", "A real committed focus command with its browser response lost recovers without closing", async () => {
    const card = await create({ title: "Repair focus recovery probe" });
    await open(card.id);
    await title().fill("Unsaved after focus response loss");
    let writes = 0, requestId, epoch, interceptionError;
    const matcher = "**/api/v1/workspace/focus";
    await page.route(matcher, async (intercept) => {
      if (intercept.request().method() !== "PUT") return intercept.continue();
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
      await dialog().getByRole("button", { name: "Pin to focus", exact: true }).click();
      // Pending controls appear as soon as the request starts. Wait until the
      // completed interception has released the in-flight command first.
      await expect(dialog().getByRole("button", { name: "Check status", exact: true })).toBeEnabled();
      assert.equal(interceptionError, undefined);
      await expect(title()).toHaveValue("Unsaved after focus response loss");
      await expect(title()).toBeDisabled();
      assert(cli("get", "/api/v1/workspace/focus").items.some((item) => item.card_id === card.id));
      await dialog().getByRole("button", { name: "Check status", exact: true }).click();
      await expect(dialog().getByRole("button", { name: "Remove from focus", exact: true })).toBeEnabled();
      await expect(title()).toBeEnabled();
      await expect(title()).toHaveValue("Unsaved after focus response loss");
      assert.equal(writes, 1);
      assert.equal(cli("get", `/api/v1/commands/${requestId}?epoch=${epoch}`).state, "committed");
      assert.equal(get(card.id).metadata.title, "Repair focus recovery probe");
      await screenshot("A01-recovered-focus-draft");
      return { committedBeforeLostResponse: true, writes, requestId };
    } finally { await page.unroute(matcher); }
  });

  await check("A01-conflict", "A focus conflict preserves the draft and refreshes only focus state", async () => {
    const card = await create({ title: "Repair focus conflict probe" });
    const competing = await create({ title: "Repair competing pin" }, otherProject);
    await open(card.id);
    await title().fill("Unsaved focus conflict draft");
    const focus = cli("get", "/api/v1/workspace/focus");
    await mutate("PUT", "/api/v1/workspace/focus", { items: [...focus.items, { project_id: otherProject, card_id: competing.id }] }, focus.version);
    await dialog().getByRole("button", { name: "Pin to focus", exact: true }).click();
    await expect(dialog().getByRole("alert")).toContainText("Focus changed elsewhere");
    await expect(title()).toHaveValue("Unsaved focus conflict draft");
    await expect(dialog().getByText("Current saved version · your draft stays above", { exact: true })).toHaveCount(0);
    await expect(dialog().getByRole("button", { name: "Pin to focus", exact: true })).toBeEnabled();
    assert.equal(get(card.id).metadata.title, "Repair focus conflict probe");
    return "The conflicting workspace command never replaced the card draft.";
  });

  await check("A02", "An unrelated title save preserves exact source tags including commas and Unicode", async () => {
    const labels = ["Research, discovery", " QA ", "Café", "Cafe\u0301"];
    const card = await create({ title: "Repair literal tags probe", labels });
    await open(card.id);
    await expect(dialog().getByRole("list", { name: "Selected tags", exact: true }).locator("li")).toHaveCount(labels.length);
    await title().fill("Repair literal tags — renamed");
    await save();
    assert.deepEqual(get(card.id).metadata.labels, labels);
    await open(card.id);
    await screenshot("A02-exact-tags");
    return { labels: get(card.id).metadata.labels };
  });

  await check("A10", "Tag chips add literal names, reject duplicates locally and support keyboard suggestions", async () => {
    await create({ title: "Repair source suggestion", labels: ["Existing, suggested tag"] });
    const card = await create({ title: "Repair tag controls", labels: ["qa"] });
    await open(card.id);
    const before = get(card.id).version;
    await tags().fill("qa"); await tags().press("Enter");
    await expect(dialog().getByRole("alert")).toContainText("already on the card");
    await expect(tags()).toHaveAttribute("aria-invalid", "true");
    await dialog().getByRole("button", { name: "Save changes", exact: true }).click();
    assert.equal(get(card.id).version, before);
    await tags().fill("x".repeat(49)); await tags().press("Enter");
    await expect(dialog().getByRole("alert")).toContainText("48 characters");
    await tags().fill("Existing, suggested");
    await expect(dialog().getByRole("option", { name: "Existing, suggested tag", exact: true })).toBeVisible();
    await tags().press("ArrowDown"); await tags().press("Enter");
    await expect(dialog().getByRole("button", { name: "Remove tag Existing, suggested tag", exact: true })).toBeVisible();
    await tags().fill("Nowy, ważny tag"); await tags().press("Enter");
    await dialog().getByRole("button", { name: "Remove tag qa", exact: true }).click();
    await screenshot("A10-tag-chips");
    await save();
    assert.deepEqual(get(card.id).metadata.labels, ["Existing, suggested tag", "Nowy, ważny tag"]);
    return "Source suggestion and a new comma-containing tag saved; duplicate and long-name attempts left the source version unchanged.";
  });

  await check("A10-limits-mobile", "The 20-tag limit is recoverable and chip controls remain reachable at 390px", async () => {
    const labels = Array.from({ length: 20 }, (_, index) => `Repair tag ${index + 1}`);
    const card = await create({ title: "Repair tag limit", labels });
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await open(card.id);
      await tags().fill("another"); await tags().press("Enter");
      await expect(dialog().getByRole("alert")).toContainText("20 tags");
      await dialog().getByRole("button", { name: "Remove tag Repair tag 1", exact: true }).click();
      await tags().fill("😀".repeat(48)); await tags().press("Enter");
      await expect(dialog().getByRole("list", { name: "Selected tags", exact: true }).locator("li")).toHaveCount(20);
      const metrics = await dialog().evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
      assert(metrics.scrollWidth <= metrics.width + 1, JSON.stringify(metrics));
      const target = await dialog().getByRole("button", { name: "Remove tag Repair tag 2", exact: true }).boundingBox();
      assert(target.width >= 44 && target.height >= 44, JSON.stringify(target));
      await screenshot("A10-mobile-tag-limit");
      await save();
      assert.equal(get(card.id).metadata.labels.length, 20);
      assert.equal([...get(card.id).metadata.labels.at(-1)].length, 48);
      return { metrics, removalTarget: target };
    } finally { await page.setViewportSize({ width: 1440, height: 1000 }); }
  });

  await check("A01-undo", "Dirty Undo cannot send a command; clean Undo still restores a saved edit", async () => {
    const card = await create({ title: "Repair undo baseline" });
    await open(card.id); await title().fill("Repair undo saved edit"); await save();
    await open(card.id); await title().fill("Repair undo unsaved draft");
    await dialog().getByText("Change history", { exact: true }).click();
    await dialog().getByRole("button", { name: "First history page", exact: true }).click();
    await expect(dialog().getByRole("button", { name: "Undo this change", exact: true }).first()).toBeDisabled();
    await expect(dialog().getByText("Save or discard your draft before undoing a saved change.", { exact: true })).toBeVisible();
    assert.equal(get(card.id).metadata.title, "Repair undo saved edit");
    await close(); await open(card.id);
    await dialog().getByText("Change history", { exact: true }).click();
    await dialog().getByRole("button", { name: "First history page", exact: true }).click();
    await dialog().getByRole("button", { name: "Undo this change", exact: true }).first().click();
    await dialog().waitFor({ state: "hidden" });
    assert.equal(get(card.id).metadata.title, "Repair undo baseline");
    return "Draft was explicitly discarded before the guarded source Undo.";
  });

  await check("A03", "A milestone List selection cannot change Board, Calendar or Timeline creation type", async () => {
    await route();
    await page.getByLabel("Resource type", { exact: true }).selectOption("milestones");
    for (const view of ["Board", "Calendar", "Timeline"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(page.locator(".heading").getByRole("button", { name: /Add card$/ })).toBeVisible();
      await page.locator(".heading").getByRole("button", { name: /Add card$/ }).click();
      await expect(dialog().getByLabel("Kind", { exact: true })).toHaveValue("outcome");
      await close();
    }
    return "All three planning views create card drafts.";
  });

  await check("A04", "Archive filter retrieves archived cards, survives reload and restores them", async () => {
    const card = await create({ title: unique("Repair archive retrieval"), status: "active", priority: "high", labels: ["Archive, literal"] });
    const row = () => page.locator("main").getByText(card.title, { exact: true });
    const archivedEmpty = () => page.getByText("No archived cards match this selection. Clear filters to see more archived cards.", { exact: true });
    await open(card.id);
    await dialog().getByText("Card lifecycle", { exact: true }).click();
    await dialog().getByLabel("Archived", { exact: true }).check();
    await save();
    assert.equal(get(card.id).metadata.archived, true);
    await route();
    await page.getByLabel("Search content", { exact: true }).fill(card.title);
    await expect(page.getByText("No items match this selection. Try another project or clear the filters.", { exact: true })).toBeVisible();
    await expect(row()).not.toBeVisible();
    await page.getByLabel("Card visibility", { exact: true }).selectOption("true");
    await expect(row()).toBeVisible();
    await page.getByLabel("Status filter", { exact: true }).selectOption("done");
    await expect(archivedEmpty()).toBeVisible();
    await expect(row()).not.toBeVisible();
    await page.getByLabel("Status filter", { exact: true }).selectOption("active");
    await expect(row()).toBeVisible();
    await page.getByLabel("Priority filter", { exact: true }).selectOption("urgent");
    await expect(archivedEmpty()).toBeVisible();
    await expect(row()).not.toBeVisible();
    await page.getByLabel("Priority filter", { exact: true }).selectOption("high");
    await page.getByLabel("Tag filter", { exact: true }).fill("Archive, literal");
    await expect(row()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Card visibility", { exact: true })).toHaveValue("true");
    await expect(page.getByLabel("Status filter", { exact: true })).toHaveValue("active");
    await expect(page.getByLabel("Priority filter", { exact: true })).toHaveValue("high");
    await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue("Archive, literal");
    await expect(row()).toBeVisible();
    // A substring is not the exact stored tag, even though the literal name
    // contains a comma. This must exclude the otherwise matching card.
    await page.getByLabel("Tag filter", { exact: true }).fill("Archive");
    await expect(archivedEmpty()).toBeVisible();
    await expect(row()).not.toBeVisible();
    await page.getByLabel("Tag filter", { exact: true }).fill("Archive, literal");
    await row().click();
    await dialog().getByText("Card lifecycle", { exact: true }).click();
    await dialog().getByLabel("Archived", { exact: true }).uncheck();
    await save();
    assert.equal(get(card.id).metadata.archived, false);
    await page.getByLabel("Card visibility", { exact: true }).selectOption("false");
    await expect(row()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Card visibility", { exact: true })).toHaveValue("false");
    await expect(page.getByLabel("Status filter", { exact: true })).toHaveValue("active");
    await expect(page.getByLabel("Priority filter", { exact: true })).toHaveValue("high");
    await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue("Archive, literal");
    await expect(row()).toBeVisible();
    assert.deepEqual(get(card.id).metadata.labels, ["Archive, literal"]);
    await screenshot("A04-restored-archive");
    return { archivedThenRestored: true, statusAndPriorityExclusions: true, exactCommaTagFilter: true, filtersPersistedAcrossReloads: true };
  });

  await check("A04-literal-spaces", "Exact tag filtering preserves source labels with outer spaces across reload", async () => {
    const card = await create({ title: unique("Repair literal spaced tag"), labels: [" QA "] });
    await route();
    await page.getByLabel("Search content", { exact: true }).fill(card.title);
    const row = page.locator("main").getByText(card.title, { exact: true });
    await expect(row).toBeVisible();
    await page.getByLabel("Tag filter", { exact: true }).fill(" QA ");
    await expect(row).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get("label") === " QA ");
    await page.reload();
    await expect(page.getByLabel("Tag filter", { exact: true })).toHaveValue(" QA ");
    await expect(row).toBeVisible();
    await page.getByLabel("Tag filter", { exact: true }).fill("QA");
    await expect(page.getByText("No items match this selection. Try another project or clear the filters.", { exact: true })).toBeVisible();
    await expect(row).not.toBeVisible();
    await page.getByLabel("Tag filter", { exact: true }).fill(" QA ");
    await expect(row).toBeVisible();
    assert.deepEqual(get(card.id).metadata.labels, [" QA "]);
    return "The exact source name including both outer spaces matches; its trimmed spelling does not.";
  });

  await check("A07-late-open", "Late card reads cannot open an inspector after changing view or project", async () => {
    const card = await create({ title: unique("Repair delayed card read") });
    const path = `${base}/cards/${card.id}`;
    const matcher = `**${path}`;
    for (const destination of ["view", "project"]) {
      await route();
      await page.getByLabel("Search content", { exact: true }).fill(card.title);
      const row = page.locator("main").getByText(card.title, { exact: true });
      await expect(row).toBeVisible();
      let release, notifyReady, notifyHandled, interceptionError, intercepted = false;
      const released = new Promise((resolve) => { release = resolve; });
      const ready = new Promise((resolve) => { notifyReady = resolve; });
      const handled = new Promise((resolve) => { notifyHandled = resolve; });
      await page.route(matcher, async (intercept) => {
        if (intercept.request().method() !== "GET") return intercept.continue();
        intercepted = true;
        try {
          const response = await intercept.fetch();
          assert.equal(response.ok(), true);
          notifyReady();
          await released;
          await intercept.fulfill({ response });
        } catch (error) { interceptionError = error; notifyReady(); }
        finally { notifyHandled(); }
      });
      try {
        await row.click();
        await waitForSignal(ready, "the held resource response");
        assert.equal(interceptionError, undefined);
        if (destination === "view") {
          await page.getByRole("button", { name: "Board", exact: true }).click();
          await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-current", "page");
        } else {
          await page.getByLabel("Project", { exact: true }).selectOption(otherProject);
          await expect(page.getByLabel("Project", { exact: true })).toHaveValue(otherProject);
        }
        const responseReceived = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "GET");
        release();
        const response = await responseReceived;
        await response.finished();
        await waitForSignal(handled, "the released resource response");
        assert.equal(interceptionError, undefined);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(dialog()).toHaveCount(0);
        if (destination === "view")
          await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-current", "page");
        else
          await expect(page.getByLabel("Project", { exact: true })).toHaveValue(otherProject);
        assert.equal(new URL(page.url()).searchParams.has("resource"), false);
      } finally {
        release();
        if (intercepted) await waitForSignal(handled, "resource interceptor cleanup");
        await page.unroute(matcher);
      }
    }
    return "Both a view switch and a project switch stay in place after the held real resource response is released.";
  });

  await check("A07", "Browser Back restores views and protects a dirty editor", async () => {
    await route("focus");
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-current", "page");
    const card = await create({ title: unique("Repair browser Back draft") });
    await route();
    await page.getByLabel("Search content", { exact: true }).fill(card.title);
    await page.locator("main").getByText(card.title, { exact: true }).click();
    await title().fill("Unsaved browser Back draft");
    const editorUrl = page.url();
    await page.goBack();
    await dialog().getByText("Discard your unsaved draft?", { exact: true }).waitFor();
    await dialog().getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(title()).toHaveValue("Unsaved browser Back draft");
    assert.equal(page.url(), editorUrl);
    assert.equal(get(card.id).metadata.title, card.title);
    await screenshot("A07-kept-navigation-draft");
    return "View history and dirty editor history use distinct guarded transitions.";
  });

  await check("A07-save", "Save after dirty Browser Back persists the draft and completes the queued navigation", async () => {
    const card = await create({ title: unique("Repair Back save probe") });
    await route();
    await page.getByLabel("Search content", { exact: true }).fill(card.title);
    await page.locator("main").getByText(card.title, { exact: true }).click();
    const savedTitle = `${card.title} — saved after navigation request`;
    await title().fill(savedTitle);
    await page.goBack();
    await dialog().getByText("Discard your unsaved draft?", { exact: true }).waitFor();
    await save();
    assert.equal(get(card.id).metadata.title, savedTitle);
    await expect(page).toHaveURL((url) => url.searchParams.get("view") === "list" && !url.searchParams.has("resource"));
    await expect(page.locator("main").getByText(savedTitle, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-current", "page");
    await page.locator("main").getByText(savedTitle, { exact: true }).click();
    await expect(title()).toHaveValue(savedTitle);
    await page.goBack();
    await page.goForward();
    await expect(title()).toHaveValue(savedTitle);
    await expect(page).toHaveURL((url) => url.searchParams.get("resource") === card.id);
    await screenshot("A07-save-and-history");
    return "The queued destination is applied after confirmed Save; subsequent view history and rapid clean card Back/Forward remain usable.";
  });

  await check("A09", "Loaded Focus pins obey project and title filters", async () => {
    const own = await create({ title: unique("Repair focus selected project") });
    const other = await create({ title: unique("Repair focus other project") }, otherProject);
    const focus = cli("get", "/api/v1/workspace/focus");
    await mutate("PUT", "/api/v1/workspace/focus", { items: [...focus.items, { project_id: project, card_id: own.id }, { project_id: otherProject, card_id: other.id }] }, focus.version);
    await route("focus");
    const pins = page.locator("main .grid");
    await expect(pins.getByRole("heading", { name: own.title, exact: true })).toBeVisible();
    await expect(pins.getByRole("heading", { name: other.title, exact: true })).not.toBeVisible();
    await page.getByLabel("Project", { exact: true }).selectOption("");
    await expect(pins.getByRole("heading", { name: other.title, exact: true })).toBeVisible();
    await page.getByLabel("Filter loaded titles", { exact: true }).fill(other.title);
    await expect(pins.getByRole("heading", { name: own.title, exact: true })).not.toBeVisible();
    await expect(pins.getByRole("heading", { name: other.title, exact: true })).toBeVisible();
    await screenshot("A09-scoped-focus");
    return "Presence was established before asserting exclusions in each scope.";
  });

  await check("inspector-context", "Card relationships and targeted updates display names and content", async () => {
    const predecessor = await create({ title: "Repair named predecessor" });
    const milestone = await mutate("POST", `${base}/milestones`, { title: "Repair named milestone" });
    const card = await create({ title: "Repair card inspector", milestone_id: milestone.id, depends_on: [predecessor.id] });
    await mutate("POST", `${base}/updates`, { kind: "result", summary: "Repair card result", author: { kind: "human", label: "Synthetic repair QA" }, target: { type: "card", id: card.id }, body: "## Verified card context\n\nThis update belongs to the selected card." });
    await open(card.id);
    await expect(dialog().locator(".relation-row").getByText(milestone.title, { exact: true })).toBeVisible();
    await expect(dialog().locator(".relation-row").getByText(predecessor.title, { exact: true })).toBeVisible();
    await dialog().getByText("Card updates", { exact: true }).click();
    await dialog().getByRole("button", { name: "Repair card result", exact: true }).click();
    await expect(dialog().getByRole("heading", { name: "Verified card context", exact: true })).toBeVisible();
    await screenshot("inspector-related-context");
    return "Named relationships and real card-targeted update Markdown are visible inside the inspector.";
  });

  await writeFile(join(evidenceDir, "results.json"), JSON.stringify({ results, errors }, null, 2));
  return { results, errors };
}

async function main() {
  const root = resolve(import.meta.dirname, "../../..");
  const runtimeDir = resolve(root, process.env.ASTRA_AUDIT_RUNTIME ?? ".manual/audit-2026-09-08");
  const evidenceDir = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/regressions/editor");
  const config = JSON.parse(await readFile(join(runtimeDir, "connection.json"), "utf8"));
  const cli = (...args) => {
    let output;
    try { output = execFileSync(join(root, "target", process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug", "projectctl"), ["--socket", config.socket, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { if (error.status !== 9) throw error; output = error.stdout; }
    const envelope = JSON.parse(output);
    assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
    return envelope.data;
  };
  let storageState;
  try { storageState = JSON.parse(await readFile(join(runtimeDir, "browser-state.json"), "utf8")); } catch {}
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(config.origin);
    const requestAccess = page.getByRole("button", { name: "Request access" });
    await requestAccess.or(page.getByLabel("Project", { exact: true })).waitFor();
    if (await requestAccess.isVisible()) {
      await requestAccess.click();
      await page.getByText("Compare this challenge on the host machine:").waitFor();
      const visible = await page.locator("body").innerText();
      const matching = cli("pairings").items.filter((item) => visible.includes(item.challenge));
      assert.equal(matching.length, 1);
      cli("approve", matching[0].id, "--challenge", matching[0].challenge);
      await page.getByRole("button", { name: "I approved this browser", exact: true }).click();
    }
    await page.getByLabel("Project", { exact: true }).waitFor();
    await context.storageState({ path: join(runtimeDir, "browser-state.json") });
    const outcome = await runEditorChecks({ page, config, cli, evidenceDir, runtimeDir });
    if (outcome.results.some((result) => result.status !== "pass") || outcome.errors.length) process.exitCode = 1;
    console.log(JSON.stringify({ passed: outcome.results.filter((result) => result.status === "pass").length, total: outcome.results.length, errors: outcome.errors, browser: browser.version(), evidenceDir }));
  } finally { await browser.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
