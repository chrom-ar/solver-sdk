import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      sourceType: "module",
    },
    rules: {
      "comma-dangle": ["error", "always-multiline"],
      "curly": ["error", "all"],
      "eol-last": ["error", "always"],
      "func-style": ["error", "expression"],
      "indent": ["error", 2],
      "key-spacing": ["error", { beforeColon: false, afterColon: true }],
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 1 }],
      "prefer-const": ["error", { destructuring: "all" }],
      "quotes": ["error", "double"],
      "semi": ["error", "always"],
    },
  },
);
