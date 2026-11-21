#!/usr/bin/env node
// CORE-OPS-133, packages/e2e-timing/README.md
import { collect } from '../lib/cli.mjs';

const code = await collect(process.argv.slice(2), { log: console.log, error: console.error });
process.exit(code);
