/** Appearance: theme, a light and a dark palette, and the character. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { root } from "../host.mjs";
import { runBrowserSuite } from "../runtime.mjs";

/** The colours each palette declares, read from the stylesheet under test. */
const palettes = (
  await readFile(join(root, "apps/web/src/styles/appearance-sets.css"), "utf8")
).replace(/\/\*[\s\S]*?\*\//g, "");
function declared(scheme, id, name) {
  const block = new RegExp(
    `\\[data-${scheme}="${id}"\\]\\s*\\{([^}]*)\\}`,
  ).exec(palettes)[1];
  const hex = new RegExp(`--${scheme}-${name}:\\s*#([0-9a-f]{6});`).exec(
    block,
  )[1];
  const channels = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${channels.join(", ")})`;
}

await runBrowserSuite(async ({ config, evidence, newContext, browser }) => {
  const context = await newContext({ colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The sets stylesheet is fetched only when a choice or Settings needs it.
  const sheets = [];
  page.on("request", (request) => {
    if (/appearance-sets[^/]*\.css/.test(request.url()))
      sheets.push(request.url());
  });
  await page.addInitScript(() => {
    // The page colour at the moment the application first renders.
    new MutationObserver((_, observer) => {
      if (!document.getElementById("app")?.firstChild) return;
      window.appearanceAtMount = getComputedStyle(
        document.documentElement,
      ).backgroundColor;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
    window.appearanceCsp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.appearanceCsp.push(event.violatedDirective),
    );
  });
  const chromium = browser.browserType().name() === "chromium";
  /** Waits out entrances and colour transitions, so a capture shows rest. */
  const settle = () =>
    page.evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      for (let round = 0; round < 40; round++) {
        await frame();
        const running = document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getComputedTiming().iterations !== Infinity,
          );
        if (!running.length) return;
        await Promise.race([
          Promise.allSettled(running.map((animation) => animation.finished)),
          new Promise((done) => setTimeout(done, 250)),
        ]);
      }
    });
  const capture = async (name) => {
    if (!chromium) return;
    await settle();
    await page.screenshot({ path: join(evidence, `${name}.png`) });
  };
  const dialog = page.getByRole("dialog", {
    name: "Ustawienia przestrzeni roboczej",
    exact: true,
  });
  async function open() {
    await page
      .getByRole("button", {
        name: "Ustawienia przestrzeni roboczej",
        exact: true,
      })
      .click();
    await expect(dialog.getByLabel("Motyw", { exact: true })).toBeVisible();
  }
  async function close() {
    await dialog
      .getByRole("button", { name: "Zamknij ustawienia", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  }
  const group = (name) => dialog.getByRole("radiogroup", { name, exact: true });
  const choose = (name, option) =>
    group(name).getByRole("radio", { name: option, exact: true }).check();
  const rootState = () =>
    page.evaluate(() => {
      const element = document.documentElement;
      const style = getComputedStyle(element);
      return {
        ...element.dataset,
        scheme: style.colorScheme,
        background: style.backgroundColor,
        color: style.color,
      };
    });
  const inUse = () =>
    dialog
      .locator("#settings-appearance")
      .getByRole("radiogroup")
      .filter({ hasText: "W użyciu" })
      .evaluateAll((groups) =>
        groups.map((element) =>
          element.getAttribute("aria-labelledby").replace(/-label$/, ""),
        ),
      );

  try {
    await page.goto(`${config.origin}/?view=focus`);
    await expect(page.locator(".view-content")).toBeVisible();
    assert.deepEqual(sheets, [], "the default set needs no extra stylesheet");
    await open();
    await expect.poll(() => sheets.length).toBe(1);
    assert.deepEqual(
      await dialog
        .locator("#settings-appearance")
        .getByRole("radiogroup")
        .evaluateAll((groups) =>
          groups.map((element) => [
            document.getElementById(element.getAttribute("aria-labelledby"))
              .textContent,
            [...element.querySelectorAll("input[type=radio]")].map((input) => {
              // The miniature is decorative and outside the accessible name.
              const label = input.labels[0].cloneNode(true);
              for (const hidden of label.querySelectorAll("[aria-hidden]"))
                hidden.remove();
              return label.textContent.trim();
            }),
            element.querySelector("input:checked").value,
          ]),
        ),
      [
        ["Motyw", ["Systemowy", "Jasny", "Ciemny"], "system"],
        ["Kolory jasne", ["Astra", "Papier", "Szałwia", "Kreda"], "astra"],
        ["Kolory ciemne", ["Astra", "Atrament", "Kakao", "Czerń"], "astra"],
        ["Charakter", ["Astra", "Miękki", "Redakcyjny", "Techniczny"], "astra"],
        ["Odstępy", ["Astra", "Zwarte", "Przestronne"], "astra"],
      ],
    );
    assert.deepEqual(await inUse(), ["appearance-light"]);
    checks.push("Settings offers the theme, both palettes and the character");

    // Every palette paints the page with the colours its block declares.
    for (const [scheme, theme, label, names] of [
      [
        "light",
        "Jasny",
        "Kolory jasne",
        ["Astra", "Papier", "Szałwia", "Kreda"],
      ],
      [
        "dark",
        "Ciemny",
        "Kolory ciemne",
        ["Astra", "Atrament", "Kakao", "Czerń"],
      ],
    ]) {
      await choose("Motyw", theme);
      assert.deepEqual(await inUse(), [`appearance-${scheme}`]);
      for (const name of names) {
        await choose(label, name);
        const state = await rootState();
        // The default needs no attribute; tokens.css already carries it.
        const id = state[scheme] ?? "astra";
        assert.equal(
          await group(label).locator("input:checked").inputValue(),
          id,
        );
        assert.equal(state.scheme, scheme);
        assert.equal(state.background, declared(scheme, id, "bg"), name);
        assert.equal(state.color, declared(scheme, id, "ink"), name);
        assert.equal(
          await dialog.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
          declared(scheme, id, "paper"),
          name,
        );
        await capture(`settings-${scheme}-${id}`);
      }
    }
    checks.push("Each of the eight palettes renders its declared colours");

    // A palette of the scheme that is not shown is kept without repainting.
    const before = await rootState();
    await choose("Kolory jasne", "Papier");
    const after = await rootState();
    assert.equal(after.light, "paper");
    assert.equal(after.background, before.background);
    await choose("Kolory ciemne", "Atrament");

    // System follows the device and switches between the two chosen palettes.
    await choose("Motyw", "Systemowy");
    assert.equal(
      (await rootState()).background,
      declared("light", "paper", "bg"),
    );
    assert.deepEqual(await inUse(), ["appearance-light"]);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(async () => (await rootState()).background)
      .toBe(declared("dark", "ink", "bg"));
    await expect.poll(inUse).toEqual(["appearance-dark"]);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(inUse).toEqual(["appearance-light"]);
    checks.push(
      "System theme switches between the chosen light and dark palette",
    );

    // The character changes corners, depth and the heading face, not colours.
    const shape = () =>
      dialog.evaluate((element) => {
        const heading = element.querySelector("h2");
        // A plain button; WebKit gives a native select its own corners.
        const control = element.querySelector("#settings-tags button");
        return {
          dialog: getComputedStyle(element).borderTopLeftRadius,
          control: getComputedStyle(control).borderTopLeftRadius,
          heading: getComputedStyle(heading).fontFamily.split(",")[0].trim(),
          body: getComputedStyle(control).fontFamily.split(",")[0].trim(),
          background: getComputedStyle(element).backgroundColor,
        };
      });
    const shapes = {};
    for (const name of ["Astra", "Miękki", "Redakcyjny", "Techniczny"]) {
      await choose("Charakter", name);
      shapes[name] = await shape();
      await capture(`settings-character-${(await rootState()).character}`);
    }
    assert.equal(shapes.Astra.control, "10px");
    assert.equal(shapes["Miękki"].control, "14px");
    assert.equal(shapes.Redakcyjny.control, "5px");
    assert.equal(shapes.Techniczny.control, "3px");
    assert.equal(shapes.Astra.heading, shapes.Astra.body);
    assert.equal(shapes["Miękki"].body, "ui-rounded");
    assert.equal(shapes.Redakcyjny.heading, "ui-serif");
    assert.equal(shapes.Redakcyjny.body, "Inter");
    assert.equal(shapes.Techniczny.heading, "ui-monospace");
    assert.equal(
      new Set(Object.values(shapes).map(({ background }) => background)).size,
      1,
    );
    checks.push("Each character sets its corners and heading typeface");

    // Spacing changes the rhythm of gaps and padding, and nothing else.
    const rhythm = () =>
      dialog.evaluate((element) => {
        const body = getComputedStyle(element.querySelector(".dialog-body"));
        const control = getComputedStyle(
          element.querySelector("#settings-tags button"),
        );
        return {
          padding: body.paddingTop,
          step: getComputedStyle(document.documentElement)
            .getPropertyValue("--space-8")
            .trim(),
          control: control.minHeight,
          corner: control.borderTopLeftRadius,
          background: getComputedStyle(element).backgroundColor,
        };
      });
    const rhythms = {};
    for (const name of ["Astra", "Zwarte", "Przestronne"]) {
      await choose("Odstępy", name);
      rhythms[name] = await rhythm();
      await capture(`settings-spacing-${(await rootState()).density}`);
    }
    assert.deepEqual(
      Object.values(rhythms).map(({ padding, step }) => [padding, step]),
      [
        ["24px", "16px"],
        ["18px", "12px"],
        ["30px", "20px"],
      ],
    );
    for (const key of ["control", "corner", "background"])
      assert.equal(
        new Set(Object.values(rhythms).map((value) => value[key])).size,
        1,
        `spacing changed the ${key}`,
      );
    assert.equal(rhythms.Astra.control, "44px");
    checks.push("Each spacing sets the scale and leaves controls and colours");

    // Arrow keys move within one group; the choices survive a reload.
    await group("Charakter")
      .getByRole("radio", { name: "Techniczny", exact: true })
      .focus();
    await page.keyboard.press("ArrowLeft");
    await expect(
      group("Charakter").getByRole("radio", {
        name: "Redakcyjny",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      group("Charakter").getByRole("radio", {
        name: "Redakcyjny",
        exact: true,
      }),
    ).toBeFocused();
    assert.equal((await rootState()).character, "editorial");
    await close();
    await page.reload();
    await expect(page.locator(".view-content")).toBeVisible();
    const restored = await rootState();
    assert.deepEqual(
      [
        restored.theme,
        restored.light,
        restored.dark,
        restored.character,
        restored.density,
      ],
      ["system", "paper", "ink", "editorial", "roomy"],
    );
    assert.equal(restored.background, declared("light", "paper", "bg"));
    // The stored set was in place before the application rendered anything.
    assert.equal(
      await page.evaluate(() => window.appearanceAtMount),
      declared("light", "paper", "bg"),
    );
    assert.equal(sheets.length, 2);
    checks.push("Keyboard selection works and every choice survives a reload");

    // Whole views in sets other than the default, including the widgets.
    const sets = [
      ["light", "paper", "editorial"],
      ["dark", "ink", "soft"],
      ["light", "sage", "soft"],
      ["dark", "cocoa", "technical"],
      ["dark", "black", "astra"],
      ["light", "chalk", "technical"],
    ];
    const project = config.projects[0].id;
    for (const [scheme, palette, shape] of sets) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(
        ([scheme, palette, shape]) => {
          document.documentElement.dataset[scheme] = palette;
          document.documentElement.dataset.character = shape;
        },
        [scheme, palette, shape],
      );
      for (const [view, query, ready] of [
        ["focus", "view=focus", ".view-content"],
        ["board", `view=board&project=${project}`, ".astra-board .wx-card"],
        ["calendar", `view=calendar&project=${project}`, ".ec"],
        ["chart", `view=chart&project=${project}`, ".view-content"],
      ]) {
        if (palette !== "paper" && palette !== "cocoa" && view !== "focus")
          continue;
        await page.evaluate((query) => {
          history.pushState({}, "", `/?${query}`);
          dispatchEvent(new PopStateEvent("popstate"));
        }, query);
        await expect(page.locator(ready).first()).toBeVisible();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
          0,
          `${view} overflows in ${palette}/${shape}`,
        );
        await capture(`${view}-${palette}-${shape}-1440`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("focus-chalk-technical-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "light" });
    checks.push("Views and planning widgets render in non-default sets");

    // Every view in both other spacings, at desktop and the narrowest phone.
    await page.evaluate(() => {
      document.documentElement.dataset.light = "astra";
      document.documentElement.dataset.character = "astra";
    });
    for (const spacing of ["compact", "roomy"]) {
      await page.evaluate(
        (spacing) => (document.documentElement.dataset.density = spacing),
        spacing,
      );
      for (const width of [1440, 320]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 760,
        });
        for (const [view, query, ready] of [
          ["focus", "view=focus", ".view-content"],
          ["projects", "view=projects", ".view-content"],
          ["board", `view=board&project=${project}`, ".astra-board .wx-card"],
          ["calendar", `view=calendar&project=${project}`, ".ec"],
          ["gantt", `view=gantt&project=${project}`, "[data-timeline-row]"],
          ["list", `view=list&project=${project}`, ".listrow"],
          ["chart", `view=chart&project=${project}`, ".view-content"],
        ]) {
          await page.evaluate((query) => {
            history.pushState({}, "", `/?${query}`);
            dispatchEvent(new PopStateEvent("popstate"));
          }, query);
          await expect(page.locator(ready).first()).toBeVisible();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
            0,
            `${view} overflows in ${spacing} at ${width}`,
          );
          await capture(`${view}-${spacing}-${width}`);
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${config.origin}/?view=focus`);
    await expect(page.locator(".view-content")).toBeVisible();
    checks.push("Every view fits in the compact and roomy spacing");

    // Phones: tiles keep a touch target, and nothing scrolls sideways.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 760 });
      await open();
      const layout = await dialog.evaluate((element) => {
        const body = element.querySelector(".dialog-body");
        // Layout sizes, which the dialog's entrance scale does not change.
        const targets = [
          ...element.querySelectorAll("#settings-appearance input[type=radio]"),
        ].map((input) => ({
          width: input.offsetWidth,
          height: input.offsetHeight,
        }));
        return {
          overflow: body.scrollWidth - body.clientWidth,
          page: document.documentElement.scrollWidth - innerWidth,
          smallest: Math.min(
            ...targets.flatMap(({ width, height }) => [width, height]),
          ),
          count: targets.length,
        };
      });
      assert.equal(layout.overflow, 0, `dialog overflow at ${width}`);
      assert.equal(layout.page, 0, `page overflow at ${width}`);
      assert.equal(layout.count, 18);
      assert.ok(layout.smallest >= 44, `target ${layout.smallest} at ${width}`);
      await group("Kolory ciemne").scrollIntoViewIfNeeded();
      await capture(`settings-phone-${width}`);
      if (width === 320) {
        await group("Kolory jasne")
          .getByRole("radio", { name: "Szałwia", exact: true })
          .tap()
          .catch(() =>
            group("Kolory jasne")
              .getByRole("radio", { name: "Szałwia", exact: true })
              .check(),
          );
        assert.equal((await rootState()).light, "sage");
      }
      await close();
    }
    checks.push("Phone widths keep 44px targets without sideways scrolling");

    assert.deepEqual(await page.evaluate(() => window.appearanceCsp), []);
    assert.deepEqual(errors, []);
    checks.push("No inline style or script is needed under the release CSP");
  } finally {
    await writeFile(
      join(evidence, "results.json"),
      JSON.stringify({ checks, errors }, null, 2) + "\n",
    );
    await context.close();
  }
});
