/** Daily counters through the release UI and conditional CLI writes. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const context = await newContext({
      timezoneId: "America/Los_Angeles",
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const file = join(runtime, "counter-command.json");
    const mutate = async (method, path, payload, version) => {
      await writeFile(file, JSON.stringify(payload));
      return cli(
        "command",
        method,
        path,
        "--json-file",
        file,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    };
    const card = await mutate("POST", base, {
      title: "Daily exercise",
      status: "active",
    });
    const id = card.metadata.id;
    const path = `${base}/${id}`;
    const get = () => cli("get", path);
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const section = dialog.getByRole("region", {
      name: "Card counters",
      exact: true,
    });
    const row = (name) =>
      section.getByRole("group", { name: `Counter: ${name}`, exact: true });
    const value = (name) =>
      row(name).getByLabel(`${name} value`, { exact: true });
    const total = (name) =>
      row(name).getByRole("textbox", { name: `${name} total`, exact: true });
    const confirm = (name) =>
      row(name).getByRole("button", { name: `Confirm ${name}`, exact: true });
    const expectRecorded = async (name) => {
      await expect(row(name).locator(".draft-hint")).toHaveCount(0);
      await expect(confirm(name)).toHaveCount(0);
    };
    const open = async () => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id, type: "card", resource: id })}`,
      );
      await expect(section).toBeVisible();
    };
    try {
      await open();
      for (const name of ["Push-ups", "Sit-ups", "Squats"]) {
        const menu = section.getByRole("button", {
          name: "Counter actions",
          exact: true,
        });
        if (name === "Push-ups") await expect(menu).toHaveCount(0);
        else await menu.click();
        await section
          .getByRole("button", { name: "Add counter", exact: true })
          .click();
        await section.getByLabel("Counter name", { exact: true }).fill(name);
        await section.getByLabel("Counter unit", { exact: true }).fill("reps");
        await section.getByLabel("Counter step", { exact: true }).fill("5");
        await section
          .getByRole("button", { name: "Save counter", exact: true })
          .click();
        await expect(value(name)).toHaveAttribute("aria-valuenow", "0");
        await expect(
          section.getByRole("group", {
            name: "Counter configuration",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      const first = get().metadata.counters[0];
      const today = await section.getAttribute("data-counter-today");
      await expect(section).not.toContainText("Today ·");
      await expect(section).not.toContainText("Europe/Warsaw");
      await value("Push-ups").scrollIntoViewIfNeeded();
      const box = await value("Push-ups").boundingBox();
      await page.mouse.move(box.x + 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 44, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "10");
      assert.deepEqual(get().metadata.counters[0].values, {});
      await row("Push-ups")
        .getByRole("button", { name: "Reset draft", exact: true })
        .click();
      if (browser.browserType().name() === "chromium") {
        await page.setViewportSize({ width: 390, height: 844 });
        const cdp = await context.newCDPSession(page);
        const swipe = async (dx, dy, cancel = false) => {
          await value("Push-ups").scrollIntoViewIfNeeded();
          const bounds = await value("Push-ups").boundingBox();
          const x = bounds.x + 20,
            y = bounds.y + bounds.height / 2;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
          });
          for (const part of [0.34, 0.67, 1])
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: x + dx * part, y: y + dy * part }],
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: cancel ? "touchCancel" : "touchEnd",
            touchPoints: [],
          });
        };
        await swipe(36, 0);
        await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "15");
        assert.deepEqual(get().metadata.counters[0].values, {});
        await row("Push-ups")
          .getByRole("button", { name: "Reset draft", exact: true })
          .click();
        await swipe(36, 0, true);
        await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "0");
        await expect(confirm("Push-ups")).toHaveCount(0);
        const beforeScroll = await dialog
          .locator(".editor-form")
          .evaluate((el) => el.scrollTop);
        await swipe(0, -80);
        await expect
          .poll(() =>
            dialog.locator(".editor-form").evaluate((el) => el.scrollTop),
          )
          .toBeGreaterThan(beforeScroll);
        await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "0");
        await expect(confirm("Push-ups")).toHaveCount(0);
        await cdp.detach();
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await value("Push-ups").click();
      await expect(
        dialog.getByRole("button", { name: "Close editor", exact: true }),
      ).toBeInViewport();
      assert.equal(
        await dialog.evaluate((el) => el.scrollTop),
        0,
        "Only the form scrolls; its header stays fixed",
      );
      await total("Push-ups").fill("");
      await expect(total("Push-ups")).toHaveAttribute("aria-invalid", "true");
      await expect(confirm("Push-ups")).toBeDisabled();
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Discard draft", exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(total("Push-ups")).toHaveValue("");
      await total("Push-ups").evaluate((el) => {
        el.dataset.retainedEntry = "yes";
      });
      await dialog
        .getByRole("button", { name: "Customize card layout", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Reorder Counters", exact: true })
        .press("ArrowUp");
      await dialog
        .getByRole("button", { name: "Done arranging sections", exact: true })
        .click();
      await expect(total("Push-ups")).toHaveValue("");
      await expect(total("Push-ups")).toHaveAttribute(
        "data-retained-entry",
        "yes",
      );
      await total("Push-ups").fill("1000000001");
      await expect(confirm("Push-ups")).toBeDisabled();
      await total("Push-ups").fill("1.5");
      await expect(confirm("Push-ups")).toBeDisabled();
      await total("Push-ups").fill("10");
      await value("Sit-ups").press("ArrowRight");
      await expect(total("Push-ups")).toHaveValue("10");
      assert.deepEqual(get().metadata.counters[0].values, {});
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("My daily exercise");
      await expect(dialog.getByTestId("autosave-status")).toHaveText("Saved");
      await dialog
        .getByRole("button", { name: "Pin to focus", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Remove from focus", exact: true }),
      ).toBeEnabled();
      await expect(total("Push-ups")).toHaveValue("10");
      await expect(value("Sit-ups")).toHaveAttribute("aria-valuenow", "5");
      await dialog
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Discard draft", exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await confirm("Push-ups").click();
      await expectRecorded("Push-ups");
      await expect(value("Push-ups")).toBeFocused();
      assert.equal(get().metadata.counters[0].values[today], 10);
      await expect(value("Sit-ups")).toHaveAttribute("aria-valuenow", "5");
      await confirm("Sit-ups").click();
      await expectRecorded("Sit-ups");
      await mutate(
        "PATCH",
        path,
        { record_counter: { id: first.id, date: "2026-01-01", value: 30 } },
        get().version,
      );
      await page.reload();
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "10");
      await row("Push-ups")
        .getByRole("button", { name: "Push-ups history", exact: true })
        .click();
      await expect(row("Push-ups")).toContainText("30 reps");
      await row("Push-ups")
        .getByRole("button", { name: "Push-ups history", exact: true })
        .click();
      // Config changes preserve dated totals; unit changes cannot reinterpret history.
      await row("Push-ups")
        .getByRole("button", { name: "Edit counter Push-ups", exact: true })
        .click();
      await expect(
        section.getByLabel("Counter unit", { exact: true }),
      ).toBeDisabled();
      await section
        .getByLabel("Hide counter, keep history", { exact: true })
        .check();
      await section
        .getByRole("button", { name: "Save counter", exact: true })
        .click();
      await expect(row("Push-ups")).toHaveCount(0);
      await section
        .getByRole("button", { name: "Counter actions", exact: true })
        .click();
      await section
        .getByRole("button", { name: "Archived", exact: true })
        .click();
      await expect(row("Push-ups")).toContainText("Hidden");
      await row("Push-ups")
        .getByRole("button", { name: "Edit counter Push-ups", exact: true })
        .click();
      await section
        .getByLabel("Hide counter, keep history", { exact: true })
        .uncheck();
      await section
        .getByRole("button", { name: "Save counter", exact: true })
        .click();
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "10");
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        await row("Push-ups").scrollIntoViewIfNeeded();
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        assert.ok(
          (await row("Push-ups").boundingBox()).height <= 100,
          "An idle counter fits a compact row",
        );
        if (browser.browserType().name() === "chromium")
          await page.screenshot({
            path: join(evidence, `counters-${width}.png`),
          });
      }
      const matcher = `${config.origin}${path}`;
      const submitted = [];
      await page.route(matcher, async (route) => {
        if (
          route.request().method() !== "PATCH" ||
          !route.request().postDataJSON()?.record_counter
        )
          return route.continue();
        submitted.push({
          headers: route.request().headers(),
          payload: route.request().postDataJSON(),
        });
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        if (submitted.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
      });
      await value("Push-ups").press("ArrowRight");
      await confirm("Push-ups").click();
      await expect(
        dialog.getByRole("button", { name: "Retry same command", exact: true }),
      ).toBeEnabled();
      assert.equal(get().metadata.counters[0].values[today], 15);
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "15");
      await dialog
        .getByRole("button", { name: "Retry same command", exact: true })
        .click();
      await expectRecorded("Push-ups");
      assert.equal(get().metadata.counters[0].values[today], 15);
      assert.equal(submitted.length, 2);
      for (const key of ["x-request-id", "x-command-epoch", "if-match"])
        assert.equal(submitted[0].headers[key], submitted[1].headers[key]);
      assert.deepEqual(submitted[0].payload, submitted[1].payload);
      await page.unroute(matcher);
      // Concurrent recording must conflict, never overwrite an unseen result.
      await value("Push-ups").press("ArrowRight");
      await page.route(matcher, async (route) => {
        if (
          route.request().method() !== "PATCH" ||
          !route.request().postDataJSON()?.record_counter
        )
          return route.continue();
        await mutate(
          "PATCH",
          path,
          { record_counter: { id: first.id, date: today, value: 35 } },
          get().version,
        );
        await route.continue();
      });
      await confirm("Push-ups").click();
      await expect(dialog).toContainText(/conflict|changed/i);
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "20");
      await expect(confirm("Push-ups")).toBeDisabled();
      assert.equal(get().metadata.counters[0].values[today], 35);
      await page.unroute(matcher);
      const source = JSON.parse(
        await readFile(
          join(project.folder, ".project", "cards", `${id}.json`),
          "utf8",
        ),
      );
      assert.deepEqual(source.metadata.counters[0].values, {
        "2026-01-01": 30,
        [today]: 35,
      });
      await page.reload();
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "35");
      // Use workspace midnight, independent of the emulated browser timezone.
      await page.clock.install({ time: new Date(`${today}T12:00:00Z`) });
      await value("Squats").click();
      await total("Squats").fill("5");
      await page.clock.setSystemTime(
        new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000),
      );
      await page.clock.fastForward(1000);
      await expect(value("Push-ups")).toHaveAttribute("aria-valuenow", "0");
      await expect(total("Squats")).toHaveValue("5");
      await expect(row("Squats")).toContainText(`Unsaved result for ${today}`);
      // Keep real time for admission; the counter draft retains its explicit day.
      await page.clock.setSystemTime(new Date());
      // An in-flight command disables OK before its durable acknowledgement.
      await page.route(matcher, async (route) => {
        if (
          route.request().method() === "PATCH" &&
          route.request().postDataJSON()?.record_counter
        )
          await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });
      await confirm("Squats").click();
      await expectRecorded("Squats");
      assert.equal(get().metadata.counters[2].values[today], 5);
      await page.unroute(matcher);
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            checks: [
              "three counters",
              "explicit confirmation",
              "daily history and rollover",
              "autosave/pin/close draft protection",
              "archive and restore",
              "unit protection",
              "320–1440px compact rows",
              "horizontal scrub and numeric entry",
              "touch cancellation and vertical modal scrolling",
              "incomplete numeric input remains guarded",
              "numeric entry stays mounted while reordering sections",
              "stable lost-response retry",
              "concurrent conflict",
              "source JSON",
            ],
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await writeFile(
        join(evidence, "geometry.json"),
        JSON.stringify(
          await dialog.evaluate((element) =>
            [
              element,
              ...element.querySelectorAll(
                ".editor-layout, .dialog-header, .editor-form",
              ),
            ].map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                className: el.className,
                top: rect.top,
                height: rect.height,
                scrollTop: el.scrollTop,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                overflow: getComputedStyle(el).overflow,
              };
            }),
          ),
          null,
          2,
        ),
      );
      await page.screenshot({ path: join(evidence, "failure.png") });
      throw error;
    } finally {
      await context.close();
    }
  },
);
