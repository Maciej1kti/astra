/** Recoverable session reads and cross-client workspace dates. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, newContext, evidence }) => {
    const project = config.projects[2];
    const base = `/api/v1/projects/${project.id}/cards`;
    const mutate = async (method, path, payload, version) => {
      const file = join(runtime, "session-command.json");
      await writeFile(file, JSON.stringify(payload));
      return cli(
        "command",
        method,
        path,
        "--json-file",
        file,
        ...(version ? ["--if-version", version] : []),
      );
    };
    let card = (await mutate("POST", base, { title: "Session recovery card" }))
      .result.resource;
    const path = `${base}/${card.metadata.id}`;
    for (const name of ["Existing draft", "New draft"])
      card = (
        await mutate(
          "PATCH",
          path,
          {
            configure_counter: { name, unit: "reps", step: 1, archived: false },
          },
          card.version,
        )
      ).result.resource;
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      let streams = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/v1/events") streams++;
      });
      const fault = "**/api/v1/projects?**";
      await page.route(fault, (r) =>
        r.fulfill({
          status: 503,
          json: {
            api_version: "1",
            error: {
              code: "SERVER_BUSY",
              message: "Synthetic startup read failure",
            },
          },
        }),
      );
      await page.goto(config.origin);
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Synthetic startup read failure" }),
      ).toBeVisible();
      await page.unroute(fault);
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(
        page
          .getByRole("button")
          .filter({ hasText: "Session recovery card" })
          .first(),
      ).toBeVisible();
      await mutate(
        "PATCH",
        path,
        { set: { title: "CLI after view recovery" } },
        card.version,
      );
      await expect(
        page
          .getByRole("button")
          .filter({ hasText: "CLI after view recovery" })
          .first(),
      ).toBeVisible();
      assert.equal(streams, 1);
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id, type: "card", resource: card.metadata.id })}`,
      );
      const counters = page.getByRole("region", {
        name: "Card counters",
        exact: true,
      });
      const day = counters;
      await expect(counters).toBeVisible();
      const before = await day.getAttribute("data-counter-today");
      await counters
        .getByRole("spinbutton", {
          name: "Existing draft value",
          exact: true,
        })
        .press("ArrowRight");
      const date = (zone) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
      const zone =
        date("Pacific/Kiritimati") !== before
          ? "Pacific/Kiritimati"
          : "Etc/GMT+12";
      const after = date(zone);
      assert.notEqual(after, before);
      const prefs = cli("get", "/api/v1/workspace/preferences");
      await mutate(
        "PATCH",
        "/api/v1/workspace/preferences",
        { timezone: zone, preferences: { week_start: "sunday" } },
        prefs.version,
      );
      await expect(day).toHaveAttribute("data-counter-today", after);
      await expect(
        counters.getByRole("group", {
          name: "Counter: Existing draft",
          exact: true,
        }),
      ).toContainText(`Unsaved result for ${before}`);
      await counters
        .getByRole("spinbutton", { name: "New draft value", exact: true })
        .press("ArrowRight");
      for (const name of ["Existing draft", "New draft"]) {
        const confirm = counters.getByRole("button", {
          name: `Confirm ${name}`,
          exact: true,
        });
        await confirm.click();
        // Disabled also covers an in-flight write; draft removal requires ACK.
        await expect(
          counters
            .getByRole("group", { name: `Counter: ${name}`, exact: true })
            .getByRole("button", { name: "Reset draft", exact: true }),
        ).toHaveCount(0);
        await expect(confirm).toHaveCount(0);
      }
      const values = cli("get", path).metadata.counters;
      assert.deepEqual(values[0].values, { [before]: 1 });
      assert.deepEqual(values[1].values, { [after]: 1 });
      await mutate(
        "PATCH",
        path,
        { set: { pinned: true } },
        cli("get", path).version,
      );
      await page.goto(`${config.origin}/?view=focus`);
      const healthyPin = page
        .getByRole("button")
        .filter({ hasText: "CLI after view recovery" })
        .first();
      await expect(healthyPin).toBeVisible();
      const pins = cli("get", "/api/v1/workspace/focus").items;
      const unpinned = config.cards.find(
        (item) => !pins.some((pin) => pin.card_id === item.id),
      );
      const broken = join(
        config.projects[0].folder,
        ".project/cards",
        `${unpinned.id}.json`,
      );
      const original = await readFile(broken);
      const warning = page.getByText(
        "Some project sources are unavailable or invalid.",
        { exact: false },
      );
      try {
        await writeFile(broken, "{");
        await expect(warning).toBeVisible();
        await expect(healthyPin).toBeVisible();
      } finally {
        await writeFile(broken, original);
      }
      await expect(warning).toHaveCount(0);

      await mutate(
        "PATCH",
        path,
        { set: { schedule: { start: after, end: after } } },
        cli("get", path).version,
      );
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project: project.id, type: "card", resource: card.metadata.id })}`,
      );
      await expect(day).toHaveAttribute("data-counter-today", after);
      const schedule = page.getByRole("button", {
        name: "Edit schedule",
        exact: true,
      });
      await expect(schedule).toContainText("Ends today");
      const comment = page.getByLabel("Write a comment", { exact: true });
      await comment.fill("Retained session-loss comment");
      await counters
        .getByRole("spinbutton", { name: "New draft value", exact: true })
        .press("ArrowRight");
      for (const session of cli("sessions").items)
        cli("revoke-session", session.id);
      await expect(
        page.getByText("Your session ended.", { exact: false }).first(),
      ).toBeVisible();
      await expect(day).toHaveAttribute("data-counter-today", after);
      await expect(schedule).toContainText("Ends today");
      await expect(comment).toHaveValue("Retained session-loss comment");
      await expect(comment).toBeDisabled();
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({
          status: "pass",
          checks: [
            "startup read failure",
            "one live stream",
            "CLI update after recovery",
            "remote timezone",
            "old and new draft dates",
            "Focus isolates an invalid source and recovers",
            "session loss retains the last known timezone and unsent drafts",
          ],
          errors,
        }),
      );
    } catch (error) {
      await page.screenshot({ path: join(evidence, "failure.png") });
      throw error;
    } finally {
      await writeFile(
        join(evidence, "page-errors.json"),
        JSON.stringify(errors, null, 2),
      );
      await context.close();
    }
  },
);
