/** Native date/time controls must remain visible and usable in phone editors. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "en-US",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    const resizeNotifications = [];
    page.on("pageerror", (error) => {
      // WebKit reports deferred ResizeObserver delivery during viewport changes.
      if (
        error.message ===
        "ResizeObserver loop completed with undelivered notifications."
      )
        resizeNotifications.push(error.message);
      else errors.push(error.message);
    });
    const project = config.projects[2].id;
    const base = `/api/v1/projects/${project}/cards`;
    const file = join(runtime, "editor-inputs.json");
    await writeFile(
      file,
      JSON.stringify({
        title: "Phone date and time",
        schedule: { start: "2026-09-13", end: "2026-09-14" },
      }),
    );
    const id = cli("command", "POST", base, "--json-file", file).result.resource
      .metadata.id;
    const get = () => cli("get", `${base}/${id}`).metadata;
    const dialog = page.getByRole("dialog", {
      name: "Edit resource",
      exact: true,
    });
    const time = dialog.getByLabel("Start time", { exact: true });
    const duration = dialog.getByLabel("Duration (minutes)", { exact: true });
    async function checkControls() {
      const fields = dialog.locator(".editor-properties input");
      for (const field of await fields.all()) {
        await field.scrollIntoViewIfNeeded();
        const geometry = await field.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const label = el.closest("label").getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            labelLeft: label.left,
            labelRight: label.right,
            hit:
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              ) === el,
            overflows: el.scrollWidth > el.clientWidth + 1,
          };
        });
        assert.ok(
          geometry.left >= geometry.labelLeft - 1 &&
            geometry.right <= geometry.labelRight + 1,
          `Control exceeds its column: ${JSON.stringify(geometry)}`,
        );
        assert.ok(
          geometry.width >= 44 && geometry.height >= 44,
          `Visible touch target: ${JSON.stringify(geometry)}`,
        );
        assert.ok(geometry.hit, "Control center is not obscured");
        assert.equal(geometry.overflows, false, "Native value fits its input");
      }
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await time.scrollIntoViewIfNeeded();
      await time.tap();
      await expect(time).toBeFocused();
    }
    try {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view: "list", project, type: "card", resource: id })}`,
      );
      await expect(time).toHaveValue("");
      const header = dialog.locator(".dialog-header");
      const title = header.getByRole("textbox", { name: "Title", exact: true });
      await expect(title).toHaveCount(1);
      await expect(
        dialog
          .locator(".dialog-body")
          .getByRole("textbox", { name: "Title", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("combobox", { name: "Status", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("combobox", { name: "Priority", exact: true }),
      ).toHaveCount(0);
      await expect(dialog.getByText(/Plan · dates only/)).toHaveCount(0);
      await expect(dialog.getByText(/Enter adds a tag/)).toHaveCount(0);
      const paths = new Set();
      for (const status of [
        "active",
        "review",
        "done",
        "cancelled",
        "planned",
      ]) {
        await header.getByRole("button", { name: /^Status:/ }).click();
        const name = status[0].toUpperCase() + status.slice(1);
        await header.getByRole("button", { name, exact: true }).click();
        await expect.poll(() => get().status).toBe(status);
        const trigger = header.getByRole("button", {
          name: `Status: ${name}`,
          exact: true,
        });
        paths.add(await trigger.locator("path").getAttribute("d"));
        await expect(trigger).toBeFocused();
      }
      assert.equal(paths.size, 5, "Every status has its own icon");
      const statusTrigger = header.getByRole("button", {
        name: "Status: Planned",
        exact: true,
      });
      await statusTrigger.press("Enter");
      await expect(statusTrigger).toHaveAttribute("aria-expanded", "true");
      await statusTrigger.press("Tab");
      await page.keyboard.press("Escape");
      await expect(statusTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(statusTrigger).toBeFocused();
      await expect(dialog).toBeVisible();
      const priority = header.getByRole("button", {
        name: "High priority",
        exact: true,
      });
      for (const value of ["high", "normal"]) {
        await priority.click();
        await expect.poll(() => get().priority).toBe(value);
        await expect(priority).toHaveAttribute(
          "aria-pressed",
          String(value === "high"),
        );
      }
      await title.fill("Phone date and time — editable header");
      await expect
        .poll(() => get().title)
        .toBe("Phone date and time — editable header");

      for (const width of [390, 320, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await checkControls();
        const layout = await header.evaluate((el) => {
          const box = (selector) =>
            el.querySelector(selector).getBoundingClientRect();
          const title = box("textarea"),
            context = box(".dialog-heading"),
            toolbar = box(".card-header-toolbar"),
            close = box(".dialog-close");
          const header = el.getBoundingClientRect();
          return {
            titleTop: title.top,
            titleBottom: title.bottom,
            contextBottom: context.bottom,
            toolbarTop: toolbar.top,
            closeBottom: close.bottom,
            overflow: el.scrollWidth > el.clientWidth + 1,
            headerHeight: header.height,
          };
        });
        assert.ok(
          layout.titleTop >=
            Math.max(layout.contextBottom, layout.closeBottom) &&
            layout.toolbarTop >= layout.titleBottom,
          `Three header rows: ${JSON.stringify(layout)}`,
        );
        assert.equal(layout.overflow, false);
        assert.ok(
          layout.headerHeight < 220,
          "Header leaves room for card content",
        );
        if (width <= 640) {
          const startBox = await dialog
            .getByLabel("Start", { exact: true })
            .boundingBox();
          const timeBox = await time.boundingBox();
          assert.ok(
            timeBox.y >= startBox.y + startBox.height,
            "Phone date and time occupy separate rows",
          );
        }
        await page.screenshot({
          path: join(evidence, `plan-${width}.png`),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await time.fill("09:30");
      await duration.fill("90");
      await expect
        .poll(() => get().event)
        .toEqual({ start: "2026-09-13T09:30", duration_minutes: 90 });
      await page.reload();
      await expect(time).toHaveValue("09:30");
      await expect(duration).toHaveValue("90");
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await checkControls();
        await page.screenshot({
          path: join(evidence, `event-${width}.png`),
          fullPage: true,
        });
      }
      await time.fill("");
      await expect
        .poll(() => get().schedule)
        .toEqual({ start: "2026-09-13", end: "2026-09-13" });
      assert.equal(get().event, undefined);
      await checkControls();
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          {
            status: "pass",
            engine: process.env.ASTRA_TEST_BROWSER ?? "chromium",
            checks: [
              "native control bounds and hit targets",
              "empty and populated time",
              "320–1440px",
              "event autosave and reload",
              "clear time to plan",
            ],
            errors,
            resizeNotifications,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await page.screenshot({
        path: join(evidence, "failure.png"),
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  },
);
