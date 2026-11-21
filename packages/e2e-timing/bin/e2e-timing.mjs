#!/usr/bin/env node
// REQ-E2E-TIMING-002, REQ-E2E-TIMING-006
import { collect } from '../lib/cli.mjs';

const code = await collect(process.argv.slice(2), { log: console.log, error: console.error });
process.exit(code);
