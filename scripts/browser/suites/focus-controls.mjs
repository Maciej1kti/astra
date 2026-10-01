/** Pinned counter gestures, conditional writes and recovery on a paired release host. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({
      timezoneId: "America/Los_Angeles",
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = config.projects[2].id;
    const base = `/api/v1/projects/${project}/cards`;
    const file = join(runtime, "focus-control-command.json");
    async function mutate(method, path, payload, version) {
      await writeFile(file, JSON.stringify(payload));
      return cli(
        "command",
        method,
        path,
        "--json-file",
        file,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    }
    let card = await mutate("POST", base, {
      title: "Daily movement and a little room to breathe",
      status: "active",
      priority: "high",
      labels: ["health", "personal"],
      body: "Synthetic focus counter fixture.",
    });
    const id = card.metadata.id,
      path = `${base}/${id}`;
    const get = () => cli("get", path);
    card = await mutate("PATCH", path, { set: { pinned: true } }, card.version);
    for (const [name, unit] of [
      ["Push-ups", "reps"],
      ["Walking", "steps"],
      ["A longer counter name that must remain readable", "reps"],
    ]) {
      card = await mutate(
        "PATCH",
        path,
        { configure_counter: { name, unit, step: 5, archived: false } },
        card.version,
      );
    }
    const counters = card.metadata.counters;
    const today = cli("focus", "get").cards.find((item) => item.id === id)
      .daily_counters[0].date;
    const url = `${config.origin}/?view=focus&project=${project}`;
    const pin = page.locator(`[data-focus-card="${id}"]`);
    const chip = () =>
      pin.getByRole("spinbutton", { name: "Push-ups", exact: true });
    const bar = page.getByRole("region", {
      name: "Edit focus counter",
      exact: true,
    });
    const numeric = () => bar.getByLabel("Push-ups total", { exact: true });
    const cancel = () =>
      bar
        .getByRole("button", { name: "Cancel counter edit", exact: true })
        .click();
    const savedValue = () => get().metadata.counters[0].values[today] ?? 0;
    const requests = [];
    page.on("request", (request) =>
      requests.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
      }),
    );
    try {
      // Unpinned daily plans/events must expose the same editable counter footer.
      for (const [sectionName, dateFields] of [
        ["In motion", { schedule: { start: today, end: today } }],
        [
          "Events",
          { event: { start: `${today}T23:59`, duration_minutes: 60 } },
        ],
      ]) {
        let daily = await mutate("POST", base, {
          title: `Daily footer ${sectionName}`,
          status: "active",
          ...dateFields,
        });
        const dailyPath = `${base}/${daily.metadata.id}`;
        daily = await mutate(
          "PATCH",
          dailyPath,
          {
            configure_counter: {
              name: "Daily steps",
              unit: "reps",
              step: 5,
              archived: false,
            },
          },
          daily.version,
        );
        const activeCounter = daily.metadata.counters[0].id;
        daily = await mutate(
          "PATCH",
          dailyPath,
          {
            configure_counter: {
              name: "Hidden counter",
              unit: "reps",
              step: 1,
              archived: true,
            },
          },
          daily.version,
        );
        await page.goto(url);
        const dailyCard = page
          .getByRole("region", { name: sectionName, exact: true })
          .locator(".focus-card")
          .filter({ hasText: daily.metadata.title });
        const dailyChip = dailyCard.getByRole("spinbutton", {
          name: "Daily steps",
          exact: true,
        });
        await expect(dailyChip).toHaveAttribute("aria-valuenow", "0");
        await expect(dailyCard.getByRole("spinbutton")).toHaveCount(1);
        assert.equal(
          requests.filter(
            (req) => req.method === "GET" && req.path === dailyPath,
          ).length,
          0,
        );
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await dailyChip.scrollIntoViewIfNeeded();
          await expect(dailyChip).toBeInViewport();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth),
            width,
          );
          await page.screenshot({
            path: join(
              evidence,
              `${sectionName.replaceAll(" ", "-")}-${width}.png`,
            ),
          });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        const bounds = await dailyChip.boundingBox();
        await page.mouse.move(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          bounds.x + bounds.width / 2 + 24,
          bounds.y + bounds.height / 2,
          { steps: 4 },
        );
        await page.mouse.up();
        await expect(
          bar.getByLabel("Daily steps total", { exact: true }),
        ).toHaveValue("10");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await bar
          .getByRole("button", { name: "Cancel counter edit", exact: true })
          .click();
        await dailyChip.press("ArrowUp");
        await expect(
          bar.getByLabel("Daily steps total", { exact: true }),
        ).toHaveValue("5");
        await bar.getByRole("button", { name: "Save", exact: true }).click();
        await expect(bar).toHaveCount(0);
        await expect(dailyChip).toHaveAttribute("aria-valuenow", "5");
        const saved = cli("get", dailyPath);
        assert.equal(
          saved.metadata.counters.find(
            (counter) => counter.id === activeCounter,
          ).values[today],
          5,
        );
        await page.reload();
        await expect(dailyChip).toHaveAttribute("aria-valuenow", "5");
      }
      await page.goto(url);
      await expect(chip()).toHaveAttribute("aria-valuenow", "0");
      assert.equal(
        requests.filter((req) => req.method === "GET" && req.path === path)
          .length,
        0,
      );
      await chip().focus();
      await chip().press("ArrowUp");
      await expect(numeric()).toHaveValue("5");
      assert.equal(savedValue(), 0);
      await cancel();
      await expect(chip()).toHaveAttribute("aria-valuenow", "0");

      const box = await chip().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 36,
        box.y + box.height / 2,
        { steps: 6 },
      );
      await expect(chip()).toHaveAttribute("aria-valuenow", "15");
      await page.mouse.up();
      await expect(numeric()).toHaveValue("15");
      await expect(page.locator("[data-focus-drag-preview]")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(savedValue(), 0);
      await bar.getByRole("button", { name: "Save", exact: true }).click();
      await expect(bar).toHaveCount(0);
      await expect(chip()).toHaveAttribute("aria-valuenow", "15");
      assert.equal(savedValue(), 15);

      // Numeric entry and cancelled touch gestures do not submit/reorder a card.
      await chip().click();
      await expect(numeric()).toBeFocused();
      await numeric().fill("25");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Board", exact: true })
        .click();
      await expect(numeric()).toHaveValue("25");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Focus", exact: true })
        .click();
      await expect(chip()).toHaveAttribute("aria-valuenow", "25");
      await cancel();
      const writes = requests.filter((r) =>
        ["PATCH", "PUT"].includes(r.method),
      ).length;
      await chip().dispatchEvent("pointerdown", {
        pointerId: 77,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      });
      await chip().dispatchEvent("pointermove", {
        pointerId: 77,
        pointerType: "touch",
        isPrimary: true,
        clientX: 101,
        clientY: 150,
      });
      await chip().dispatchEvent("pointercancel", {
        pointerId: 77,
        pointerType: "touch",
        isPrimary: true,
      });
      await expect(bar).toHaveCount(0);
      assert.equal(
        requests.filter((r) => ["PATCH", "PUT"].includes(r.method)).length,
        writes,
      );

      // A changed source rejects the observed draft; no new-version overwrite follows.
      await chip().click();
      await numeric().fill("30");
      await mutate(
        "PATCH",
        path,
        { set: { title: "Updated by another client" } },
        get().version,
      );
      await bar.getByRole("button", { name: "Save", exact: true }).click();
      await expect(bar.getByRole("alert")).toContainText("changed");
      await expect(numeric()).toHaveValue("30");
      assert.equal(savedValue(), 15);
      await bar.getByRole("button", { name: "Discard and refresh" }).click();
      await expect(pin).toContainText("Updated by another client");

      // Lose a committed response, navigate away, then retry the identical request.
      const attempts = [];
      await page.route(`${config.origin}${path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const req = route.request(),
          headers = req.headers();
        attempts.push({
          payload: req.postDataJSON(),
          version: headers["if-match"],
          request: headers["x-request-id"],
          epoch: headers["x-command-epoch"],
        });
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        if (attempts.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
      });
      await chip().click();
      await numeric().fill("40");
      await bar.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        bar.getByRole("button", { name: "Retry same command" }),
      ).toBeVisible();
      await expect(numeric()).toBeDisabled();
      assert.equal(savedValue(), 40);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Board", exact: true })
        .click();
      await bar.getByRole("button", { name: "Retry same command" }).click();
      await expect(bar).toHaveCount(0);
      assert.deepEqual(attempts[0], attempts[1]);
      await page.unroute(`${config.origin}${path}`);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Focus", exact: true })
        .click();
      await expect(chip()).toHaveAttribute("aria-valuenow", "40");
      const notice = page.getByRole("button", {
        name: "Dismiss counter confirmation",
      });
      if (await notice.count()) await notice.click();

      // Real Chromium touch input: a horizontal swipe changes only the local draft.
      await page.setViewportSize({ width: 390, height: 844 });
      if (context.browser().browserType().name() === "chromium") {
        const cdp = await context.newCDPSession(page);
        await chip().scrollIntoViewIfNeeded();
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        await chip().evaluate((element) => {
          window.counterTouchTrace = [];
          for (const type of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "gotpointercapture",
            "lostpointercapture",
          ])
            element.addEventListener(type, (event) =>
              window.counterTouchTrace.push({
                type,
                target: event.target.tagName,
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              }),
            );
        });
        const touchBox = await chip().boundingBox();
        const x = touchBox.x + 15,
          y = touchBox.y + touchBox.height / 2;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (const dx of [12, 24, 36])
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + dx, y }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await writeFile(
          join(evidence, "touch-trace.json"),
          JSON.stringify(
            await page.evaluate(() => window.counterTouchTrace),
            null,
            2,
          ),
        );
        await expect(numeric()).toHaveValue("55");
        assert.equal(savedValue(), 40);
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        await expect(numeric()).toBeInViewport();
        await page.screenshot({
          path: join(evidence, "focus-touch-draft.png"),
        });
        await cancel();
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 36, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
        await expect(bar).toHaveCount(0);
        await expect(chip()).toHaveAttribute("aria-valuenow", "40");
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 36, y }],
        });
        await page.keyboard.press("Escape");
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect(bar).toHaveCount(0);
        await expect(chip()).toHaveAttribute("aria-valuenow", "40");
        assert.equal(savedValue(), 40);
        await cdp.detach();
      }
      await chip().click();
      await numeric().fill("1000000000");
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await expect(numeric()).toBeInViewport();
      await page.screenshot({
        path: join(evidence, "focus-large-total-draft.png"),
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await cancel();

      // Hide one counter without leaking its stored history into the preview.
      await mutate(
        "PATCH",
        path,
        {
          configure_counter: {
            ...counters[1],
            values: undefined,
            archived: true,
          },
        },
        get().version,
      );
      await page.reload();
      await expect(
        pin.getByRole("spinbutton", { name: "Walking", exact: true }),
      ).toHaveCount(0);
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(pin).toBeVisible();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `No page overflow at ${width}`,
        );
        const hit = await chip().boundingBox();
        assert(hit.height >= 44 && hit.width >= 44);
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        await page.screenshot({ path: join(evidence, `focus-${width}.png`) });
      }
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({ path: join(evidence, "focus-dark.png") });
      await mutate("PATCH", path, { set: { archived: true } }, get().version);
      await page.reload();
      await expect(pin).toContainText("Archived");
      await expect(chip()).toBeEnabled();
      await chip().click();
      await expect(numeric()).toHaveValue("40");
      await cancel();
      assert.deepEqual(errors, []);
      assert.equal(
        requests.filter(
          (r) => r.method === "PUT" && r.path.endsWith("/workspace/focus"),
        ).length,
        0,
      );
      console.log(
        JSON.stringify({
          suite: "focus-controls",
          gestures: true,
          conditionalWrites: true,
          retainedRetry: true,
          responsiveWidths: [1440, 1024, 768, 390, 320],
        }),
      );
    } catch (error) {
      await page
        .screenshot({ path: join(evidence, "failure.png") })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  },
);
