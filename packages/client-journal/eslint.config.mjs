import globals from 'globals';
import typescriptEslint from 'typescript-eslint';
import { javascript, typescript } from '../project-conventions/configs/eslint.base.mjs';

// REQ-QUALITY-002
export default typescriptEslint.config(
  ...javascript({ globals: globals.browser }),
  { ignores: ['eslint.config.mjs'] },
  ...typescript(typescriptEslint, {
    globals: globals.browser,
    allowDefaultProject: ['vitest.config.ts', 'vitest.setup.ts'],
  }),
);
