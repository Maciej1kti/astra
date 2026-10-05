import js from "@eslint/js";
import globals from "globals";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";

const application = ["apps/web/**/*.ts", "apps/web/**/*.svelte"];
const components = ["apps/web/**/*.svelte"];
const scripts = ["scripts/**/*.mjs", "eslint.config.js"];

/**
 * Prettier owns formatting and svelte-check owns Svelte diagnostics; this
 * configuration looks for defects: dead conditions, unhandled promises and
 * unsafe values. The browser application is checked with type information.
 */
export default ts.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "target/**",
      "test-results/**",
      // Generated from the contracts; never edited by hand.
      "apps/web/src/lib/contracts/**",
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  {
    files: application,
    extends: [ts.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      // TypeScript resolves names, including the Svelte runes.
      "no-undef": "off",
      // Dead fallbacks and comparisons on values that cannot be absent.
      "@typescript-eslint/no-unnecessary-condition": "error",
      // The compiler's own rule: an underscore marks a deliberate placeholder.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A caught cause or an abort reason is passed on unchanged, never wrapped.
      "@typescript-eslint/prefer-promise-reject-errors": [
        "error",
        { allowThrowingAny: true, allowThrowingUnknown: true },
      ],
    },
  },
  ...svelte.configs.recommended,
  {
    files: [...components, "apps/web/**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      // Props and `$state` are declared with `let` whether or not this
      // component reassigns them; the Svelte rule understands that.
      "prefer-const": "off",
      "svelte/prefer-const": "error",
      // It reports every local Set, Map, Date and URL in a rune module. The
      // ones here are temporaries or deliberate non-reactive registries.
      "svelte/prefer-svelte-reactivity": "off",
      // A keyed block needs unique keys and changes how rows are reused; that
      // is a per-list decision, not a blanket cleanup.
      "svelte/require-each-key": "off",
    },
  },
  {
    files: components,
    rules: {
      // The Svelte parser gives snippet parameters, component callbacks and
      // `bind:this` instances the type `any`, so these rules report values
      // that svelte-check types correctly. They stay on for every `.ts` file.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: scripts,
    languageOptions: {
      // Browser suites pass functions to the page; they share one file with Node.
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
