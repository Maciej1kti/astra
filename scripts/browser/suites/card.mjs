/** Paired HTTPS browser against an isolated synthetic host and real versioned writes. */
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { isMain, runBrowserSuite } from "../runtime.mjs";
import { binaries } from "../host.mjs";
import assert from "node:assert/strict";

export async function runCardChecks({
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
  const commandFile = join(runtimeDir, `stage2-card-${randomUUID()}.json`);
  const results = [],
    errors = [],
    csp = [];
  const unique = (name) => `Stage 2 ${name} ${randomUUID().slice(0, 8)}`;
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__stage2CardCsp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__stage2CardCsp.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
  });
  const dialog = () =>
    page.getByRole("dialog", { name: /^(Edit|Create) resource$/ });
  const title = () => dialog().getByLabel("Title", { exact: true });
  const reviewOn = () => dialog().getByLabel("Review on", { exact: true });
  const descriptionRendered = () =>
    dialog().locator(".resource-description-rendered");
  const description = () => dialog().getByLabel("Description", { exact: true });
  async function editDescription() {
    await descriptionRendered().click();
    await expect(description()).toBeVisible();
  }
  const item = (index) =>
    dialog().getByLabel(`Acceptance item ${index}`, { exact: true });
  const checklist = () =>
    dialog().getByRole("region", { name: "Acceptance checklist", exact: true });
  const composer = () =>
    dialog().getByRole("region", {
      name: "Add an update to this card",
      exact: true,
    });
  const get = (id) => cli("get", `${base}/cards/${id}`);

  async function mutate(method, path, payload, version) {
    await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
    const args = ["command", method, path, "--json-file", commandFile];
    if (version) args.push("--if-version", version);
    const result = cli(...args).result;
    return result.resource?.metadata ?? result;
  }
  const create = (payload) => mutate("POST", `${base}/cards`, payload);
  function all(path) {
    const items = [];
    let cursor;
    do {
      const value = cli(
        "get",
        `${path}${path.includes("?") ? "&" : "?"}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      items.push(...value.items);
      cursor = value.page?.next_cursor ?? value.next_cursor;
    } while (cursor);
    return items;
  }
  const updatesFor = (cardId) =>
    all(`${base}/updates`).filter(
      (update) => update.target?.type === "card" && update.target.id === cardId,
    );

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
    await page.goto(
      `${config.origin}/?${new URLSearchParams({ view, project, ...extra })}`,
    );
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
  async function openFromList(card) {
    await route("list", { q: card.title });
    await page.locator("main").getByText(card.title, { exact: true }).click();
    await title().waitFor();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("resource") === card.id,
    );
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
      csp.push(
        ...(await page
          .evaluate(() => window.__stage2CardCsp ?? [])
          .catch(() => [])),
      );
      await page
        .evaluate(() => {
          window.__stage2CardCsp = [];
        })
        .catch(() => {});
      await close().catch(() => {});
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        join(evidenceDir, "results.json"),
        JSON.stringify({ results, errors, csp }, null, 2),
      );
    }
  }

  await check(
    "C01-minimal",
    "A title-only card still creates without filling optional card fields",
    async () => {
      const name = unique("minimal card");
      await route();
      await page
        .locator(".heading")
        .getByRole("button", { name: /Add card$/ })
        .click();
      await title().fill(name);
      await waitForAutosaveACK();
      await expect(dialog()).toBeVisible();
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await dialog().waitFor({ state: "hidden" });
      const matches = all(
        `/api/v1/views/list?type=card&project_id=${project}&q=${encodeURIComponent(name)}`,
      ).filter((card) => card.title === name);
      assert.equal(matches.length, 1);
      const saved = get(matches[0].id);
      assert.equal(saved.metadata.title, name);
      for (const field of ["review_on", "acceptance"])
        assert.equal(Object.hasOwn(saved.metadata, field), false);
      return { card: matches[0].id, optionalFieldsAbsent: true };
    },
  );

  await check(
    "C01-description",
    "A card description enters from the keyboard, renders after an outside click, and flushes before close",
    async () => {
      const initialSource = "Initial card context.";
      const card = await create({
        title: unique("description editing"),
        body: initialSource,
      });
      await open(card.id);
      await expect(descriptionRendered()).toBeVisible();
      await expect(
        dialog().getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog().getByRole("button", { name: "Cancel", exact: true }),
      ).toHaveCount(0);
      for (const field of ["Kind", "Expected result", "Owner"])
        await expect(dialog().getByLabel(field, { exact: true })).toHaveCount(
          0,
        );
      await expect(
        dialog().getByText("Change history", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog().getByRole("button", {
          name: "Preview Markdown",
          exact: true,
        }),
      ).toHaveCount(0);

      await descriptionRendered().focus();
      await descriptionRendered().press("Enter");
      await expect(description()).toBeVisible();
      await expect(description()).toHaveValue(initialSource);
      const nextSource = [
        "## Rendered card Markdown",
        "",
        "**Strong card context**",
      ].join("\n");
      await description().fill(nextSource);
      await dialog()
        .locator("header")
        .click({ position: { x: 2, y: 2 } });
      await expect(description()).toBeHidden();
      const rendered = descriptionRendered();
      await expect(rendered).toBeVisible();
      await expect(rendered.locator("h2")).toContainText(
        "Rendered card Markdown",
      );
      await expect(rendered.locator("strong")).toContainText(
        "Strong card context",
      );
      await expect
        .poll(
          () => {
            try {
              return get(card.id).body;
            } catch {
              return undefined;
            }
          },
          { timeout: 15000 },
        )
        .toBe(nextSource);
      await waitForAutosaveACK();

      const closeSource = `${nextSource}\n\nClose flush source.`;
      await rendered.click();
      await description().fill(closeSource);
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(dialog()).toBeHidden();
      await expect
        .poll(() => {
          try {
            return get(card.id).body;
          } catch {
            return undefined;
          }
        })
        .toBe(closeSource);
      return {
        card: card.id,
        keyboardEditing: true,
        outsideClickRendersAndPersists: true,
        closeFlushesAndCloses: true,
      };
    },
  );

  await check(
    "C02-model",
    "Review date and reordered acceptance items persist through autosave and reload without accepting the card",
    async () => {
      const card = await create({
        title: unique("acceptance workflow"),
        status: "active",
        review_on: "2026-09-20",
        body: "Original context remains intact.",
      });
      await open(card.id);
      await dialog()
        .getByLabel("New acceptance condition", { exact: true })
        .fill("The intended result is visible.");
      await dialog()
        .getByLabel("New acceptance condition", { exact: true })
        .press("Enter");
      await dialog()
        .getByLabel("New acceptance condition", { exact: true })
        .fill("Keyboard and narrow layouts are verified.");
      await dialog()
        .getByRole("button", { name: "Add item", exact: true })
        .click();
      await dialog()
        .getByRole("checkbox", { name: /^Complete acceptance item 1:/ })
        .check();
      await dialog()
        .getByRole("button", {
          name: "Move acceptance item 1 down",
          exact: true,
        })
        .click();
      await expect(item(1)).toHaveValue(
        "Keyboard and narrow layouts are verified.",
      );
      await expect(item(2)).toHaveValue("The intended result is visible.");
      await expect(
        dialog().getByRole("checkbox", {
          name: /^Complete acceptance item 2:/,
        }),
      ).toBeChecked();
      await expect(dialog().getByLabel("Status", { exact: true })).toHaveValue(
        "active",
      );
      await checklist().scrollIntoViewIfNeeded();
      await screenshot("C02-acceptance-draft");
      await waitForAutosaveACK();
      const saved = get(card.id);
      assert.equal(saved.metadata.review_on, "2026-09-20");
      assert.equal(saved.body, "Original context remains intact.");
      assert.equal(saved.metadata.status, "active");
      assert.deepEqual(
        saved.metadata.acceptance.map(({ text, completed }) => ({
          text,
          completed,
        })),
        [
          {
            text: "Keyboard and narrow layouts are verified.",
            completed: false,
          },
          { text: "The intended result is visible.", completed: true },
        ],
      );
      const ids = saved.metadata.acceptance.map((entry) => entry.id);
      assert.equal(new Set(ids).size, 2);
      for (const id of ids)
        assert.match(
          id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      await open(card.id);
      await page.reload();
      await expect(reviewOn()).toHaveValue(saved.metadata.review_on);
      await expect(item(1)).toHaveValue(saved.metadata.acceptance[0].text);
      await expect(item(2)).toHaveValue(saved.metadata.acceptance[1].text);
      await dialog()
        .getByRole("checkbox", { name: /^Complete acceptance item 1:/ })
        .check();
      await expect(dialog().getByLabel("Status", { exact: true })).toHaveValue(
        "active",
      );
      await waitForAutosaveACK();
      const completed = get(card.id);
      assert.deepEqual(
        completed.metadata.acceptance.map((entry) => entry.id),
        ids,
      );
      assert(completed.metadata.acceptance.every((entry) => entry.completed));
      assert.equal(completed.metadata.status, "active");
      const summary = all(
        `/api/v1/views/list?type=card&project_id=${project}&q=${encodeURIComponent(card.title)}`,
      ).find((entry) => entry.id === card.id);
      assert.deepEqual(summary.acceptance_progress, { total: 2, completed: 2 });
      await route("list", { q: card.title });
      const row = page
        .locator("main .table")
        .getByRole("button")
        .filter({ hasText: card.title });
      await expect(row).toContainText("Acceptance 2/2");
      await screenshot("C02-list-summary");
      await route("board", { q: card.title });
      const boardCard = page.locator(`[data-board-card="${card.id}"]`);
      await expect(boardCard).toContainText("Acceptance 2/2");
      await screenshot("C02-board-summary");
      return {
        card: card.id,
        stableAcceptanceIds: ids,
        status: completed.metadata.status,
        summary: summary.acceptance_progress,
      };
    },
  );

  await check(
    "C03-clear",
    "Clearing the review date and checklist keeps other card facts",
    async () => {
      const card = await create({
        title: unique("clear card fields"),
        status: "review",
        review_on: "2026-09-21",
        acceptance: [
          {
            id: randomUUID(),
            text: "Alternatives are recorded.",
            completed: true,
          },
        ],
        body: "Decision context",
      });
      await open(card.id);
      await reviewOn().fill("");
      await dialog()
        .getByRole("button", { name: "Remove acceptance item 1", exact: true })
        .click();
      await waitForAutosaveACK();
      const saved = get(card.id);
      for (const field of ["review_on", "acceptance"])
        assert.equal(Object.hasOwn(saved.metadata, field), false, field);
      assert.equal(saved.metadata.status, "review");
      assert.equal(saved.body, "Decision context");
      await open(card.id);
      await expect(reviewOn()).toHaveValue("");
      await expect(checklist().locator("li")).toHaveCount(0);
      await screenshot("C03-cleared-optional-fields");
      return {
        card: card.id,
        removed: ["review_on", "acceptance"],
        preserved: ["status", "body"],
      };
    },
  );

  await check(
    "C04-update",
    "A real card-targeted update posts once while the autosaved card remains editable",
    async () => {
      const card = await create({
        title: unique("dirty card update"),
        status: "active",
        review_on: "2026-09-22",
        body: "Saved description",
      });
      const before = get(card.id);
      const summary = unique("recorded result");
      await open(card.id);
      await title().fill(`${card.title} — autosaved card draft`);
      await reviewOn().fill("2026-09-23");
      await editDescription();
      await description().fill("Autosaved description with preserved context.");
      await waitForAutosaveACK();
      await composer()
        .getByRole("button", { name: "Add card update", exact: true })
        .click();
      await composer()
        .getByLabel("Update kind", { exact: true })
        .selectOption("result");
      await composer()
        .getByLabel("Update summary", { exact: true })
        .fill(summary);
      await composer()
        .getByLabel(/^Update details/)
        .fill(
          "## Evidence from the card\n\nA real targeted report recorded in the synthetic project.",
        );
      await composer()
        .getByLabel("Update author", { exact: true })
        .fill("Synthetic card QA");
      await composer()
        .getByRole("button", { name: "Post card update", exact: true })
        .click();
      await expect(composer().getByRole("status")).toContainText(
        "Update recorded for this card",
      );
      await expect(title()).toHaveValue(`${card.title} — autosaved card draft`);
      if (!(await description().count())) await editDescription();
      await expect(description()).toHaveValue(
        "Autosaved description with preserved context.",
      );
      assert.notEqual(get(card.id).version, before.version);
      const reports = updatesFor(card.id).filter(
        (update) => update.title === summary,
      );
      assert.equal(reports.length, 1);
      const report = cli("get", `${base}/updates/${reports[0].id}`);
      assert.deepEqual(report.metadata.target, { type: "card", id: card.id });
      assert.equal(report.metadata.kind, "result");
      assert.equal(report.metadata.author.label, "Synthetic card QA");
      assert.match(report.body, /A real targeted report/);
      await dialog()
        .locator("summary")
        .filter({ hasText: /^Card updates/ })
        .click();
      await dialog()
        .getByRole("button", { name: summary, exact: true })
        .click();
      await expect(
        dialog().getByRole("heading", {
          name: "Evidence from the card",
          exact: true,
        }),
      ).toBeVisible();
      await screenshot("C04-update-with-card-draft");
      await waitForAutosaveACK();
      assert.equal(get(card.id).metadata.review_on, "2026-09-23");
      assert.equal(get(card.id).metadata.status, "active");
      assert.equal(
        updatesFor(card.id).filter((update) => update.title === summary).length,
        1,
      );
      return {
        card: card.id,
        update: reports[0].id,
        cardAutosavedBeforeUpdate: true,
        duplicateUpdates: 0,
      };
    },
  );

  await check(
    "C05-update-guard",
    "An update-only draft is protected by Close and browser Back",
    async () => {
      const card = await create({ title: unique("update only draft") });
      const before = get(card.id);
      await openFromList(card);
      await composer()
        .getByRole("button", { name: "Add card update", exact: true })
        .click();
      await composer()
        .getByLabel("Update summary", { exact: true })
        .fill("Unsaved update with a clean card");
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        dialog().getByText("Discard your unsaved draft?", { exact: true }),
      ).toBeVisible();
      await dialog()
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(
        composer().getByLabel("Update summary", { exact: true }),
      ).toHaveValue("Unsaved update with a clean card");
      const editorUrl = page.url();
      await page.goBack();
      await expect(
        dialog().getByText("Discard your unsaved draft?", { exact: true }),
      ).toBeVisible();
      await dialog()
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(page).toHaveURL(editorUrl);
      await expect(
        composer().getByLabel("Update summary", { exact: true }),
      ).toHaveValue("Unsaved update with a clean card");
      await composer().scrollIntoViewIfNeeded();
      await screenshot("C05-update-only-guarded-draft");
      assert.equal(get(card.id).version, before.version);
      assert.equal(updatesFor(card.id).length, 0);
      await composer()
        .getByRole("button", { name: "Cancel update", exact: true })
        .click();
      await composer()
        .getByRole("button", { name: "Discard update draft", exact: true })
        .click();
      await dialog()
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await dialog().waitFor({ state: "hidden" });
      return {
        card: card.id,
        closeGuard: true,
        backGuard: true,
        sourceUnchanged: true,
      };
    },
  );

  for (const recovery of ["retry", "status"]) {
    await check(
      `C06-update-${recovery}`,
      `A committed update with a lost response recovers by ${recovery} without a duplicate or editor state loss`,
      async () => {
        const card = await create({
          title: unique(`update ${recovery} recovery`),
        });
        const summary = unique(`response loss ${recovery}`);
        await open(card.id);
        await title().fill(`${card.title} — preserved draft`);
        await waitForAutosaveACK();
        await composer()
          .getByRole("button", { name: "Add card update", exact: true })
          .click();
        await composer()
          .getByLabel("Update summary", { exact: true })
          .fill(summary);
        const requests = [];
        let interceptionError;
        const matcher = `**${base}/updates`;
        await page.route(matcher, async (intercept) => {
          if (intercept.request().method() !== "POST")
            return intercept.continue();
          const request = intercept.request();
          requests.push({
            requestId: request.headers()["x-request-id"],
            epoch: request.headers()["x-command-epoch"],
            payload: request.postData(),
          });
          if (requests.length > 1) return intercept.continue();
          try {
            const committed = await intercept.fetch();
            assert.equal(committed.ok(), true, await committed.text());
            await intercept.abort("failed");
          } catch (cause) {
            interceptionError = String(cause);
            await intercept.abort("failed").catch(() => {});
          }
        });
        try {
          await composer()
            .getByRole("button", { name: "Post card update", exact: true })
            .click();
          await expect(
            composer().getByRole("button", {
              name: "Check update status",
              exact: true,
            }),
          ).toBeEnabled();
          assert.equal(interceptionError, undefined);
          assert.equal(
            updatesFor(card.id).filter((update) => update.title === summary)
              .length,
            1,
          );
          assert.equal(
            cli(
              "get",
              `/api/v1/commands/${requests[0].requestId}?epoch=${requests[0].epoch}`,
            ).state,
            "committed",
          );
          await expect(title()).toBeDisabled();
          await expect(title()).toHaveValue(`${card.title} — preserved draft`);
          await composer()
            .getByRole("button", {
              name:
                recovery === "retry"
                  ? "Retry same update"
                  : "Check update status",
              exact: true,
            })
            .click();
          await expect(composer().getByRole("status")).toContainText(
            "Update recorded for this card",
          );
          await expect(title()).toBeEnabled();
          await expect(title()).toHaveValue(`${card.title} — preserved draft`);
          assert.equal(requests.length, recovery === "retry" ? 2 : 1);
          if (recovery === "retry") assert.deepEqual(requests[1], requests[0]);
          assert.equal(
            updatesFor(card.id).filter((update) => update.title === summary)
              .length,
            1,
          );
          assert.equal(
            get(card.id).metadata.title,
            `${card.title} — preserved draft`,
          );
          await composer().scrollIntoViewIfNeeded();
          await screenshot(`C06-update-${recovery}-recovered`);
          return {
            card: card.id,
            requests: requests.length,
            sameIdentity: true,
            committedBeforeResponseLoss: true,
            duplicateUpdates: 0,
          };
        } finally {
          await page.unroute(matcher);
        }
      },
    );
  }

  await check(
    "C07-invalid",
    "Invalid checklist edits give field feedback and leave the saved card untouched",
    async () => {
      const card = await create({
        title: unique("invalid acceptance draft"),
        acceptance: [
          {
            id: randomUUID(),
            text: "Existing acceptance condition",
            completed: false,
          },
        ],
      });
      const before = get(card.id);
      await open(card.id);
      await item(1).fill("  ");
      await expect(checklist().getByRole("alert")).toContainText(
        "Add text to acceptance item 1",
      );
      assert.equal(get(card.id).version, before.version);
      await item(1).fill("x".repeat(501));
      await expect(checklist().getByRole("alert")).toContainText(
        "500 characters",
      );
      assert.equal(get(card.id).version, before.version);
      await item(1).fill("A valid condition after local feedback");
      await waitForAutosaveACK();
      assert.equal(
        get(card.id).metadata.acceptance[0].id,
        before.metadata.acceptance[0].id,
      );
      return {
        card: card.id,
        invalidDraftsPersisted: false,
        itemIdentityPreserved: true,
      };
    },
  );

  await check(
    "C08-mobile",
    "Card purpose, acceptance controls and update composer fit a 390px viewport",
    async () => {
      const card = await create({
        title: unique(
          "mobile card with long context and Polish characters — zażółć gęślą jaźń",
        ),
        acceptance: [
          {
            id: randomUUID(),
            text: "A long acceptance condition remains editable without horizontal page scrolling. ".repeat(
              5,
            ),
            completed: true,
          },
          {
            id: randomUUID(),
            text: "Every move and remove action is reachable from the keyboard and viewport.",
            completed: false,
          },
        ],
        labels: ["Mobile, synthetic QA", "Polskie znaki ąęść"],
      });
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await open(card.id);
        await checklist().scrollIntoViewIfNeeded();
        await screenshot("C08-mobile-purpose");
        await checklist().scrollIntoViewIfNeeded();
        const checklistMetrics = await dialog().evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        assert(
          checklistMetrics.scrollWidth <= checklistMetrics.width + 1,
          JSON.stringify(checklistMetrics),
        );
        const moveTarget = await dialog()
          .getByRole("button", {
            name: "Move acceptance item 1 down",
            exact: true,
          })
          .boundingBox();
        assert(
          moveTarget && moveTarget.width >= 44 && moveTarget.height >= 44,
          JSON.stringify(moveTarget),
        );
        await screenshot("C08-mobile-checklist");
        await dialog()
          .getByRole("button", {
            name: "Move acceptance item 1 down",
            exact: true,
          })
          .click();
        await expect(item(1)).toHaveValue(
          card.acceptance?.[1]?.text ??
            "Every move and remove action is reachable from the keyboard and viewport.",
        );
        await waitForAutosaveACK();
        await open(card.id);
        await composer()
          .getByRole("button", { name: "Add card update", exact: true })
          .click();
        await composer()
          .getByLabel("Update summary", { exact: true })
          .fill("Mobile update draft remains reachable");
        await composer()
          .getByLabel(/^Update details/)
          .fill(
            "Synthetic narrow-layout check. No update is posted by this layout-only case.",
          );
        await composer()
          .getByRole("button", { name: "Post card update", exact: true })
          .scrollIntoViewIfNeeded();
        const composerMetrics = await dialog().evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        assert(
          composerMetrics.scrollWidth <= composerMetrics.width + 1,
          JSON.stringify(composerMetrics),
        );
        await expect(
          composer().getByRole("button", {
            name: "Post card update",
            exact: true,
          }),
        ).toBeVisible();
        await screenshot("C08-mobile-update-composer");
        return {
          viewport: { width: 390, height: 844 },
          checklistMetrics,
          composerMetrics,
          moveTarget,
          physicalPhone: false,
        };
      } finally {
        await close();
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    },
  );

  await check(
    "C09-removed-fields",
    "Removed card fields are rejected without changing the versioned source",
    async () => {
      const card = await create({ title: unique("removed field contract") });
      const path = `${base}/cards/${card.id}`;
      const original = get(card.id);
      for (const payload of [
        { set: { kind: "outcome" } },
        { set: { expected_result: "Removed" } },
        { set: { owner: "Removed" } },
        { clear: ["kind"] },
        { clear: ["expected_result"] },
        { clear: ["owner"] },
      ]) {
        await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
        const result = spawnSync(
          join(binaries, "projectctl"),
          [
            "--socket",
            config.socket,
            "command",
            "PATCH",
            path,
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
        const after = get(card.id);
        assert.equal(after.version, original.version);
        assert.equal(after.body, original.body);
      }
      return { removedFieldsRejected: true, sourceUnchanged: true };
    },
  );

  await writeFile(
    join(evidenceDir, "results.json"),
    JSON.stringify({ results, errors, csp }, null, 2),
  );
  return { results, errors, csp };
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
      const outcome = await runCardChecks({
        page,
        config,
        cli,
        evidenceDir,
        runtimeDir,
      });
      if (
        outcome.results.some((result) => result.status !== "pass") ||
        outcome.errors.length ||
        outcome.csp.length
      )
        process.exitCode = 1;
      console.log(
        JSON.stringify({
          passed: outcome.results.filter((result) => result.status === "pass")
            .length,
          total: outcome.results.length,
          errors: outcome.errors,
          csp: outcome.csp,
          browser: browser.version(),
          evidenceDir,
        }),
      );
    },
  );
