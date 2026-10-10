/** Goals: a card-shaped editor, dates taken from cards, and their own Calendar and Timeline scope. */
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBrowserSuite } from "../runtime.mjs";
import { formatCivilRange } from "../../../apps/web/src/lib/ui/locale.ts";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, newContext }) => {
    const context = await newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const [dated, quiet, empty] = config.projects;
    const commandFile = join(runtime, "goals-command.json");
    const mutate = async (method, path, payload, version) => {
      await writeFile(commandFile, JSON.stringify(payload));
      return cli(
        "command",
        method,
        path,
        "--json-file",
        commandFile,
        ...(version ? ["--if-version", version] : []),
      ).result.resource;
    };
    const goalPath = (goal) => `/api/v1/projects/${goal.id}`;
    const goal = (item) => cli("get", goalPath(item));
    const summaries = () => cli("get", "/api/v1/projects").items;
    const summary = (item) => summaries().find((entry) => entry.id === item.id);
    const url = (params) => `${config.origin}/?${new URLSearchParams(params)}`;
    const dialog = page.getByRole("dialog", {
      name: "Edytuj element",
      exact: true,
    });
    const closeDialog = async () => {
      await dialog
        .getByRole("button", { name: "Zamknij edytor", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    };
    const boardCard = (item) => page.locator(`[data-board-card="${item.id}"]`);
    const scope = (label, name) =>
      page
        .getByRole("group", { name: label, exact: true })
        .getByRole("button", { name, exact: true });
    /** Entrances have ended, so a picture shows the view at rest. */
    const settle = (target = page) =>
      target.evaluate(async () => {
        // Layers start one after another, so one pass can miss the later ones.
        for (let quiet = 0; quiet < 3;) {
          const running = document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState !== "finished" &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            );
          quiet = running.length ? 0 : quiet + 1;
          await Promise.all(
            running.map((animation) => animation.finished.catch(() => {})),
          );
          await new Promise((done) => requestAnimationFrame(done));
        }
      });
    // Writes a goal view may never make: its dates belong to its cards.
    const goalWrites = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (
        request.method() !== "GET" &&
        config.projects.some((item) => path === goalPath(item))
      )
        goalWrites.push(`${request.method()} ${path}`);
    });

    try {
      // The fixture's first goal has cards planned from 7 to 23 September 2026.
      const span = summary(dated).span;
      assert.deepEqual(span, { start: "2026-09-07", end: "2026-09-23" });
      assert.equal(summary(quiet).span, undefined);
      assert.equal(summary(empty).span, undefined);
      const range = formatCivilRange(span.start, span.end);

      // Goals board: the navigation and a goal's card speak of goals and dates.
      await page.goto(url({ view: "projects" }));
      await expect(
        page.getByRole("region", {
          name: "Tablica statusów celów",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation")
          .getByRole("button", { name: "Cele", exact: true })
          .first(),
      ).toBeVisible();
      await expect(page.getByText("Projekty", { exact: true })).toHaveCount(0);
      await expect(boardCard(dated).locator("time")).toHaveText(range);
      await expect(boardCard(quiet).locator("time")).toHaveCount(0);

      // A card's dates move the goal's span while the board is open. Its
      // neighbours may slide to make room; nothing makes its entrance again.
      await settle();
      await page.evaluate(() => {
        window.goalBoardEntrances = 0;
        window.goalBoardSampler = setInterval(() => {
          window.goalBoardEntrances += document
            .getAnimations()
            .filter((animation) =>
              animation.effect
                .getKeyframes()
                .some((frame) => "opacity" in frame || "filter" in frame),
            ).length;
        }, 16);
      });
      const quietCard = cli(
        "get",
        `${goalPath(quiet)}/cards/${config.other.id}`,
      );
      await mutate(
        "PATCH",
        `${goalPath(quiet)}/cards/${config.other.id}`,
        { set: { schedule: { start: "2026-10-01", end: "2026-10-05" } } },
        quietCard.version,
      );
      await expect(boardCard(quiet).locator("time")).toHaveText(
        formatCivilRange("2026-10-01", "2026-10-05"),
      );
      assert.equal(
        await page.evaluate(() => {
          clearInterval(window.goalBoardSampler);
          return window.goalBoardEntrances;
        }),
        0,
        "A refreshed span replays no entrance",
      );
      const quietVersion = summary(quiet).version;
      assert.equal(
        quietVersion,
        goal(quiet).version,
        "A derived span leaves the goal's own version alone",
      );

      // The goal opens in the card's shape: title, status and dates in the
      // header, then Description, Comments and Folder. No work sections.
      await boardCard(dated).getByRole("button").first().click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/card-editor/);
      await expect(dialog.getByLabel("Nazwa", { exact: true })).toHaveValue(
        dated.title,
      );
      await expect(dialog.getByTestId("goal-span")).toHaveText(range);
      await expect(
        dialog.getByRole("button", { name: "Status: Aktywne", exact: true }),
      ).toBeVisible();
      assert.deepEqual(
        await dialog
          .locator("[data-card-section]")
          .evaluateAll((sections) =>
            sections.map((section) => section.dataset.cardSection),
          ),
        ["description", "comments", "folder"],
      );
      for (const absent of [
        "Lista kontrolna",
        "Liczniki",
        "Harmonogram",
        "Etykiety",
      ])
        await expect(
          dialog.getByRole("heading", { name: absent, exact: true }),
        ).toHaveCount(0);
      await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
      await settle();
      await page.screenshot({ path: join(evidence, "goal-editor.png") });

      // Comments are the goal's own conversation, saved in its source.
      const section = dialog.getByRole("region", {
        name: "Komentarze celu",
        exact: true,
      });
      const input = section.getByRole("textbox", {
        name: "Napisz komentarz",
        exact: true,
      });
      await input.fill(
        "**Goal reply**\n\n<script>window.goalCommentExecuted = true</script>",
      );
      await section
        .getByRole("button", { name: "Dodaj komentarz", exact: true })
        .click();
      await expect(input).toHaveValue("");
      await expect(section.locator("li")).toHaveCount(1);
      await expect(section.locator("li").first()).toContainText("Człowiek");
      await expect(section.locator("li strong").last()).toHaveText(
        "Goal reply",
      );
      assert.equal(
        await page.evaluate(() => window.goalCommentExecuted),
        undefined,
      );
      let source = goal(dated);
      assert.equal(source.metadata.comments.length, 1);
      assert.equal(source.metadata.comments[0].author.kind, "human");
      assert.match(source.metadata.comments[0].body, /^\*\*Goal reply\*\*/);

      // An ordinary edit afterwards keeps the conversation.
      await dialog
        .getByRole("button", { name: "Status: Aktywne", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Wstrzymane", exact: true })
        .click();
      await expect(dialog.getByTestId("autosave-status")).toHaveText(
        "Zapisano",
      );
      await expect.poll(() => goal(dated).metadata.state).toBe("paused");
      source = goal(dated);
      assert.equal(source.metadata.comments.length, 1);
      await dialog
        .getByRole("button", { name: "Status: Wstrzymane", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Aktywne", exact: true })
        .click();
      await expect.poll(() => goal(dated).metadata.state).toBe("active");
      await closeDialog();

      // A bot's comment written elsewhere is in the conversation when reopened.
      source = goal(dated);
      await mutate(
        "PATCH",
        goalPath(dated),
        {
          append_comment: {
            body: "GoalBotNeedle: checked.",
            author: { kind: "agent", label: "Codex" },
          },
        },
        source.version,
      );
      await boardCard(dated).getByRole("button").first().click();
      await expect(section.locator("li")).toHaveCount(2);
      await expect(section.locator("li").last()).toContainText("Bot");
      await expect(section.locator("li").last()).toContainText("GoalBotNeedle");
      await closeDialog();
      await expect(boardCard(dated)).toContainText("2 komentarze");
      goalWrites.length = 0;

      // Calendar: goals are a scope of their own, apart from cards.
      await page.goto(
        url({
          view: "calendar",
          date: "2026-09-15",
          layout: "month",
          scope: "goals",
        }),
      );
      await expect(scope("Zakres kalendarza", "Cele")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const goalItem = page.locator(`[data-calendar-item="goal:${dated.id}"]`);
      await expect(goalItem.first()).toBeVisible();
      await expect(goalItem.first()).toContainText(dated.title);
      assert.deepEqual(
        await page
          .locator("[data-calendar-item]")
          .evaluateAll((items) => [
            ...new Set(
              items.map((item) => item.dataset.calendarItem.split(":")[0]),
            ),
          ]),
        ["goal"],
        "The goal scope shows goals only",
      );
      await settle();
      await page.screenshot({ path: join(evidence, "calendar-goals.png") });
      // Nothing moves a goal: Enter on it opens it, and Alt+arrow, which
      // moves a card's plan, falls through to changing the period.
      await page
        .getByRole("button", { name: `Cel: ${dated.title}`, exact: true })
        .first()
        .focus();
      await page.keyboard.press("Enter");
      await expect(dialog.getByLabel("Nazwa", { exact: true })).toHaveValue(
        dated.title,
      );
      await closeDialog();
      await page
        .getByRole("button", { name: `Cel: ${dated.title}`, exact: true })
        .first()
        .focus();
      await page.keyboard.down("Alt");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Alt");
      // October holds the second goal, which got its dates from a card above.
      await expect(page).toHaveURL(/date=2026-10-01/);
      await expect(
        page.locator(`[data-calendar-item="goal:${quiet.id}"]`).first(),
      ).toBeVisible();
      await scope("Zakres kalendarza", "Karty").click();
      await expect(scope("Zakres kalendarza", "Karty")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page).not.toHaveURL(/scope=/);
      await expect(page.locator('[data-calendar-item^="goal:"]')).toHaveCount(
        0,
      );
      await expect(page.locator("[data-calendar-item]").first()).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/scope=goals/);
      await expect(
        page.locator(`[data-calendar-item="goal:${quiet.id}"]`).first(),
      ).toBeVisible();

      // Timeline: all goals on one axis without choosing one first.
      await page.goto(url({ view: "gantt", month: "2026-09", scope: "goals" }));
      const chart = page.getByRole("group", {
        name: "Oś czasu celów",
        exact: true,
      });
      await expect(chart).toBeVisible();
      const goalBars = chart.locator('.timeline-bar[data-kind="goal"]');
      await expect(goalBars).toHaveCount(2);
      await expect(chart.locator(".timeline-bar[data-movable]")).toHaveCount(0);
      await expect(chart.locator(".timeline-bar .edge")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Nowa karta", exact: true }),
      ).toHaveCount(0);
      const waiting = page.getByRole("region", {
        name: "Cele bez dat",
        exact: true,
      });
      await expect(
        waiting.getByRole("button", { name: empty.title, exact: true }),
      ).toBeVisible();
      await settle();
      await page.screenshot({ path: join(evidence, "timeline-goals.png") });
      const bar = page.getByRole("button", {
        name: `Cel: ${dated.title}, ${range}`,
        exact: true,
      });
      await bar.focus();
      await page.keyboard.down("Alt");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Alt");
      await page.keyboard.press("Enter");
      await expect(dialog.getByLabel("Nazwa", { exact: true })).toHaveValue(
        dated.title,
      );
      await closeDialog();
      // Cards need a chosen goal; the way back to goals stays in view.
      await scope("Zakres osi czasu", "Karty").click();
      await expect(page.getByText(/^Wybierz cel, aby zobaczyć/)).toBeVisible();
      await scope("Zakres osi czasu", "Cele").click();
      await expect(goalBars).toHaveCount(2);
      assert.deepEqual(goalWrites, [], "Goal views write nothing to a goal");

      // A phone keeps both scopes and the goal editor within its width.
      const phone = await context.newPage();
      phone.on("pageerror", (error) => errors.push(error.message));
      await phone.setViewportSize({ width: 390, height: 844 });
      for (const [name, params] of [
        [
          "calendar",
          {
            view: "calendar",
            date: "2026-09-15",
            layout: "month",
            scope: "goals",
          },
        ],
        ["timeline", { view: "gantt", month: "2026-09", scope: "goals" }],
      ]) {
        await phone.goto(url(params));
        await expect(
          phone.getByRole("button", { name: "Cele", exact: true }).last(),
        ).toHaveAttribute("aria-pressed", "true");
        // The header's goal list holds the same title in a hidden option.
        await expect(
          phone.getByRole("button", { name: `Cel: ${dated.title}` }).first(),
        ).toBeVisible();
        const widths = await phone.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          width: innerWidth,
        }));
        assert(
          widths.scroll <= widths.width + 1,
          `${name} goals overflow a phone: ${JSON.stringify(widths)}`,
        );
        await settle(phone);
        await phone.screenshot({
          path: join(evidence, `phone-${name}-goals.png`),
        });
      }
      await phone.goto(
        url({
          view: "projects",
          resource_project: dated.id,
          type: "project",
          resource: dated.id,
        }),
      );
      const phoneDialog = phone.getByRole("dialog", {
        name: "Edytuj element",
        exact: true,
      });
      await expect(phoneDialog.getByTestId("goal-span")).toHaveText(range);
      const box = await phoneDialog.boundingBox();
      assert(
        box && box.x >= 0 && box.x + box.width <= 391,
        JSON.stringify(box),
      );
      await settle(phone);
      await phone.screenshot({ path: join(evidence, "phone-goal-editor.png") });
      await phone.close();

      // Another character, palette and spacing restyle the goal views too.
      await page.evaluate(() => {
        localStorage.setItem("astra-character:v1", "technical");
        localStorage.setItem("astra-light:v1", "chalk");
        localStorage.setItem("astra-density:v1", "roomy");
      });
      for (const [name, params] of [
        [
          "calendar",
          {
            view: "calendar",
            date: "2026-09-15",
            layout: "month",
            scope: "goals",
          },
        ],
        ["timeline", { view: "gantt", month: "2026-09", scope: "goals" }],
        [
          "editor",
          {
            view: "projects",
            resource_project: dated.id,
            type: "project",
            resource: dated.id,
          },
        ],
      ]) {
        await page.goto(url(params));
        await expect(
          name === "editor"
            ? dialog.getByTestId("goal-span")
            : page.getByRole("button", { name: `Cel: ${dated.title}` }).first(),
        ).toBeVisible();
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.character),
          "technical",
        );
        await settle();
        await page.screenshot({
          path: join(evidence, `restyled-${name}-goals.png`),
        });
      }
      await page.evaluate(() => {
        for (const part of ["character", "light", "density"])
          localStorage.removeItem(`astra-${part}:v1`);
      });

      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);
