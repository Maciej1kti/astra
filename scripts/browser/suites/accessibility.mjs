/** Roles, names and keyboard-only operation of the description and confirmations. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext }) => {
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "accessibility-command.json");
    const results = [];
    const errors = [];
    const webkit = process.env.ASTRA_TEST_BROWSER === "webkit";
    // WebKit reserves plain Tab for form fields, as Safari does by default.
    const tabKey = webkit ? "Alt+Tab" : "Tab";

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }
    async function create(title, extra = {}) {
      const result = await mutate("POST", `${base}/cards`, {
        title,
        status: "active",
        ...extra,
      });
      return cli("get", `${base}/cards/${result.id}`);
    }
    async function visit(page, parameters) {
      await page.goto(`${config.origin}/?${new URLSearchParams(parameters)}`);
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Połączono z serwerem",
      );
    }
    async function openCard(page, card) {
      await visit(page, {
        view: "list",
        project,
        type: "card",
        resource: card.metadata.id,
      });
      const editor = page.getByRole("dialog", {
        name: "Edytuj element",
        exact: true,
      });
      await expect(
        editor.getByRole("button", { name: "Przypnij do Focus", exact: true }),
      ).toBeEnabled();
      return editor;
    }
    /** Reach a control with the keyboard alone; returns the key presses used. */
    async function tabTo(page, control, limit = 60) {
      for (let presses = 0; presses <= limit; presses++) {
        if (await control.evaluate((node) => node === document.activeElement))
          return presses;
        await page.keyboard.press(tabKey);
      }
      throw new Error("Keyboard focus never reached the control");
    }
    /** No button may hide inside a live region that is read out as one message. */
    async function noControlsInAlerts(scope) {
      await expect(scope.getByRole("alert").getByRole("button")).toHaveCount(0);
      await expect(scope.getByRole("alert").getByRole("link")).toHaveCount(0);
    }
    async function snapshot(page, name) {
      // WebKit's screenshot preparation injects a stylesheet the CSP rejects.
      if (!webkit) await page.screenshot({ path: join(evidence, name) });
    }
    async function check(id, name, run) {
      const context = await newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) =>
        errors.push({ id, message: error.message }),
      );
      const started = Date.now();
      try {
        const detail = await run(page);
        results.push({ id, name, status: "pass", detail });
      } catch (error) {
        results.push({ id, name, status: "fail", error: String(error) });
        await snapshot(page, `${id}-failure.png`).catch(() => {});
      } finally {
        results.at(-1).ms = Date.now() - started;
        await context.close();
        console.log(JSON.stringify(results.at(-1)));
        await writeFile(
          join(evidence, "results.json"),
          JSON.stringify(
            { results, errors, browser: browser.version() },
            null,
            2,
          ),
        );
      }
    }

    await check(
      "X01",
      "A description is ordinary content with a separate labelled edit control",
      async (page) => {
        const card = await create("Accessible description", {
          body: "Intro with a [reference link](https://example.test/reference).\n\nSecond paragraph.",
        });
        const editor = await openCard(page, card);
        const section = editor.getByRole("region", {
          name: "Karta — opis",
          exact: true,
        });
        const rendered = section.locator(".resource-description-rendered");
        const edit = section.getByRole("button", {
          name: "Edytuj opis: Karta",
          exact: true,
        });
        const source = section.getByRole("textbox", {
          name: "Opis",
          exact: true,
        });
        const link = section.getByRole("link", {
          name: "reference link",
          exact: true,
        });
        await expect(rendered).toContainText("Second paragraph.");
        // The control is a real button and the Markdown is not inside it, so
        // its label cannot replace the description or flatten the link.
        assert.equal(await edit.evaluate((node) => node.tagName), "BUTTON");
        assert.equal(await edit.locator("a").count(), 0);
        assert.equal(await rendered.getAttribute("role"), null);
        assert.equal(await rendered.getAttribute("tabindex"), null);
        assert.equal(await rendered.getAttribute("aria-label"), null);
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute(
          "href",
          "https://example.test/reference",
        );

        // Keyboard only: reach the control, edit, and leave with Tab.
        await editor.getByLabel("Tytuł", { exact: true }).focus();
        const presses = await tabTo(page, edit);
        await expect(edit).toBeVisible();
        const focused = await edit.boundingBox();
        assert(focused && focused.width >= 24 && focused.height >= 24);
        await snapshot(page, "description-edit-control-1440.png");
        await page.keyboard.press("Enter");
        await expect(source).toBeFocused();
        await page.keyboard.press("End");
        await page.keyboard.type(" Typed by keyboard.");
        await page.keyboard.press("Tab");
        await expect(source).toHaveCount(0);
        await expect(rendered).toContainText("Typed by keyboard.");
        await expect(editor.getByTestId("autosave-status")).toHaveText(
          "Zapisano",
        );
        assert.match(
          cli("get", `${base}/cards/${card.metadata.id}`).body,
          /Typed by keyboard\.$/,
        );
        // Space activates the same control.
        await tabTo(page, edit);
        await page.keyboard.press("Space");
        await expect(source).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(source).toHaveCount(0);

        // Pointer users still click the text; a link stays a link.
        await link.evaluate((node) =>
          node.addEventListener("click", (event) => event.preventDefault(), {
            once: true,
          }),
        );
        await link.click();
        await expect(source).toHaveCount(0);
        await rendered.getByText("Second paragraph.").click();
        await expect(source).toBeFocused();
        await editor.getByLabel("Tytuł", { exact: true }).click();
        await expect(source).toHaveCount(0);
        await expect(editor.getByTestId("autosave-status")).toHaveText(
          "Zapisano",
        );

        const metrics = [];
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 1000 : 844,
          });
          await tabTo(page, edit);
          const box = await edit.boundingBox();
          const within = await section.boundingBox();
          assert(box && within, "The focused edit control must be rendered");
          assert(box.x >= 0 && box.x + box.width <= width);
          assert(box.x + box.width <= within.x + within.width + 1);
          metrics.push({ width, control: box });
          await snapshot(page, `description-edit-focused-${width}.png`);
          await editor.getByLabel("Tytuł", { exact: true }).focus();
          await snapshot(page, `description-${width}.png`);
        }
        return { presses, metrics };
      },
    );

    await check(
      "X02",
      "An empty description offers the same control and placeholder",
      async (page) => {
        const card = await create("Accessible empty description");
        const editor = await openCard(page, card);
        const section = editor.getByRole("region", {
          name: "Karta — opis",
          exact: true,
        });
        const edit = section.getByRole("button", {
          name: "Edytuj opis: Karta",
          exact: true,
        });
        await expect(section.getByText("Dodaj opis…")).toBeVisible();
        assert.equal(await edit.evaluate((node) => node.tagName), "BUTTON");
        await section.getByText("Dodaj opis…").click();
        const source = section.getByRole("textbox", {
          name: "Opis",
          exact: true,
        });
        await expect(source).toBeFocused();
        await source.fill("Added by pointer");
        await editor.getByLabel("Tytuł", { exact: true }).click();
        await expect(editor.getByTestId("autosave-status")).toHaveText(
          "Zapisano",
        );
        assert.equal(
          cli("get", `${base}/cards/${card.metadata.id}`).body,
          "Added by pointer",
        );
        return { saved: true };
      },
    );

    await check(
      "X03",
      "The discard confirmation is a labelled group operable by keyboard",
      async (page) => {
        const card = await create("Accessible discard");
        const editor = await openCard(page, card);
        const comment = editor.getByLabel("Napisz komentarz", { exact: true });
        await comment.fill("Unsent comment");
        await page.keyboard.press("Escape");
        const question = "Odrzucić niezapisaną wersję roboczą?";
        const group = editor.getByRole("group", {
          name: question,
          exact: true,
        });
        await expect(group).toBeVisible();
        // Only the question is announced as an alert.
        await expect(group.getByRole("alert")).toHaveText(question);
        await noControlsInAlerts(editor);
        const keep = group.getByRole("button", {
          name: "Kontynuuj edycję",
          exact: true,
        });
        const drop = group.getByRole("button", {
          name: "Odrzuć wersję roboczą",
          exact: true,
        });
        await tabTo(page, keep);
        await page.keyboard.press("Enter");
        await expect(group).toHaveCount(0);
        await expect(comment).toHaveValue("Unsent comment");
        // Focus returns to the control that asked, not to the page.
        await expect(
          editor.getByRole("button", { name: "Zamknij edytor", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(group).toBeVisible();
        await tabTo(page, drop);
        await page.keyboard.press("Enter");
        await expect(editor).toHaveCount(0);
        return { keyboard: true };
      },
    );

    await check(
      "X04",
      "The delete confirmation is a named alert dialog operable by keyboard",
      async (page) => {
        const card = await create("Accessible delete");
        const editor = await openCard(page, card);
        await editor
          .getByRole("button", { name: "Działania karty", exact: true })
          .click();
        await editor
          .getByRole("button", { name: "Usuń kartę", exact: true })
          .click();
        const confirmation = editor.getByRole("alertdialog", {
          name: "Trwale usunąć kartę?",
          exact: true,
        });
        await expect(confirmation).toBeVisible();
        await expect(confirmation).toHaveAccessibleDescription(
          /Accessible delete.*nie można tego cofnąć/,
        );
        await noControlsInAlerts(editor);
        const remove = confirmation.getByRole("button", {
          name: "Trwale usuń kartę",
          exact: true,
        });
        const keep = confirmation.getByRole("button", {
          name: "Kontynuuj edycję",
          exact: true,
        });
        await expect(remove).toBeFocused();
        await page.keyboard.press(tabKey);
        await expect(keep).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(confirmation).toHaveCount(0);
        assert.equal(
          cli("get", `${base}/cards/${card.metadata.id}`).metadata.title,
          "Accessible delete",
        );

        // An unfinished entry is confirmed first, in the same dialog role.
        await editor
          .getByLabel("Napisz komentarz", { exact: true })
          .fill("Unsent comment");
        await editor
          .getByRole("button", { name: "Działania karty", exact: true })
          .click();
        await editor
          .getByRole("button", { name: "Usuń kartę", exact: true })
          .click();
        const drafts = editor.getByRole("alertdialog", {
          name: "Odrzucić wersje robocze przed usunięciem?",
          exact: true,
        });
        await expect(
          drafts.getByRole("button", {
            name: "Odrzuć wersje robocze i kontynuuj",
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(remove).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(editor).toHaveCount(0);
        await expect
          .poll(() => {
            try {
              cli("get", `${base}/cards/${card.metadata.id}`);
              return "present";
            } catch {
              return "removed";
            }
          })
          .toBe("removed");
        return { keyboard: true };
      },
    );

    await check(
      "X05",
      "Settings confirmations keep their buttons out of alerts",
      async (page) => {
        await visit(page, { view: "list", project });
        await page
          .getByRole("button", {
            name: "Ustawienia przestrzeni roboczej",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        const timezone = dialog.getByLabel("Strefa czasowa", { exact: true });
        await expect(timezone).toBeEnabled();
        const original = await timezone.inputValue();
        await timezone.fill(original === "UTC" ? "Europe/Warsaw" : "UTC");
        await page.keyboard.press("Escape");
        const confirmation = dialog.getByRole("alertdialog", {
          name: "Odrzucić niezapisane ustawienia?",
          exact: true,
        });
        await expect(confirmation).toBeVisible();
        await noControlsInAlerts(dialog);
        const keep = confirmation.getByRole("button", {
          name: "Kontynuuj edycję",
          exact: true,
        });
        await expect(keep).toBeFocused();
        await page.keyboard.press(tabKey);
        await expect(
          confirmation.getByRole("button", {
            name: "Odrzuć wersję roboczą ustawień",
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog).toHaveCount(0);
        assert.equal(
          cli("get", "/api/v1/workspace/preferences").timezone,
          original,
        );
        return { keyboard: true };
      },
    );

    if (results.some((result) => result.status !== "pass") || errors.length)
      process.exitCode = 1;
    console.log(
      JSON.stringify({
        passed: results.filter((result) => result.status === "pass").length,
        total: results.length,
        errors,
      }),
    );
  },
);
