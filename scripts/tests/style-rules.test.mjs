/** Static guards for the visual vocabulary described in docs/DESIGN-SYSTEM.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const source = join(import.meta.dirname, "../../apps/web/src");
const files = readdirSync(source, { recursive: true })
  .filter((name) => /\.(css|svelte)$/.test(name))
  .map((name) => join(source, name));
const tokens = join(source, "styles/tokens.css");

/** Style text only: whole stylesheets, or the style block of a component. */
function styles(file) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".css")) return text;
  return /<style[^>]*>([\s\S]*?)<\/style>/.exec(text)?.[1] ?? "";
}
const declarations = files
  .filter((file) => file !== tokens)
  .flatMap((file) =>
    styles(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line, index) => ({
        where: `${relative(source, file)}:${index + 1}`,
        line: line.trim(),
      })),
  )
  .filter(({ line }) => line && !/^@(media|container)\b/.test(line));
const offending = (pattern, allowed = () => false) =>
  declarations
    .filter(({ line }) => pattern.test(line) && !allowed(line))
    .map(({ where, line }) => `${where}  ${line}`);

test("component styles take colours, sizes, layers and timing from tokens", () => {
  // A named custom property may hold a component's own dimension.
  const named = (line) => /^--[a-z0-9-]+:/.test(line);
  assert.deepEqual(
    offending(/#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i, (line) =>
      /mask-image|#000 /.test(line),
    ),
    [],
    "raw colours",
  );
  assert.deepEqual(
    // A zero fallback such as env(safe-area-inset-top, 0px) is not a dimension.
    offending(/(^|[\s:,(])-?(?!0px)\d*\.?\d+(px|rem|ch)\b/, (line) =>
      named(line),
    ),
    [],
    "raw dimensions",
  );
  assert.deepEqual(
    offending(/\b\d+m?s\b/, (line) => /\b0s\b/.test(line)),
    [],
    "raw durations",
  );
  assert.deepEqual(
    offending(/z-index:\s*(?!\s|-?[01];|var\()/),
    [],
    "raw layers",
  );
  assert.deepEqual(
    offending(/(?<![-a-z])opacity:\s*0?\.\d/),
    [],
    "raw partial opacity",
  );
  assert.deepEqual(offending(/cubic-bezier\(/), [], "raw easing");
  assert.deepEqual(
    offending(/font-(size|weight):\s*(?!\s|var\(|inherit|0\.9em)/),
    [],
    "raw type",
  );
  assert.deepEqual(offending(/text-transform:\s*capitalize/), [], "case");
});

test("viewport breakpoints come from one short list", () => {
  const allowed = new Set([360, 420, 520, 640, 641, 700, 701, 1100]);
  const used = files.flatMap((file) =>
    [...styles(file).matchAll(/@media[^{]*?\((?:max|min)-width:\s*(\d+)px\)/g)]
      .map((match) => Number(match[1]))
      .filter((width) => !allowed.has(width))
      .map((width) => `${relative(source, file)}: ${width}px`),
  );
  assert.deepEqual(used, []);
});

test("the palette is defined once and motion durations stay a named set", () => {
  const text = readFileSync(tokens, "utf8");
  assert.equal(
    text.includes("prefers-color-scheme"),
    false,
    "light-dark() carries both themes",
  );
  assert.deepEqual(
    [...text.matchAll(/--motion-[a-z-]+(?=:\s*\d+ms)/g)].map(([name]) => name),
    [
      "--motion-quick",
      "--motion-enter",
      "--motion-heading",
      "--motion-content",
      "--motion-detail",
      "--motion-backdrop",
      "--motion-dialog",
      "--motion-scene",
      "--motion-selection",
      "--motion-exit",
      "--motion-stagger",
      "--motion-press-in",
      "--motion-popup-heading",
      "--motion-popup-content",
    ],
  );
  assert.deepEqual(
    [...text.matchAll(/--text-[a-z]+/g)].map(([name]) => name),
    [
      "--text-xs",
      "--text-sm",
      "--text-base",
      "--text-lg",
      "--text-xl",
      "--text-title",
      "--text-display",
    ],
  );
});

test("controls use the icon set instead of text glyphs", () => {
  const glyphs = /[↗←→‹›✕×⋯↔↑↓＋]/;
  const found = files
    .filter((file) => file.endsWith(".svelte"))
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        // Shortcut hints and sentences may name a key or a direction.
        .filter(
          ({ line }) =>
            glyphs.test(line) && !/title=|Alt\+|aria-|<p>|<strong>/.test(line),
        )
        .map(({ index }) => `${relative(source, file)}:${index + 1}`),
    );
  assert.deepEqual(found, []);
});
