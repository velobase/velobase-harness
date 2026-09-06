import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default tseslint.config(
  {
    ignores: [
      ".next",
      "next-env.d.ts",
      "scripts/**",
      "**/node_modules/**",
      ".pnpm-store/**",
      "**/dist/**",
      "**/out/**",
      "**/.expo/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    // This is the actual App Router root layout behind src/app/layout.tsx.
    files: ["apps/web/src/composition/layout.tsx"],
    rules: { "@next/next/no-head-element": "off" },
  },
  {
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "prisma/**/*.ts",
      "services/**/*.ts",
      "apps/web/src/**/*.ts",
      "apps/web/src/**/*.tsx",
    ],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      // 禁用 console.log，但允许 warn 和 error
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: [
      "apps/desktop/**/*.ts",
      "apps/mobile/**/*.ts",
      "apps/mobile/**/*.tsx",
      "packages/**/*.ts",
      "apps/web/tests/**/*.ts",
    ],
    extends: [...tseslint.configs.recommended],
  },
  {
    files: [
      "src/**/*.{ts,tsx,js}",
      "prisma/**/*.ts",
      "services/**/*.ts",
      "apps/web/src/**/*.{ts,tsx}",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
