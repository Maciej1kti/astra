/** Browser regressions for irreversible card and project metadata deletion. */
import { expect } from "@playwright/test";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "deletion-command.json");
    const results = [];
    const errors = [];
    await mkdir(evidence, { recursive: true });

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }
    async function createCard(title, projectId = project) {
      const result = await mutate(
        "POST",
        `/api/v1/projects/${projectId}/cards`,
        {
          title,
          status: "active",
          body: "Deletion baseline",
        },
      );
      return result.resource?.metadata ?? result;
    }
    async function exists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
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
    async function route(page, view, projectId = project, extra = {}) {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project: projectId, ...extra })}`,
      );
      if (view !== "projects")
        await expect(page.getByLabel("Project", { exact: true })).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Connected to host",
      );
    }
    async function openProjectDeletion(page, title) {
      await page
        .getByRole("button", { name: `More actions for ${title}` })
        .click();
      await page
        .getByRole("button", { name: "Delete project", exact: true })
        .click();
    }
    function editor(page) {
      return page.getByRole("dialog", { name: "Edit resource", exact: true });
    }
    async function openCard(page, card, view = "list") {
      if (view === "board") {
        await route(page, view);
        await page
          .locator(`[data-board-card="${card.id}"]`)
          .getByRole("button")
          .click();
      } else {
        await route(page, view, project, {
          type: "card",
          resource: card.id,
        });
      }
      await expect(editor(page)).toBeVisible();
      await expect(
        editor(page).getByLabel("Title", { exact: true }),
      ).toHaveValue(card.title);
    }
    async function closeEditor(page) {
      const dialog = editor(page);
      if (!(await dialog.count())) return;
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      const discard = dialog.getByRole("button", {
        name: "Discard draft",
        exact: true,
      });
      if (await discard.isVisible()) await discard.click();
      await expect(dialog).toBeHidden();
    }
    async function clickAtVisiblePoint(page, locator, label) {
      const box = await locator.boundingBox();
      assert(box, `${label} must be rendered before pointer input`);
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      assert(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height,
        `${label} must be fully visible before pointer input: ${JSON.stringify({ box, viewport })}`,
      );
      const point = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
      const hit = await locator.evaluate((element, value) => {
        const hit = document.elementFromPoint(value.x, value.y);
        return {
          inside: !!hit && (hit === element || element.contains(hit)),
          tag: hit?.tagName,
          text: hit?.textContent?.trim().slice(0, 80),
          aria: hit?.getAttribute("aria-label"),
        };
      }, point);
      assert.equal(
        hit.inside,
        true,
        `${label} must receive the pointer at its visible center; hit ${JSON.stringify(hit)}`,
      );
      await page.mouse.click(point.x, point.y);
    }
    async function check(id, name, run) {
      const started = Date.now();
      try {
        results.push({
          id,
          name,
          status: "pass",
          detail: await run(),
          ms: Date.now() - started,
        });
      } catch (error) {
        results.push({
          id,
          name,
          status: "fail",
          error: String(error),
          ms: Date.now() - started,
        });
        await page
          .screenshot({
            path: join(evidence, `${id}-failure.png`),
            fullPage: true,
          })
          .catch(() => {});
      }
      console.log(JSON.stringify(results.at(-1)));
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ results, errors }, null, 2),
      );
    }

    const context = await newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: config.origin,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await check(
        "D01",
        "Cancelling card deletion keeps the saved card",
        async () => {
          const card = await createCard(`Delete cancel ${Date.now()}`);
          await openCard(page, card);
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          const confirmation = page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" });
          await expect(confirmation).toContainText(card.title);
          await expect(confirmation).toContainText("cannot be undone");
          await confirmation
            .getByRole("button", { name: "Keep editing", exact: true })
            .click();
          await expect(confirmation).toBeHidden();
          assert.equal(
            cli("get", `${base}/cards/${card.id}`).metadata.title,
            card.title,
          );
          return { card: card.id, cancelled: true };
        },
      );

      await check(
        "D02-autosave-delete",
        "Card deletion waits for a held autosave and previews the latest version",
        async () => {
          const card = await createCard(`Delete autosave ${Date.now()}`);
          await openCard(page, card);
          const dialog = editor(page);
          const path = `${config.origin}${base}/cards/${card.id}`;
          let resolveStarted;
          const autosaveStarted = new Promise((resolve) => {
            resolveStarted = resolve;
          });
          let releaseAutosave;
          const autosaveReleased = new Promise((resolve) => {
            releaseAutosave = resolve;
          });
          const writes = [];
          const deletes = [];
          await page.route(path, async (route) => {
            const method = route.request().method();
            if (method === "PATCH") {
              writes.push(route.request().postData());
              if (writes.length === 1) {
                resolveStarted();
                await autosaveReleased;
              }
              return route.continue();
            }
            if (method === "DELETE") {
              deletes.push(route.request().postData());
              return route.abort("failed");
            }
            return route.continue();
          });
          try {
            const latestTitle = "Delete after autosave acknowledgement";
            await dialog.getByLabel("Title", { exact: true }).fill(latestTitle);
            await dialog.locator(".resource-description-rendered").click();
            await dialog
              .getByLabel("Description", { exact: true })
              .fill("The delete preview must use the acknowledged source.");
            await waitForSignal(autosaveStarted, "delete autosave");
            await dialog
              .getByRole("button", { name: "Card actions", exact: true })
              .click();
            const deleteButton = dialog.getByRole("button", {
              name: "Delete card",
              exact: true,
            });
            const final = page
              .getByRole("alert")
              .filter({ hasText: "Permanently delete card?" });
            await deleteButton.click();
            await expect.poll(() => deletes.length).toBe(0);
            const autosaveStatus = dialog.getByTestId("autosave-status");
            await expect
              .poll(async () => {
                const status = (await autosaveStatus.textContent()) ?? "";
                return (
                  (await dialog
                    .getByRole("button", { name: "Card actions", exact: true })
                    .isDisabled()) || status !== "Saved"
                );
              })
              .toBe(true);
            await expect(final).toHaveCount(0);
            assert.equal(writes.length, 1);
            releaseAutosave();
            await expect(autosaveStatus).toHaveText("Saved");
            const updated = cli("get", `${base}/cards/${card.id}`);
            assert.equal(updated.metadata.title, latestTitle);
            assert.notEqual(updated.version, card.version);
            await expect(final).toContainText(latestTitle);
            await final
              .getByRole("button", { name: "Keep editing", exact: true })
              .click();
            await expect(final).toBeHidden();
            assert.equal(deletes.length, 0);
            return {
              card: card.id,
              autosaveWrites: writes.length,
              sourceVersionAdvanced: true,
              deleteRequestsBeforeCancel: deletes.length,
            };
          } finally {
            releaseAutosave();
            await page.unroute(path);
          }
        },
      );

      await check(
        "D02",
        "Card deletion keeps an unfinished checklist item behind a discard confirmation",
        async () => {
          const card = await createCard(`Delete draft ${Date.now()}`);
          await openCard(page, card, "board");
          const dialog = editor(page);
          await dialog
            .getByLabel("Title", { exact: true })
            .fill("Autosaved delete title");
          await dialog.locator(".resource-description-rendered").click();
          await dialog
            .getByLabel("Description", { exact: true })
            .fill("Autosaved report body");
          await expect(dialog.getByTestId("autosave-status")).toHaveText(
            "Saved",
          );
          const newItem = dialog.getByLabel("New item", { exact: true });
          await newItem.fill("Unfinished checklist item");
          await dialog
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await dialog
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          const draftWarning = page
            .getByRole("alert")
            .filter({ hasText: "Discard drafts before deleting?" });
          await expect(draftWarning).toContainText("Autosaved delete title");
          await expect(
            dialog.getByLabel("Title", { exact: true }),
          ).toBeDisabled();
          await expect(
            dialog.locator(".resource-description-rendered"),
          ).toHaveAttribute("aria-disabled", "true");
          await expect(newItem).toBeDisabled();
          await draftWarning
            .getByRole("button", { name: "Keep editing", exact: true })
            .click();
          await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
            "Autosaved delete title",
          );
          await dialog
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await dialog
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          await page
            .getByRole("alert")
            .filter({ hasText: "Discard drafts before deleting?" })
            .getByRole("button", {
              name: "Discard drafts and continue",
              exact: true,
            })
            .click();
          const final = page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" });
          await expect(final).toContainText("Autosaved delete title");
          await final
            .getByRole("button", {
              name: "Permanently delete card",
              exact: true,
            })
            .click();
          await expect(dialog).toBeHidden();
          assert.equal(
            await exists(
              join(
                config.projects[0].folder,
                ".project",
                "cards",
                `${card.id}.md`,
              ),
            ),
            false,
          );
          return { card: card.id, checklistDraftRequiredExplicitDiscard: true };
        },
      );

      await check(
        "D03",
        "Lost card deletion response retries the same command and closes after replay",
        async () => {
          const card = await createCard(`Delete lost response ${Date.now()}`);
          await openCard(page, card);
          const path = `${base}/cards/${card.id}`;
          const attempts = [];
          await page.route(`${config.origin}${path}`, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            const request = route.request();
            attempts.push({
              requestId: request.headers()["x-request-id"],
              epoch: request.headers()["x-command-epoch"],
              version: request.headers()["if-match"],
              payload: request.postDataJSON(),
            });
            const response = await route.fetch();
            if (attempts.length === 1) return route.abort("failed");
            return route.fulfill({ response });
          });
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          await page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" })
            .getByRole("button", {
              name: "Permanently delete card",
              exact: true,
            })
            .click();
          await expect(
            editor(page).getByRole("button", {
              name: "Retry same deletion",
              exact: true,
            }),
          ).toBeVisible();
          await editor(page)
            .getByRole("button", { name: "Retry same deletion", exact: true })
            .click();
          await expect.poll(() => attempts.length).toBe(2);
          assert.deepEqual(attempts[1], attempts[0]);
          await expect(editor(page)).toBeHidden();
          await page.unroute(`${config.origin}${path}`);
          await route(page, "list");
          await expect(page.getByText(card.title, { exact: true })).toHaveCount(
            0,
          );
          return { card: card.id, attempts, identityRetained: true };
        },
      );

      await check(
        "D04",
        "Lost card deletion response can complete through command status",
        async () => {
          const card = await createCard(`Delete status ${Date.now()}`);
          await openCard(page, card);
          const path = `${base}/cards/${card.id}`;
          const attempts = [];
          await page.route(`${config.origin}${path}`, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            attempts.push(route.request().headers()["x-request-id"]);
            await route.fetch();
            await route.abort("failed").catch(() => {});
          });
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          await page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" })
            .getByRole("button", {
              name: "Permanently delete card",
              exact: true,
            })
            .click();
          await expect(
            editor(page).getByRole("button", {
              name: "Check deletion status",
              exact: true,
            }),
          ).toBeVisible();
          await editor(page)
            .getByRole("button", { name: "Check deletion status", exact: true })
            .click();
          await expect(editor(page)).toBeHidden();
          assert.equal(attempts.length, 1);
          await page.unroute(`${config.origin}${path}`);
          return {
            card: card.id,
            requestId: attempts[0],
            statusConfirmed: true,
          };
        },
      );

      await check(
        "D05",
        "A failed deletion status lookup keeps the original command available",
        async () => {
          const card = await createCard(`Delete status lookup ${Date.now()}`);
          await openCard(page, card);
          const path = `${base}/cards/${card.id}`;
          const deleteAttempts = [];
          const statusUrls = [];
          await page.route(`${config.origin}${path}`, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            deleteAttempts.push({
              requestId: route.request().headers()["x-request-id"],
              epoch: route.request().headers()["x-command-epoch"],
              version: route.request().headers()["if-match"],
              payload: route.request().postDataJSON(),
            });
            await route.fetch();
            await route.abort("failed").catch(() => {});
          });
          await page.route("**/api/v1/commands/**", async (route) => {
            if (route.request().method() !== "GET") return route.continue();
            statusUrls.push(route.request().url());
            if (statusUrls.length === 1)
              return route.fulfill({
                status: 503,
                json: {
                  api_version: "1",
                  error: { code: "RESOURCE_UNAVAILABLE" },
                },
              });
            return route.continue();
          });
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          await page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" })
            .getByRole("button", {
              name: "Permanently delete card",
              exact: true,
            })
            .click();
          await editor(page)
            .getByRole("button", { name: "Check deletion status", exact: true })
            .click();
          await expect(
            editor(page).getByRole("button", {
              name: "Check deletion status",
              exact: true,
            }),
          ).toBeVisible();
          await expect.poll(() => statusUrls.length).toBe(1);
          const firstStatus = new URL(statusUrls[0]);
          assert.equal(
            firstStatus.pathname,
            `/api/v1/commands/${deleteAttempts[0].requestId}`,
          );
          assert.equal(
            firstStatus.searchParams.get("epoch"),
            deleteAttempts[0].epoch,
          );
          await editor(page)
            .getByRole("button", { name: "Check deletion status", exact: true })
            .click();
          await expect.poll(() => statusUrls.length).toBe(2);
          assert.equal(statusUrls[1], statusUrls[0]);
          await expect(editor(page)).toBeHidden();
          await page.unroute(`${config.origin}${path}`);
          await page.unroute("**/api/v1/commands/**");
          return {
            card: card.id,
            deleteAttempts,
            statusIdentityRetained: true,
          };
        },
      );

      await check(
        "D06",
        "A card version conflict preserves the editor until deliberate reopening",
        async () => {
          const card = await createCard(`Delete conflict ${Date.now()}`);
          await openCard(page, card);
          const path = `${base}/cards/${card.id}`;
          const saved = cli("get", path);
          let attempts = 0;
          await page.route(`${config.origin}${path}`, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            attempts += 1;
            if (attempts === 1) {
              const changed = await mutate(
                "PATCH",
                path,
                { set: { title: "Changed elsewhere" } },
                saved.version,
              );
              assert.equal(
                changed.resource?.metadata.title ?? changed.metadata?.title,
                "Changed elsewhere",
              );
            }
            return route.continue();
          });
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Delete card", exact: true })
            .click();
          await page
            .getByRole("alert")
            .filter({ hasText: "Permanently delete card?" })
            .getByRole("button", {
              name: "Permanently delete card",
              exact: true,
            })
            .click();
          await expect(editor(page)).toContainText(
            "Close and reopen the card before trying again.",
          );
          await editor(page)
            .getByRole("button", { name: "Card actions", exact: true })
            .click();
          await expect(
            editor(page).getByRole("button", {
              name: "Delete card",
              exact: true,
            }),
          ).toBeDisabled();
          await closeEditor(page);
          await page.unroute(`${config.origin}${path}`);
          await openCard(page, { id: card.id, title: "Changed elsewhere" });
          await expect(
            editor(page).getByLabel("Title", { exact: true }),
          ).toHaveValue("Changed elsewhere");
          return { card: card.id, conflictPreserved: true, reopened: true };
        },
      );

      await check(
        "D07",
        "Project deletion preview cancellation preserves the repository",
        async () => {
          const candidate = config.projects[2];
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await expect(dialog).toContainText(candidate.title);
          await expect(dialog).toContainText(".project");
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeEnabled();
          await dialog
            .getByRole("button", { name: "Keep project", exact: true })
            .click();
          await expect(dialog).toBeHidden();
          assert.equal(await exists(join(candidate.folder, ".project")), true);
          return { project: candidate.id, cancelled: true };
        },
      );

      await check(
        "D08",
        "Pending project deletion preserves the command and protects beforeunload",
        async () => {
          const candidate = config.projects[2];
          const projectPath = `${config.origin}/api/v1/projects/${candidate.id}`;
          let deletionRequest;
          await page.route(projectPath, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            deletionRequest = {
              requestId: route.request().headers()["x-request-id"],
              epoch: route.request().headers()["x-command-epoch"],
              version: route.request().headers()["if-match"],
              payload: route.request().postDataJSON(),
            };
            await route.fetch();
            await route.abort("failed").catch(() => {});
          });
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Check deletion status",
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog).toContainText(deletionRequest.requestId);
          const unloadProtected = await page.evaluate(() => {
            const event = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented || event.returnValue === "";
          });
          assert.equal(unloadProtected, true);
          await dialog
            .getByRole("button", { name: "Copy deletion details", exact: true })
            .click();
          await expect(dialog).toContainText(
            /Deletion details copied|Clipboard access is unavailable/,
          );
          const copied = await page
            .evaluate(() => navigator.clipboard?.readText().catch(() => ""))
            .catch(() => "");
          if (copied) {
            const details = JSON.parse(copied);
            assert.equal(details.project_id, candidate.id);
            assert.equal(details.pending.requestId, deletionRequest.requestId);
            assert.equal(details.pending.epoch, deletionRequest.epoch);
            assert.deepEqual(details.pending.payload, deletionRequest.payload);
          }
          await dialog
            .getByRole("button", { name: "Check deletion status", exact: true })
            .click();
          await expect(dialog).toBeHidden();
          await page.unroute(projectPath);
          assert.equal(await exists(join(candidate.folder, ".project")), false);
          assert.equal(await exists(candidate.folder), true);
          return {
            project: candidate.id,
            requestId: deletionRequest.requestId,
            commandExportVisible: true,
            beforeunloadProtected: unloadProtected,
          };
        },
      );

      await check(
        "D09",
        "A direct project deletion conflict requires a newly loaded preview",
        async () => {
          const candidate = config.projects[1];
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .waitFor();
          await createCard(
            `Project direct conflict ${Date.now()}`,
            candidate.id,
          );
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .click();
          await expect(dialog).toContainText(
            "Load a new deletion preview before trying again.",
          );
          await expect(
            dialog.getByRole("button", {
              name: "Load a new deletion preview",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeDisabled();
          await dialog
            .getByRole("button", {
              name: "Load a new deletion preview",
              exact: true,
            })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeEnabled();
          await dialog
            .getByRole("button", { name: "Keep project", exact: true })
            .click();
          assert.equal(await exists(join(candidate.folder, ".project")), true);
          return { project: candidate.id, newPreviewRequired: true };
        },
      );

      await check(
        "D10",
        "A project conflict recovered through status requires a new preview",
        async () => {
          const candidate = config.projects[1];
          const projectPath = `${config.origin}/api/v1/projects/${candidate.id}`;
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .waitFor();
          await createCard(
            `Project status conflict ${Date.now()}`,
            candidate.id,
          );
          await page.route(projectPath, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            await route.fetch();
            await route.abort("failed").catch(() => {});
          });
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .click();
          await dialog
            .getByRole("button", {
              name: "Check deletion status",
              exact: true,
            })
            .click();
          await expect(dialog).toContainText(
            "Load a new deletion preview before trying again.",
          );
          await expect(
            dialog.getByRole("button", {
              name: "Load a new deletion preview",
              exact: true,
            }),
          ).toBeVisible();
          await dialog
            .getByRole("button", {
              name: "Load a new deletion preview",
              exact: true,
            })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeEnabled();
          await page.unroute(projectPath);
          await dialog
            .getByRole("button", { name: "Keep project", exact: true })
            .click();
          return { project: candidate.id, statusConflictRequiresPreview: true };
        },
      );

      await check(
        "D11",
        "Project deletion removes only .project and navigates away from the current project",
        async () => {
          const candidate = config.projects[1];
          let planVersion;
          let deletionRequest;
          const planPath = `${config.origin}/api/v1/projects/${candidate.id}/deletion-plan`;
          const projectPath = `${config.origin}/api/v1/projects/${candidate.id}`;
          await page.route(planPath, async (route) => {
            if (route.request().method() !== "GET") return route.continue();
            const response = await route.fetch();
            const value = await response.json();
            planVersion = value.version;
            return route.fulfill({ response });
          });
          await page.route(projectPath, async (route) => {
            if (route.request().method() !== "DELETE") return route.continue();
            deletionRequest = {
              version: route.request().headers()["if-match"],
              payload: route.request().postDataJSON(),
            };
            return route.continue();
          });
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeEnabled();
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .click();
          await expect(dialog).toBeHidden();
          assert.equal(deletionRequest.version, `"${planVersion}"`);
          assert.deepEqual(deletionRequest.payload, {});
          await page.unroute(planPath);
          await page.unroute(projectPath);
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("view") === "projects" &&
              !url.searchParams.get("project"),
          );
          assert.equal(await exists(join(candidate.folder, ".project")), false);
          assert.equal(await exists(candidate.folder), true);
          return {
            project: candidate.id,
            metadataRemoved: true,
            repositoryPreserved: true,
          };
        },
      );

      await check(
        "D12",
        "Deleting the last current project leaves the projects workspace usable",
        async () => {
          const candidate = config.projects[0];
          await route(page, "projects", candidate.id);
          await openProjectDeletion(page, candidate.title);
          const dialog = page.getByRole("dialog", {
            name: "Delete project",
            exact: true,
          });
          await expect(
            dialog.getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            }),
          ).toBeEnabled();
          await dialog
            .getByRole("button", {
              name: "Permanently delete project",
              exact: true,
            })
            .click();
          await expect(dialog).toBeHidden();
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("view") === "projects" &&
              !url.searchParams.get("project"),
          );
          await expect(page.locator(".empty")).toContainText(
            "Start with a folder",
          );
          assert.equal(await exists(join(candidate.folder, ".project")), false);
          assert.equal(await exists(candidate.folder), true);
          return {
            project: candidate.id,
            lastProjectRemoved: true,
            projectsWorkspaceUsable: true,
          };
        },
      );
    } finally {
      await context.close();
    }
    if (results.some((result) => result.status !== "pass") || errors.length)
      process.exitCode = 1;
  },
);

export const deletionSuite = true;
