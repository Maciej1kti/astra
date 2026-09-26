/** Daily counters through the release UI and conditional CLI writes. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({ timezoneId: "America/Los_Angeles" });
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
    const increase = (name) =>
      row(name).getByRole("button", {
        name: `Increase ${name} by 5`,
        exact: true,
      });
    const confirm = (name) =>
      row(name).getByRole("button", { name: `Confirm ${name}`, exact: true });
    const open = async () => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id, type: "card", resource: id })}`,
      );
      await expect(section).toBeVisible();
    };
    try {
      await open();
      for (const name of ["Push-ups", "Sit-ups", "Squats"]) {
        await section
          .getByRole("button", { name: "Add counter", exact: true })
          .click();
        await section.getByLabel("Counter name", { exact: true }).fill(name);
        await section.getByLabel("Counter unit", { exact: true }).fill("reps");
        await section.getByLabel("Counter step", { exact: true }).fill("5");
        await section
          .getByRole("button", { name: "Save counter", exact: true })
          .click();
        await expect(value(name)).toHaveText("0");
        await expect(
          section.getByRole("group", {
            name: "Counter configuration",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      const first = get().metadata.counters[0];
      const today = await section
        .locator(":scope > .field-hint time")
        .getAttribute("datetime");
      await increase("Push-ups").click();
      await increase("Push-ups").click();
      await increase("Sit-ups").click();
      await expect(value("Push-ups")).toHaveText("10");
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
      await expect(value("Push-ups")).toHaveText("10");
      await expect(value("Sit-ups")).toHaveText("5");
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
      await expect(confirm("Push-ups")).toBeDisabled();
      assert.equal(get().metadata.counters[0].values[today], 10);
      await expect(value("Sit-ups")).toHaveText("5");
      await confirm("Sit-ups").click();
      await expect(confirm("Sit-ups")).toBeDisabled();
      await mutate(
        "PATCH",
        path,
        { record_counter: { id: first.id, date: "2026-01-01", value: 30 } },
        get().version,
      );
      await page.reload();
      await expect(value("Push-ups")).toHaveText("10");
      await row("Push-ups")
        .getByText("History · 2 days", { exact: true })
        .click();
      await expect(row("Push-ups")).toContainText("30 reps");
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
        .getByRole("button", { name: "Show archived counters", exact: true })
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
      await expect(value("Push-ups")).toHaveText("10");
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        await row("Push-ups").scrollIntoViewIfNeeded();
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
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
      await increase("Push-ups").click();
      await confirm("Push-ups").click();
      await expect(
        dialog.getByRole("button", { name: "Retry same command", exact: true }),
      ).toBeEnabled();
      assert.equal(get().metadata.counters[0].values[today], 15);
      await expect(value("Push-ups")).toHaveText("15");
      await dialog
        .getByRole("button", { name: "Retry same command", exact: true })
        .click();
      await expect(confirm("Push-ups")).toBeDisabled();
      assert.equal(get().metadata.counters[0].values[today], 15);
      assert.equal(submitted.length, 2);
      for (const key of ["x-request-id", "x-command-epoch", "if-match"])
        assert.equal(submitted[0].headers[key], submitted[1].headers[key]);
      assert.deepEqual(submitted[0].payload, submitted[1].payload);
      await page.unroute(matcher);
      // Concurrent recording must conflict, never overwrite an unseen result.
      await increase("Push-ups").click();
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
      await expect(value("Push-ups")).toHaveText("20");
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
      await expect(value("Push-ups")).toHaveText("35");
      // Use workspace midnight, independent of the emulated browser timezone.
      await page.clock.install({ time: new Date(`${today}T12:00:00Z`) });
      await increase("Squats").click();
      await page.clock.setSystemTime(
        new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000),
      );
      await page.clock.fastForward(1000);
      await expect(value("Push-ups")).toHaveText("0");
      await expect(value("Squats")).toHaveText("5");
      await expect(row("Squats")).toContainText(`Unsaved result for ${today}`);
      // Keep real time for admission; the counter draft retains its explicit day.
      await page.clock.setSystemTime(new Date());
      await confirm("Squats").click();
      await expect(confirm("Squats")).toBeDisabled();
      assert.equal(get().metadata.counters[2].values[today], 5);
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
              "320/390/1440px",
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
      await page.screenshot({ path: join(evidence, "failure.png") });
      throw error;
    } finally {
      await context.close();
    }
  },
);
