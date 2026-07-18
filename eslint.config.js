import js from "@eslint/js";
import globals from "globals";

// Openle is a no-build static site, so the files load in a few different ways
// and each group needs its own environment. Flat config lets us scope globals
// and source type per group instead of sprinkling /* global */ comments.
export default [
  { ignores: ["node_modules/**"] },

  // Base rules for every JS file.
  js.configs.recommended,

  // The app: ES modules in js/, running in the browser.
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // Provided by the classic scripts loaded before the module entry point.
        OTChess: "readonly",
        OPENINGS: "readonly",
        OPENING_DESCRIPTIONS: "readonly",
      },
    },
  },

  // Classic scripts loaded via <script> that publish onto window.
  {
    files: ["chess.js", "openings.js", "descriptions.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: globals.browser,
    },
  },

  // Service worker: its own global scope (self, caches, clients).
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: globals.serviceworker,
    },
  },

  // Node tooling: the test runner and this config.
  {
    files: ["scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },

  // Project-wide rules on top of recommended.
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Empty catch blocks are intentional here: best-effort calls to
      // localStorage, AudioContext, and setPointerCapture that may throw and
      // are safe to ignore.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
