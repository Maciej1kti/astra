/** Guards for the palettes and characters described in docs/DESIGN-SYSTEM.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";

const styles = join(import.meta.dirname, "../../apps/web/src/styles");
const css = (name) =>
  readFileSync(join(styles, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Rule blocks as { selectors, values } with custom properties only. */
function blocks(text) {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, head, body]) => ({
    selectors: head.split(",").map((selector) => selector.trim()),
    values: Object.fromEntries(
      [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
        ([, name, value]) => [
          name,
          // One spelling, however the formatter wrapped a long value.
          value
            .trim()
            .replace(/\s+/g, " ")
            .replace(/\( /g, "(")
            .replace(/,? \)/g, ")"),
        ],
      ),
    ),
  }));
}
/** Blocks keyed by the value of one attribute, such as data-light. */
function byAttribute(text, attribute) {
  const found = new Map();
  for (const block of blocks(text))
    for (const selector of block.selectors) {
      const id = new RegExp(`^\\[${attribute}="([a-z]+)"\\]$`).exec(
        selector,
      )?.[1];
      if (id) found.set(id, block);
    }
  return found;
}

const sets = css("appearance-sets.css");
const light = byAttribute(sets, "data-light");
const dark = byAttribute(sets, "data-dark");
const characters = byAttribute(sets, "data-character");
/** The block for the page and for a fragment shown in one scheme. */
const rootOnly = (text) =>
  blocks(text).find(
    ({ selectors }) => selectors.join() === ":root,[data-scheme]",
  ).values;
/** What the first load carries, and how the sets pair and shade it. */
const tokens = rootOnly(css("tokens.css"));
const pairing = rootOnly(sets);

const globals = { storage: new Map(), fail: false, root: { dataset: {} } };
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => {
      if (globals.fail) throw new Error("storage unavailable");
      return globals.storage.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (globals.fail) throw new Error("storage unavailable");
      globals.storage.set(key, value);
    },
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: globals.root },
});
// Node has no stylesheets; count the requests for one instead.
let stylesheets = 0;
registerHooks({
  load(url, context, next) {
    if (!url.endsWith(".css")) return next(url, context);
    stylesheets++;
    return { format: "module", source: "", shortCircuit: true };
  },
});
const appearance = {
  ...(await import("../../apps/web/src/features/settings/appearance.ts")),
  ...(await import("../../apps/web/src/features/settings/appearance-choices.ts")),
};

const ids = (options) => options.map(({ id }) => id);

test("the menu and the stylesheets list the same palettes and characters", () => {
  assert.deepEqual([...light.keys()], ids(appearance.lightPalette.options));
  assert.deepEqual([...dark.keys()], ids(appearance.darkPalette.options));
  assert.deepEqual([...characters.keys()], ids(appearance.character.options));
  for (const [name, map] of Object.entries({ light, dark, characters }))
    assert.ok(
      [...map.values()][0].selectors.includes(":root"),
      `the first of ${name} is the default`,
    );
  for (const group of [
    appearance.lightPalette,
    appearance.darkPalette,
    appearance.character,
  ])
    for (const { label } of group.options) assert.ok(label.trim());
});

test("every palette and character names the complete set of values", () => {
  for (const [prefix, map] of [
    ["--light-", light],
    ["--dark-", dark],
    ["--", characters],
  ]) {
    const [first, ...rest] = [...map.entries()];
    const expected = Object.keys(first[1].values);
    assert.ok(expected.length > 0);
    assert.ok(expected.every((name) => name.startsWith(prefix)));
    for (const [id, block] of rest)
      assert.deepEqual(Object.keys(block.values), expected, id);
  }
});

test("each colour token pairs the chosen light and dark palette", () => {
  const colours = Object.keys(light.get("astra").values).map((name) =>
    name.replace("--light-", ""),
  );
  assert.deepEqual(
    Object.keys(dark.get("astra").values).map((name) =>
      name.replace("--dark-", ""),
    ),
    colours,
  );
  for (const name of colours)
    assert.equal(
      pairing[`--${name}`],
      `light-dark(var(--light-${name}), var(--dark-${name}))`,
      name,
    );
  assert.equal(sets.includes("prefers-color-scheme"), false);
});

