/** Polish presentation works independently of browser and stored workspace locale. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext({ locale: "en-US", hasTouch: true });
    const page = await context.newPage();
    const errors = [],
      checks = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = config.projects[0].id;
    const file = join(runtime, "polish-command.json");
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
    const base = `/api/v1/projects/${project}/cards`;
    let card = await mutate("POST", base, {
      title: "Polska karta testowa",
      status: "active",
      priority: "high",
      schedule: { start: "2026-10-01", end: "2026-10-04" },
      body: "Opis pozostaje w języku wybranym przez autora.",
    });
    const path = `${base}/${card.metadata.id}`;
    card = await mutate(
      "PATCH",
      path,
      {
        configure_counter: {
          name: "Trening",
          unit: "powt.",
          step: 1,
          archived: false,
        },
      },
      card.version,
    );
    card = await mutate(
      "PATCH",
      path,
      {
        record_counter: {
          id: card.metadata.counters[0].id,
          date: "2026-10-04",
          value: 1234,
        },
      },
      card.version,
    );
    card = await mutate(
      "PATCH",
      path,
      {
        append_comment: {
          body: "Komentarz testowy",
          author: { kind: "human", label: "Właściciel" },
        },
      },
      card.version,
    );
    card = await mutate("PATCH", path, { set: { pinned: true } }, card.version);
    const route = async (view, extra = {}) => {
      await page.goto(
        `${config.origin}/?${new URLSearchParams({ view, project, date: "2026-10-04", month: "2026-10", ...extra })}`,
      );
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    };
    try {
      for (const [view, label] of [
        ["focus", "Focus"],
        ["projects", "Cele"],
        ["board", "Tablica"],
        ["calendar", "Kalendarz"],
        ["gantt", "Oś czasu"],
        ["list", "Lista"],
        ["updates", "Aktualizacje"],
        ["chart", "Wykres"],
      ]) {
        await route(view);
        await expect(
          page.getByRole("heading", { name: label, exact: true }),
        ).toBeVisible();
        if (view === "focus") {
          await expect(
            page.getByRole("region", { name: "W Focus", exact: true }),
          ).toContainText("1 komentarz");
          await expect(
            page.getByRole("heading", {
              name: "Potrzebuje mojej uwagi",
              exact: true,
            }),
          ).toBeVisible();
          // Every section count agrees with whatever number the fixture shows.
          const forms = {
            attention: ["widoczny element", "widoczne elementy", "elementów"],
            motion: ["widoczny plan", "widoczne plany", "widocznych planów"],
            events: ["widoczne wydarzenie", "widoczne wydarzenia", "wydarzeń"],
          };
          for (const [section, [one, few, many]] of Object.entries(forms)) {
            const text = await page
              .locator(`[data-focus-section="${section}"] .sectiontitle span`)
              .first()
              .innerText();
            const count = Number(text.match(/^\d+/)?.[0]);
            const last = count % 10;
            const teens = count % 100;
            const expected =
              count === 1
                ? one
                : last >= 2 && last <= 4 && !(teens >= 12 && teens <= 14)
                  ? few
                  : many;
            assert(text.endsWith(expected), `${section}: ${text}`);
          }
        }
        if (view === "chart") {
          await expect(
            page.getByRole("region", { name: "Panel liczników", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByLabel("Znajdź licznik", { exact: true }),
          ).toBeEnabled();
        }
        if (view === "calendar") {
          await expect(page.locator(".ec")).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Dzisiaj", exact: true }),
          ).toBeVisible();
          await expect(page.locator(".ec")).not.toContainText(
            /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|October|all-day/,
          );
        }
        if (view === "gantt") {
          const timeline = page.locator(".astra-gantt");
          await expect(timeline).toBeVisible();
          await expect(timeline).toContainText("październik");
          // Weekdays and the toolbar are Polish under an English browser too.
          await expect(timeline.locator(".tick.day").first()).toHaveText(
            /^(pon|wt|śr|czw|pt|sob|niedz)\s*\d+$/,
          );
          await expect(
            page.getByRole("group", { name: "Skala osi czasu" }),
          ).toHaveText("DniTygodnieMiesiące");
          await expect(timeline).not.toContainText(
            /Mon|Tue|Wed|Thu|Fri|Sat|Sun|October|September/,
          );
        }
        if (view === "board") {
          await expect(
            page
              .getByRole("button", { name: "Zwiń kolumnę", exact: true })
              .first(),
          ).toBeVisible();
          await expect(
            page.getByRole("region", { name: "Tablica kart", exact: true }),
          ).toBeVisible();
        }
        checks.push(`view:${view}`);
      }
      await route("list", { type: "card", resource: card.metadata.id });
      const editor = page.getByRole("dialog", {
        name: "Edytuj element",
        exact: true,
      });
      await expect(editor).toBeVisible();
      await expect(
        editor.getByLabel("Wysoki priorytet", { exact: true }),
      ).toBeVisible();
      await expect(
        editor.getByLabel("Napisz komentarz", { exact: true }),
      ).toBeVisible();
      await editor
        .getByRole("button", { name: "Dostosuj układ karty", exact: true })
        .click();
      await expect(
        editor.getByRole("list", { name: "Kolejność sekcji", exact: true }),
      ).toBeVisible();
      await expect(
        editor.getByRole("button", { name: "Pokaż Opis", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await editor
        .getByRole("button", { name: "Edytuj harmonogram", exact: true })
        .click();
      await editor.getByRole("button", { name: /Wybierz daty/ }).click();
      const calendar = page.getByRole("dialog", {
        name: "Wybierz daty karty",
        exact: true,
      });
      await expect(calendar).toContainText("październik");
      const day = calendar.locator('[data-calendar-day="2026-10-04"]');
      await day.focus();
      await page.keyboard.press("End");
      await expect(
        calendar.locator('[data-calendar-day="2026-10-04"]'),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(
        editor.getByRole("button", { name: /Wybierz daty/ }),
      ).toBeFocused();
      await editor
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      checks.push("card editor, sections and keyboard calendar");

      await page
        .getByRole("button", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        })
        .click();
      const settings = page.getByRole("dialog", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      });
      await expect(
        settings.getByLabel("Strefa czasowa", { exact: true }),
      ).toBeEnabled();
      await expect(
        settings
          .getByLabel("Początek tygodnia", { exact: true })
          .locator("option"),
      ).toHaveText(["Poniedziałek", "Niedziela"]);
      await expect(
        settings
          .getByLabel("Widok domyślny", { exact: true })
          .locator("option"),
      ).toHaveText([
        "Focus",
        "Cele",
        "Tablica",
        "Kalendarz",
        "Oś czasu",
        "Lista",
        "Aktualizacje",
        "Wykres",
      ]);
      await expect(settings).not.toContainText(
        /Workspace settings|Appearance|Browser access|Pairing requests|default/,
      );
      await settings
        .getByRole("button", { name: "Zamknij ustawienia", exact: true })
        .click();
      await expect(settings).toHaveCount(0);
      checks.push("settings with a previously stored English locale");

      for (const width of [320, 390, 640]) {
        await page.setViewportSize({
          width,
          height: width === 640 ? 320 : 844,
        });
        await route("focus");
        const more = page.getByRole("button", {
          name: "Więcej widoków",
          exact: true,
        });
        await more.tap();
        await page.getByText("Dostosuj nawigację", { exact: true }).click();
        await expect(
          page.getByRole("list", { name: "Kolejność nawigacji", exact: true }),
        ).toBeVisible();
        const bounds = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert(bounds.scroll <= bounds.width + 1, JSON.stringify(bounds));
        if (process.env.ASTRA_TEST_BROWSER !== "webkit") {
          await page.evaluate(async () => {
            await new Promise(requestAnimationFrame);
            await Promise.allSettled(
              document
                .getAnimations()
                .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished),
            );
          });
          await page.screenshot({
            path: join(evidence, `polish-phone-${width}.png`),
          });
        }
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
        checks.push(`phone navigation:${width}`);
      }
      assert.deepEqual(errors, []);
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checks, errors }, null, 2),
      );
      console.log(
        `PASS Polish presentation: ${checks.length} workflow groups.`,
      );
    } finally {
      await context.close();
    }
  },
);
