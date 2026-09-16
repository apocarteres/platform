import js from '@eslint/js';
import globals from 'globals';

// REQ-QUALITY-002
export const IGNORED = ['node_modules/**', 'dist/**', 'target/**', 'coverage/**'];

// REQ-QUALITY-002
export const SHARED_RULES = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'no-var': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
};

// REQ-QUALITY-002
export function javascript({ globals: named = globals.node } = {}) {
  return [
    { ignores: IGNORED },
    js.configs.recommended,
    {
      files: ['**/*.mjs', '**/*.js'],
      languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: named },
      rules: SHARED_RULES,
    },
  ];
}

// REQ-QUALITY-002
export function typescript(typescriptEslint, { globals: named = globals.browser, allowDefaultProject = [] } = {}) {
  return [
    {
      files: ['**/*.ts'],
      extends: typescriptEslint.configs.recommendedTypeChecked,
      languageOptions: {
        globals: named,
        parserOptions: { projectService: { allowDefaultProject }, tsconfigRootDir: process.cwd() },
      },
      rules: {
        ...SHARED_RULES,
        // REQ-QUALITY-006
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
  ];
}
