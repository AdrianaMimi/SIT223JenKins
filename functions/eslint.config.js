import js from "@eslint/js";
export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: true },
      env: { node: true },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];