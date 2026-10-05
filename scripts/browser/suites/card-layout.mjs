/** Section gestures, shared visibility and retained drafts on a paired release host. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";
import { cardSections } from "../../../apps/web/src/features/editor/card-layout.ts";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext, browser }) => {
    const context = await newContext({
      timezoneId: "Pacific/Honolulu",
      hasTouch: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "astra-card-layout:v1",
        JSON.stringify({
          content: ["description", "checklist", "counters", "comments"],
          properties: ["labels", "schedule"],
        }),
      );
      window.layoutCsp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.layoutCsp.push(e.effectiveDirective),
      );
    });
    await page.clock.setFixedTime(new Date("2026-09-30T10:00Z"));
    const project = config.projects[0].id;
    const base = `/api/v1/projects/${project}/cards`;
    const file = join(runtime, "layout-card.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "A calmer card",
        body: "A useful description.",
        status: "active",
        schedule: { start: "2026-09-28", end: "2026-10-02" },
      }),
    );
    const card = cli("command", "POST", base, "--json-file", file).result
      .resource;
    await writeFile(file, JSON.stringify({ title: "A separate card" }));
    const other = cli("command", "POST", base, "--json-file", file).result
      .resource;
    const path = `${base}/${card.metadata.id}`;
    const url = `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: card.metadata.id })}`;
    const dialog = page.getByRole("dialog", {
      name: /^(Edytuj|Utwórz) element$/,
    });
    const toggle = dialog.getByRole("button", {
      name: "Edytuj harmonogram",
      exact: true,
    });
    const customize = dialog.getByRole("button", {
      name: "Dostosuj układ karty",
      exact: true,
    });
    const panel = dialog.locator(".card-layout-menu .action-menu-panel");
    const sections = () =>
      dialog
        .locator(".card-body-grid > [data-card-section]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardSection));
    const mixedOrder = [
      "schedule",
      "comments",
      "labels",
      "description",
      "checklist",
      "counters",
    ];
    const closePanel = () =>
      panel.getByRole("button", { name: "Zakończ układanie sekcji" }).click();
    const settleOrder = () =>
      panel.locator(".layout-order").evaluate(async (el) => {
        // Svelte starts FLIP on the next frame; measure after it has settled.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await Promise.all(
          el
            .getAnimations({ subtree: true })
            .map((a) => a.finished.catch(() => {})),
        );
      });
    async function pointerMove(section, anchor, after, cancel = false) {
      await settleOrder();
      const handle = panel.getByRole("button", {
        name: `Zmień kolejność ${cardSections[section]}`,
        exact: true,
      });
      await handle.scrollIntoViewIfNeeded();
      const from = await handle.boundingBox();
      const target = await panel
        .locator(`[data-layout-section="${anchor}"]`)
        .boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        from.x + from.width / 2,
        target.y + (after ? target.height - 2 : 2),
        { steps: 8 },
      );
      await expect(dialog.locator(".layout-drag-preview")).toBeVisible();
      await expect(
        panel.locator(`[data-layout-section="${section}"]`),
      ).toHaveAttribute("data-dragging", "true");
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(dialog.locator(".layout-drag-preview")).toHaveCount(0);
      await expect(panel).toBeVisible();
      await settleOrder();
    }
    try {
      await page.goto(url);
      await expect
        .poll(sections)
        .toEqual([
          "description",
          "checklist",
          "counters",
          "comments",
          "labels",
          "schedule",
        ]);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toContainText("Pozostało 2 dni");
      await expect(toggle).toContainText("Dzień 3");
      await expect(dialog.getByLabel("Początek", { exact: true })).toBeHidden();
      await toggle.scrollIntoViewIfNeeded();
      const toggleBounds = await toggle.boundingBox();
      assert.ok(toggleBounds.height >= 44, JSON.stringify(toggleBounds));
      await toggle.click();
      await expect(
        dialog.getByLabel("Początek", { exact: true }),
      ).toBeVisible();
      await dialog.getByLabel("Koniec", { exact: true }).fill("");
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await dialog.getByLabel("Koniec", { exact: true }).fill("2026-10-02");
      await expect(toggle).toHaveAttribute("aria-disabled", "false");
      await expect(dialog.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      await toggle.click();
      await expect(dialog.getByLabel("Początek", { exact: true })).toBeHidden();
      assert.equal(
        cli("get", path).version,
        card.version,
        "Disclosure and reverted edits do not write the card",
      );

      const comment = dialog.getByLabel("Napisz komentarz", { exact: true });
      await comment.fill("An unfinished comment");
      await dialog
        .getByLabel("Nowa pozycja", { exact: true })
        .fill("An unfinished checklist item");
      await expect(
        dialog.getByRole("button", { name: "Działania licznika", exact: true }),
      ).toHaveCount(0);
      await dialog
        .getByRole("button", { name: "Dodaj licznik", exact: true })
        .click();
      await dialog
        .getByLabel("Nazwa licznika", { exact: true })
        .fill("An unfinished counter");
      await comment.evaluate((el) => (el.dataset.mountedProbe = "retained"));
      const labels = dialog.getByRole("combobox", {
        name: "Etykiety",
        exact: true,
      });
      await labels.fill("An unfinished label");
      await labels.evaluate((el) => (el.dataset.mountedProbe = "retained"));
      await toggle.click();
      await toggle.evaluate((el) => (el.dataset.mountedProbe = "retained"));
      await customize.click();
      await expect(
        panel.getByRole("list", { name: "Kolejność sekcji" }),
      ).toHaveCount(1);
      await expect(panel.getByRole("listitem")).toHaveCount(6);
      const moveComments = panel.getByRole("button", {
        name: "Zmień kolejność Komentarze",
        exact: true,
      });
      await moveComments.focus();
      await moveComments.press("ArrowUp");
      await expect(moveComments).toBeFocused();
      await moveComments.press("ArrowUp");
      await moveComments.press("ArrowUp");
      await moveComments.press("ArrowUp");
      const moveSchedule = panel.getByRole("button", {
        name: "Zmień kolejność Harmonogram",
        exact: true,
      });
      await moveSchedule.focus();
      await moveSchedule.press("Home");
      await expect(moveSchedule).toBeFocused();
      await expect(panel.getByRole("status")).toHaveText(
        "Harmonogram przeniesiono na miejsce 1 z 6.",
      );
      for (let step = 0; step < 3; step++)
        await panel
          .getByRole("button", {
            name: "Zmień kolejność Etykiety",
            exact: true,
          })
          .press("ArrowUp");
      await expect.poll(sections).toEqual(mixedOrder);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toHaveAttribute("data-mounted-probe", "retained");
      await expect(labels).toHaveValue("An unfinished label");
      await expect(labels).toHaveAttribute("data-mounted-probe", "retained");
      await expect(comment).toHaveValue("An unfinished comment");
      await expect(comment).toHaveAttribute("data-mounted-probe", "retained");
      await expect(
        dialog.getByLabel("Nowa pozycja", { exact: true }),
      ).toHaveValue("An unfinished checklist item");
      await expect(
        dialog.getByLabel("Nazwa licznika", { exact: true }),
      ).toHaveValue("An unfinished counter");
      assert.equal(
        cli("get", path).version,
        card.version,
        "Presentation preferences do not mutate card source",
      );
      for (const [section, name] of [
        ["comments", "Komentarze"],
        ["counters", "Liczniki"],
        ["labels", "Etykiety"],
      ]) {
        const eye = panel.getByRole("button", {
          name: `Pokaż ${name}`,
          exact: true,
        });
        await eye.click();
        await expect(eye).toHaveAttribute("aria-pressed", "false");
        const contents = dialog.locator(`[data-card-section="${section}"]`);
        await expect(contents).toHaveCount(1);
        await expect(contents).toBeHidden();
      }
      await expect
        .poll(() => cli("get", path).metadata.hidden_sections)
        .toEqual(["counters", "comments", "labels"]);
      assert.equal(cli("get", path).body, card.body);
      assert.deepEqual(
        cli("get", path).metadata.schedule,
        card.metadata.schedule,
      );
      assert.equal(
        cli("get", `${base}/${other.metadata.id}`).metadata.hidden_sections,
        undefined,
      );
      const secondContext = await newContext();
      try {
        const second = await secondContext.newPage();
        await second.goto(url);
        await expect(
          second.getByRole("dialog", { name: "Edytuj element", exact: true }),
        ).toBeVisible();
        for (const name of ["counters", "comments", "labels"]) {
          const contents = second.locator(`[data-card-section="${name}"]`);
          await expect(contents).toHaveCount(1);
          await expect(contents).toBeHidden();
        }
        await second.goto(
          `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: other.metadata.id })}`,
        );
        await expect(second.locator('[data-card-visible="true"]')).toHaveCount(
          6,
        );
      } finally {
        await secondContext.close();
      }
      for (const name of ["Komentarze", "Liczniki", "Etykiety"]) {
        const eye = panel.getByRole("button", {
          name: `Pokaż ${name}`,
          exact: true,
        });
        if (name === "Etykiety") {
          // Previous visibility changes resize the centered dialog. A held
          // press must keep its eye target while the owner continues resizing.
          // Aim where the eye is now, not where it was measured: the dialog
          // may jump between the measurement and the press.
          await expect
            .poll(async () => {
              const bounds = await eye.boundingBox();
              const x = bounds.x + bounds.width / 2;
              const y = bounds.y + bounds.height / 2;
              await page.mouse.move(x, y);
              return eye.evaluate(
                (element, point) =>
                  element.contains(document.elementFromPoint(point.x, point.y)),
                { x, y },
              );
            })
            .toBe(true);
          await page.mouse.down();
          const before = await panel.boundingBox();
          await page.waitForTimeout(120);
          const held = await panel.boundingBox();
          assert.ok(
            Math.abs(held.y - before.y) < 1,
            `A held visibility control must not move: ${JSON.stringify({ before, held })}`,
          );
          await page.mouse.up();
        } else await eye.click();
        await expect(eye).toHaveAttribute("aria-pressed", "true");
      }
      await expect
        .poll(() => cli("get", path).metadata.hidden_sections)
        .toBeUndefined();
      await expect(comment).toHaveValue("An unfinished comment");
      await expect(comment).toHaveAttribute("data-mounted-probe", "retained");
      await expect(labels).toHaveValue("An unfinished label");
      await expect(labels).toHaveAttribute("data-mounted-probe", "retained");
      await expect(
        dialog.getByLabel("Nazwa licznika", { exact: true }),
      ).toHaveValue("An unfinished counter");
      const presentationVersion = cli("get", path).version;
      await pointerMove("comments", "labels", true, true);
      await expect.poll(sections).toEqual(mixedOrder);
      assert.equal(cli("get", path).version, presentationVersion);
      const counterEye = panel.getByRole("button", {
        name: "Pokaż Liczniki",
        exact: true,
      });
      await counterEye.click();
      await expect(counterEye).toHaveAttribute("aria-pressed", "false");
      await counterEye.click();
      await expect(counterEye).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(customize).toBeFocused();
      await expect(dialog).toBeVisible();
      await labels.fill("");
      await dialog.getByLabel("Nowa pozycja", { exact: true }).fill("");
      await dialog.getByLabel("Napisz komentarz", { exact: true }).fill("");
      await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
      await page.reload();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect.poll(sections).toEqual(mixedOrder);
      assert.deepEqual(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("astra-card-layout:v2")),
        ),
        mixedOrder,
      );

      for (const [width, height] of [
        [1440, 1000],
        [1024, 900],
        [768, 1024],
        [390, 844],
        [320, 740],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await customize.tap();
        await expect(panel).toBeVisible();
        const geometry = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            bottom: r.bottom,
            overflow: el.scrollWidth > el.clientWidth + 1,
          };
        });
        assert.ok(
          geometry.left >= 0 &&
            geometry.right <= width &&
            geometry.bottom <= height,
          JSON.stringify({ width, ...geometry }),
        );
        assert.equal(geometry.overflow, false);
        const move = panel.getByRole("button", {
          name: "Zmień kolejność Komentarze",
          exact: true,
        });
        const bounds = await move.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44);
        if (height > 500) {
          await pointerMove("comments", "labels", true);
          await expect
            .poll(sections)
            .toEqual([
              "schedule",
              "labels",
              "comments",
              "description",
              "checklist",
              "counters",
            ]);
          await pointerMove("comments", "labels", false);
        } else {
          await move.press("ArrowDown");
          await move.press("ArrowUp");
        }
        await closePanel();
        await dialog.locator(".card-body-grid").evaluate(async (el) => {
          await Promise.all(
            el
              .getAnimations({ subtree: true })
              .map((a) => a.finished.catch(() => {})),
          );
        });
        const sectionBounds = await dialog
          .locator(".card-body-grid > [data-card-section]")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const r = node.getBoundingClientRect();
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
              };
            }),
          );
        for (let index = 1; index < sectionBounds.length; index++) {
          assert.ok(
            sectionBounds[index].top >= sectionBounds[index - 1].bottom,
          );
          assert.equal(sectionBounds[index].left, sectionBounds[0].left);
          assert.equal(sectionBounds[index].right, sectionBounds[0].right);
        }
        await expect.poll(sections).toEqual(mixedOrder);
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        await toggle.tap();
        await expect(
          dialog.getByLabel("Początek", { exact: true }),
        ).toBeVisible();
        await toggle.tap();
        await expect(
          dialog.getByLabel("Początek", { exact: true }),
        ).toBeHidden();
        if (browser.browserType().name() === "chromium") {
          await dialog.locator(".editor-form").evaluate((el) => {
            el.scrollTop = 0;
          });
          await page.screenshot({
            path: join(evidence, `mixed-layout-${width}.png`),
          });
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 390, height: 844 });
      await customize.click();
      if (browser.browserType().name() === "chromium") {
        const touch = await context.newCDPSession(page);
        try {
          const handle = panel.getByRole("button", {
            name: "Zmień kolejność Harmonogram",
            exact: true,
          });
          const from = await handle.boundingBox();
          const target = await panel
            .locator('[data-layout-section="comments"]')
            .boundingBox();
          const point = {
            x: from.x + from.width / 2,
            y: from.y + from.height / 2,
          };
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [point],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...point, y: target.y + target.height - 2 }],
          });
          await expect(dialog.locator(".layout-drag-preview")).toBeVisible();
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchCancel",
            touchPoints: [],
          });
          await expect.poll(sections).toEqual(mixedOrder);
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [point],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...point, y: target.y + target.height - 2 }],
          });
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await expect
            .poll(sections)
            .toEqual([
              "comments",
              "schedule",
              "labels",
              "description",
              "checklist",
              "counters",
            ]);
          await handle.press("Home");
          await expect.poll(sections).toEqual(mixedOrder);
        } finally {
          await touch.detach();
        }
      }
      await page.setViewportSize({ width: 844, height: 390 });
      const handle = panel.getByRole("button", {
        name: "Zmień kolejność Harmonogram",
        exact: true,
      });
      await handle.scrollIntoViewIfNeeded();
      const grip = await handle.boundingBox();
      const shortPanel = await panel.boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        grip.x + grip.width / 2,
        shortPanel.y + shortPanel.height - 6,
        { steps: 5 },
      );
      await expect
        .poll(() =>
          panel.evaluate(
            (el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1,
          ),
        )
        .toBe(true);
      await page.mouse.up();
      await expect.poll(sections).toEqual([...mixedOrder.slice(1), "schedule"]);
      await handle.press("Home");
      await expect.poll(sections).toEqual(mixedOrder);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const name of [
        "Opis",
        "Lista kontrolna",
        "Liczniki",
        "Komentarze",
        "Harmonogram",
        "Etykiety",
      ])
        await panel
          .getByRole("button", { name: `Pokaż ${name}`, exact: true })
          .click();
      await expect(dialog.locator('[data-card-visible="true"]')).toHaveCount(0);
      await expect
        .poll(() => cli("get", path).metadata.hidden_sections?.length)
        .toBe(6);
      await expect(panel.getByRole("listitem")).toHaveCount(6);
      await closePanel();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await customize.click();
      await expect(panel).toBeVisible();
      await panel
        .getByRole("button", { name: "Przywróć układ", exact: true })
        .click();
      await expect
        .poll(sections)
        .toEqual([
          "description",
          "checklist",
          "counters",
          "comments",
          "schedule",
          "labels",
        ]);
      await expect
        .poll(() => cli("get", path).metadata.hidden_sections)
        .toBeUndefined();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await dialog
          .locator(".card-body-grid")
          .evaluate(
            (el) =>
              el
                .getAnimations({ subtree: true })
                .filter((a) => a.playState === "running").length,
          ),
        0,
      );
      await closePanel();
      await toggle.click();
      assert.equal(
        await dialog
          .locator(".schedule-disclosure")
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
      await dialog
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await page
        .locator(".heading")
        .getByRole("button", { name: /Dodaj kartę$/ })
        .click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(
        dialog.getByLabel("Początek", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByLabel("Tytuł", { exact: true })
        .fill("Creation keeps schedule open");
      await expect(dialog.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.layoutCsp), []);
      await dialog
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await page.goto(url);
      if (browser.browserType().name() === "chromium") {
        for (const [width, height] of [
          [1440, 1000],
          [768, 1024],
          [390, 844],
          [320, 740],
        ]) {
          await page.setViewportSize({ width, height });
          await customize.click();
          await page.screenshot({
            path: join(evidence, `layout-${width}.png`),
          });
          if (width === 390) {
            const eye = panel.getByRole("button", {
              name: "Pokaż Harmonogram",
              exact: true,
            });
            await eye.click();
            await page.emulateMedia({ colorScheme: "dark" });
            await page.screenshot({
              path: join(evidence, "layout-hidden-dark-390.png"),
            });
            await eye.click();
            await page.emulateMedia({ colorScheme: "light" });
          }
          await closePanel();
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.layoutCsp), []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            engine: browser.browserType().name(),
            checks: [
              "relative workspace date",
              "collapsed and invalid schedules",
              "no presentation writes",
              "per-card visibility persists across browser contexts",
              "hidden drafts remain mounted and recover intact",
              "visibility clicks remain stable while their modal owner resizes",
              "all-hidden state remains recoverable from the layout menu",
              "legacy preference upgrade to one six-section order",
              "cross-group moves retain mounted drafts and disclosure state",
              "visual order matches reading order at every width",
              "handle pointer and keyboard ordering, Escape cancellation",
              "short-panel drag autoscroll and Chromium touch/cancellation",
              "local preference reload and reset",
              "320–1440px plus landscape",
              "reduced motion",
              "creation stays expanded",
              "strict CSP",
            ],
            errors,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await writeFile(
        join(evidence, "failure.txt"),
        await dialog.ariaSnapshot(),
      );
      throw error;
    } finally {
      await context.close();
    }
  },
);
