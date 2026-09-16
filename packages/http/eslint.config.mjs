import js from '@eslint/js';
import globals from 'globals';
import typescript from 'typescript-eslint';

// REQ-QUALITY-002
export default typescript.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'eslint.config.mjs'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: typescript.configs.recommendedTypeChecked,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts', 'vitest.setup.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);
