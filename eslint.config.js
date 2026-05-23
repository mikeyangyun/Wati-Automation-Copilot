import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Architecture invariant: the deterministic `executor/` must never depend on
  // LLM-driven modules. Catches accidental drift at lint time so CI fails fast.
  {
    files: ['packages/server/src/executor/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/llm/**', '**/agents/**', '../llm/*', '../agents/*'],
              message:
                'executor/ must remain LLM-free (see docs/architecture.md). Move shared types to packages/shared or invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  // Architecture invariant: structural `validator/` must remain pure and
  // LLM-free. Rule signals must be deterministic so the merge step can treat
  // them as authoritative over the semantic ReviewAgent output.
  {
    files: ['packages/server/src/validator/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/llm/**', '**/agents/**', '../llm/*', '../agents/*'],
              message:
                'validator/ must remain LLM-free (see docs/architecture.md). Structural rules must be deterministic.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];
