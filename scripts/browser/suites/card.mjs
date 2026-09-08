/** Paired HTTPS browser against an isolated synthetic host and real versioned writes. */
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  const expectedResult = () => dialog().getByLabel(/^Expected result/);
  const owner = () => dialog().getByLabel(/^Owner/);
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
  async function save() {
    await dialog()
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await dialog().waitFor({ state: "hidden" });
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
      await dialog()
        .getByRole("button", { name: "Create", exact: true })
        .click();
      await dialog().waitFor({ state: "hidden" });
      const matches = all(
        `/api/v1/views/list?type=card&project_id=${project}&q=${encodeURIComponent(name)}`,
      ).filter((card) => card.title === name);
      assert.equal(matches.length, 1);
      const saved = get(matches[0].id);
      assert.equal(saved.metadata.title, name);
      for (const field of ["expected_result", "owner", "acceptance"])
        assert.equal(Object.hasOwn(saved.metadata, field), false);
      return { card: matches[0].id, optionalFieldsAbsent: true };
    },
  );

  await check(
    "C02-model",
    "Purpose, owner and reordered acceptance items persist through save and reload without accepting the card",
    async () => {
      const card = await create({
        title: unique("acceptance workflow"),
        status: "active",
        body: "Original context remains intact.",
      });
      await open(card.id);
      await expectedResult().fill(
        "A useful release with clear acceptance evidence — zażółć gęślą jaźń.",
      );
      await owner().fill("Synthetic QA owner");
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
      await save();
      const saved = get(card.id);
      assert.equal(
        saved.metadata.expected_result,
        "A useful release with clear acceptance evidence — zażółć gęślą jaźń.",
      );
      assert.equal(saved.metadata.owner, "Synthetic QA owner");
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
      await expect(expectedResult()).toHaveValue(
        saved.metadata.expected_result,
      );
      await expect(owner()).toHaveValue(saved.metadata.owner);
      await expect(item(1)).toHaveValue(saved.metadata.acceptance[0].text);
      await expect(item(2)).toHaveValue(saved.metadata.acceptance[1].text);
      await dialog()
        .getByRole("checkbox", { name: /^Complete acceptance item 1:/ })
        .check();
      await expect(dialog().getByLabel("Status", { exact: true })).toHaveValue(
        "active",
      );
      await save();
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
      assert.equal(summary.owner, "Synthetic QA owner");
      assert.deepEqual(summary.acceptance_progress, { total: 2, completed: 2 });
      await route("list", { q: card.title });
      const row = page
        .locator("main .table")
        .getByRole("button")
        .filter({ hasText: card.title });
      await expect(row).toContainText("Synthetic QA owner");
      await expect(row).toContainText("Acceptance 2/2");
      await screenshot("C02-list-summary");
      await route("board", { q: card.title });
      const boardCard = page.locator(`[data-board-card="${card.id}"]`);
      await expect(boardCard).toContainText("Synthetic QA owner");
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
    "Clearing the optional purpose, owner and checklist keeps other card facts",
    async () => {
      const card = await create({
        title: unique("clear card fields"),
        kind: "decision",
        status: "review",
        expected_result: "Choose a release window.",
        owner: "Synthetic reviewer",
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
      await expectedResult().fill("");
      await owner().fill("");
      await dialog()
        .getByRole("button", { name: "Remove acceptance item 1", exact: true })
        .click();
      await save();
      const saved = get(card.id);
      for (const field of ["expected_result", "owner", "acceptance"])
        assert.equal(Object.hasOwn(saved.metadata, field), false, field);
      assert.equal(saved.metadata.kind, "decision");
      assert.equal(saved.metadata.status, "review");
      assert.equal(saved.body, "Decision context");
      await open(card.id);
      await expect(expectedResult()).toHaveValue("");
      await expect(owner()).toHaveValue("");
      await expect(checklist().locator("li")).toHaveCount(0);
      await screenshot("C03-cleared-optional-fields");
      return {
        card: card.id,
        removed: ["expected_result", "owner", "acceptance"],
        preserved: ["kind", "status", "body"],
      };
    },
  );

  await check(
    "C04-update",
    "A real card-targeted update posts once while the unsaved card remains editable",
    async () => {
      const card = await create({
        title: unique("dirty card update"),
        status: "active",
        expected_result: "Saved result",
        body: "Saved description",
      });
      const before = get(card.id);
      const summary = unique("recorded result");
      await open(card.id);
      await title().fill(`${card.title} — unsaved card draft`);
      await expectedResult().fill("Unsaved expected result");
      await dialog()
        .getByLabel(/^Description/)
        .fill("Unsaved description with preserved context.");
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
      await expect(
        dialog().getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();
      await composer()
        .getByRole("button", { name: "Post card update", exact: true })
        .click();
      await expect(composer().getByRole("status")).toContainText(
        "Update recorded for this card",
      );
      await expect(title()).toHaveValue(`${card.title} — unsaved card draft`);
      await expect(expectedResult()).toHaveValue("Unsaved expected result");
      await expect(dialog().getByLabel(/^Description/)).toHaveValue(
        "Unsaved description with preserved context.",
      );
      await expect(
        dialog().getByRole("button", { name: "Save changes", exact: true }),
      ).toBeEnabled();
      assert.equal(get(card.id).version, before.version);
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
      await save();
      assert.equal(
        get(card.id).metadata.expected_result,
        "Unsaved expected result",
      );
      assert.equal(get(card.id).metadata.status, "active");
      assert.equal(
        updatesFor(card.id).filter((update) => update.title === summary).length,
        1,
      );
      return {
        card: card.id,
        update: reports[0].id,
        originalCardVersionUnchangedUntilSave: true,
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
      `A committed update with a lost response recovers by ${recovery} without a duplicate or card draft loss`,
      async () => {
        const card = await create({
          title: unique(`update ${recovery} recovery`),
        });
        const summary = unique(`response loss ${recovery}`);
        await open(card.id);
        await title().fill(`${card.title} — preserved draft`);
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
            cli("get", `/api/v1/commands/${requests[0].requestId}`).state,
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
          assert.equal(get(card.id).metadata.title, card.title);
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
      await dialog()
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(checklist().getByRole("alert")).toContainText(
        "Add text to acceptance item 1",
      );
      assert.equal(get(card.id).version, before.version);
      await item(1).fill("x".repeat(501));
      await dialog()
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(checklist().getByRole("alert")).toContainText(
        "500 characters",
      );
      assert.equal(get(card.id).version, before.version);
      await item(1).fill("A valid condition after local feedback");
      await save();
      assert.equal(
        get(card.id).metadata.acceptance[0].id,
        before.metadata.acceptance[0].id,
      );
      return {
        card: card.id,
        rejectedDraftsPersisted: false,
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
        owner: "Synthetic mobile owner with a descriptive name",
        expected_result: "A readable, useful card on a narrow screen. ".repeat(
          8,
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
        await expectedResult().scrollIntoViewIfNeeded();
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
        await save();
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

  await writeFile(
    join(evidenceDir, "results.json"),
    JSON.stringify({ results, errors, csp }, null, 2),
  );
  return { results, errors, csp };
}

async function main() {
  const root = resolve(import.meta.dirname, "../../..");
  const runtimeDir = resolve(
    root,
    process.env.ASTRA_AUDIT_RUNTIME ?? ".manual/audit-2026-09-08",
  );
  const evidenceDir = resolve(
    root,
    process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/regressions/card",
  );
  const config = JSON.parse(
    await readFile(join(runtimeDir, "connection.json"), "utf8"),
  );
  const cli = (...args) => {
    let output;
    try {
      output = execFileSync(
        join(root, "target", process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug", "projectctl"),
        ["--socket", config.socket, ...args],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      if (error.status !== 9) throw error;
      output = error.stdout;
    }
    const envelope = JSON.parse(output);
    assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
    return envelope.data;
  };
  let storageState;
  try {
    storageState = JSON.parse(
      await readFile(join(runtimeDir, "browser-state.json"), "utf8"),
    );
  } catch {}
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined,
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto(config.origin);
    const requestAccess = page.getByRole("button", { name: "Request access" });
    await requestAccess
      .or(page.getByLabel("Project", { exact: true }))
      .waitFor();
    if (await requestAccess.isVisible()) {
      await requestAccess.click();
      await page
        .getByText("Compare this challenge on the host machine:")
        .waitFor();
      const visible = await page.locator("body").innerText();
      const matching = cli("pairings").items.filter((entry) =>
        visible.includes(entry.challenge),
      );
      assert.equal(matching.length, 1);
      cli("approve", matching[0].id, "--challenge", matching[0].challenge);
      await page
        .getByRole("button", { name: "I approved this browser", exact: true })
        .click();
    }
    await page.getByLabel("Project", { exact: true }).waitFor();
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
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main();