test("the first load carries the default set by value", () => {
  // tokens.css is all a browser has until a stored choice or Settings asks
  // for the sets, so it must equal the default palettes and character.
  const lightAstra = light.get("astra").values;
  const darkAstra = dark.get("astra").values;
  for (const name of Object.keys(lightAstra)) {
    const token = name.replace("--light-", "");
    assert.equal(
      tokens[`--${token}`],
      `light-dark(${lightAstra[name]}, ${darkAstra[`--dark-${token}`]})`,
      token,
    );
  }
  for (const [name, value] of Object.entries(characters.get("astra").values)) {
    // The display face is new with the sets and starts as the interface face.
    if (name === "--font-display") {
      assert.equal(value, "var(--font-sans)");
      assert.equal(pairing[name], value);
      continue;
    }
    assert.equal(
      tokens[name],
      value.replace(/var\((--shade-[a-z]+)\)/g, (_, shade) => pairing[shade]),
      name,
    );
  }
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test("text keeps its contrast in every palette", () => {
  // WCAG AA for body text, and 3:1 for the borders that mark a control.
  const pairs = [
    ["ink", "paper", 7],
    ["ink", "bg", 7],
    ["ink", "soft", 7],
    ["ink", "hover", 7],
    ["ink", "wash", 7],
    ["ink", "review-bg", 7],
    ["muted", "paper", 4.5],
    ["muted", "bg", 4.5],
    ["muted", "soft", 4.5],
    ["muted", "wash", 4.5],
    ["accent-ink", "paper", 4.5],
    ["accent-ink", "accent", 4.5],
    ["accent-ink", "soft", 4.5],
    ["on-primary", "primary", 7],
    ["on-primary", "primary-hover", 7],
    ["notice-ink", "notice-bg", 4.5],
    ["danger", "paper", 4.5],
    ["danger", "danger-bg", 4.5],
    ["paper", "danger", 4.5],
    ["success", "paper", 4.5],
    ["success", "plan-bg", 4.5],
  ];
  const failures = [];
  for (const [prefix, map] of [
    ["--light-", light],
    ["--dark-", dark],
  ])
    for (const [id, { values }] of map)
      for (const [text, surface, minimum] of pairs) {
        const ratio = contrast(
          values[`${prefix}${text}`],
          values[`${prefix}${surface}`],
        );
        if (!(ratio >= minimum))
          failures.push(
            `${prefix}${id}: ${text} on ${surface} is ${ratio.toFixed(2)}, needs ${minimum}`,
          );
      }
  assert.deepEqual(failures, []);
});

test("a stored choice is restored and an unknown one falls back to the default", () => {
  globals.storage.clear();
  globals.root.dataset = {};
  assert.equal(appearance.lightPalette.read(), "astra");
  assert.equal(appearance.darkPalette.read(), "astra");
  assert.equal(appearance.character.read(), "astra");

  appearance.darkPalette.apply("ink");
  appearance.character.apply("soft");
  assert.equal(globals.root.dataset.dark, "ink");
  assert.equal(globals.root.dataset.character, "soft");
  assert.equal(appearance.darkPalette.read(), "ink");
  // The two schemes keep separate choices.
  assert.equal(appearance.lightPalette.read(), "astra");

  // A palette that no longer exists matches no block, so the default shows.
  globals.storage.set("astra-light:v1", "removed-palette");
  assert.equal(appearance.lightPalette.read(), "astra");
});

test("only a stored set other than the default asks for the stylesheet", async () => {
  globals.storage.clear();
  globals.root.dataset = {};
  await appearance.restoreAppearance();
  // Nothing stored: tokens.css alone is the default appearance.
  assert.deepEqual({ ...globals.root.dataset }, {});
  assert.equal(stylesheets, 0);

  appearance.applyTheme("dark");
  appearance.applyHand("left");
  appearance.lightPalette.apply("astra");
  globals.root.dataset = {};
  await appearance.restoreAppearance();
  assert.deepEqual(
    { ...globals.root.dataset },
    { theme: "dark", hand: "left", light: "astra" },
  );
  assert.equal(stylesheets, 0);

  appearance.darkPalette.apply("cocoa");
  globals.root.dataset = {};
  await appearance.restoreAppearance();
  assert.equal(globals.root.dataset.dark, "cocoa");
  assert.equal(stylesheets, 1);
});

test("appearance applies without browser storage", async () => {
  globals.fail = true;
  try {
    globals.root.dataset = {};
    assert.equal(appearance.character.read(), "astra");
    assert.equal(appearance.readTheme(), "system");
    appearance.lightPalette.apply("paper");
    assert.equal(globals.root.dataset.light, "paper");
    await appearance.restoreAppearance();
  } finally {
    globals.fail = false;
  }
});
