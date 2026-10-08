/**
 * The in-app agent against a daemon started with a scripted provider: the floating
 * button, the chat dialog, resilience to a lost connection or reload, and settings.
 * The host's test double answers by marker; see crates/projectd/tests/fixtures.
 */
import { addTrigger, holdAndChoose } from "../add-menu.mjs";
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const views = [
  "focus",
  "projects",
  "board",
  "calendar",
  "gantt",
  "list",
  "updates",
  "chart",
];

await runBrowserSuite(
  async ({ config, cli, evidence, browser, newContext }) => {
    const context = await newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const checks = [];
    const errors = [];
    let current = "setup";
    page.on("pageerror", (error) =>
      errors.push(`${current}: ${error.message}`),
    );

    const screenshots = process.env.ASTRA_TEST_BROWSER !== "webkit";
    // Safari moves between controls with Alt+Tab unless the user changed a setting.
    const tabKey =
      process.env.ASTRA_TEST_BROWSER === "webkit" ? "Alt+Tab" : "Tab";
    const project = config.projects[0].id;

    // The Agent is one choice of the floating "+"; its state shows on the "+".
    const agentButton = (target = page) => addTrigger(target);
    const dialogOf = (target = page) =>
      target.getByRole("dialog", { name: "Agent", exact: true });
    const composerOf = (dialog) =>
      dialog.getByRole("textbox", { name: "Wiadomość do agenta", exact: true });
    const sendOf = (dialog) =>
      dialog.getByRole("button", { name: "Wyślij", exact: true });
    const buttonStatus = (target = page) =>
      target.locator(".floating-actions").getByRole("status");
    const text = (dialog, value) => dialog.getByText(value, { exact: true });
    const nativeDialogs = page.locator("dialog[open]");

    const settle = (target) =>
      target.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.allSettled(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished),
        );
      });
    const snapshot = async (name, target = page) => {
      if (!screenshots) return;
      await settle(target);
      await target.screenshot({ path: join(evidence, `${name}.png`) });
    };
    async function check(name, run) {
      try {
        checks.push({ name, status: "pass", detail: await run() });
      } catch (error) {
        checks.push({ name, status: "fail", error: String(error) });
        await snapshot(`failure-${checks.length}`).catch(() => {});
      }
      console.log(JSON.stringify(checks.at(-1)));
    }

    /** A first visit: no stored conversation, the host's runs do not matter. */
    async function visit(view = "list", { target = page, width, height } = {}) {
      if (width) await target.setViewportSize({ width, height });
      await target.goto(`${config.origin}/?view=${view}&project=${project}`);
      await target.evaluate(() => localStorage.clear());
      await target.reload();
      await agentButton(target).waitFor();
    }
    async function open(target = page) {
      await holdAndChoose(target, "agent");
      const dialog = dialogOf(target);
      await expect(dialog).toBeVisible();
      await expect(text(dialog, "Łączenie z agentem…")).toHaveCount(0);
      await expect(composerOf(dialog)).toBeFocused();
      return dialog;
    }
    async function close(dialog, target = page) {
      await dialog.getByRole("button", { name: "Zamknij agenta" }).click();
      await expect(target.locator("dialog[open]")).toHaveCount(0);
    }
    /** Type a message and send it with the button; wait until it is listed. */
    async function say(dialog, message) {
      await composerOf(dialog).fill(message);
      await sendOf(dialog).click();
      await expect(composerOf(dialog)).toHaveValue("");
    }
    // The test double echoes the last non-blank line, keeping only ASCII letters,
    // digits, spaces, dots and hyphens.
    const lastLine = (message) =>
      message
        .split("\n")
        .filter((line) => line.trim())
        .at(-1)
        .replace(/[^A-Za-z0-9 .-]/g, "");
    const answerTo = (dialog, message, kind = "new", provider = "claude") =>
      text(dialog, `fake ${provider} ${kind}: ${lastLine(message)}`);
    const box = async (locator) => {
      const rect = await locator.boundingBox();
      assert(rect, "Expected a rendered box");
      return {
        ...rect,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      };
    };
    const intersects = (a, b) =>
      a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
    /** The conversation the host holds for the stored conversation ID. */
    const hostConversation = (target = page) =>
      target.evaluate(async () => {
        const key = Object.keys(localStorage).find((name) =>
          name.startsWith("astra-agent:v1:"),
        );
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        const response = await fetch(
          `/api/v1/agent/conversations/${stored.conversationId}`,
        );
        return { status: response.status, body: await response.json() };
      });
    const waitForView = async (view, target = page) => {
      await target
        .getByRole("navigation", { name: "Widoki przestrzeni roboczej" })
        .waitFor();
      await expect(
        target.getByText(
          /^(Ładowanie danych…|Ładowanie widoku planowania…|Ładowanie tablicy…|Ładowanie kalendarza…|Ładowanie osi czasu…|Ładowanie wykresu…|Ładowanie projektów…|Ładowanie listy…|Ładowanie aktualizacji…)$/,
        ),
      ).toHaveCount(0);
      if (view === "board")
        await expect(
          target.locator(".astra-board .add-card").first(),
        ).toBeEnabled();
      if (view === "calendar") await target.locator(".ec").waitFor();
      if (view === "gantt")
        await target.locator(".astra-gantt .timeline-head").waitFor();
      await settle(target);
    };

    try {
      await page.goto(`${config.origin}/?view=list&project=${project}`);
      await expect(page.locator("header.topbar")).toBeVisible();

      await check("The button is present in all eight views", async () => {
        for (const view of views) {
          await page.goto(
            `${config.origin}/?${new URLSearchParams({ view, project, month: "2026-09", date: "2026-09-25" })}`,
          );
          await waitForView(view);
          await expect(agentButton()).toBeVisible();
          await expect(agentButton()).toBeEnabled();
          await expect(buttonStatus()).toHaveText("");
        }
        return { views };
      });

      await check(
        "One add button holds the corner in every view and width",
        async () => {
          const layouts = [];
          for (const [width, height] of [
            [1440, 1000],
            [390, 844],
            [320, 700],
          ]) {
            await page.setViewportSize({ width, height });
            for (const view of ["focus", "list", "chart"]) {
              await page.goto(
                `${config.origin}/?view=${view}&project=${project}`,
              );
              await waitForView(view);
              const add = await box(agentButton());
              assert(add.height >= 44 - 1, "A touch target is 44px");
              assert(add.right <= width - 8, "Inside the right margin");
              assert(add.right >= width - 60, `${width}: it keeps the corner`);
              assert(add.x >= 0);
              if (width <= 700)
                assert(
                  !intersects(add, await box(page.locator(".app > aside"))),
                  "Above the navigation",
                );
              layouts.push({ width, view, add });
            }
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          return layouts;
        },
      );

      await check("Releasing outside the menu folds it back", async () => {
        await visit("list");
        const trigger = agentButton();
        const at = await box(trigger);
        await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
        await page.mouse.down();
        await expect(page.getByRole("menu", { name: "Dodaj" })).toBeVisible();
        await expect(page.getByRole("menuitem")).toHaveCount(3);
        await page.mouse.move(at.x - 200, at.y - 400, { steps: 4 });
        await page.mouse.up();
        await expect(page.getByRole("menu", { name: "Dodaj" })).toBeHidden();
        await expect(dialogOf()).toHaveCount(0);
      });

      await check(
        "On a phone the choices fan out beside the button, on the chosen side",
        async () => {
          const sides = {};
          for (const hand of ["right", "left"]) {
            await visit("focus", { width: 390, height: 844 });
            await page.evaluate(
              (value) => localStorage.setItem("astra-hand:v1", value),
              hand,
            );
            await page.reload();
            const trigger = await box(agentButton());
            assert(
              hand === "right" ? trigger.x > 195 : trigger.right < 195,
              `${hand}: the button stands on that side`,
            );
            assert(
              !intersects(trigger, await box(page.locator(".app > aside"))),
            );
            await page.mouse.move(
              trigger.x + trigger.width / 2,
              trigger.y + trigger.height / 2,
            );
            await page.mouse.down();
            const items = page.getByRole("menuitem");
            await expect(items).toHaveCount(3);
            // Each choice starts under the button and travels to its own place.
            const frame = (time) =>
              page.evaluate((at) => {
                const centre = (element) => {
                  const rect = element.getBoundingClientRect();
                  return [rect.x + rect.width / 2, rect.y + rect.height / 2];
                };
                return [...document.querySelectorAll("[role=menuitem]")].map(
                  (item) => {
                    for (const animation of item.getAnimations()) {
                      animation.pause();
                      animation.currentTime = at;
                    }
                    return centre(item);
                  },
                );
              }, time);
            const origin = [
              trigger.x + trigger.width / 2,
              trigger.y + trigger.height / 2,
            ];
            for (const [x, y] of await frame(0))
              assert(
                Math.hypot(x - origin[0], y - origin[1]) <= 20,
                `${hand}: a choice starts under the button (${x}, ${y} from ${origin})`,
              );
            await frame(140);
            if (screenshots)
              await page.screenshot({
                path: join(evidence, `add-menu-phone-${hand}-moving.png`),
              });
            await page.evaluate(() =>
              document
                .querySelectorAll("[role=menuitem]")
                .forEach((item) =>
                  item
                    .getAnimations()
                    .forEach((animation) => animation.finish()),
                ),
            );
            await settle(page);
            const boxes = [];
            for (const item of await items.all()) boxes.push(await box(item));
            const middle = trigger.y + trigger.height / 2;
            for (const item of boxes) {
              assert(
                hand === "right"
                  ? item.right <= trigger.x
                  : item.x >= trigger.right,
                `${hand}: every choice lies beside the button`,
              );
              assert(item.x >= 0 && item.right <= 390, "Inside the viewport");
              assert(item.height >= 44 - 1, "A touch target is 44px");
            }
            assert(boxes[0].bottom < middle, "The first choice lies above");
            assert(
              boxes[1].y < middle && boxes[1].bottom > middle,
              "The middle choice is level with the button",
            );
            assert(boxes[2].y > middle, "The last choice lies below");
            assert(
              !intersects(boxes[2], await box(page.locator(".app > aside"))),
              "Above the navigation",
            );
            await snapshot(`add-menu-phone-${hand}`);
            await page.mouse.move(195, 200, { steps: 4 });
            await page.mouse.up();
            await expect(items.first()).toBeHidden();
            sides[hand] = { trigger, boxes };
          }
          await page.evaluate(() => localStorage.removeItem("astra-hand:v1"));
          await page.setViewportSize({ width: 1440, height: 1000 });
          return sides;
        },
      );

      await check(
        "Workspace content clears the floating buttons in every view and width",
        async () => {
          const report = [];
          for (const width of [1440, 1024, 768, 390, 320]) {
            await page.setViewportSize({
              width,
              height: width > 700 ? 900 : 800,
            });
            for (const view of views) {
              await page.goto(
                `${config.origin}/?${new URLSearchParams({ view, project, month: "2026-09", date: "2026-09-25" })}`,
              );
              await waitForView(view);
              // After scrolling to the end, nothing but empty space may lie below the buttons.
              const hits = await page.evaluate(async () => {
                const scroller = document.scrollingElement;
                scroller.scrollTop = scroller.scrollHeight;
                await new Promise((done) => setTimeout(done, 250));
                const actions = document.querySelector(".floating-actions");
                const rect = actions.getBoundingClientRect();
                actions.style.visibility = "hidden";
                const found = new Set();
                const pad = 6;
                for (let x = 0; x <= 8; x++)
                  for (let y = 0; y <= 4; y++) {
                    const element = document.elementFromPoint(
                      Math.min(
                        innerWidth - 1,
                        rect.left - pad + ((rect.width + 2 * pad) * x) / 8,
                      ),
                      Math.min(
                        innerHeight - 1,
                        rect.top - pad + ((rect.height + 2 * pad) * y) / 4,
                      ),
                    );
                    if (!element) continue;
                    const own = [...element.childNodes].some(
                      (node) => node.nodeType === 3 && node.textContent.trim(),
                    );
                    const control = element.closest(
                      "button,a,input,select,textarea,summary,[role=button],[role=slider]",
                    );
                    if (own || control)
                      found.add(
                        `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}: ${(element.textContent ?? "").trim().slice(0, 30)}`,
                      );
                  }
                actions.style.visibility = "";
                return [...found];
              });
              assert.deepEqual(hits, [], `${view} at ${width}px`);
              report.push({ width, view, covered: hits.length });
            }
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          return report.length;
        },
      );

      await check(
        "An open counter edit is never covered by the Agent button",
        async () => {
          const base = `/api/v1/projects/${config.projects[2].id}/cards`;
          const file = join(config.temp, "agent-counter-command.json");
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
          let card = await mutate("POST", base, {
            title: "Agent button counter fixture",
            status: "active",
          });
          const path = `${base}/${card.metadata.id}`;
          card = await mutate(
            "PATCH",
            path,
            { set: { pinned: true } },
            card.version,
          );
          card = await mutate(
            "PATCH",
            path,
            {
              configure_counter: {
                name: "Push-ups",
                unit: "reps",
                step: 5,
                archived: false,
              },
            },
            card.version,
          );
          const outcomes = [];
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(
            `${config.origin}/?view=focus&project=${config.projects[2].id}`,
          );
          const chip = page
            .locator(`[data-focus-card="${card.metadata.id}"]`)
            .getByRole("spinbutton", { name: "Push-ups", exact: true });
          await chip.focus();
          await chip.press("ArrowUp");
          const bar = page.getByRole("region", {
            name: "Edytuj licznik Focus",
          });
          await expect(bar).toBeVisible();
          for (const [width, height] of [
            [1440, 900],
            [1200, 900],
            [1024, 900],
            [768, 900],
            [390, 800],
            [320, 700],
          ]) {
            await page.setViewportSize({ width, height });
            await expect(bar).toBeVisible();
            const barBox = await box(bar);
            const agent = agentButton();
            // Either out of the way or clear of the bar; never both on top of each other.
            const shown = await agent.isVisible();
            if (shown) {
              assert(
                !intersects(await box(agent), barBox),
                `${width}: the Agent button must not cover the counter bar`,
              );
            }
            outcomes.push({ width, agentShown: shown });
          }
          await bar
            .getByRole("button", { name: "Anuluj edycję licznika" })
            .click();
          await expect(bar).toHaveCount(0);
          await page.setViewportSize({ width: 1440, height: 1000 });
          await expect(agentButton()).toBeVisible();
          return outcomes;
        },
      );

      await check(
        "Opening, closing with Escape and the close button, and focus return",
        async () => {
          await visit("list");
          const trigger = agentButton();
          await trigger.focus();
          await trigger.press("Enter");
          await page.keyboard.press("Enter");
          const dialog = dialogOf();
          await expect(dialog).toBeVisible();
          await expect(composerOf(dialog)).toBeFocused();
          await expect(
            dialog.getByRole("heading", { name: "Agent" }),
          ).toBeVisible();
          await expect(
            dialog.getByText("Claude Code", { exact: true }),
          ).toBeVisible();
          await expect(
            dialog.getByRole("button", { name: "Nowa rozmowa", exact: true }),
          ).toBeEnabled();
          await expect(
            dialog.getByText("Co mam zrobić?", { exact: true }),
          ).toBeVisible();
          await expect(
            dialog.getByText(
              "Napisz zwykłym zdaniem, na przykład „zrobiłem 10 pompek” albo „dodaj komentarz do karty o fakturze”. Agent sam znajdzie projekt i kartę.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(composerOf(dialog)).toHaveAttribute(
            "placeholder",
            "Napisz, co zrobić…",
          );
          await expect(sendOf(dialog)).toBeDisabled();
          await page.keyboard.press("Escape");
          await expect(nativeDialogs).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await holdAndChoose(page, "agent");
          await expect(dialog).toBeVisible();
          await close(dialog);
          await expect(trigger).toBeFocused();
          return { escape: true, closeButton: true, focusReturned: true };
        },
      );

      await check(
        "An empty, blank or oversized message cannot be sent",
        async () => {
          await visit("list");
          const dialog = await open();
          const composer = composerOf(dialog);
          for (const value of ["", "   ", "\n\t  \n"]) {
            await composer.fill(value);
            await expect(sendOf(dialog)).toBeDisabled();
          }
          // A programmatic value ignores maxlength, like a paste the browser did not cut.
          const setValue = (value) =>
            composer.evaluate((element, next) => {
              element.value = next;
              element.dispatchEvent(new Event("input", { bubbles: true }));
            }, value);
          await setValue("x".repeat(8001));
          await expect(sendOf(dialog)).toBeDisabled();
          await setValue("x".repeat(8000));
          await expect(sendOf(dialog)).toBeEnabled();
          assert.equal(await composer.getAttribute("maxlength"), "8000");
          await composer.fill("");
          await composer.press("Enter");
          await expect(
            dialog.getByRole("list", { name: "Rozmowa z agentem" }),
          ).toHaveCount(0);
          return { limit: 8000 };
        },
      );

      await check(
        "Enter sends, Shift+Enter inserts a line, the button sends",
        async () => {
          await visit("list");
          const dialog = await open();
          const composer = composerOf(dialog);
          await composer.fill("pierwsza wiadomość");
          await composer.press("Enter");
          await expect(composer).toHaveValue("");
          await expect(text(dialog, "pierwsza wiadomość")).toBeVisible();
          await expect(dialog.locator(".sr", { hasText: /^Ty$/ })).toHaveCount(
            1,
          );
          await expect(answerTo(dialog, "pierwsza wiadomość")).toBeVisible();
          await expect(
            dialog.locator(".sr", { hasText: /^Agent$/ }),
          ).toHaveCount(1);

          await composer.pressSequentially("linia pierwsza");
          await composer.press("Shift+Enter");
          await composer.pressSequentially("linia druga");
          await expect(composer).toHaveValue("linia pierwsza\nlinia druga");
          await expect(
            dialog
              .getByRole("list", { name: "Rozmowa z agentem" })
              .getByRole("listitem"),
          ).toHaveCount(2);
          await sendOf(dialog).click();
          // Line breaks survive in the list, and the follow-up continues the session.
          const sent = dialog.locator(".user-text").last();
          await expect(sent).toHaveText("linia pierwsza\nlinia druga");
          assert.equal(
            await sent.evaluate(
              (element) => getComputedStyle(element).whiteSpace,
            ),
            "pre-wrap",
          );
          await expect(
            answerTo(dialog, "linia pierwsza\nlinia druga", "resumed"),
          ).toBeVisible();
          return { enter: true, shiftEnter: true, button: true, resumed: true };
        },
      );

      await check(
        "On a touch device Enter inserts a line and only the button sends",
        async () => {
          const touch = await newContext({
            hasTouch: true,
            isMobile: true,
            viewport: { width: 390, height: 844 },
          });
          const phone = await touch.newPage();
          phone.setDefaultTimeout(12000);
          phone.on("pageerror", (error) => errors.push(error.message));
          try {
            await visit("list", { target: phone });
            assert(
              await phone.evaluate(
                () => matchMedia("(pointer: coarse)").matches,
              ),
              "The emulated device must have a coarse primary pointer",
            );
            const dialog = await open(phone);
            const composer = composerOf(dialog);
            await composer.pressSequentially("pierwsza");
            await composer.press("Enter");
            await composer.pressSequentially("druga");
            await expect(composer).toHaveValue("pierwsza\ndruga");
            await expect(
              dialog.getByRole("list", { name: "Rozmowa z agentem" }),
            ).toHaveCount(0);
            await sendOf(dialog).tap();
            await expect(answerTo(dialog, "pierwsza\ndruga")).toBeVisible();
            return { enterInsertsLine: true, buttonSends: true };
          } finally {
            await touch.close();
          }
        },
      );

      await check("A Markdown answer renders safely", async () => {
        await visit("list");
        const dialog = await open();
        await say(dialog, "pokaż [[markdown]]");
        const answer = dialog.locator(".markdown").last();
        await expect(answer.locator("strong").first()).toBeVisible();
        await expect(answer.locator("li")).toHaveCount(2);
        const link = answer.locator('a[href^="https://"]').first();
        await expect(link).toBeVisible();
        await expect(dialog.locator("img")).toHaveCount(0);
        await expect(dialog.locator("script")).toHaveCount(0);
        assert.equal(await page.evaluate(() => window.pwned), undefined);
        return {
          bold: true,
          items: 2,
          link: await link.getAttribute("href"),
          images: 0,
          scripts: 0,
        };
      });

      await check(
        "A failed provider shows its message and plain-text details",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "spróbuj [[fail]]");
          const alert = dialog.getByRole("alert").filter({
            hasText: "Dostawca agenta zgłosił błąd.",
          });
          await expect(alert).toBeVisible();
          const details = dialog.locator("details");
          await expect(
            details.getByText("Szczegóły", { exact: true }),
          ).toBeVisible();
          await expect(details.getByText("fake failure")).toBeHidden();
          await details.getByText("Szczegóły", { exact: true }).click();
          await expect(details.getByText("fake failure")).toBeVisible();
          await expect(
            dialog.getByRole("button", { name: "Nowa rozmowa", exact: true }),
          ).toBeEnabled();
          // A crash keeps its details too.
          await say(dialog, "rozbij [[crash]]");
          await expect(
            dialog.locator("details").last().locator("summary"),
          ).toBeVisible();
          await dialog.locator("details").last().locator("summary").click();
          await expect(
            dialog.locator("details").last().locator(".detail"),
          ).toContainText("fake crash");
          return { failed: true, crash: true };
        },
      );

      await check("A silent provider reports that no answer came", async () => {
        await visit("list");
        const dialog = await open();
        await say(dialog, "cisza [[silent]]");
        await expect(
          dialog.getByRole("alert").filter({
            hasText: "Agent zakończył pracę bez odpowiedzi.",
          }),
        ).toBeVisible();
        return { silent: true };
      });

      await check(
        "A truncated answer says so and stays inside the dialog",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "dużo [[big]]");
          await expect(
            text(dialog, "Odpowiedź została skrócona."),
          ).toBeVisible();
          const overflow = await dialog
            .locator(".dialog-body")
            .evaluate((element) => ({
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
            }));
          assert(
            overflow.scrollWidth <= overflow.clientWidth + 1,
            `The answer must wrap: ${JSON.stringify(overflow)}`,
          );
          return overflow;
        },
      );

      await check("A running turn can be cancelled", async () => {
        await visit("list");
        const dialog = await open();
        await say(dialog, "długo [[sleep 30]]");
        const running = dialog
          .getByRole("status")
          .filter({ hasText: /^Agent pracuje…/ });
        await expect(running).toBeVisible();
        await expect(running).toContainText(/\d+:\d\d/);
        // One turn at a time: the next send and a new conversation wait.
        await composerOf(dialog).fill("następna");
        await expect(sendOf(dialog)).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: "Nowa rozmowa", exact: true }),
        ).toBeDisabled();
        await dialog
          .getByRole("button", { name: "Przerwij", exact: true })
          .click();
        await expect(
          dialog.getByRole("status").filter({ hasText: "Przerywanie…" }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Przerwij", exact: true }),
        ).toHaveCount(0);
        await expect(
          text(dialog, "Przerwano. Agent mógł zdążyć wykonać część zmian."),
        ).toBeVisible();
        // The text typed meanwhile is still there, and sending is possible again.
        await expect(composerOf(dialog)).toHaveValue("następna");
        await expect(sendOf(dialog)).toBeEnabled();
        return { cancelled: true, draftKept: true };
      });

      await check(
        "A run that exceeds the host's limit is reported as timed out",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "bardzo długo [[sleep 30]]");
          await expect(
            text(
              dialog,
              "Agent nie skończył w wyznaczonym czasie i został zatrzymany. Mógł wykonać część zmian.",
            ),
          ).toBeVisible({ timeout: 25000 });
          return { timedOut: true };
        },
      );

      await check(
        "Closing during a run shows the button's status, reopening shows the answer",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "w tle [[sleep 4]]");
          await expect(
            dialog.getByRole("status").filter({ hasText: /^Agent pracuje…/ }),
          ).toBeVisible();
          await close(dialog);
          await expect(buttonStatus()).toHaveText("pracuje");
          await expect(agentButton()).toHaveAttribute(
            "data-activity",
            "pracuje",
          );
          await expect(buttonStatus()).toHaveText("nowa odpowiedź", {
            timeout: 15000,
          });
          await expect(agentButton()).toHaveAttribute(
            "data-activity",
            "nowa odpowiedź",
          );
          const again = await open();
          await expect(text(again, "w tle [[sleep 4]]")).toBeVisible();
          await expect(text(again, "slept")).toBeVisible();
          // Seeing the answer clears the status.
          await expect(buttonStatus()).toHaveText("");
          await expect(agentButton()).not.toHaveAttribute(
            "data-activity",
            /.+/,
          );
          return { working: true, answered: true, cleared: true };
        },
      );

      await check(
        "Reloading during a run resumes it and shows the answer",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "po przeładowaniu [[sleep 6]]");
          await expect(
            dialog.getByRole("status").filter({ hasText: /^Agent pracuje…/ }),
          ).toBeVisible();
          await page.reload();
          await agentButton().waitFor();
          // The conversation resumes without opening the dialog.
          await expect(buttonStatus()).toHaveText("pracuje");
          const again = await open();
          await expect(
            text(again, "po przeładowaniu [[sleep 6]]"),
          ).toBeVisible();
          await expect(text(again, "slept")).toBeVisible({ timeout: 20000 });
          // The same conversation continues with context.
          await say(again, "dalej");
          await expect(answerTo(again, "dalej", "resumed")).toBeVisible();
          return { resumed: true, follow: "resumed" };
        },
      );

      await check(
        "Nowa rozmowa clears the list and starts a fresh session",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "jeden");
          await expect(answerTo(dialog, "jeden")).toBeVisible();
          await say(dialog, "dwa");
          await expect(answerTo(dialog, "dwa", "resumed")).toBeVisible();
          await dialog
            .getByRole("button", { name: "Nowa rozmowa", exact: true })
            .click();
          await expect(
            dialog.getByText("Co mam zrobić?", { exact: true }),
          ).toBeVisible();
          await expect(
            dialog.getByRole("list", { name: "Rozmowa z agentem" }),
          ).toHaveCount(0);
          await say(dialog, "trzy");
          await expect(answerTo(dialog, "trzy")).toBeVisible();
          // The stored conversation is the new one: after a reload only it returns.
          await page.reload();
          const again = await open();
          await expect(text(again, "trzy")).toBeVisible();
          await expect(text(again, "jeden")).toHaveCount(0);
          return { fresh: true };
        },
      );

      await check(
        "A conversation the host does not know is replaced with a notice",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "zapamiętaj");
          await expect(answerTo(dialog, "zapamiętaj")).toBeVisible();
          await close(dialog);
          await page.evaluate(() => {
            const key = Object.keys(localStorage).find((name) =>
              name.startsWith("astra-agent:v1:"),
            );
            const stored = JSON.parse(localStorage.getItem(key));
            // A conversation of another host life: acknowledged, but unknown here.
            stored.conversationId = crypto.randomUUID();
            localStorage.setItem(key, JSON.stringify(stored));
          });
          await page.reload();
          const again = await open();
          await expect(
            text(again, "Poprzednia rozmowa nie jest już dostępna na hoście."),
          ).toBeVisible();
          await expect(text(again, "Co mam zrobić?")).toBeVisible();
          // The line is shown once.
          await close(again);
          const third = await open();
          await expect(
            text(third, "Poprzednia rozmowa nie jest już dostępna na hoście."),
          ).toHaveCount(0);
          return { gone: true, once: true };
        },
      );

      await check(
        "A lost POST response is retried with the same run and starts it once",
        async () => {
          await visit("list");
          const bodies = [];
          let first = true;
          await page.route("**/api/v1/agent/runs", async (route) => {
            const request = route.request();
            if (request.method() !== "POST") return route.continue();
            bodies.push(request.postData());
            if (first) {
              first = false;
              // The host receives it and starts the agent; the browser never hears back.
              await route.fetch();
              return route.abort("connectionreset");
            }
            // Keep the "no connection" hint on screen long enough to be seen.
            await new Promise((done) => setTimeout(done, 1500));
            return route.continue();
          });
          try {
            const dialog = await open();
            await say(dialog, "raz tylko");
            await expect(
              dialog.getByRole("status").filter({
                hasText: "Brak połączenia z hostem — ponawiam…",
              }),
            ).toBeVisible();
            await expect(answerTo(dialog, "raz tylko")).toBeVisible({
              timeout: 15000,
            });
            assert.equal(bodies.length, 2, "One lost attempt and one retry");
            assert.equal(
              bodies[0],
              bodies[1],
              "The retry is the identical request",
            );
            const held = await hostConversation();
            assert.equal(held.status, 200);
            assert.equal(held.body.runs.length, 1, "The agent ran once");
            assert.equal(
              held.body.runs[0].run_id,
              JSON.parse(bodies[0]).run_id,
            );
            return { attempts: bodies.length, runs: held.body.runs.length };
          } finally {
            await page.unroute("**/api/v1/agent/runs");
          }
        },
      );

      await check(
        "An unreachable host leaves a manual retry of the same request",
        async () => {
          await visit("list");
          let attempts = 0;
          let identical = new Set();
          await page.route("**/api/v1/agent/runs", async (route) => {
            if (route.request().method() !== "POST") return route.continue();
            attempts++;
            identical.add(route.request().postData());
            return route.abort("connectionrefused");
          });
          try {
            const dialog = await open();
            await say(dialog, "bez sieci");
            await expect(
              text(
                dialog,
                "Nie udało się potwierdzić, że wiadomość dotarła do hosta.",
              ),
            ).toBeVisible({ timeout: 30000 });
            assert.equal(attempts, 5, "One send and four automatic retries");
            assert.equal(
              identical.size,
              1,
              "Every attempt carried the same body",
            );
            // The unconfirmed turn still blocks the next message.
            await composerOf(dialog).fill("kolejna");
            await expect(sendOf(dialog)).toBeDisabled();
            await composerOf(dialog).fill("");
            await page.unroute("**/api/v1/agent/runs");
            await dialog
              .getByRole("button", { name: "Ponów", exact: true })
              .click();
            await expect(answerTo(dialog, "bez sieci")).toBeVisible();
            return { attempts, manualRetry: true };
          } finally {
            await page.unroute("**/api/v1/agent/runs").catch(() => {});
          }
        },
      );

      await check(
        "A message not yet acknowledged is sent again after a reload",
        async () => {
          await visit("list");
          await page.route("**/api/v1/agent/runs", (route) =>
            route.request().method() === "POST"
              ? route.abort("connectionrefused")
              : route.continue(),
          );
          const dialog = await open();
          await say(dialog, "przed przeładowaniem");
          await expect(
            dialog.getByRole("status").filter({
              hasText: "Brak połączenia z hostem — ponawiam…",
            }),
          ).toBeVisible();
          await page.unroute("**/api/v1/agent/runs");
          await page.reload();
          await agentButton().waitFor();
          const again = await open();
          await expect(text(again, "przed przeładowaniem")).toBeVisible();
          await expect(answerTo(again, "przed przeładowaniem")).toBeVisible({
            timeout: 15000,
          });
          const held = await hostConversation();
          assert.equal(held.body.runs.length, 1);
          return { resumed: true };
        },
      );

      await check(
        "A lost connection while waiting shows a hint and recovers",
        async () => {
          await visit("list");
          const dialog = await open();
          await say(dialog, "czekam [[sleep 5]]");
          await expect(
            dialog.getByRole("status").filter({ hasText: /^Agent pracuje…/ }),
          ).toBeVisible();
          await context.setOffline(true);
          try {
            await expect(
              dialog.getByRole("status").filter({
                hasText: "Brak połączenia z hostem — ponawiam…",
              }),
            ).toBeVisible();
            // The turn stays a running turn, not a failure.
            await expect(
              dialog.getByRole("status").filter({ hasText: /^Agent pracuje…/ }),
            ).toBeVisible();
          } finally {
            await context.setOffline(false);
          }
          await expect(text(dialog, "slept")).toBeVisible({ timeout: 20000 });
          await expect(
            text(dialog, "Brak połączenia z hostem — ponawiam…"),
          ).toHaveCount(0);
          return { hint: true, recovered: true };
        },
      );

      await check("Settings move the phone's add button at once", async () => {
        await visit("list", { width: 390, height: 844 });
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
        const select = dialog.getByLabel("Przycisk dodawania na telefonie", {
          exact: true,
        });
        await expect(select).toHaveValue("right");
        await select.selectOption("left");
        await expect(page.locator("html")).toHaveAttribute("data-hand", "left");
        await page.reload();
        await agentButton().waitFor();
        assert((await box(agentButton())).right < 195, "It stays on the left");
        await page.evaluate(() => localStorage.removeItem("astra-hand:v1"));
        await page.setViewportSize({ width: 1440, height: 1000 });
      });

      await check(
        "Settings choose the provider of a new conversation",
        async () => {
          await visit("list");
          const first = await open();
          await expect(
            first.getByText("Claude Code", { exact: true }),
          ).toBeVisible();
          await say(first, "przed zmianą");
          await expect(answerTo(first, "przed zmianą")).toBeVisible();
          await close(first);

          const settings = async () => {
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
            const providers = dialog
              .getByRole("radiogroup", { name: "Dostawca agenta", exact: true })
              .getByRole("radio");
            await expect(providers.first()).toBeEnabled();
            return { dialog, providers };
          };
          let panel = await settings();
          await expect(
            panel.dialog.getByRole("radio", { name: /^Claude Code/ }),
          ).toBeChecked();
          assert.deepEqual(
            await panel.providers.evaluateAll((nodes) =>
              nodes.map((node) => node.value),
            ),
            ["claude", "codex"],
          );
          await panel.dialog.getByRole("radio", { name: /^Codex/ }).check();
          await panel.dialog
            .getByRole("button", { name: "Zapisz ustawienia" })
            .click();
          await expect(nativeDialogs).toHaveCount(0);

          // The conversation that began with Claude keeps its provider.
          const old = await open();
          await expect(
            old.getByText("Claude Code", { exact: true }),
          ).toBeVisible();
          await old
            .getByRole("button", { name: "Nowa rozmowa", exact: true })
            .click();
          await expect(old.getByText("Codex", { exact: true })).toBeVisible();
          await say(old, "po zmianie");
          await expect(
            answerTo(old, "po zmianie", "new", "codex"),
          ).toBeVisible();
          await close(old);

          // Put it back so that later checks start from the default.
          panel = await settings();
          await expect(
            panel.dialog.getByRole("radio", { name: /^Codex/ }),
          ).toBeChecked();
          await panel.dialog
            .getByRole("radio", { name: /^Claude Code/ })
            .check();
          await panel.dialog
            .getByRole("button", { name: "Zapisz ustawienia" })
            .click();
          await expect(nativeDialogs).toHaveCount(0);
          const back = await open();
          await back
            .getByRole("button", { name: "Nowa rozmowa", exact: true })
            .click();
          await expect(
            back.getByText("Claude Code", { exact: true }),
          ).toBeVisible();
          return { switched: true, restored: true };
        },
      );

      await check("The whole flow works from the keyboard alone", async () => {
        await visit("list");
        const trigger = agentButton();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        const dialog = dialogOf();
        await expect(composerOf(dialog)).toBeFocused();
        await expect(text(dialog, "Łączenie z agentem…")).toHaveCount(0);
        await page.keyboard.type("z klawiatury");
        await page.keyboard.press("Enter");
        await expect(answerTo(dialog, "z klawiatury")).toBeVisible();
        // Every control is reachable by Tab inside the dialog; Wyślij needs a draft.
        await page.keyboard.type("szkic");
        const reached = new Set();
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press(tabKey);
          reached.add(
            await page.evaluate(
              () =>
                document.activeElement?.getAttribute("aria-label") ??
                document.activeElement?.textContent?.trim() ??
                "",
            ),
          );
        }
        for (const name of [
          "Nowa rozmowa",
          "Zamknij agenta",
          "Wiadomość do agenta",
          "Wyślij",
        ])
          assert(
            reached.has(name),
            `Tab reaches ${name}: ${[...reached].join(", ")}`,
          );
        // A long turn is stopped from the keyboard.
        await composerOf(dialog).fill("");
        await composerOf(dialog).focus();
        await page.keyboard.type("klawiszem [[sleep 30]]");
        await page.keyboard.press("Enter");
        const stop = dialog.getByRole("button", {
          name: "Przerwij",
          exact: true,
        });
        await expect(stop).toBeVisible();
        await stop.focus();
        await page.keyboard.press("Enter");
        await expect(
          text(dialog, "Przerwano. Agent mógł zdążyć wykonać część zmian."),
        ).toBeVisible();
        // A new conversation, then Escape returns to the button.
        const fresh = dialog.getByRole("button", {
          name: "Nowa rozmowa",
          exact: true,
        });
        await fresh.focus();
        await page.keyboard.press("Space");
        await expect(text(dialog, "Co mam zrobić?")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(nativeDialogs).toHaveCount(0);
        await expect(trigger).toBeFocused();
        return { keyboardOnly: true, reached: [...reached] };
      });

      await check(
        "Above a phone keyboard the dialog stays a rounded card with even gaps",
        async () => {
          const touch = await newContext({
            hasTouch: true,
            isMobile: true,
            viewport: { width: 390, height: 844 },
          });
          // No engine here raises a keyboard, so the visible height is scripted.
          await touch.addInitScript(() => {
            const viewport = window.visualViewport;
            let covered = 0;
            Object.defineProperty(viewport, "height", {
              get: () => window.innerHeight - covered,
            });
            window.astraTestKeyboard = (height) => {
              covered = height;
              viewport.dispatchEvent(new Event("resize"));
            };
          });
          const phone = await touch.newPage();
          phone.setDefaultTimeout(12000);
          phone.on("pageerror", (error) => errors.push(error.message));
          try {
            await visit("focus", { target: phone });
            const dialog = await open(phone);
            // The entrance moves the dialog; its resting box is what counts.
            const measure = async () => {
              await settle(phone);
              return phone.evaluate(() => {
                const element = document.querySelector("dialog[open]");
                const rect = element.getBoundingClientRect();
                const form = element
                  .querySelector("form")
                  .getBoundingClientRect();
                return {
                  keyboard: element.hasAttribute("data-keyboard"),
                  radius: parseFloat(getComputedStyle(element).borderRadius),
                  top: rect.top,
                  left: rect.left,
                  right: innerWidth - rect.right,
                  below: window.visualViewport.height - rect.bottom,
                  formInside: form.bottom <= rect.bottom,
                };
              });
            };
            const resting = await measure();
            await phone.evaluate(() => window.astraTestKeyboard(336));
            await expect(dialog).toHaveAttribute("data-keyboard", "");
            const fitted = await measure();
            await snapshot("agent-keyboard-390", phone);
            assert.equal(
              fitted.radius,
              resting.radius,
              "The keyboard must not square the dialog's corners",
            );
            assert(fitted.radius > 0, "The dialog has rounded corners");
            for (const side of ["top", "left", "right", "below"])
              assert(
                Math.abs(fitted[side] - 8) <= 1,
                `An 8px gap ${side}: ${JSON.stringify(fitted)}`,
              );
            assert(fitted.formInside, "The composer stays inside the dialog");
            await phone.evaluate(() => window.astraTestKeyboard(0));
            await expect(dialog).not.toHaveAttribute("data-keyboard");
            assert.deepEqual(await measure(), resting);
            return { resting, fitted };
          } finally {
            await touch.close();
          }
        },
      );

      await check(
        "Screenshots record the dialog empty, answered and failed",
        async () => {
          const shots = [];
          for (const [width, height] of [
            [1440, 1000],
            [390, 844],
          ]) {
            await visit("focus", { width, height });
            const dialog = await open();
            await snapshot(`agent-empty-${width}`, dialog);
            await say(dialog, "zrobiłem 10 pompek");
            await expect(answerTo(dialog, "zrobiłem 10 pompek")).toBeVisible();
            await say(dialog, "pokaż [[markdown]]");
            await expect(
              dialog.locator(".markdown").last().locator("li"),
            ).toHaveCount(2);
            await snapshot(`agent-answer-${width}`, dialog);
            await say(dialog, "spróbuj [[fail]]");
            await expect(
              dialog
                .getByRole("alert")
                .filter({ hasText: "Dostawca agenta zgłosił błąd." }),
            ).toBeVisible();
            await dialog.locator("details summary").click();
            await snapshot(`agent-error-${width}`, dialog);
            // The composer stays inside the dialog and the page never scrolls sideways.
            const geometry = await page.evaluate(() => {
              const dialogBox = document
                .querySelector("dialog[open]")
                .getBoundingClientRect();
              const form = document
                .querySelector("dialog[open] form")
                .getBoundingClientRect();
              return {
                dialog: dialogBox.toJSON(),
                form: form.toJSON(),
                documentWidth: document.documentElement.scrollWidth,
                viewport: innerWidth,
              };
            });
            assert(geometry.documentWidth <= geometry.viewport + 1);
            assert(geometry.form.bottom <= geometry.dialog.bottom + 1);
            assert(
              geometry.dialog.right <= geometry.viewport + 1 &&
                geometry.dialog.left >= -1,
            );
            shots.push({ width, geometry });
            await page.keyboard.press("Escape");
            await expect(nativeDialogs).toHaveCount(0);
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          return shots;
        },
      );
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify({ checks, errors, browser: browser.version() }, null, 2),
      );
    }
    if (checks.some((entry) => entry.status !== "pass") || errors.length)
      process.exitCode = 1;
    assert.deepEqual(errors, []);
  },
);
