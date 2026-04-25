import js from "@eslint/js";
import globals from "globals";
import importPlugin from "eslint-plugin-import";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["vite.config.ts", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
  },
  {
    files: ["vite.config.ts", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
  {
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
        },
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
    plugins: {
      import: importPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "import/no-default-export": "off",
      "import/no-duplicates": "error",
      "import/no-unresolved": "error",
      "import/named": "error",
      "import/default": "error",
      "import/namespace": "error",
      "react/no-unescaped-entities": "off",
      "react/prop-types": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/static-components": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
);
