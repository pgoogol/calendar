import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "_site/**", "eslint.config.js"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
];
