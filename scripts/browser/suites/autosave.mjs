/** Autosave editor regressions against the real paired synthetic host. */
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { isMain, runBrowserSuite } from "../runtime.mjs";
import { binaries } from "../host.mjs";

export async function runAutosaveChecks({
  page,
  config,
  cli,
  evidenceDir,
  runtimeDir,
}) {
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  const project = config.projects[0].id;
  const base = `/api/v1/projects/${project}`;
  const commandFile = join(runtimeDir, "autosave-command.json");
  const writes = [];
  const results = [];
  const errors = [];
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  const dialog = () =>
    page.getByRole("dialog", { name: /^(Edit|Create) resource$/ });
  const title = () => dialog().getByLabel("Title", { exact: true });
  const owner = () => dialog().getByLabel(/^Owner/);
  const cardPath = (id) => `${base}/cards/${id}`;
  const projectPath = `${base}`;

  function isWrite(request) {
    const method = request.method();
    if (method !== "POST" && method !== "PATCH") return false;
    return new URL(request.url()).pathname.startsWith("/api/v1/projects/");
  }
  const onRequest = (request) => {
    if (!isWrite(request)) return;
    let payload;
    try {
      payload = request.postDataJSON();
    } catch {
      payload = request.postData();
    }
    const headers = request.headers();
    writes.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      payload,
      requestId: headers["x-request-id"],
      epoch: headers["x-command-epoch"],
      version: headers["if-match"],
    });
  };
  page.on("request", onRequest);

  async function mutate(method, path, payload, version) {
    await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
    const args = ["command", method, path, "--json-file", commandFile];
    if (version) args.push("--if-version", version);
    return cli(...args).result;
  }
  async function createCard(payload) {
    const result = await mutate("POST", `${base}/cards`, payload);
    return cli("get", cardPath(result.id));
  }
  function writesFor(path, method) {
    return writes.filter(
      (write) => write.path === path && (!method || write.method === method),
    );
  }
  async function bounded(promise, label, timeout = 15000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out waiting for ${label}`)),
            timeout,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function waitForWrite(path, method, count) {
    await expect
      .poll(() => writesFor(path, method).length, { timeout: 15000 })
      .toBe(count);
    return writesFor(path, method).at(-1);
  }
  async function waitForSaved(path, predicate) {
    await expect
      .poll(
        () => {
          try {
            return predicate(cli(`get`, path));
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
  }
  async function routeTo(view, params = {}) {
    const query = new URLSearchParams({ view, project, ...params });
    await page.goto(`${config.origin}/?${query}`);
    await expect(page.locator(".asidebottom")).toContainText(
      "Connected to host",
    );
  }
  async function openCard(id) {
    await routeTo("list", { type: "card", resource: id });
    await title().waitFor();
  }
  async function openProject() {
    await routeTo("projects", {
      resource_project: project,
      type: "project",
      resource: project,
    });
    await dialog().waitFor();
    await dialog().getByLabel("Name", { exact: true }).waitFor();
  }
  async function closeDialog() {
    if (!(await dialog().count())) return;
    const close = dialog().getByRole("button", {
      name: "Close editor",
      exact: true,
    });
    if ((await close.isVisible()) && (await close.isEnabled()))
      await close.click();
    const discard = dialog().getByRole("button", {
      name: "Discard draft",
      exact: true,
    });
    if (await discard.isVisible()) await discard.click();
    const discardUpdate = dialog().getByRole("button", {
      name: "Discard update draft",
      exact: true,
    });
    if (await discardUpdate.isVisible()) await discardUpdate.click();
    await dialog()
      .waitFor({ state: "hidden" })
      .catch(() => {});
  }
  async function screenshot(id) {
    await page.screenshot({
      path: join(evidenceDir, `${id}-failure.png`),
      fullPage: !(await dialog()
        .isVisible()
        .catch(() => false)),
    });
  }
  async function check(id, name, run) {
    const started = Date.now();
    writes.length = 0;
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
      await screenshot(id).catch(() => {});
    } finally {
      await closeDialog().catch(() => {});
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        join(evidenceDir, "results.json"),
        JSON.stringify({ results, errors }, null, 2),
      );
    }
  }

  await check(
    "AS01",
    "A valid new card creates once, then patches the same resource while the modal stays open",
    async () => {
      await routeTo("list");
      await page
        .locator(".heading")
        .getByRole("button", { name: /Add card$/ })
        .click();
      await dialog().waitFor();
      await expect(
        dialog().getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog().getByRole("button", { name: "Cancel", exact: true }),
      ).toHaveCount(0);
      const name = `Autosave new card ${Date.now().toString(36)}`;
      const post = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/cards"),
      );
      await title().fill(name);
      await page.waitForTimeout(200);
      assert.equal(writesFor(`${base}/cards`, "POST").length, 0);
      const postResponse = await post;
      assert.equal(postResponse.status(), 200);
      const envelope = await postResponse.json();
      const id = envelope.result.id;
      await expect(dialog()).toBeVisible();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("resource"))
        .toBe(id);
      const later = `${name} later`;
      const patch = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().endsWith(`/cards/${id}`),
      );
      await title().fill(later);
      const patchResponse = await patch;
      assert.equal(patchResponse.status(), 200);
      await waitForWrite(cardPath(id), "PATCH", 1);
      await waitForSaved(
        cardPath(id),
        (value) => value.metadata.title === later,
      );
      const immediateStarted = Date.now();
      const immediate = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().endsWith(`/cards/${id}`),
      );
      await dialog()
        .getByLabel("Status", { exact: true })
        .selectOption("active");
      const immediateResponse = await immediate;
      assert.equal(immediateResponse.status(), 200);
      assert(
        Date.now() - immediateStarted < 350,
        "discrete status changes should save without the text debounce",
      );
      await waitForWrite(cardPath(id), "PATCH", 2);
      assert.equal(writesFor(`${base}/cards`, "POST").length, 1);
      assert.equal(writesFor(cardPath(id), "PATCH").length, 2);
      assert.equal(new URL(page.url()).searchParams.get("resource"), id);
      await waitForSaved(
        cardPath(id),
        (value) =>
          value.metadata.title === later && value.metadata.status === "active",
      );
      await dialog()
        .getByRole("button", { name: "Delete card", exact: true })
        .click();
      await expect(dialog()).toContainText("Permanently delete card?");
      const deletion = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().endsWith(`/cards/${id}`),
      );
      await dialog()
        .getByRole("button", { name: "Permanently delete card", exact: true })
        .click();
      const deletionResponse = await deletion;
      assert.equal(deletionResponse.status(), 200);
      await expect(dialog()).toBeHidden();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("resource"))
        .toBeNull();
      await expect
        .poll(() => {
          try {
            cli("get", cardPath(id));
            return false;
          } catch {
            return true;
          }
        })
        .toBe(true);
      return {
        id,
        postThenPatch: true,
        discreteChangeImmediate: true,
        modalStayedOpen: true,
        deletedCardClearedRoute: true,
      };
    },
  );

  await check(
    "AS02",
    "Delayed acknowledgements serialize edits, preserve newest text and send owner clears from the prior version",
    async () => {
      const card = await createCard({
        title: `Autosave delayed ${Date.now().toString(36)}`,
        owner: "Original owner",
      });
      await openCard(card.metadata.id);
      const path = cardPath(card.metadata.id);
      let releaseFirst;
      const firstFetched = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      let firstReady;
      const firstReadyPromise = new Promise((resolve) => {
        firstReady = resolve;
      });
      await page.route(`${config.origin}${path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const response = await route.fetch();
        if (writesFor(path, "PATCH").length === 1) {
          assert.equal(response.status(), 200);
          const committed = cli(`get`, path);
          firstReady(committed.version);
          await bounded(firstFetched, "release of delayed autosave");
          await route.fulfill({ response });
        } else {
          await route.fulfill({ response });
        }
      });
      try {
        await owner().fill("Temporary owner");
        await title().fill("First delayed title");
        await expect
          .poll(() => writesFor(path, "PATCH").length, { timeout: 15000 })
          .toBe(1);
        const firstVersion = await bounded(
          firstReadyPromise,
          "first autosave ACK",
        );
        assert.equal(
          writesFor(path, "PATCH")[0].payload.set.owner,
          "Temporary owner",
        );
        await expect(title()).toBeEnabled();
        await title().fill("Newest typed title");
        await owner().fill("");
        await page.waitForTimeout(150);
        assert.equal(
          writesFor(path, "PATCH").length,
          1,
          "the second edit must wait for the first acknowledgement",
        );
        releaseFirst();
        await waitForWrite(path, "PATCH", 2);
        const second = writesFor(path, "PATCH")[1];
        assert.equal(second.version, JSON.stringify(firstVersion));
        assert.equal(second.payload.set.title, "Newest typed title");
        assert(second.payload.clear.includes("owner"));
        await waitForSaved(
          path,
          (value) =>
            value.metadata.title === "Newest typed title" &&
            !Object.hasOwn(value.metadata, "owner"),
        );
        let releaseThird = () => {};
        let thirdReady;
        const thirdReadyPromise = new Promise((resolve) => {
          thirdReady = resolve;
        });
        let holdThird = true;
        const thirdGate = new Promise((resolve) => {
          releaseThird = resolve;
        });
        await page.unroute(`${config.origin}${path}`);
        await page.route(`${config.origin}${path}`, async (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          const response = await route.fetch();
          if (holdThird && writesFor(path, "PATCH").length === 3) {
            holdThird = false;
            assert.equal(response.status(), 200);
            thirdReady();
            await bounded(thirdGate, "release of entry-buffer autosave");
          }
          await route.fulfill({ response });
        });
        try {
          await owner().fill("Owner ACK holder");
          await expect
            .poll(() => writesFor(path, "PATCH").length, { timeout: 15000 })
            .toBe(3);
          await bounded(thirdReadyPromise, "third autosave ACK");
          const tagDraft = `buffered-tag-${Date.now().toString(36)}`;
          const acceptanceDraft = "Buffered acceptance entry";
          const tagInput = dialog().locator(
            'input[placeholder="Find or create a tag"]',
          );
          const acceptanceInput = dialog().getByLabel(
            "New acceptance condition",
            { exact: true },
          );
          await tagInput.fill(tagDraft);
          await acceptanceInput.fill(acceptanceDraft);
          await page.waitForTimeout(550);
          assert.equal(
            writesFor(path, "PATCH").length,
            3,
            "entry buffers must not enqueue a source write",
          );
          releaseThird();
          await waitForSaved(
            path,
            (value) => value.metadata.owner === "Owner ACK holder",
          );
          await page.waitForTimeout(550);
          await expect(tagInput).toHaveValue(tagDraft);
          await expect(acceptanceInput).toHaveValue(acceptanceDraft);
          assert.equal(writesFor(path, "PATCH").length, 3);
          const persisted = cli("get", path);
          assert(
            !persisted.metadata.labels?.includes(tagDraft),
            "buffered tag must not be posted",
          );
          assert(
            !persisted.metadata.acceptance?.some(
              (item) => item.text === acceptanceDraft,
            ),
            "buffered acceptance item must not be posted",
          );
        } finally {
          releaseThird();
          await page.unroute(`${config.origin}${path}`);
        }
        return {
          serialized: true,
          versionChained: true,
          ownerCleared: true,
          entryBuffersSurviveAck: true,
        };
      } finally {
        releaseFirst();
        await page.unroute(`${config.origin}${path}`);
      }
    },
  );

  await check(
    "AS03",
    "Closing with X flushes the latest valid draft and waits for its acknowledgement",
    async () => {
      const card = await createCard({ title: `Autosave close ${Date.now()}` });
      await openCard(card.metadata.id);
      const path = cardPath(card.metadata.id);
      const next = "Latest value before close";
      await title().fill(next);
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await waitForWrite(path, "PATCH", 1);
      await expect(dialog()).toBeHidden();
      await waitForSaved(path, (value) => value.metadata.title === next);
      return { flushedBeforeClose: true };
    },
  );

  await check(
    "AS04",
    "An invalid card draft remains open with a visible copy action",
    async () => {
      const card = await createCard({
        title: `Autosave invalid ${Date.now()}`,
      });
      await openCard(card.metadata.id);
      await title().fill("");
      await page.waitForTimeout(550);
      assert.equal(writes.length, 0);
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog()).toBeVisible();
      await expect(
        dialog().getByRole("button", { name: "Copy draft", exact: true }),
      ).toBeVisible();
      await expect(dialog().getByTestId("autosave-status")).toHaveText(
        "Not saved",
      );
      await expect(
        dialog()
          .getByRole("alert")
          .filter({ hasText: /title|required|valid/i }),
      ).toContainText(/title|required|valid/i);
      return { invalidDraftPreserved: true, copyVisible: true };
    },
  );

  await check(
    "AS05",
    "A real 412 conflict keeps the card modal, draft and copy action visible",
    async () => {
      const card = await createCard({
        title: `Autosave conflict ${Date.now()}`,
      });
      await openCard(card.metadata.id);
      const path = cardPath(card.metadata.id);
      const observed = card.version;
      const draftTitle = "Draft kept after conflict";
      await page.route(`${config.origin}${path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        await mutate(
          "PATCH",
          path,
          { set: { title: "Competing CLI edit" } },
          observed,
        );
        const response = await route.fetch();
        assert.equal(response.status(), 412);
        await route.fulfill({ response });
      });
      try {
        await title().fill(draftTitle);
        await waitForWrite(path, "PATCH", 1);
        await expect(dialog()).toBeVisible();
        await expect(title()).toHaveValue(draftTitle);
        await expect(dialog().getByTestId("autosave-status")).toHaveText(
          "Not saved",
        );
        await expect(dialog().getByRole("alert")).toContainText(
          /conflict|version|changed/i,
        );
        await expect(
          dialog().getByRole("button", { name: "Copy draft", exact: true }),
        ).toBeVisible();
        return { conflictPreserved: true };
      } finally {
        await page.unroute(`${config.origin}${path}`);
      }
    },
  );

  await check(
    "AS06",
    "Project name and description autosave while Markdown renders safely and retains its source",
    async () => {
      const initialSource =
        "Existing unknownsource marker\n\nThe original project source remains intact.";
      const nextSource = [
        initialSource,
        "",
        "## Rendered project Markdown",
        "",
        "**Strong project text**",
        "",
        "<script>alert('unsafe')</script>",
        "",
        "![remote image](https://example.invalid/project-image.png)",
      ].join("\n");
      const before = cli("get", projectPath);
      await mutate(
        "PATCH",
        projectPath,
        {
          set: {
            body: initialSource,
          },
        },
        before.version,
      );
      await openProject();
      await expect(
        dialog().getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog().getByRole("button", { name: "Cancel", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog().getByRole("button", {
          name: "Preview Markdown",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        dialog().getByLabel("Review on", { exact: true }),
      ).toHaveCount(0);
      await expect(dialog().getByLabel("Phase", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        dialog().getByText("Additional fields", { exact: true }),
      ).toHaveCount(0);
      const name = `Autosave project ${Date.now().toString(36)}`;
      const projectWrites = () => writesFor(projectPath, "PATCH").length;
      await dialog().getByLabel("Name", { exact: true }).fill(name);
      await waitForWrite(projectPath, "PATCH", 1);
      await waitForSaved(projectPath, (value) => value.metadata.name === name);
      const editDescription = dialog().getByRole("button", {
        name: "Edit description",
        exact: true,
      });
      await editDescription.click();
      const sourceEditor = dialog().getByRole("textbox", {
        name: "Project description",
        exact: true,
      });
      await sourceEditor.focus();
      await expect(sourceEditor).toHaveValue(initialSource);
      const remoteImageRequests = [];
      const onRemoteImageRequest = (request) => {
        if (request.url().startsWith("https://example.invalid/"))
          remoteImageRequests.push(request.url());
      };
      page.on("request", onRemoteImageRequest);
      await sourceEditor.fill(nextSource);
      await sourceEditor.blur();
      const preview = dialog().locator(".project-description-rendered");
      await expect(preview).toBeVisible();
      await expect(preview).toContainText("Rendered project Markdown");
      await expect(preview.locator("h2")).toContainText(
        "Rendered project Markdown",
      );
      await expect(preview.locator("strong")).toContainText(
        "Strong project text",
      );
      const rendered = await preview.evaluate((node) => node.innerHTML);
      assert.doesNotMatch(rendered, /<(script|img|iframe|object|svg)\b/i);
      assert.equal(await preview.locator("img").count(), 0);
      assert.equal(remoteImageRequests.length, 0);
      await editDescription.click();
      await expect(sourceEditor).toHaveValue(nextSource);
      await sourceEditor.blur();
      await waitForWrite(projectPath, "PATCH", 2);
      await waitForSaved(projectPath, (value) => value.body === nextSource);
      await page.off("request", onRemoteImageRequest);
      await dialog()
        .getByLabel("Status", { exact: true })
        .selectOption("paused");
      await waitForWrite(projectPath, "PATCH", 3);
      await waitForSaved(
        projectPath,
        (value) =>
          value.metadata.state === "paused" && value.body === nextSource,
      );
      assert.equal(projectWrites(), 3);
      await expect(dialog()).toBeVisible();
      await dialog()
        .getByLabel("Status", { exact: true })
        .selectOption("active");
      await waitForWrite(projectPath, "PATCH", 4);
      await waitForSaved(
        projectPath,
        (value) =>
          value.metadata.state === "active" && value.body === nextSource,
      );
      const closeSource = `${nextSource}\n\nPointer close source is saved.`;
      await editDescription.click();
      await dialog()
        .getByLabel("Project description", { exact: true })
        .fill(closeSource);
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await waitForWrite(projectPath, "PATCH", 5);
      await waitForSaved(projectPath, (value) => value.body === closeSource);
      await expect(dialog()).toBeHidden();
      return {
        name: true,
        descriptionSource: true,
        markdownPreview: true,
        sanitizedPreview: true,
        pointerCloseFlushed: true,
        modalStayedOpen: true,
      };
    },
  );

  await check(
    "AS09",
    "The project editor is centered, has a blurred backdrop, and fits a 390px viewport",
    async () => {
      await openProject();
      const previousViewport = page.viewportSize() ?? {
        width: 1440,
        height: 1000,
      };
      try {
        const desktop = await dialog().evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const backdrop = getComputedStyle(node, "::backdrop");
          return {
            viewportWidth: innerWidth,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            centered:
              Math.abs(rect.left + rect.width / 2 - innerWidth / 2) <= 2,
            verticallyCentered:
              Math.abs(rect.top + rect.height / 2 - innerHeight / 2) <= 2,
            backdropFilter:
              backdrop.backdropFilter || backdrop.webkitBackdropFilter || "",
          };
        });
        assert(desktop.centered, JSON.stringify(desktop));
        assert(desktop.verticallyCentered, JSON.stringify(desktop));
        assert.match(desktop.backdropFilter, /blur\(/i);
        await page.screenshot({
          path: join(evidenceDir, "AS09-desktop.png"),
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(dialog()).toBeVisible();
        const mobile = await dialog().evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        });
        assert(
          mobile.documentWidth <= mobile.viewportWidth + 1,
          JSON.stringify(mobile),
        );
        assert(mobile.left >= 8, JSON.stringify(mobile));
        assert(
          mobile.right <= mobile.viewportWidth - 8,
          JSON.stringify(mobile),
        );
        assert(
          mobile.width <= mobile.viewportWidth - 16,
          JSON.stringify(mobile),
        );
        await page.screenshot({
          path: join(evidenceDir, "AS09-mobile-390.png"),
          fullPage: true,
        });
        return {
          centeredDesktop: true,
          verticallyCentered: true,
          blurredBackdrop: true,
          mobile390NoOverflow: true,
        };
      } finally {
        await page.setViewportSize(previousViewport);
      }
    },
  );

  await check(
    "AS10",
    "The project command contract rejects removed fields without changing the source",
    async () => {
      const original = cli("get", projectPath);
      async function expectRejected(payload) {
        await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
        const result = spawnSync(
          join(binaries, "projectctl"),
          [
            "--socket",
            config.socket,
            "command",
            "PATCH",
            projectPath,
            "--json-file",
            commandFile,
            "--if-version",
            original.version,
          ],
          { encoding: "utf8", timeout: 30000 },
        );
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.notEqual(result.status, 0);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.ok, false);
        assert.equal(envelope.http_status, 422);
        assert.equal(envelope.error.code, "VALIDATION_FAILED");
        const after = cli("get", projectPath);
        assert.equal(after.version, original.version);
        assert.equal(after.body, original.body);
      }
      for (const payload of [
        { set: { phase: "removed" } },
        { set: { review_on: "2026-12-31" } },
        { set: { "x-modal-probe": { retained: true } } },
        { clear: ["phase"] },
        { clear: ["review_on"] },
        { clear: ["x-modal-probe"] },
      ])
        await expectRejected(payload);

      const validName = `CLI project contract probe ${Date.now().toString(36)}`;
      await mutate(
        "PATCH",
        projectPath,
        { set: { name: validName } },
        original.version,
      );
      const updated = cli("get", projectPath);
      assert.equal(updated.metadata.name, validName);
      assert.equal(updated.body, original.body);
      return {
        removedFieldsRejected: true,
        invalidWritesPreservedSource: true,
        validEditReadBack: true,
      };
    },
  );

  await check(
    "AS07",
    "Card owner, acceptance, dependency and tag edits autosave while an independent report draft remains editable",
    async () => {
      const dependency = await createCard({
        title: `Autosave dependency ${Date.now().toString(36)}`,
      });
      const card = await createCard({
        title: `Autosave fields ${Date.now().toString(36)}`,
      });
      await openCard(card.metadata.id);
      const path = cardPath(card.metadata.id);
      await owner().fill("Added owner");
      await waitForWrite(path, "PATCH", 1);
      await waitForSaved(
        path,
        (value) => value.metadata.owner === "Added owner",
      );
      await owner().fill("");
      await waitForWrite(path, "PATCH", 2);
      await waitForSaved(
        path,
        (value) => !Object.hasOwn(value.metadata, "owner"),
      );
      const acceptance = dialog().getByLabel("New acceptance condition", {
        exact: true,
      });
      await acceptance.fill("The autosave acceptance condition is met.");
      await acceptance.press("Enter");
      await waitForWrite(path, "PATCH", 3);
      await waitForSaved(
        path,
        (value) => value.metadata.acceptance?.length === 1,
      );
      await dialog()
        .getByRole("checkbox", { name: /^Complete acceptance item 1:/ })
        .check();
      await waitForWrite(path, "PATCH", 4);
      await waitForSaved(
        path,
        (value) => value.metadata.acceptance?.[0]?.completed === true,
      );
      const tag = `autosave-tag-${Date.now().toString(36)}`;
      await dialog()
        .locator('input[placeholder="Find or create a tag"]')
        .fill(tag);
      await dialog()
        .locator('input[placeholder="Find or create a tag"]')
        .press("Enter");
      await waitForWrite(path, "PATCH", 5);
      await waitForSaved(path, (value) => value.metadata.labels?.includes(tag));
      await dialog()
        .getByLabel("Find by title", { exact: true })
        .fill(dependency.metadata.title);
      await dialog()
        .getByRole("button", { name: "Find resources", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: dependency.metadata.title, exact: true })
        .last()
        .click();
      await waitForWrite(path, "PATCH", 6);
      await waitForSaved(path, (value) =>
        value.metadata.depends_on?.includes(dependency.metadata.id),
      );
      await dialog()
        .getByRole("button", { name: "Add card update", exact: true })
        .click();
      await dialog()
        .getByLabel("Update summary", { exact: true })
        .fill("Independent report draft");
      await dialog()
        .getByLabel(/^Update details/)
        .fill("This draft must not block card autosave.");
      const latest = "Card autosave while report draft is open";
      await title().fill(latest);
      await waitForWrite(path, "PATCH", 7);
      await waitForSaved(path, (value) => value.metadata.title === latest);
      await expect(
        dialog().getByLabel("Update summary", { exact: true }),
      ).toHaveValue("Independent report draft");
      return {
        ownerAddClear: true,
        acceptance: true,
        tag: true,
        dependency: true,
        reportIndependent: true,
      };
    },
  );

  await check(
    "AS08",
    "A lost autosave response keeps the modal open with the original identity and a copy action",
    async () => {
      const card = await createCard({
        title: `Autosave unresolved ${Date.now()}`,
      });
      await openCard(card.metadata.id);
      const path = cardPath(card.metadata.id);
      await page.route(`${config.origin}${path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      });
      let first;
      try {
        await title().fill("Committed before response loss");
        await waitForWrite(path, "PATCH", 1);
        first = writesFor(path, "PATCH")[0];
        await expect(dialog()).toContainText(first.requestId);
        await expect(
          dialog().getByRole("button", { name: "Copy draft", exact: true }),
        ).toBeVisible();
        const statusPattern = `**/api/v1/commands/${first.requestId}*`;
        await page.route(statusPattern, async (route) => {
          if (route.request().method() !== "GET") return route.continue();
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              api_version: "1",
              error: {
                code: "STATUS_LOOKUP_FAILED",
                message: "Retry status lookup.",
              },
            }),
          });
        });
        await dialog()
          .getByRole("button", { name: "Check status", exact: true })
          .click();
        await expect(dialog()).toContainText(first.requestId);
        await expect(
          dialog().getByRole("button", { name: "Copy draft", exact: true }),
        ).toBeVisible();
        await page.unroute(statusPattern);
        await page.unroute(`${config.origin}${path}`);
        await dialog()
          .getByRole("button", { name: "Retry same command", exact: true })
          .click();
        await waitForWrite(path, "PATCH", 2);
        const retry = writesFor(path, "PATCH")[1];
        assert.equal(retry.requestId, first.requestId);
        assert.equal(retry.epoch, first.epoch);
        assert.deepEqual(retry.payload, first.payload);
        await waitForSaved(
          path,
          (value) => value.metadata.title === "Committed before response loss",
        );
        return { unresolvedStayedOpen: true, identityPreserved: true };
      } finally {
        await page.unroute(`${config.origin}${path}`).catch(() => {});
      }
    },
  );

  await page.removeListener("request", onRequest);
  await writeFile(
    join(evidenceDir, "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  return { results, errors };
}

if (isMain(import.meta.url))
  await runBrowserSuite(
    async ({ config, cli, runtime, evidence, browser, newContext, pair }) => {
      const context = await newContext();
      const page = await context.newPage();
      await pair(page);
      await context.storageState({ path: join(runtime, "browser-state.json") });
      const outcome = await runAutosaveChecks({
        page,
        config,
        cli,
        evidenceDir: evidence,
        runtimeDir: runtime,
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
          evidenceDir: evidence,
        }),
      );
    },
  );
