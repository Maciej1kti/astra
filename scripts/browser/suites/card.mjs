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
  const writes = [];
  const unique = (name) => `Stage 2 ${name} ${randomUUID().slice(0, 8)}`;
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (request.method() === "POST" || request.method() === "PATCH") &&
      url.pathname.startsWith(`${base}/cards`)
    )
      writes.push({
        method: request.method(),
        path: url.pathname,
        payload: request.postDataJSON(),
      });
  });
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
    dialog().getByLabel(`Checklist item ${index}`, { exact: true });
  const checklist = () =>
    dialog().getByRole("region", { name: "Checklist", exact: true });
  const grip = (index) =>
    dialog().getByRole("button", {
      name: `Move checklist item ${index}`,
      exact: true,
    });
  const keyboardMove = async (index, direction = "ArrowDown") => {
    await grip(index).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press(direction);
    await page.keyboard.press("Space");
  };
  const get = (id) => cli("get", `${base}/cards/${id}`);
  const cardWrites = (id) =>
    writes.filter(
      (write) =>
        write.path === `${base}/cards/${id}` && write.method === "PATCH",
    );

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
    "Review date and reordered checklist items persist through autosave and reload without accepting the card",
    async () => {
      const card = await create({
        title: unique("acceptance workflow"),
        status: "active",
        review_on: "2026-09-20",
        body: "Original context remains intact.",
      });
      await open(card.id);
      await dialog()
        .getByLabel("New item", { exact: true })
        .fill("The intended result is visible.");
      await dialog().getByLabel("New item", { exact: true }).press("Enter");
      await dialog()
        .getByLabel("New item", { exact: true })
        .fill("Keyboard and narrow layouts are verified.");
      await dialog()
        .getByRole("button", { name: "Add item", exact: true })
        .click();
      await dialog()
        .getByRole("checkbox", { name: /^Complete checklist item 1:/ })
        .check();
      await keyboardMove(1);
      await expect(item(1)).toHaveValue(
        "Keyboard and narrow layouts are verified.",
      );
      await expect(item(2)).toHaveValue("The intended result is visible.");
      await expect(
        dialog().getByRole("checkbox", {
          name: /^Complete checklist item 2:/,
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
        .getByRole("checkbox", { name: /^Complete checklist item 1:/ })
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
      await expect(row).toContainText("Checklist 2/2");
      await screenshot("C02-list-summary");
      await route("board", { q: card.title });
      const boardCard = page.locator(`[data-board-card="${card.id}"]`);
      await expect(boardCard).toContainText("Checklist 2/2");
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
        .getByRole("button", { name: "Remove checklist item 1", exact: true })
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
    "C04-drag",
    "Checklist pointer and keyboard ordering persist exactly once and cancel safely",
    async () => {
      const acceptance = [
        { id: randomUUID(), text: "First checklist item", completed: false },
        { id: randomUUID(), text: "Completed checklist item", completed: true },
        { id: randomUUID(), text: "Last checklist item", completed: false },
      ];
      const card = await create({
        title: unique("checklist drag ordering"),
        acceptance,
      });
      await open(card.id);
      const path = `${base}/cards/${card.id}`;
      const beforePointerWrites = cardWrites(card.id).length;
      const firstGrip = grip(1);
      const lastRow = dialog().locator("[data-checklist-item]").nth(2);
      const gripBox = await firstGrip.boundingBox();
      const lastBox = await lastRow.boundingBox();
      assert(
        gripBox && lastBox,
        "Checklist drag targets should be measurable.",
      );
      await page.mouse.move(
        gripBox.x + gripBox.width / 2,
        gripBox.y + gripBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        lastBox.x + lastBox.width / 2,
        lastBox.y + lastBox.height / 2,
        {
          steps: 8,
        },
      );
      await page.waitForTimeout(250);
      assert.equal(
        cardWrites(card.id).length,
        beforePointerWrites,
        "A held drag must not submit a PATCH.",
      );
      await page.mouse.up();
      await expect(item(1)).toHaveValue("Completed checklist item");
      await expect(item(2)).toHaveValue("Last checklist item");
      await expect(item(3)).toHaveValue("First checklist item");
      await expect
        .poll(() => cardWrites(card.id).length, { timeout: 15000 })
        .toBe(beforePointerWrites + 1);
      await waitForAutosaveACK();
      assert.equal(cardWrites(card.id).length, beforePointerWrites + 1);
      const pointerSaved = get(card.id);
      assert.deepEqual(
        pointerSaved.metadata.acceptance.map(({ id, text, completed }) => ({
          id,
          text,
          completed,
        })),
        [acceptance[1], acceptance[2], acceptance[0]],
      );
      assert.equal(cardWrites(card.id).at(-1).path, path);

      await page.reload();
      await title().waitFor();
      assert.deepEqual(
        await dialog()
          .locator("[data-checklist-item]")
          .evaluateAll((rows) =>
            rows.map((row) => ({
              id: row.dataset.checklistItem,
              text: row.querySelector("textarea").value,
              completed: row.querySelector('input[type="checkbox"]').checked,
            })),
          ),
        [acceptance[1], acceptance[2], acceptance[0]],
      );

      await keyboardMove(1);
      await expect(item(1)).toHaveValue("Last checklist item");
      await expect(item(2)).toHaveValue("Completed checklist item");
      await expect
        .poll(() => cardWrites(card.id).length, { timeout: 15000 })
        .toBe(beforePointerWrites + 2);
      await waitForAutosaveACK();
      const keyboardSaved = get(card.id);
      assert.deepEqual(
        keyboardSaved.metadata.acceptance.map(({ id, text, completed }) => ({
          id,
          text,
          completed,
        })),
        [acceptance[2], acceptance[1], acceptance[0]],
      );

      await grip(1).focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Escape");
      await expect(item(1)).toHaveValue("Last checklist item");
      await expect(item(2)).toHaveValue("Completed checklist item");
      await page.waitForTimeout(400);
      assert.equal(
        cardWrites(card.id).length,
        beforePointerWrites + 2,
        "Escape must cancel the keyboard reorder without a write.",
      );
      assert.equal(get(card.id).version, keyboardSaved.version);
      return {
        card: card.id,
        pointerWrites: 1,
        keyboardWrites: 1,
        idsStable: true,
        completionPreserved: true,
        cancelUnchanged: true,
      };
    },
  );

  await check(
    "C05-long-drag-cancel",
    "A held checklist drag scrolls the dialog and Escape restores the saved order",
    async () => {
      const acceptance = Array.from({ length: 24 }, (_, index) => ({
        id: randomUUID(),
        text: `Scrollable item ${index + 1}`,
        completed: index % 2 === 0,
      }));
      const card = await create({
        title: unique("long checklist"),
        acceptance,
      });
      await open(card.id);
      await grip(1).scrollIntoViewIfNeeded();
      const before = get(card.id);
      const startScroll = await dialog().evaluate((node) => node.scrollTop);
      const handle = await grip(1).boundingBox();
      const modal = await dialog().boundingBox();
      assert(handle && modal);
      const initialWrites = cardWrites(card.id).length;
      await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
      );
      await page.mouse.down();
      try {
        await page.mouse.move(
          handle.x + handle.width / 2,
          modal.y + modal.height - 14,
          { steps: 6 },
        );
        await expect
          .poll(() => dialog().evaluate((node) => node.scrollTop), {
            timeout: 5000,
          })
          .toBeGreaterThan(startScroll + 30);
        assert.equal(cardWrites(card.id).length, initialWrites);
        await page.keyboard.press("Escape");
        await expect(dialog()).toBeVisible();
      } finally {
        await page.mouse.up();
      }
      await expect(
        dialog().locator("[data-checklist-item]").first(),
      ).toHaveAttribute("data-checklist-item", acceptance[0].id);
      await page.waitForTimeout(400);
      assert.equal(cardWrites(card.id).length, initialWrites);
      assert.equal(get(card.id).version, before.version);
      return {
        dialogAutoScroll: true,
        cancelledWithoutWrite: true,
        modalStayedOpen: true,
      };
    },
  );

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
        "Add text to checklist item 1",
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
    "Card checklist controls fit a 390px viewport without card report sections",
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
        for (const section of [
          "Record progress",
          "Card updates",
          "Additional fields",
        ])
          await expect(
            dialog().getByText(section, { exact: true }),
          ).toHaveCount(0);
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
        const rowMetrics = await dialog()
          .locator("[data-checklist-item]")
          .first()
          .evaluate((row) => {
            const rect = (selector) => {
              const node = row.querySelector(selector);
              if (!node) return null;
              const box = node.getBoundingClientRect();
              return { width: box.width, height: box.height };
            };
            return {
              width: row.clientWidth,
              scrollWidth: row.scrollWidth,
              height: row.clientHeight,
              checkbox: rect('input[type="checkbox"]'),
              text: rect("textarea"),
              trash: rect("button.icon-button"),
              grip: rect("button.handle"),
            };
          });
        assert(
          rowMetrics.scrollWidth <= rowMetrics.width + 1,
          JSON.stringify(rowMetrics),
        );
        assert(rowMetrics.text?.height >= 44, JSON.stringify(rowMetrics));
        for (const control of ["trash", "grip"])
          assert(
            rowMetrics[control]?.width >= 44 &&
              rowMetrics[control]?.height >= 44,
            `${control}: ${JSON.stringify(rowMetrics)}`,
          );
        await screenshot("C08-mobile-checklist");
        const touchGrip = await grip(1).boundingBox();
        const touchTarget = await dialog()
          .locator("[data-checklist-item]")
          .nth(1)
          .boundingBox();
        assert(
          touchGrip && touchTarget,
          "Touch drag targets should be measurable.",
        );
        const writesBeforeTouch = cardWrites(card.id).length;
        const cdp = await page.context().newCDPSession(page);
        const touchPoint = (x, y) => [{ x, y, id: 1, radiusX: 3, radiusY: 3 }];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: touchPoint(
            touchGrip.x + touchGrip.width / 2,
            touchGrip.y + touchGrip.height / 2,
          ),
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: touchPoint(
            touchTarget.x + touchTarget.width / 2,
            touchTarget.y + touchTarget.height / 2,
          ),
        });
        await page.waitForTimeout(250);
        assert.equal(cardWrites(card.id).length, writesBeforeTouch);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect(item(1)).toHaveValue(
          "Every move and remove action is reachable from the keyboard and viewport.",
        );
        await expect
          .poll(() => cardWrites(card.id).length, { timeout: 15000 })
          .toBe(writesBeforeTouch + 1);
        await waitForAutosaveACK();
        await expect(item(2)).toHaveValue(
          "A long acceptance condition remains editable without horizontal page scrolling. ".repeat(
            5,
          ),
        );
        await screenshot("C08-mobile-touch-checklist");
        return {
          viewport: { width: 390, height: 844 },
          checklistMetrics,
          rowMetrics,
          touchWrites: 1,
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
