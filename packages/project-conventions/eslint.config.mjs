import { javascript } from './configs/eslint.base.mjs';

// REQ-QUALITY-002
export default [
  ...javascript(),
  { ignores: ['docs/**'] },
];
