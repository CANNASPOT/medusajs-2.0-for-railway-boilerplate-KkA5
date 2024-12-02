import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import('eslint').Linter.Config} */
export default {
  // Apply ESLint rules to JavaScript and TypeScript files
  overrides: [
    {
      files: ["**/*.{js,mjs,cjs,ts}"],
      parser: tsparser, // Use TypeScript parser for TypeScript files
      languageOptions: {
        ecmaVersion: "latest", // ECMAScript 2021+ support
        sourceType: "module", // Use ES Modules by default
        globals: globals.browser, // Include browser globals
      },
      extends: [
        "eslint:recommended", // Basic recommended rules from ESLint
        "plugin:@typescript-eslint/recommended", // Recommended rules for TypeScript
      ],
      rules: {
        // Example custom rules (add more as needed)
        "@typescript-eslint/no-unused-vars": ["warn", { vars: "all", args: "after-used", ignoreRestSiblings: true }],
        "@typescript-eslint/no-explicit-any": "off", // Disable warning for `any` usage
      },
    },
    {
      files: ["**/*.js"],
      languageOptions: {
        sourceType: "script", // Use script mode for .js files
      },
    },
  ],
};
