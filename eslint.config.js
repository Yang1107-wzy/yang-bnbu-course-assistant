export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        location: "readonly",
        sessionStorage: "readonly",
        MutationObserver: "readonly",
        Notification: "readonly",
        Blob: "readonly",
        URL: "readonly",
        HTMLElement: "readonly",
        console: "readonly",
        navigator: "readonly",
        unsafeWindow: "readonly",
        GM_getValue: "readonly",
        GM_setValue: "readonly",
        GM_deleteValue: "readonly",
        GM_addValueChangeListener: "readonly",
        GM_addStyle: "readonly",
        GM_notification: "readonly",
        GM_registerMenuCommand: "readonly",
        GM_openInTab: "readonly"
      }
    },
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-undef": "error",
      "prefer-const": "error"
    }
  }
];
