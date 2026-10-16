import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export const base = tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'no-console': 'error',
      // Side effects, then packages, then this package's files; type imports as a block of their own.
      'simple-import-sort/imports': [
        'error',
        { groups: [['^\\u0000'], ['^node:', '^@?\\w'], ['^'], ['^\\.'], ['^.+\\u0000$']] },
      ],
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
)

export const react = tseslint.config(
  ...base,
  {
    ignores: ['**/routeTree.gen.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        // TanStack Router route files export `Route` alongside components.
        { allowConstantExport: true },
      ],
    },
  },
  {
    // TanStack Router route files colocate components with the exported `Route`;
    // the router plugin splits them for HMR/code-splitting itself.
    files: ['**/src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
